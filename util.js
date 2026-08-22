/**
 * Doruklu CDN — Ortak Güvenlik Yardımcıları
 *
 * Bu dosyada UI ya da Supabase bağımlılığı YOKTUR; her modül serbestçe import edebilir.
 * Kullanıcıdan gelen hiçbir veri escape edilmeden innerHTML'e basılmamalıdır.
 */

/**
 * Platformun tanıdığı origin'ler — SSO token'ı YALNIZCA buradaki adreslere teslim edilir.
 * Yeni subdomain eklenince buraya da eklenmeli, yoksa SSO sessizce çalışmaz.
 *
 * Listede olmayan bir subdomain hâlâ yayında olabilir; sadece token almaz.
 * Aktif olmayan uygulamaları listeden çıkarmak saldırı yüzeyini küçültür.
 */
export const ALLOWED_ORIGINS = Object.freeze([
    'https://doruklu.com',
    'https://www.doruklu.com',
    'https://cdn.doruklu.com',
    'https://ozgur.doruklu.com',
    'https://toprak.doruklu.com',
    'https://nurcan.doruklu.com'

    // ⏸️ 2026-08-22: Aktif geliştirilmiyorlar, SSO yüzeyinden çıkarıldılar.
    // Üzerlerinde çalışmaya başlayınca bu iki satırı geri aç.
    // 'https://dashboard.doruklu.com',
    // 'https://dashboard-builder.doruklu.com'
]);

/**
 * HTML metin escape'i. innerHTML'e basılan HER kullanıcı verisi bundan geçmeli.
 * Öznitelik içinde de güvenlidir (tırnak ve tek tırnak kaçırılıyor).
 */
export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * <img src> için güvenli URL. Sadece https ve data:image kabul edilir;
 * javascript: / data:text/html gibi şemalar boş dönerek etkisizleşir.
 */
export function safeImageUrl(raw) {
    const s = String(raw ?? '').trim();
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(s)) return esc(s);
    try {
        const u = new URL(s);
        return u.protocol === 'https:' ? esc(u.toString()) : '';
    } catch {
        return '';
    }
}

/**
 * Açık yönlendirme koruması. Sadece ALLOWED_ORIGINS içindeki TAM origin'lere izin verir.
 * `endsWith('.doruklu.com')` bilerek kullanılmadı — `ozgur.doruklu.com.saldirgan.example`
 * gibi adresleri elemek için tam eşleşme gerekiyor.
 *
 * @returns {URL|null} Güvenliyse URL nesnesi, değilse null.
 */
export function safeRedirect(raw) {
    if (!raw) return null;
    try {
        const u = new URL(String(raw), window.location.origin);
        return ALLOWED_ORIGINS.includes(u.origin) ? u : null;
    } catch {
        return null;
    }
}
