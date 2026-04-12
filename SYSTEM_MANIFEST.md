# Doruklu Platform — System Manifest

> **Son güncelleme:** 2026-04-12
> Bu dosya tüm Doruklu platformunun haritasıdır. Her repo, DB tablosu ve bağımlılık burada izlenir.

---

## 🏗️ Mimari

```
doruklu.com (SSO Hub)          ← doruklu-main repo
    │
    ├── cdn.doruklu.com        ← doruklu-cdn repo (shared assets)
    │   ├── supabase-config.js   → Supabase client (localStorage)
    │   ├── auth.js              → Merkezi SSO auth modülü
    │   ├── ui.js                → Global UI (badge, alerts, spinner)
    │   ├── style.css            → Global CSS
    │   └── db-schema.sql        → DB şema takip dosyası
    │
    ├── ozgur.doruklu.com      ← doruklu-ozgur repo
    ├── toprak.doruklu.com     ← doruklu-toprak repo
    └── nurcan.doruklu.com     ← doruklu-nurcan repo
```

## 📦 Repolar

| Repo | URL | GitHub Pages | Açıklama |
|------|-----|--------------|----------|
| `doruklu-cdn` | cdn.doruklu.com | ✅ | Paylaşılan JS/CSS/Auth |
| `doruklu-main` | doruklu.com | ✅ | SSO hub + Admin paneli |
| `doruklu-ozgur` | ozgur.doruklu.com | ✅ | Özgür'ün kişisel alanı |
| `doruklu-toprak` | toprak.doruklu.com | ✅ | Bilgi kartı oyunu |
| `doruklu-nurcan` | nurcan.doruklu.com | ✅ | Nurcan'ın uygulaması |

## 🔗 CDN Bağımlılık Haritası

Her repo CDN'den neyi kullanıyor:

| Dosya | main | ozgur | toprak | nurcan |
|-------|------|-------|--------|--------|
| `supabase-config.js` | ✅ | ✅ | ✅ | ✅ |
| `auth.js` | ❌ (kendi) | ✅ | ✅ | ✅ |
| `ui.js` | ✅ | ✅ | ✅ (+ kendi) | ✅ |
| `style.css` | ✅ | ✅ | ✅ | ✅ |

> **NOT:** `doruklu-main` kendi auth akışını kullanır (SSO hub olduğu için).  
> `doruklu-toprak` CDN ui.js + kendi ui.js (oyun-spesifik) kullanır.

## 🗄️ Veritabanı (Supabase)

**Proje URL:** `https://izwubhjhqbmnxpddjljr.supabase.co`

### Tablolar

| Tablo | Kolon Sayısı | Açıklama |
|-------|-------------|----------|
| `profiles` | 6 | Kullanıcı profilleri (role, permissions, score) |
| `flashcards` | 6 | Bilgi kartı soruları |
| `game_sessions` | 9 | Oyun oturum kayıtları |

### Şema Detayı → [`db-schema.sql`](./db-schema.sql)

### Roller

| Rol | Yetkiler |
|-----|----------|
| `super_admin` | Tüm uygulamalar + admin paneli + kullanıcı yönetimi |
| `admin` | Tüm uygulamalar + admin paneli |
| `player` | Sadece izin verilen uygulamalar (permissions JSONB) |

### Permissions JSONB Anahtarları

| Anahtar | Kontrol Eden Uygulama |
|---------|----------------------|
| `toprak_game` | toprak.doruklu.com |
| `ozgur_dashboard` | ozgur.doruklu.com |
| `nurcan_app` | nurcan.doruklu.com |

## 🔐 SSO Akışı

```
Subdomain (session yok)
    → redirect: doruklu.com?redirect_to=SUBDOMAIN_URL
    → doruklu.com: localStorage session var → Google OAuth (yoksa)
    → redirect: SUBDOMAIN_URL#access_token=...&refresh_token=...
    → Subdomain: Supabase detectSessionInUrl → localStorage'a kaydeder
    → Subdomain: Profil sorgusu → yetki kontrolü → uygulama göster
```

## 📋 Kontrol Listesi — DB Değişikliği Yapıldığında

- [ ] `db-schema.sql` güncellendi mi?
- [ ] RLS politikaları `super_admin` dahil mi?
- [ ] JS kodları yeni/silinen kolonları yansıtıyor mu?
- [ ] Tüm subdomain'ler test edildi mi?

## 📋 Kontrol Listesi — Yeni Uygulama Eklendiğinde

- [ ] Yeni repo oluşturuldu mu?
- [ ] CDN auth.js'deki `initSubdomainAuth(appKey)` için yeni appKey belirlendi mi?
- [ ] `doruklu-main/js/app.js`'deki `apps` dizisine eklendi mi?
- [ ] `profiles.permissions` JSONB'ye yeni anahtar eklendi mi?
- [ ] RLS politikaları güncellendi mi?
- [ ] Bu manifest güncellendi mi?
