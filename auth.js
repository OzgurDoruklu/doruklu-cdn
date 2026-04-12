/**
 * Doruklu CDN — Merkezi Auth Modülü
 * Tüm subdomain'ler bu modülü kullanarak SSO akışını standartlaştırır.
 * 
 * SSO Akışı:
 * 1. Subdomain session arar (localStorage)
 * 2. URL'de sso_token query param var mı? (doruklu.com'dan relay)
 * 3. sso_token varsa → supabase.auth.setSession() ile manuel session kurar
 * 4. Hiçbiri yoksa → doruklu.com'a redirect (login için)
 */
import { supabase, AppState } from './supabase-config.js';
import { ui } from './ui.js';

/**
 * Subdomain uygulamaları için standart SSO auth akışı.
 * 
 * @param {string} appKey — Bu uygulamanın permissions anahtarı
 * @param {Function} onSuccess — Başarılı login + yetki sonrası callback: (user, profile) => void
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

        // Yetki kontrolü
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

    // ADIM 1: URL'de SSO token var mı? (doruklu.com'dan relay)
    const urlParams = new URLSearchParams(window.location.search);
    const ssoToken = urlParams.get('sso_token');
    const ssoRefresh = urlParams.get('sso_refresh');

    if (ssoToken && ssoRefresh) {
        // URL'i temizle (tokenları adres çubuğundan kaldır)
        const cleanUrl = window.location.origin + window.location.pathname;
        history.replaceState(null, '', cleanUrl);

        // Manuel session kurulumu — en güvenilir yöntem
        const { data, error } = await supabase.auth.setSession({
            access_token: ssoToken,
            refresh_token: ssoRefresh
        });

        if (data?.session) {
            await handleSession(data.session);
            return;
        }

        // setSession başarısız olduysa, login'e yönlendir
        if (spinner) spinner.style.display = 'none';
        showAccessDenied('Oturum doğrulanamadı. Lütfen tekrar giriş yapın.');
        return;
    }

    // ADIM 2: localStorage'da mevcut session var mı?
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        await handleSession(session);
        return;
    }

    // ADIM 3: Hash'te token var mı? (eski yöntem fallback)
    if (window.location.hash.includes('access_token')) {
        // onAuthStateChange ile yakala
        supabase.auth.onAuthStateChange(async (event, session) => {
            if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
                await handleSession(session);
            }
        });

        setTimeout(() => {
            if (!_handled) {
                if (spinner) spinner.style.display = 'none';
                redirectToLogin();
            }
        }, 5000);
        return;
    }

    // ADIM 4: Hiçbir session yok → login'e yönlendir
    if (spinner) spinner.style.display = 'none';
    redirectToLogin();
}

function redirectToLogin() {
    if (window.location.hostname === 'doruklu.com' || window.location.hostname === 'www.doruklu.com') {
        const authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.style.display = 'flex';
        return;
    }
    window.location.href = 'https://doruklu.com/?redirect_to=' + encodeURIComponent(window.location.origin + window.location.pathname);
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
