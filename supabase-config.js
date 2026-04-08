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

// LÜTFEN BURALARI KENDİ SUPABASE BİLGİLERİNİZLE DEĞİŞTİRİN
const supabaseUrl = 'https://izwubhjhqbmnxpddjljr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d3ViaGpocWJtbnhwZGRqbGpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2Njk5MjEsImV4cCI6MjA5MTI0NTkyMX0.luiCToferkH0Z3z59rh-4tzPA1yXqe4gM_ob3_qMLJU';

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

export const AppState = { user: null, profile: null };
