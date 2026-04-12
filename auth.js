/**
 * Doruklu CDN — Merkezi Auth Modülü
 * Tüm subdomain'ler bu modülü kullanarak SSO akışını standartlaştırır.
 * 
 * SSO Akışı:
 * 1. Subdomain session arar (localStorage)
 * 2. Yoksa → URL hash'te token var mı? (doruklu.com'dan relay)
 * 3. Hash token varsa → Supabase detectSessionInUrl ile otomatik alır, bekle
 * 4. Hiçbiri yoksa → doruklu.com'a redirect (login için)
 */
import { supabase, AppState } from './supabase-config.js';
import { ui } from './ui.js';

/**
 * Subdomain uygulamaları için standart SSO auth akışı.
 * 
 * @param {string} appKey — Bu uygulamanın permissions anahtarı (ör: 'toprak_game', 'ozgur_dashboard', 'nurcan_app')
 *                          null ise yetki kontrolü yapılmaz
 * @param {Function} onSuccess — Başarılı login + yetki sonrası çağrılacak callback: (user, profile) => void
 */
export async function initSubdomainAuth(appKey, onSuccess) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'flex';

    let _handled = false;

    async function handleSession(session) {
        if (_handled) return;
        if (!session) return;
        _handled = true;

        const user = session.user;
        AppState.user = user;

        // URL hash'i temizle (token relay sonrası)
        if (window.location.hash.includes('access_token')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        // Profil bilgisini çek
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error || !profile) {
            AppState.profile = { role: 'player', permissions: {} };
        } else {
            AppState.profile = profile;
        }

        // Loading gizle
        if (spinner) spinner.style.display = 'none';

        // Yetki kontrolü (appKey varsa)
        if (appKey) {
            const perms = AppState.profile.permissions || {};
            const hasAccess = AppState.profile.role === 'super_admin' || perms[appKey] === true;

            if (!hasAccess) {
                showAccessDenied();
                return;
            }
        }

        // Badge göster
        ui.renderUserBadge(user, AppState.profile, async () => {
            await supabase.auth.signOut();
            window.location.href = 'https://doruklu.com';
        });

        // Başarı callback
        if (onSuccess) {
            onSuccess(user, AppState.profile);
        }
    }

    // Auth state listener — hash token relay'i de yakalar
    supabase.auth.onAuthStateChange(async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            await handleSession(session);
        }
    });

    // Mevcut session kontrol (localStorage'da varsa)
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        await handleSession(session);
    } else if (window.location.hash.includes('access_token')) {
        // Hash'te token var — Supabase detectSessionInUrl ile işleyecek
        // onAuthStateChange(SIGNED_IN) tetiklenecek, bekle
        setTimeout(() => {
            if (!_handled) {
                // 8 saniye geçti, hâlâ işlenmedi — hash parse başarısız
                if (spinner) spinner.style.display = 'none';
                showAccessDenied('Oturum doğrulanamadı. Lütfen tekrar giriş yapın.');
            }
        }, 8000);
    } else {
        // Session yok, hash yok → ana sayfaya yönlendir
        if (spinner) spinner.style.display = 'none';
        window.location.href = 'https://doruklu.com/?redirect_to=' + encodeURIComponent(window.location.href);
    }
}

function showAccessDenied(customMessage) {
    document.body.innerHTML = `
        <div style="
            color: white; text-align: center; padding: 80px 20px; 
            font-family: 'Outfit', sans-serif; min-height: 100vh;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
        ">
            <div style="
                background: rgba(255,255,255,0.04); backdrop-filter: blur(20px);
                border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
                padding: 3rem; max-width: 450px; width: 100%;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            ">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
                <h2 style="color: #f87171; margin-top: 0;">Erişim Reddedildi</h2>
                <p style="color: #c7d2fe; line-height: 1.6;">
                    ${customMessage || 'Bu uygulamaya erişim yetkiniz bulunmuyor.<br>Yöneticiden yetki talep edebilirsiniz.'}
                </p>
                <a href="https://doruklu.com" style="
                    display: inline-block; margin-top: 1.5rem; padding: 0.8rem 2rem;
                    background: #6366f1; color: white; text-decoration: none;
                    border-radius: 12px; font-weight: 600; transition: all 0.3s;
                ">Merkezi Sisteme Dön</a>
            </div>
        </div>
    `;
}
