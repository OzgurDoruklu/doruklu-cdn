-- ============================================================
-- DORUKLU PLATFORM — Güvenlik Sertleştirmesi
-- Tarih: 2026-08-22 · Kapsam: BULGULAR.md K-01, K-05, K-06, K-08
-- Revizyon: r2 — eksik tablolara dayanıklı
-- ============================================================
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → tamamını yapıştır → Run.
-- Idempotent'tir; iki kez çalıştırmak zarar vermez.
--
-- ⚠️ SIRA ÖNEMLİ: Bu dosyayı JS deploy'undan ÖNCE çalıştır.
--    Yeni JS artık total_score yazmıyor; trigger olmadan puanlar hiç işlenmez.
--
-- ── r2 neden gerekti ────────────────────────────────────────
-- İlk sürüm `ERROR: 42P01: relation "public.reports" does not exist` ile durdu.
-- Sebep: `DROP POLICY IF EXISTS ... ON tablo` ifadesindeki IF EXISTS **politikaya**
-- bakar, tabloya değil. Tablo yoksa ifade patlar.
-- Supabase SQL Editor her şeyi tek transaction'da çalıştırdığı için hiçbir şey uygulanmadı.
--
-- Ortaya çıkan gerçek: `reports` tablosu canlıda hiç oluşturulmamış. Yani
-- dashboard-builder'ın "Kaydet" düğmesi bugüne kadar hiç çalışmadı.
--
-- Bu sürümde tablo bağımlı her bölümün başında CREATE TABLE IF NOT EXISTS var;
-- böylece tablo ister olsun ister olmasın script sonuna kadar akıyor.
-- ============================================================


-- ============================================================
-- 0. ÖN KONTROL
-- ============================================================
DO $$
DECLARE eksik TEXT := '';
BEGIN
    IF to_regclass('public.profiles')      IS NULL THEN eksik := eksik || 'profiles ';      END IF;
    IF to_regclass('public.flashcards')    IS NULL THEN eksik := eksik || 'flashcards ';    END IF;
    IF to_regclass('public.game_sessions') IS NULL THEN eksik := eksik || 'game_sessions '; END IF;
    IF to_regclass('public.reports')       IS NULL THEN eksik := eksik || 'reports ';       END IF;

    IF eksik = '' THEN
        RAISE NOTICE '[Doruklu] Tum tablolar mevcut.';
    ELSE
        RAISE NOTICE '[Doruklu] Eksik tablo(lar): % -> asagida olusturulacak.', eksik;
    END IF;

    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'profiles tablosu yok. Once db-schema.sql calistirilmali.';
    END IF;
END $$;


-- ============================================================
-- YARDIMCI: rol okuyucu (politikaların tamamı buna bağlı)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT role FROM profiles WHERE id = auth.uid();
$fn$;


-- ============================================================
-- K-01 + K-08 — Yetki yükseltmesini kapat
-- ============================================================
-- Sorun: profiles UPDATE politikalarında WITH CHECK yoktu. PostgreSQL bu durumda
-- USING ifadesini satır-sonrası kontrol olarak da kullanır — "kendi satırın mı"
-- diye bakar, "hangi sütunu değiştirdin" diye BAKMAZ. Sonuç: her kullanıcı
-- kendi role'ünü 'super_admin' yapabiliyordu.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kullanıcılar kendi profilini güncelleyebilir" ON public.profiles;
DROP POLICY IF EXISTS "Yöneticiler profilleri güncelleyebilir"      ON public.profiles;
DROP POLICY IF EXISTS "Kullanici kendi profilini gunceller"         ON public.profiles;
DROP POLICY IF EXISTS "Super admin profilleri gunceller"            ON public.profiles;

-- 1) Kullanıcı kendi profilini günceller — role/permissions/total_score DEĞİŞEMEZ
CREATE POLICY "Kullanici kendi profilini gunceller" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND role        IS NOT DISTINCT FROM (SELECT p.role        FROM public.profiles p WHERE p.id = auth.uid())
        AND permissions IS NOT DISTINCT FROM (SELECT p.permissions FROM public.profiles p WHERE p.id = auth.uid())
        AND total_score IS NOT DISTINCT FROM (SELECT p.total_score FROM public.profiles p WHERE p.id = auth.uid())
    );

-- 2) Yetki yönetimi SADECE super_admin (admin artık kendini yükseltemez)
CREATE POLICY "Super admin profilleri gunceller" ON public.profiles
    FOR UPDATE TO authenticated
    USING      (public.get_auth_role() = 'super_admin')
    WITH CHECK (public.get_auth_role() = 'super_admin');

-- 3) İkinci bariyer: sütun düzeyinde yetki. RLS'ten BAĞIMSIZ çalışır.
--
-- ⚠️ SIRA ZORUNLU: PostgreSQL'de tablo düzeyinde UPDATE yetkisi dururken
--    `REVOKE UPDATE (sütun)` HİÇBİR ŞEY YAPMAZ — sütun iptali tablo yetkisini ezmez.
--    Supabase varsayılan olarak `authenticated` rolüne tablo düzeyinde ALL veriyor.
--    Doğru kalıp: önce tablo yetkisini tamamen al, sonra sadece serbest sütunları ver.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (display_name, email, avatar_url) ON public.profiles TO authenticated;
GRANT  SELECT, INSERT ON public.profiles TO authenticated;

REVOKE ALL ON public.profiles FROM anon;

-- Meşru yetki değiştirme kapısı (REVOKE'u SECURITY DEFINER ile aşar)
CREATE OR REPLACE FUNCTION public.set_user_permission(
    target_id UUID, perm_key TEXT, perm_value BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF public.get_auth_role() <> 'super_admin' THEN
        RAISE EXCEPTION 'Yetkisiz: yalnizca super_admin izin degistirebilir';
    END IF;

    UPDATE public.profiles
       SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(perm_key, perm_value)
     WHERE id = target_id;
END;
$fn$;

REVOKE ALL     ON FUNCTION public.set_user_permission(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_user_permission(UUID, TEXT, BOOLEAN) TO authenticated;

-- Rol değişimi de aynı kapıdan
CREATE OR REPLACE FUNCTION public.set_user_role(target_id UUID, new_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF public.get_auth_role() <> 'super_admin' THEN
        RAISE EXCEPTION 'Yetkisiz: yalnizca super_admin rol degistirebilir';
    END IF;
    IF new_role NOT IN ('super_admin', 'admin', 'player') THEN
        RAISE EXCEPTION 'Gecersiz rol: %', new_role;
    END IF;
    IF target_id = auth.uid() THEN
        RAISE EXCEPTION 'Kendi rolunu degistiremezsin';  -- kilitlenmeye karsi
    END IF;

    UPDATE public.profiles SET role = new_role WHERE id = target_id;
END;
$fn$;

REVOKE ALL     ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;


-- ============================================================
-- K-05a — flashcards: anonim okumayı kapat
-- ============================================================
-- SELECT USING (true) 'anon' rolünü de kapsıyordu. Anon key public olduğu için
-- giriş yapmamış herkes tüm soruları cevaplarıyla çekebiliyordu.

CREATE TABLE IF NOT EXISTS public.flashcards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_type   TEXT NOT NULL CHECK (question_type IN ('single_choice', 'multi_choice', 'free_text')),
    content         TEXT NOT NULL,
    options         JSONB,
    correct_answer  JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Herkes kartları okuyabilir"         ON public.flashcards;
DROP POLICY IF EXISTS "Yöneticiler kart ekleyebilir"       ON public.flashcards;
DROP POLICY IF EXISTS "Yöneticiler kart güncelleyebilir"   ON public.flashcards;
DROP POLICY IF EXISTS "Yöneticiler kart silebilir"         ON public.flashcards;
DROP POLICY IF EXISTS "Giris yapanlar kartlari okuyabilir" ON public.flashcards;
DROP POLICY IF EXISTS "Yoneticiler kart ekler"             ON public.flashcards;
DROP POLICY IF EXISTS "Yoneticiler kart gunceller"         ON public.flashcards;
DROP POLICY IF EXISTS "Yoneticiler kart siler"             ON public.flashcards;

CREATE POLICY "Giris yapanlar kartlari okuyabilir" ON public.flashcards
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Yoneticiler kart ekler" ON public.flashcards
    FOR INSERT TO authenticated WITH CHECK (public.get_auth_role() IN ('admin','super_admin'));

CREATE POLICY "Yoneticiler kart gunceller" ON public.flashcards
    FOR UPDATE TO authenticated
    USING      (public.get_auth_role() IN ('admin','super_admin'))
    WITH CHECK (public.get_auth_role() IN ('admin','super_admin'));

CREATE POLICY "Yoneticiler kart siler" ON public.flashcards
    FOR DELETE TO authenticated USING (public.get_auth_role() IN ('admin','super_admin'));

REVOKE ALL ON public.flashcards FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;


-- ============================================================
-- K-06 — Puanı sunucuda hesapla
-- ============================================================
-- total_score artık client'a kapalı (yukarıdaki REVOKE). Meşru yol bu trigger:
-- puan, oyun bitince game_sessions'a yazılan score_delta üzerinden işleniyor.

CREATE TABLE IF NOT EXISTS public.game_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    duration_seconds    INTEGER DEFAULT 0,
    questions_answered  JSONB DEFAULT '[]'::jsonb,
    total_questions     INTEGER DEFAULT 0,
    correct_count       INTEGER DEFAULT 0,
    incorrect_count     INTEGER DEFAULT 0,
    score_delta         INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Yöneticiler tüm session'ları okuyabilir" ON public.game_sessions;
DROP POLICY IF EXISTS "Yoneticiler tum sessionlari okuyabilir"  ON public.game_sessions;
DROP POLICY IF EXISTS "Player kendi session'ını görebilir"      ON public.game_sessions;
DROP POLICY IF EXISTS "Player kendi sessionini gorebilir"       ON public.game_sessions;
DROP POLICY IF EXISTS "Player yeni session ekleyebilir"         ON public.game_sessions;

CREATE POLICY "Player kendi sessionini gorebilir" ON public.game_sessions
    FOR SELECT TO authenticated USING (auth.uid() = player_id);

CREATE POLICY "Yoneticiler tum sessionlari okuyabilir" ON public.game_sessions
    FOR SELECT TO authenticated USING (public.get_auth_role() IN ('admin','super_admin'));

CREATE POLICY "Player yeni session ekleyebilir" ON public.game_sessions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

REVOKE ALL ON public.game_sessions FROM anon;
GRANT  SELECT, INSERT ON public.game_sessions TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_session_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    -- score_delta client'tan geliyor; makul aralığa sıkıştırılıyor.
    -- 15 soru x 3 puan = 45 üst sınır, tamamı yanlış = -15.
    IF NEW.score_delta IS NULL OR NEW.score_delta < -50 OR NEW.score_delta > 50 THEN
        RAISE EXCEPTION 'Gecersiz score_delta: %', NEW.score_delta;
    END IF;

    UPDATE public.profiles
       SET total_score = COALESCE(total_score, 0) + NEW.score_delta
     WHERE id = NEW.player_id;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_apply_session_score ON public.game_sessions;
CREATE TRIGGER trg_apply_session_score
    AFTER INSERT ON public.game_sessions
    FOR EACH ROW EXECUTE FUNCTION public.apply_session_score();


-- ============================================================
-- K-05b — reports: tablo canlıda YOKTU, burada oluşturuluyor
-- ============================================================
-- db-schema.sql bu tabloyu içeriyordu ama canlıya hiç uygulanmamış.
-- Pratik sonucu: dashboard-builder'ın "Kaydet" düğmesi bugüne kadar hiç çalışmadı.

CREATE TABLE IF NOT EXISTS public.reports (
    id          TEXT PRIMARY KEY,
    schema      JSONB NOT NULL DEFAULT '{}'::jsonb,
    owner_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Tablo başka bir ortamda zaten varsa eksik sütunu tamamla
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Herkes raporları okuyabilir"             ON public.reports;
DROP POLICY IF EXISTS "Yöneticiler rapor ekleyebilir"           ON public.reports;
DROP POLICY IF EXISTS "Yöneticiler rapor güncelleyebilir"       ON public.reports;
DROP POLICY IF EXISTS "Yöneticiler rapor silebilir"             ON public.reports;
DROP POLICY IF EXISTS "Giris yapanlar raporlari okuyabilir"     ON public.reports;
DROP POLICY IF EXISTS "Yoneticiler rapor ekler"                 ON public.reports;
DROP POLICY IF EXISTS "Sahibi veya super_admin rapor gunceller" ON public.reports;
DROP POLICY IF EXISTS "Yoneticiler rapor siler"                 ON public.reports;

CREATE POLICY "Giris yapanlar raporlari okuyabilir" ON public.reports
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Yoneticiler rapor ekler" ON public.reports
    FOR INSERT TO authenticated
    WITH CHECK (public.get_auth_role() IN ('admin','super_admin') AND owner_id = auth.uid());

CREATE POLICY "Sahibi veya super_admin rapor gunceller" ON public.reports
    FOR UPDATE TO authenticated
    USING      (owner_id = auth.uid() OR public.get_auth_role() = 'super_admin')
    WITH CHECK (owner_id = auth.uid() OR public.get_auth_role() = 'super_admin');

CREATE POLICY "Yoneticiler rapor siler" ON public.reports
    FOR DELETE TO authenticated USING (public.get_auth_role() IN ('admin','super_admin'));

REVOKE ALL ON public.reports FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;


-- ============================================================
DO $$ BEGIN RAISE NOTICE '[Doruklu] Guvenlik gocu tamamlandi.'; END $$;


-- ============================================================
-- DOĞRULAMA — göç bittikten SONRA ayrı çalıştır
-- ============================================================
-- 1) UPDATE politikalarında with_check dolu mu? (NULL kalmamalı)
-- SELECT tablename, policyname, cmd, roles, with_check
-- FROM pg_policies WHERE schemaname='public' AND cmd='UPDATE' ORDER BY tablename;
--
-- 2) anon'un elinde ne kaldı?
-- SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND grantee='anon' ORDER BY table_name;
--
-- 3) Tablolar ve trigger yerinde mi?
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal;
--
-- 4) Yetki yükseltmesi kapandı mı? Normal kullanıcı oturumuyla:
--    UPDATE profiles SET role='super_admin' WHERE id = auth.uid();
--    → "permission denied for column role" beklenir.
