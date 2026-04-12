import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

if (window.location.search.includes('reset_cache=true')) {
    localStorage.clear();
    sessionStorage.clear();
    
    // Bütün çerezleri her domain/path varyasyonu için yok et
    document.cookie.split(";").forEach(function(c) { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/;domain=.doruklu.com");
    });

    alert("Tüm Cache ve Cookie'ler başarıyla temizlendi! Şimdi sıfırdan başlıyorsunuz.");
    window.location.href = window.location.origin;
}

const supabaseUrl = 'https://izwubhjhqbmnxpddjljr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d3ViaGpocWJtbnhwZGRqbGpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2Njk5MjEsImV4cCI6MjA5MTI0NTkyMX0.luiCToferkH0Z3z59rh-4tzPA1yXqe4gM_ob3_qMLJU';

// Cross-domain cookie storage — .doruklu.com altındaki tüm subdomainler session paylaşır
function getCookieDomain() {
    const hostname = window.location.hostname;
    if (hostname.includes('doruklu.com')) return '.doruklu.com';
    return '';
}

const cookieStorage = {
    getItem: (key) => {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(key + '=')) {
                return decodeURIComponent(cookie.substring(key.length + 1));
            }
        }
        return null;
    },
    setItem: (key, value) => {
        const domain = getCookieDomain();
        const domainStr = domain ? `domain=${domain}; ` : '';
        document.cookie = `${key}=${encodeURIComponent(value)}; ${domainStr}path=/; max-age=31536000; SameSite=Lax; Secure`;
    },
    removeItem: (key) => {
        const domain = getCookieDomain();
        const domainStr = domain ? `domain=${domain}; ` : '';
        document.cookie = `${key}=; ${domainStr}path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage: cookieStorage,
        storageKey: 'sb-auth-token',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

export const AppState = { user: null, profile: null };
