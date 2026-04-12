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
    renderGlobalHeader: async (title = "") => {
        if (document.getElementById('doruklu-global-header')) return;

        const { data: { session } } = await supabase.auth.getSession();
        let hubUrl = 'https://doruklu.com';
        
        if (session) {
            hubUrl = `https://doruklu.com/?sso_token=${session.access_token}&sso_refresh=${session.refresh_token}`;
        }

        const headerHTML = `
            <header id="doruklu-global-header" style="
                position: fixed; top: 0; left: 0; width: 100%; height: 65px;
                background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(15px);
                border-bottom: 1px solid rgba(255,255,255,0.1);
                display: flex; align-items: center; justify-content: space-between;
                padding: 0 20px; z-index: 1000; font-family: 'Outfit', sans-serif;
            ">
                <a href="${hubUrl}" id="global-logo-link" style="display:flex; align-items:center; gap:12px; text-decoration:none; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    <div style="width: 40px; height: 40px;">${Assets.logoSVG}</div>
                    <span style="color: white; font-weight: 800; font-size: 1.2rem; letter-spacing: -0.5px;">DORUKLU <span style="color: #6366f1; font-weight: 400;">${title}</span></span>
                </a>
                <div id="header-right-slot" style="display:flex; align-items:center; gap:15px;">
                </div>
            </header>
        `;

        document.body.insertAdjacentHTML('afterbegin', headerHTML);
        ui.syncFavicon();
    },

    renderUserBadge: (user, profile, logoutCallback) => {
        if (document.getElementById('doruklu-global-badge')) {
            document.getElementById('doruklu-global-badge').remove();
        }

        const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Kullanıcı';
        const email = user?.email || '';
        const avatarUrl = profile?.avatar_url;

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
                
                <div id="badge-dropdown" style="display:none; position:absolute; top:55px; right:20px; background:rgba(15, 23, 42, 0.98); backdrop-filter: blur(20px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px; width:260px; box-shadow:0 10px 25px rgba(0,0,0,0.4); transform-origin: top right;">
                    <div style="display:flex; flex-direction:column; align-items:center; text-align:center; padding-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); margin-bottom:15px;">
                        <div style="width:60px; height:60px; border-radius:50%; border:2px solid #6366f1; overflow:hidden; margin-bottom:10px;">
                            ${avatarHTML}
                        </div>
                        <div style="font-weight:700; color:white; font-size:1.1rem; margin-bottom:2px;">${displayName}</div>
                        <div style="font-size:0.8rem; color:rgba(255,255,255,0.5); word-break:break-all;">${email}</div>
                    </div>
                    
                    <button id="badge-logout-btn" style="width:100%; padding:10px; background:rgba(239, 68, 68, 0.1); color:#f87171; border:1px solid rgba(239, 68, 68, 0.2); border-radius:10px; cursor:pointer; font-weight:700; font-size:0.9rem; transition:all 0.3s; display:flex; align-items:center; justify-content:center; gap:8px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
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
        
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
        });

        document.getElementById('badge-logout-btn').addEventListener('click', async () => {
            if(logoutCallback) await logoutCallback();
        });
    }
};
