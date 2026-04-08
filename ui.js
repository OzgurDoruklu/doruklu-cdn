export const ui = {
    showScreen: (screenId) => {
        const screens = ['auth-screen', 'dashboard-screen'];
        screens.forEach(s => {
            document.getElementById(s).style.display = s === screenId ? 'flex' : 'none';
        });
    },

    showError: (msg) => {
        const el = document.getElementById('alert-box');
        el.className = 'alert error show';
        el.textContent = msg;
        setTimeout(() => el.classList.remove('show'), 3000);
    },

    showSuccess: (msg) => {
        const el = document.getElementById('alert-box');
        el.className = 'alert success show';
        el.textContent = msg;
        setTimeout(() => el.classList.remove('show'), 3000);
    },

    setLoading: (isLoading) => {
        const spinner = document.getElementById('loading-spinner');
        if(spinner) spinner.style.display = isLoading ? 'flex' : 'none';
    },

    renderUserBadge: (user, profile, logoutCallback) => {
        if (document.getElementById('doruklu-global-badge')) return;

        let initial = 'U';
        if (profile?.display_name) {
            initial = profile.display_name.charAt(0).toUpperCase();
        } else if (user?.email) {
            initial = user.email.charAt(0).toUpperCase();
        }

        const badgeHTML = `
            <div id="doruklu-global-badge" style="position:fixed; top:20px; left:20px; z-index:9999; font-family:'Outfit', sans-serif;">
                <div id="badge-icon" style="width:45px; height:45px; border-radius:50%; background: linear-gradient(135deg, #d946ef, #8b5cf6); color:white; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:bold; font-size:1.2rem; box-shadow:0 4px 10px rgba(0,0,0,0.3); border: 2px solid rgba(255,255,255,0.2);">
                    ${initial}
                </div>
                <div id="badge-dropdown" style="display:none; position:absolute; top:55px; left:0; background:rgba(30,30,40,0.95); backdrop-filter: blur(10px); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:15px; width:220px; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                    <div style="font-weight:bold; color:white; margin-bottom:5px; font-size:1.1rem;">${profile?.display_name || 'Kullanıcı'}</div>
                    <div style="font-size:0.85rem; color:#aaa; margin-bottom:15px; word-break:break-all;">${user?.email || ''}</div>
                    <button id="badge-logout-btn" style="width:100%; padding:8px; background:#ef4444; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; display:flex; gap:8px; align-items:center; justify-content:center;">
                        Çıkış Yap
                    </button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', badgeHTML);

        document.getElementById('badge-icon').addEventListener('click', () => {
            const drop = document.getElementById('badge-dropdown');
            drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('badge-logout-btn').addEventListener('click', async () => {
            if(logoutCallback) await logoutCallback();
        });
    }
};
