# Doruklu Platform — System Manifest

> **Son güncelleme:** 2026-08-22 (güvenlik sertleştirmesi)
> Bu dosya tüm Doruklu platformunun haritasıdır. Her repo, DB tablosu ve bağımlılık burada izlenir.
> Ayrıntılı mimari ve risk kaydı çalışma alanındadır: `D:\Github\DORUKLU-PLATFORM.md`, `D:\Github\BULGULAR.md`

---

## 🏗️ Mimari

```
doruklu.com (SSO Hub)          ← doruklu-main repo
    │
    ├── cdn.doruklu.com        ← doruklu-cdn repo (shared assets)
    │   ├── supabase-config.js   → Supabase client + PLATFORM_VERSION
    │   ├── auth.js              → Merkezi SSO auth modülü
    │   ├── util.js              → esc / safeImageUrl / safeRedirect  (güvenlik yardımcıları)
    │   ├── ui.js                → Global UI (header, badge, alerts, spinner)
    │   ├── assets.js            → Logo SVG
    │   ├── style.css            → Global CSS
    │   ├── db-schema.sql        → DB şema takip dosyası
    │   └── migrations/          → Uygulanmış SQL göçleri
    │
    ├── ozgur.doruklu.com      ← doruklu-ozgur repo
    ├── toprak.doruklu.com     ← doruklu-toprak repo
    ├── nurcan.doruklu.com     ← doruklu-nurcan repo
    ├── dashboard.doruklu.com  ← doruklu-dashboard repo
    ├── dashboard-builder…     ← doruklu-dashboard-builder repo
    └── drument.doruklu.com    ← doruklu-drument repo (platform dışı, SSO yok)
```

## 📦 Repolar

| Repo | URL | GitHub Pages | Açıklama |
|------|-----|--------------|----------|
| `doruklu-cdn` | cdn.doruklu.com | ✅ | Paylaşılan JS/CSS/Auth |
| `doruklu-main` | doruklu.com | ✅ | SSO hub + Admin paneli |
| `doruklu-ozgur` | ozgur.doruklu.com | ✅ | Özgür'ün kişisel alanı (placeholder) |
| `doruklu-toprak` | toprak.doruklu.com | ✅ | Bilgi kartı oyunu |
| `doruklu-nurcan` | nurcan.doruklu.com | ✅ | Nurcan'ın uygulaması (placeholder) |
| `doruklu-dashboard` | dashboard.doruklu.com | ✅ | Kullanıcı / Sistem istatistik paneli |
| `doruklu-dashboard-builder` | dashboard-builder.doruklu.com | ✅ | Rapor şablon tasarım aracı |
| `doruklu-boboraktv` | boboraktv.doruklu.com | ✅ | **Platform dışı** — Boborak TV web yüzü, ayrı Supabase projesi. CDN’den yalnızca `style.css` alır |
| `doruklu-drument` | drument.doruklu.com | ✅ | **Platform dışı** — Alesis Nitro davul öğrenme ortamı. SSO yok, Supabase yok, CDN bağımlılığı yok (tamamen kendi içinde). `ALLOWED_ORIGINS`'e **eklenmedi** — token almasına gerek yok |

## 🔗 CDN Bağımlılık Haritası

| Dosya | main | ozgur | toprak | nurcan | dashboard | builder |
|-------|------|-------|--------|--------|-----------|---------|
| `supabase-config.js` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.js` | ✅ (isHub) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `util.js` | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `ui.js` | ✅ | ✅ | ✅ (+ kendi) | ✅ | ✅ | ✅ |
| `style.css` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (Tailwind) |

> `doruklu-main` `initPlatformAuth({ isHub: true })` ile aynı modülü kullanır.
> `doruklu-dashboard-builder` ortak CSS yerine Tailwind kullanır — tek istisna.

## 🗄️ Veritabanı (Supabase)

**Proje:** `izwubhjhqbmnxpddjljr`

| Tablo | Açıklama |
|-------|----------|
| `profiles` | Kullanıcı profilleri (role, permissions, total_score) |
| `flashcards` | Bilgi kartı soruları |
| `game_sessions` | Oyun oturum kayıtları — trigger ile `total_score`'u işler |
| `reports` | Dashboard Builder rapor şemaları (`owner_id` ile sahiplik) |

**Şema detayı →** [`db-schema.sql`](./db-schema.sql) · **Göçler →** [`migrations/`](./migrations/)

### Sunucu tarafı fonksiyonlar

| Fonksiyon | Amaç |
|---|---|
| `get_auth_role()` | RLS rekürsiyonunu kıran rol okuyucu |
| `set_user_permission(target_id, perm_key, perm_value)` | **Tek meşru yetki değiştirme kapısı** (super_admin) |
| `set_user_role(target_id, new_role)` | Rol değiştirme (super_admin, kendi rolü hariç) |
| `apply_session_score()` | `game_sessions` insert trigger'ı — puanı sunucuda işler |
| `check_flashcard_answer(kart_id, cevap)` | **Cevap doğrulama.** Yalnızca boolean döner; `correct_answer` client'a hiç inmez |
| `admin_list_flashcards()` | Yönetici kart listesi (cevaplar dahil). admin/super_admin kontrolü sunucuda |

### Roller

| Rol | Yetkiler |
|-----|----------|
| `super_admin` | Tüm uygulamalar + admin paneli + kullanıcı/rol yönetimi |
| `admin` | Tüm uygulamalar + kart yönetimi (kullanıcı yönetimi **yok**) |
| `player` | Sadece `permissions` JSONB'sinde `true` olan uygulamalar |

### Permissions JSONB Anahtarları

| Anahtar | Kontrol Eden Uygulama |
|---------|----------------------|
| `toprak_game` | toprak.doruklu.com |
| `ozgur_dashboard` | ozgur.doruklu.com |
| `nurcan_app` | nurcan.doruklu.com |
| `doruklu_dashboard` | dashboard.doruklu.com |
| `doruklu_dashboard_builder` | dashboard-builder.doruklu.com |

## 🔐 SSO Akışı

```
Subdomain (session yok)
    → redirect: doruklu.com?redirect_to=SUBDOMAIN_URL
    → Hub: redirect_to util.js ALLOWED_ORIGINS listesinden geçer (yoksa yok sayılır)
    → Hub: localStorage session var mı? yoksa → Google OAuth
    → redirect: SUBDOMAIN_URL#sso_token=...&sso_refresh=...   ← HASH fragment
    → Subdomain: setSession() → localStorage'a yazar, URL temizlenir
    → Subdomain: Profil sorgusu → permissions[appKey] → uygulama göster
```

> Token'lar **hash fragment** ile taşınır; fragment sunucuya gönderilmez, Referer'a düşmez.
> Query string (`?sso_token=`) yalnızca geriye dönük uyumluluk için **okunur**, asla üretilmez.

## 🚪 Çıkış Akışı (platform geneli)

```
Rozet → "Oturumu Kapat" → performGlobalLogout()
    1. supabase.auth.signOut()          ← ÖNCE. scope:'global', refresh token'ları sunucuda iptal eder
    2. clearAllCaches()                 ← localStorage + çerezler (logout damgası HARİÇ)
    3. doruklu_logout_at=s<saniye> çerezi ← .doruklu.com alanına, tüm subdomain'ler görür
    4. doruklu.com/?logout=true
```

Damga, **çıkış anındaki token'ın JWT `iat` iddiasından** üretilir (`s<saniye>`). Her origin
açılışta kendi oturumunun `iat`'ıyla karşılaştırır; `tokenIat <= damga` ise bayat oturumu düşürür.

> ⚠️ **Damga `localStorage`'a YAZILMAZ.** İlk sürüm öyleydi ve girişi tamamen kırdı: çıkış
> `localStorage`'ı da sildiği için taze oturum `0` ile kıyaslanıp anında öldürülüyordu (R-01).
> Ölçüt, oturumun kendi içinde olmalı.
>
> ⚠️ **İki farklı saat karşılaştırılmaz.** Damga da token da Supabase sunucusunun saatinden
> gelir. Oturum okunamazsa `c<saniye>` (istemci saati) yedeğine düşülür ve 120 sn pay bırakılır.
> Tanınmayan biçimdeki damgalar yok sayılır — fail open (R-02).

> ⚠️ `doruklu_logout_at` çerezi silinirse çıkış subdomain'lere ulaşmaz. `clearAllCaches()` ve
> `supabase-config.js`'deki `?logout=true` temizliği bu çerezi bilerek atlıyor — dokunma.
> `localStorage` origin başına ayrı olduğu için çıkışı yayacak başka bir kanal yok.

## 📋 Kontrol Listesi — CDN Değişikliği

- [ ] `supabase-config.js` içindeki `PLATFORM_VERSION` artırıldı mı?
- [ ] Tüm `index.html`'lerdeki `?v=` eki senkron mu? (`doruklu.sh version`)
- [ ] Export imzası değişti mi? → 6 sitenin tamamı etkilenir
- [ ] Push sonrası 6 subdomain de elle denendi mi?

## 📋 Kontrol Listesi — DB Değişikliği

- [ ] `db-schema.sql` güncellendi mi?
- [ ] Politika hem `USING` hem `WITH CHECK` alıyor mu?
- [ ] `anon` rolü bilerek mi dahil? (`USING (true)` anon'u da kapsar)
- [ ] Client'a kapalı olması gereken sütunlar için `REVOKE` var mı?
      (Sıra zorunlu: önce tablo düzeyi yetkiyi al, sonra serbest sütunları `GRANT` et.
       Tablo yetkisi dururken sütun düzeyinde `REVOKE` **etkisizdir**.
       INSERT ve UPDATE'in **ikisi de** kapatılmalı — yalnızca UPDATE, satırı ilk kez
       oluşturan kullanıcı için hiçbir şey ifade etmez.)
- [ ] Sütun kısıtlanan tabloda istemci `select('*')` yapıyor mu? Yıldız genişlemesi
      yetkisiz sütuna denk gelip sorguyu düşürür — açık sütun listesi yaz.
- [ ] Göç dosyası `migrations/` altına yazıldı mı?

## 📋 Kontrol Listesi — Yeni Uygulama

**Önce şunu cevapla: uygulama bu platformun Supabase projesini mi kullanacak?**

Hayırsa (kendi projesi varsa) aşağıdaki `ALLOWED_ORIGINS` / `appKey` / `appGroups` adımları
**uygulanmaz** — `cdn.doruklu.com/auth.js` ve `ui.js` de import edilmez. Yalnızca `style.css`
ortak olabilir. Örnek: `doruklu-boboraktv`. Yanlış projede oturum açan kullanıcı kendi
verisini göremez ve hata mesajı almaz.

- [ ] Repo + `CNAME` dosyası + GoDaddy CNAME kaydı
- [ ] GitHub Pages açık ve **Enforce HTTPS** işaretli
- [ ] `util.js` içindeki `ALLOWED_ORIGINS` listesine yeni origin eklendi mi? ← **unutulursa SSO çalışmaz**
- [ ] `initSubdomainAuth('<yeni_app_key>')` bağlandı mı?
- [ ] `doruklu-main/js/app.js` → `appGroups` dizisine eklendi mi?
- [ ] Admin tablosuna yetki toggle sütunu eklendi mi?
- [ ] Bu manifest güncellendi mi?
