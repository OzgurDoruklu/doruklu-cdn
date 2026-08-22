/**
 * Doruklu CDN — Merkezi Auth Modülü (v2.1.0 — Güvenlik sertleştirmesi)
 * Tüm platformun (Hub + Subdomainler) SSO ve Profil yönetim kalbi.
 *
 * v2.1.0 değişiklikleri:
 *  - redirect_to artık izin listesinden geçiyor (açık yönlendirme / token hırsızlığı kapatıldı)
 *  - Token relay query string yerine hash fragment ile yapılıyor (fragment sunucuya gitmez)
 *  - Sürüm temizliği oturumu ve redirect_to'yu artık silmiyor
 */
import { supabase, AppState, PLATFORM_VERSION } from './supabase-config.js';
import { safeRedirect } from './util.js';
import { ui } from './ui.js';

/** Sürüm temizliğinde korunacak localStorage anahtarları (Supabase oturumu dahil). */
const PRESERVED_KEYS = /^(sb-|redirect_to$|doruklu-theme$|DORUKLU_PLATFORM_VERSION$)/;

/**
 * PLATFORM GENELİNDE ÇIKIŞ
 *
 * localStorage origin başına ayrıdır: hub'da çıkış yapmak nurcan.doruklu.com'un
 * oturumunu silmez. Access token'ı süresi dolana kadar geçerli kaldığı için
 * subdomain "hiç çıkış yapılmamış" gibi davranıyordu; oradan hub'a dönen relay de
 * çıkışı tamamen geri alıyordu.
 *
 * Çözüm: çerezler *.doruklu.com genelinde paylaşılır. Çıkışta bir zaman damgası
 * çerezi bırakılıyor; her origin açılışta kendi oturum damgasıyla karşılaştırıp
 * daha eskiyse oturumu düşürüyor.
 */
const LOGOUT_COOKIE = 'doruklu_logout_at';

function readLogoutStamp() {
    const m = document.cookie.match(/(?:^|;\s*)doruklu_logout_at=(\d+)/);
    return m ? Number(m[1]) : 0;
}

/** Çıkış damgasını bırakır. clearAllCaches çerezleri sildiği için ONDAN SONRA çağrılmalı. */
function markGlobalLogout() {
    document.cookie = `${LOGOUT_COOKIE}=${Date.now()};path=/;domain=.doruklu.com;max-age=604800;SameSite=Lax;Secure`;
}

/**
 * Oturumun access token'ının ne zaman verildiği (JWT `iat` iddiası, ms).
 * Çözülemezse 0 döner.
 */
function sessionIssuedAt(session) {
    try {
        const b64 = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
        return typeof payload.iat === 'number' ? payload.iat * 1000 : 0;
    } catch {
        return 0;
    }
}

/**
 * Bu oturum, platform genelindeki çıkıştan daha mı eski?
 *
 * ⚠️ Kıyas ölçütü token'ın KENDİ `iat` iddiasıdır, localStorage değil.
 * Önceki sürüm `localStorage.doruklu_session_at` ile karşılaştırıyordu — ama çıkış
 * localStorage'ı da siliyor, dolayısıyla Google'dan yeni dönen taze oturum bile
 * sessionAt=0 görüp bayat sayılıyor ve kurulur kurulmaz düşürülüyordu. Sonuç:
 * giriş sonsuz döngüye giriyordu. Token'ın iat'ı bu tuzağa düşmez.
 *
 * Çözülemeyen token'da FAIL OPEN: çıkışın yayılmaması, girişin tamamen kırılmasından iyidir.
 */
function isStaleSession(session) {
    const logoutAt = readLogoutStamp();
    if (!logoutAt) return false;

    const issuedAt = sessionIssuedAt(session);
    if (!issuedAt) return false;   // fail open

    return logoutAt > issuedAt;
}

/**
 * Tüm platformdan çıkış. Rozetteki "Oturumu Kapat" bunu çağırır.
 *
 * SIRA ÖNEMLİ: signOut() ÖNCE gelmeli. Eskiden clearAllCaches() önce çalışıyor,
 * Supabase oturumunu siliyordu; signOut() elinde token olmadan çağrıldığı için
 * sunucudaki refresh token'lar iptal edilmiyordu.
 */
export async function performGlobalLogout() {
    try {
        // Varsayılan kapsam 'global': kullanıcının TÜM refresh token'larını sunucuda iptal eder
        await supabase.auth.signOut();
    } catch (err) {
        console.warn('[Auth] signOut sunucuya ulaşamadı, yerel temizlikle devam ediliyor:', err);
    }
    await clearAllCaches();
    markGlobalLogout();   // clearAllCaches'ten SONRA — o çerezleri siliyor
    window.location.href = 'https://doruklu.com/?logout=true';
}

/**
 * Sürüm atlandığında bayat önbelleği temizler ama oturumu düşürmez.
 * (Eskiden düz localStorage.clear() çağrılıyordu; her deploy herkesi çıkış yaptırıyordu.)
 */
function purgeStaleCache() {
    const preserved = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && PRESERVED_KEYS.test(k)) preserved.push([k, localStorage.getItem(k)]);
    }
    localStorage.clear();
    sessionStorage.clear();
    for (const [k, v] of preserved) localStorage.setItem(k, v);
}

/**
 * SSO token'larını URL'den okur.
 * Öncelik hash fragment'te; query string yalnızca geriye dönük uyumluluk için okunuyor
 * (eski, önbellekten gelen auth.js kopyaları hâlâ query ile relay edebilir).
 */
function readSsoTokens(urlParams) {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    let token = hash.get('sso_token');
    let refresh = hash.get('sso_refresh');

    if (!token || !refresh) {
        token = urlParams.get('sso_token');
        refresh = urlParams.get('sso_refresh');
    }
    return (token && refresh) ? { token, refresh } : null;
}

/** Adres çubuğundan SSO izlerini siler; diğer query parametrelerine dokunmaz. */
function stripSsoFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('sso_token');
    url.searchParams.delete('sso_refresh');
    url.hash = '';
    history.replaceState(null, '', url.pathname + url.search);
}

/**
 * Merkezi Platform Auth Başlatıcı
 * @param {Object} options
 * @param {boolean} options.isHub - Ana portal (doruklu.com) mu?
 * @param {string} options.appKey - Subdomain için yetki anahtarı (örn: 'toprak_game')
 * @param {Function} options.onSuccess - Başarılı giriş ve yetki sonrası callback: (user, profile) => void
 */
export async function initPlatformAuth({ isHub = false, appKey = null, onSuccess = null } = {}) {
    // 0. Versiyon Kontrolü (Cache Busting) — redirect_to yazımından ÖNCE çalışmalı
    //
    // OAuth dönüşü sırasında ASLA çalıştırma: Supabase, #access_token=... fragment'ini
    // asenkron işliyor (detectSessionInUrl). Ortasında reload() çağırmak fragment'i
    // götürür ve oturum hiç kurulamaz — kullanıcı giriş yapar yapmaz çıkmış olur.
    // Sürüm temizliği bir sonraki açılışa ertelenir.
    const oauthDonusu = /[#&](access_token|error|error_description)=/.test(window.location.hash);

    const storedVersion = localStorage.getItem('DORUKLU_PLATFORM_VERSION');
    if (!oauthDonusu && storedVersion !== PLATFORM_VERSION) {
        console.log(`[Platform] Yeni versiyon (${storedVersion} -> ${PLATFORM_VERSION}). Önbellek temizleniyor...`);
        purgeStaleCache();
        localStorage.setItem('DORUKLU_PLATFORM_VERSION', PLATFORM_VERSION);
        window.location.reload();
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);

    // Redirect parametresini yakala (Sadece Hub'da) — izin listesinden geçmeyen adres yok sayılır
    if (isHub) {
        const requested = urlParams.get('redirect_to');
        if (requested) {
            const safe = safeRedirect(requested);
            if (safe) {
                localStorage.setItem('redirect_to', safe.toString());
            } else {
                console.warn('[Auth] redirect_to izin listesinde değil, yok sayıldı:', requested);
                localStorage.removeItem('redirect_to');
            }
        }
    }

    // Google Login butonu varsa otomatik bağla
    const googleBtn = document.getElementById('google-btn');
    if (googleBtn) googleBtn.onclick = handleGoogleLogin;

    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'flex';

    let _handled = false;

    // Ana session işleme mantığı
    async function handleSession(session) {
        if (_handled) return;
        if (!session) return;
        _handled = true;

        const user = session.user;
        AppState.user = user;

        // 1. Profil Senkronizasyonu (Source of Truth)
        let profile = await syncProfileData(user);
        AppState.profile = profile;

        // 2. TOKEN RELAY (Hub -> Subdomain Geçişi)
        if (isHub) {
            const storedRedirect = localStorage.getItem('redirect_to');
            if (storedRedirect) {
                localStorage.removeItem('redirect_to');

                // localStorage'daki değer de yeniden doğrulanıyor (eski/bozuk kayıtlara karşı)
                const target = safeRedirect(storedRedirect);
                if (target && session.access_token) {
                    // Token'lar HASH FRAGMENT ile taşınıyor: fragment sunucuya gönderilmez,
                    // Referer başlığına ve sunucu loglarına düşmez.
                    target.hash = new URLSearchParams({
                        sso_token: session.access_token,
                        sso_refresh: session.refresh_token
                    }).toString();

                    // replace(): token'lı URL hub'ın geri tuşu geçmişinde kalmasın
                    window.location.replace(target.toString());
                    return; // Relayed!
                }
                if (!target) console.warn('[Auth] Kayıtlı redirect_to güvenli değil, relay iptal edildi.');
            }
        }

        if (spinner) spinner.style.display = 'none';

        // 3. Yetki Kontrolü (Subdomainler için)
        if (!isHub && appKey) {
            const perms = AppState.profile.permissions || {};
            const hasAccess = AppState.profile.role === 'super_admin' || perms[appKey] === true;
            if (!hasAccess) {
                showAccessDenied();
                return;
            }
        }

        // 4. Başarı Callback — rozetten ÖNCE çalışmalı.
        //    Hub'ın header'ını (#header-right-slot) yaratan şey bu callback; rozet önce
        //    render edilirse slot'u bulamayıp document.body'nin sonuna düşüyordu.
        if (onSuccess) {
            try {
                onSuccess(user, AppState.profile);
            } catch (err) {
                // onSuccess patlasa bile rozet render edilmeli — yoksa çıkış yapmak imkânsız kalır
                console.error('[Auth] onSuccess hata verdi:', err);
            }
        }

        // 5. Ortak UI Render (Global Badge) — artık header mevcut
        ui.renderUserBadge(user, AppState.profile, performGlobalLogout);
    }

    // SSO Token Yakalama (hash öncelikli, query geriye dönük uyumluluk için)
    const sso = readSsoTokens(urlParams);
    if (sso) {
        stripSsoFromUrl();
        const { data } = await supabase.auth.setSession({
            access_token: sso.token,
            refresh_token: sso.refresh
        });
        if (data?.session) {
            await handleSession(data.session);
            return;
        }
    }

    // Mevcut Session Kontrolü
    let { data: { session } } = await supabase.auth.getSession();

    // Oturum, platform genelindeki çıkıştan ESKİYSE düşür.
    // Taze giriş (Google'dan yeni dönen ya da relay ile gelen) token'ın iat'ı
    // çıkış damgasından yeni olduğu için bu kontrole takılmaz.
    if (session && isStaleSession(session)) {
        console.log('[Auth] Platform genelinde çıkış yapılmış, bu origin\'deki bayat oturum düşürülüyor.');
        try {
            await supabase.auth.signOut({ scope: 'local' });
        } catch (err) {
            console.warn('[Auth] Yerel signOut hatası:', err);
        }
        session = null;
    }

    if (session) {
        await handleSession(session);
    } else {
        if (spinner) spinner.style.display = 'none';
        if (isHub) {
            // Hub ise auth ekranına düş
            const authScreen = document.getElementById('auth-screen');
            if (authScreen) authScreen.style.display = 'flex';
        } else {
            // Subdomain ise Hub'a yönlendir
            redirectToLogin();
        }
    }
}

/**
 * Geriye Dönük Uyumluluk için Wrapper
 */
export async function initSubdomainAuth(appKey, onSuccess) {
    return initPlatformAuth({ isHub: false, appKey, onSuccess });
}

/**
 * Profil verilerini Auth (Google) ile senkronize tutar.
 *
 * NOT: role / permissions / total_score bu akışta BİLEREK yazılmaz.
 * Bu sütunlar DB tarafında client'a kapalıdır (bkz. migrations/2026-08-22-security.sql).
 */
async function syncProfileData(user) {
    const meta = user.user_metadata || {};
    const googleName = meta.full_name || meta.name || meta.displayName;
    const googleAvatar = meta.avatar_url || meta.picture;

    // Profili çek
    let { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

    if (!profile) {
        console.log("[Auth] Yeni profil oluşturuluyor...");
        // role ve permissions gönderilmiyor — DB varsayılanları ('player', '{}') geçerli
        const payload = {
            id: user.id,
            display_name: googleName || user.email.split('@')[0],
            email: user.email,
            avatar_url: googleAvatar
        };
        const { data: newP, error } = await supabase.from('profiles').insert(payload).select().single();
        if (error) { // Email sütunu yoksa fallback
            delete payload.email;
            const { data: fallbackP } = await supabase.from('profiles').insert(payload).select().single();
            return fallbackP;
        }
        return newP;
    }

    // Mevcut profil senkronizasyonu
    const needsSync = !profile.email ||
                     (!profile.display_name && googleName) ||
                     (googleName && googleName !== profile.display_name && !profile.display_name.includes(user.email.split('@')[0]));

    if (needsSync) {
        console.log("[Auth] Profil güncelleniyor (Metadata Sync)...");
        const updatePayload = {
            email: user.email,
            display_name: googleName || profile.display_name,
            avatar_url: googleAvatar || profile.avatar_url
        };
        const { data: updatedP, error: err1 } = await supabase.from('profiles').update(updatePayload).eq('id', user.id).select().single();
        if (err1) {
            console.warn("[Auth] Email ile güncelleme başarısız, email'siz deneniyor...");
            delete updatePayload.email;
            const { data: updatedP2, error: err2 } = await supabase.from('profiles').update(updatePayload).eq('id', user.id).select().single();

            if (err2) {
                console.warn("[Auth] Profil senkronize edilemedi (Muhtemelen RLS yetki hatası), mevcut verilerle devam ediliyor:", err2.message);
                return profile; // Hata durumunda eldeki mevcut profili koru!
            }
            return updatedP2;
        }
        return updatedP;
    }

    return profile;
}

export async function handleGoogleLogin() {
    const redirectTo = window.location.origin;
    await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectTo
        }
    });
}

export function redirectToLogin() {
    window.location.href = 'https://doruklu.com/?redirect_to=' + encodeURIComponent(window.location.origin + window.location.pathname);
}

export async function clearAllCaches() {
    localStorage.clear();
    sessionStorage.clear();
    // doruklu_logout_at korunuyor — çıkış damgası burada silinirse subdomain'ler haberdar olmaz.
    // (performGlobalLogout damgayı bundan sonra yeniden yazıyor; bu koruma doğrudan
    //  clearAllCaches çağıran diğer yollar için.)
    document.cookie.split(";").forEach(function(c) {
        if (c.replace(/^ +/, "").startsWith(LOGOUT_COOKIE + "=")) return;
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/;domain=.doruklu.com");
    });
}

function showAccessDenied() {
    document.body.innerHTML = `
        <div style="color: white; text-align: center; padding: 80px 20px; font-family: 'Outfit', sans-serif; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);">
            <div style="background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 3rem; max-width: 450px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
                <h2 style="color: #f87171; margin-top: 0;">Erişim Reddedildi</h2>
                <p style="color: #c7d2fe; line-height: 1.6;">Bu uygulamaya erişim yetkiniz bulunmuyor.<br>Yöneticiden yetki talep edebilirsiniz.</p>
                <a href="https://doruklu.com" style="display: inline-block; margin-top: 1.5rem; padding: 0.8rem 2rem; background: #6366f1; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; transition: all 0.3s;">Merkezi Sisteme Dön</a>
            </div>
        </div>`;
}
