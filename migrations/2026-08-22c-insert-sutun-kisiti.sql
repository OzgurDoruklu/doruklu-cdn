-- ============================================================
-- DORUKLU PLATFORM — profiles INSERT sütun kısıtı
-- Tarih: 2026-08-22 · BULGULAR.md K-12
-- ============================================================
-- ÇALIŞTIRMA: Supabase SQL Editor → tamamını yapıştır → Run. Idempotent.
--
-- NEDEN GEREKLİ
-- 2026-08-22-security.sql yetki yükseltmesini UPDATE tarafında kapattı.
-- INSERT tarafı açık kalmıştı:
--
--   • `authenticated` tablo düzeyinde INSERT tutuyordu → TÜM sütunlara yazabiliyordu
--   • RLS'teki INSERT politikası yalnızca `auth.uid() = id` kontrolü yapıyor,
--     `role` / `permissions` / `total_score` DEĞERLERİNE bakmıyor
--
-- Sonuç: profili henüz oluşmamış bir kullanıcı ilk kaydını doğrudan
-- role='super_admin' olarak atabiliyordu. Google girişi herhangi bir hesaba
-- açık olduğu için dışarıdan biri kaydolup ilk INSERT'te yönetici olabilirdi.
-- Mevcut kullanıcılar bunu yapamaz (birincil anahtar çakışır) — risk YENİ hesaplarda.
--
-- ÇÖZÜM: UPDATE'te uygulanan kalıbın aynısı. Tablo düzeyi INSERT alınır,
-- yalnızca kimlik/görünüm sütunları geri verilir. role, permissions ve
-- total_score artık client tarafından HİÇ yazılamaz; sütun varsayılanları geçerli olur
-- ('player', '{}'::jsonb, 0).
-- ============================================================

-- ── INSERT'i sütun düzeyine indir ───────────────────────────
REVOKE INSERT ON public.profiles FROM authenticated;
GRANT  INSERT (id, display_name, email, avatar_url) ON public.profiles TO authenticated;

-- ── Varsayılanların gerçekten yerinde olduğundan emin ol ────
-- (Sütun grant'i role'ü engelliyor; değeri DB koyacak.)
ALTER TABLE public.profiles ALTER COLUMN role        SET DEFAULT 'player';
ALTER TABLE public.profiles ALTER COLUMN permissions SET DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ALTER COLUMN total_score SET DEFAULT 0;

-- ── RLS politikasını da tekilleştir ─────────────────────────
DROP POLICY IF EXISTS "Kullanıcılar kendi profilini oluşturabilir" ON public.profiles;
DROP POLICY IF EXISTS "Kullanici kendi profilini olusturur"        ON public.profiles;

CREATE POLICY "Kullanici kendi profilini olusturur" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);


-- ============================================================
DO $$ BEGIN RAISE NOTICE '[Doruklu] profiles INSERT sutun duzeyine indirildi.'; END $$;


-- ============================================================
-- DOĞRULAMA — sonra ayrı çalıştır
-- ============================================================
-- 1) INSERT yalnızca dört sütunda görünmeli:
--    avatar_url, display_name, email, id
--
-- SELECT column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema='public' AND table_name='profiles'
--   AND grantee='authenticated' AND privilege_type='INSERT'
-- ORDER BY column_name;
--
-- 2) Tablo düzeyinde INSERT KALMAMALI (yalnızca SELECT görünmeli):
--
-- SELECT privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='profiles' AND grantee='authenticated';
--
-- 3) Gerçek saldırı denemesi — "permission denied" beklenir:
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
-- INSERT INTO profiles (id, display_name, role)
-- VALUES ('11111111-1111-1111-1111-111111111111', 'saldirgan', 'super_admin');
-- ROLLBACK;
--
-- 4) Meşru sütunlarla kayıt — yetki engeline TAKILMAMALI:
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
-- INSERT INTO profiles (id, display_name, email, avatar_url)
-- VALUES ('11111111-1111-1111-1111-111111111111', 'test', 'test@example.com', NULL);
-- ROLLBACK;
--
--    Beklenen: `violates foreign key constraint "profiles_id_fkey"`
--    (sahte UUID auth.users'ta yok). Bu hatanın gelmesi İYİdir — sütun yetkisi
--    aşıldı, sıra satır doğrulamasına geldi demektir. "permission denied" gelirse
--    grant'ler fazla daraltılmış demektir, haber ver.
