# doruklu-cdn - Copilot Proje Bağlamı

## Proje
`cdn.doruklu.com` — Tüm Doruklu uygulamaları için merkezi CDN.

## Amaç
Ortak CSS, JS ve Supabase Auth konfigürasyonlarını barındırır.
Diğer projeler bu dosyaları `https://cdn.doruklu.com/` üzerinden mutlak path ile import eder.

## Dosyalar
- `assets.js` — Ortak asset yönetimi
- `auth.js` — Supabase Auth ortak mantığı
- `style.css` — Ortak stil dosyası
- `supabase-config.js` — Supabase bağlantı konfigürasyonu
- `db-schema.sql` — Veritabanı şeması

## Kurallar
- Bir değişiklik diğer tüm projeleri etkiler — dikkatli ol
- Geriye dönük uyumluluk koru
