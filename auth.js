/**
 * Doruklu CDN — Merkezi Auth Modülü (v2.0.0 — Unified)
 * Tüm platformun (Hub + Subdomainler) SSO ve Profil yönetim kalbi.
 */
import { supabase, AppState, PLATFORM_VERSION } from './supabase-config.js';
import { ui } from './ui.js';

/**
 * Merkezi Platform Auth Başlatıcı
 * @param {Object} options 
 * @param {boolean} options.isHub - Ana portal (doruklu.com) mu?
 * @param {string} options.appKey - Subdomain için yetki anahtarı (örn: 'toprak_game')
 * @param {Function} options.onSuccess - Başarılı giriş ve yetki sonrası callback: (user, profile) => void
 */
export async function initPlatformAuth({ isHub = false, appKey = null, onSuccess = null } = {}) {
    // 0. Versiyon Kontrolü (Cache Busting)
    const storedVersion = localStorage.getItem('DORUKLU_PLATFORM_VERSION');
    if (storedVersion !== PLATFORM_VERSION) {
        console.log(`[Platform] Yeni versiyon tespit edildi (${storedVersion} -> ${PLATFORM_VERSION}). Önbellek temizleniyor...`);
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('DORUKLU_PLATFORM_VERSION', PLATFORM_VERSION);
        window.location.reload(true);
        return;
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

        if (spinner) spinner.style.display = 'none';

        // 2. Yetki Kontrolü (Subdomainler için)
        if (!isHub && appKey) {
            const perms = AppState.profile.permissions || {};
            const hasAccess = AppState.profile.role === 'super_admin' || perms[appKey] === true;
            if (!hasAccess) {
                showAccessDenied();
                return;
            }
        }

        // 3. Ortak UI Render (Global Badge)
        ui.renderUserBadge(user, AppState.profile, async () => {
            await clearAllCaches();
            await supabase.auth.signOut();
            window.location.href = 'https://doruklu.com/?logout=true';
        });

        // 4. Başarı Callback
        if (onSuccess) onSuccess(user, AppState.profile);
    }

    // SSO Token Yakalama (Query Param - Hem Hub hem Subdomain için aktif)
    const urlParams = new URLSearchParams(window.location.search);
    const ssoToken = urlParams.get('sso_token');
    const ssoRefresh = urlParams.get('sso_refresh');

    if (ssoToken && ssoRefresh) {
        history.replaceState(null, '', window.location.origin + window.location.pathname);
        const { data, error } = await supabase.auth.setSession({
            access_token: ssoToken,
            refresh_token: ssoRefresh
        });
        if (data?.session) {
            await handleSession(data.session);
            return;
        }
    }

    // Mevcut Session Kontrolü
    const { data: { session } } = await supabase.auth.getSession();
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
 * Profil verilerini Auth (Google) ile senkronize tutar
 */
async function syncProfileData(user) {
    const meta = user.user_metadata || {};
    const googleName = meta.full_name || meta.name || meta.displayName;
    const googleAvatar = meta.avatar_url || meta.picture;

    // Profili çek
    let { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

    if (!profile) {
        console.log("[Auth] Yeni profil oluşturuluyor...");
        const payload = {
            id: user.id,
            display_name: googleName || user.email.split('@')[0],
            email: user.email,
            avatar_url: googleAvatar,
            role: 'player',
            permissions: {}
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
    document.cookie.split(";").forEach(function(c) { 
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
