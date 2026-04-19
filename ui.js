import { Assets } from './assets.js';
import { supabase } from './supabase-config.js';

export const ui = {
    showScreen: (screenId) => {
        const screens = ['auth-screen', 'dashboard-screen', 'management-screen'];
        screens.forEach(s => {
            const el = document.getElementById(s);
            if(el) el.style.display = s === screenId ? 'flex' : 'none';
        });
    },

    showError: (msg) => {
        const el = document.getElementById('alert-box');
        if(!el) return;
        el.className = 'alert error show';
        el.textContent = msg;
        setTimeout(() => el.classList.remove('show'), 3000);
    },

    showSuccess: (msg) => {
        const el = document.getElementById('alert-box');
        if(!el) return;
        el.className = 'alert success show';
        el.textContent = msg;
        setTimeout(() => el.classList.remove('show'), 3000);
    },

    setLoading: (isLoading) => {
        const spinner = document.getElementById('loading-spinner');
        if(spinner) spinner.style.display = isLoading ? 'flex' : 'none';
    },

    /**
     * Tüm sayfalarda favicon'u verdiğimiz logo ile günceller.
     */
    syncFavicon: () => {
        const svgBase64 = btoa(Assets.logoSVG);
        const faviconUrl = `data:image/svg+xml;base64,${svgBase64}`;
        
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = faviconUrl;
    },

    /**
     * Tüm subdomain'lerde üstte yer alan logolu header'ı render eder.
     * Logo tıklandığında doruklu.com'a TOKEN RELAY ile gider.
     */
    renderGlobalHeader: (title = "") => {
        if (document.getElementById('doruklu-global-header')) return;

        // Container'ı hemen (senkron) oluşturuyoruz ki renderUserBadge slotu bulabilsin
        const headerHTML = `
            <header id="doruklu-global-header" style="
                position: fixed; top: 0; left: 0; width: 100%; height: 65px;
                background: var(--header-bg); backdrop-filter: blur(15px);
                border-bottom: 1px solid var(--glass-border);
                display: flex; align-items: center; justify-content: space-between;
                padding: 0 24px; z-index: 1000; font-family: 'Outfit', sans-serif;
            ">
                <a href="https://doruklu.com" id="global-logo-link" style="display:flex; align-items:center; gap:12px; text-decoration:none; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    <div style="width: 42px; height: 42px; display:flex; align-items:center; justify-content:center;">${Assets.logoSVG}</div>
                    <span style="color: var(--text-main); font-weight: 800; font-size: 1.3rem; letter-spacing: -0.5px;">DORUKLU <span style="color: var(--primary); font-weight: 400;">${title}</span></span>
                </a>
                <div id="header-right-slot" style="display:flex; align-items:center; gap:15px;">
                    <!-- User badge buraya gelecek -->
                </div>
            </header>
        `;

        document.body.insertAdjacentHTML('afterbegin', headerHTML);
        ui.syncFavicon();

        // Hub URL'ini (token relay) asenkron olarak arka planda güncelliyoruz
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const hubUrl = `https://doruklu.com/?sso_token=${session.access_token}&sso_refresh=${session.refresh_token}`;
                const link = document.getElementById('global-logo-link');
                if (link) link.href = hubUrl;
            } else {
                // Giriş yoksa temayı zorla karanlık yap (User isteği)
                document.body.classList.remove('light-mode');
            }
        })();
    },

    /**
     * Kullanıcı profil bilgilerini ve ayarlarını (Tema vb.) içeren rozeti render eder.
     */
    renderUserBadge: (user, profile, logoutCallback) => {
        if (document.getElementById('doruklu-global-badge')) {
            document.getElementById('doruklu-global-badge').remove();
        }

        const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Kullanıcı';
        const email = user?.email || '';
        const avatarUrl = profile?.avatar_url;
        
        // Tema başlangıç kontrolü
        const currentTheme = localStorage.getItem('doruklu-theme') || 'dark';
        if (currentTheme === 'light') document.body.classList.add('light-mode');

        let avatarHTML = '';
        if (avatarUrl) {
            avatarHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        } else {
            const initial = displayName.charAt(0).toUpperCase();
            avatarHTML = `<div style="width:100%; height:100%; border-radius:50%; background: linear-gradient(135deg, #6366f1, #a855f7); color:white; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:1.2rem;">${initial}</div>`;
        }

        const badgeHTML = `
            <div id="doruklu-global-badge" style="z-index: 2000; font-family:'Outfit', sans-serif;">
                <div id="badge-trigger" style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:5px 12px; background:rgba(30,30,40,0.6); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.15); border-radius:30px; transition:all 0.3s;">
                    <div id="badge-avatar" style="width:32px; height:32px; border-radius:50%; border:2px solid rgba(255,255,255,0.2); overflow:hidden;">
                        ${avatarHTML}
                    </div>
                    <span style="color:white; font-weight:500; font-size:0.9rem; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayName}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
                
                <div id="badge-dropdown" style="display:none; position:absolute; top:65px; right:20px; background:var(--header-bg); backdrop-filter: blur(20px); border:1px solid var(--glass-border); border-radius:20px; padding:20px; width:280px; box-shadow:0 20px 40px rgba(0,0,0,0.3); transform-origin: top right;">
                    <div style="display:flex; flex-direction:column; align-items:center; text-align:center; padding-bottom:15px; border-bottom:1px solid var(--glass-border); margin-bottom:15px;">
                        <div style="width:64px; height:64px; border-radius:50%; border:2px solid var(--primary); overflow:hidden; margin-bottom:12px; padding:2px;">
                            ${avatarHTML}
                        </div>
                        <div style="font-weight:700; color:var(--text-main); font-size:1.15rem; margin-bottom:4px;">${displayName}</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary); word-break:break-all;">${email}</div>
                    </div>

                    <!-- Theme Toggle Section -->
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; margin-bottom:15px; border-bottom:1px solid var(--glass-border);">
                        <div style="display:flex; align-items:center; gap:10px; color:var(--text-main); font-size:0.9rem; font-weight:500;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                            Görünüm
                        </div>
                        <label class="toggle">
                            <input type="checkbox" id="theme-switcher-input" ${currentTheme === 'light' ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <button id="badge-logout-btn" style="width:100%; padding:12px; background:rgba(239, 68, 68, 0.1); color:var(--danger); border:1px solid rgba(239, 68, 68, 0.2); border-radius:12px; cursor:pointer; font-weight:700; font-size:0.95rem; transition:all 0.3s; display:flex; align-items:center; justify-content:center; gap:10px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        Oturumu Kapat
                    </button>
                </div>
            </div>
        `;

        const target = document.getElementById('header-right-slot') || document.body;
        if (target.id === 'header-right-slot') target.innerHTML = badgeHTML;
        else document.body.insertAdjacentHTML('beforeend', badgeHTML);

        const trigger = document.getElementById('badge-trigger');
        const dropdown = document.getElementById('badge-dropdown');
        const themeInput = document.getElementById('theme-switcher-input');
        
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) dropdown.style.display = 'none';
        });

        themeInput.addEventListener('change', (e) => {
            const isLight = e.target.checked;
            if (isLight) {
                document.body.classList.add('light-mode');
                localStorage.setItem('doruklu-theme', 'light');
            } else {
                document.body.classList.remove('light-mode');
                localStorage.setItem('doruklu-theme', 'dark');
            }
        });

        document.getElementById('badge-logout-btn').addEventListener('click', async () => {
            if(logoutCallback) await logoutCallback();
        });
    }
};
