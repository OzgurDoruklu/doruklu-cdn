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
        spinner.style.display = isLoading ? 'flex' : 'none';
    }
};
