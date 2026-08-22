-- ============================================================
-- DORUKLU PLATFORM — SUPABASE DATABASE SCHEMA
-- Source of Truth — Son güncelleme: 2026-08-22 (Güvenlik sertleştirmesi)
-- ============================================================
-- Bu dosya veritabanının gerçek şemasını yansıtır.
-- Her DB değişikliğinde bu dosya da güncellenmelidir.
--
-- Uygulanan göçler:
--   migrations/2026-08-22-security.sql          → K-01, K-05, K-06, K-08, K-09
--   migrations/2026-08-22b-yetki-sikilastirma.sql → tablo yetkileri asgariye indirildi
--
-- YETKİ İLKESİ: `anon` hiçbir tabloya erişemez. `authenticated` yalnızca uygulamanın
-- gerçekten kullandığı fiillere sahiptir; TRUNCATE / TRIGGER / REFERENCES hiçbir tabloda yoktur.
-- Supabase kurulumda `GRANT ALL ... TO anon, authenticated` uyguluyor — yeni tablo
-- eklendiğinde bu varsayılan geri gelir, göç dosyasındaki REVOKE/GRANT kalıbını tekrarla.
--
-- ALTIN KURAL: Her UPDATE/INSERT politikası hem USING hem WITH CHECK almalı.
-- WITH CHECK atlanırsa PostgreSQL USING'i kullanır — bu "satır benim mi" der,
-- "hangi sütunu değiştirdim" DEMEZ. Yetki yükseltmesi tam olarak böyle oluşur.
-- ============================================================


-- =====================
-- YARDIMCI: rol okuma
-- =====================
-- profiles politikaları içinden profiles'a bakmak rekürsiyon yaratır.
-- SECURITY DEFINER bunu kırar.
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;


-- =====================
-- TABLE: profiles
-- =====================
-- Auth.users ile 1:1 bağlantılı kullanıcı profili
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role          TEXT DEFAULT 'player' CHECK (role IN ('super_admin', 'admin', 'player')),
    display_name  TEXT,
    email         TEXT,
    avatar_url    TEXT,
    total_score   INTEGER DEFAULT 0,
    permissions   JSONB DEFAULT '{}'::jsonb,  -- Uygulama bazlı izinler
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Okuma
CREATE POLICY "Herkes kendi profilini görebilir" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Yöneticiler tüm profilleri görebilir" ON public.profiles
    FOR SELECT USING (public.get_auth_role() IN ('admin', 'super_admin'));

-- Oluşturma (ilk giriş)
CREATE POLICY "Kullanıcılar kendi profilini oluşturabilir" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Güncelleme — role / permissions / total_score DEĞİŞTİRİLEMEZ
CREATE POLICY "Kullanici kendi profilini gunceller" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND role        IS NOT DISTINCT FROM (SELECT p.role        FROM public.profiles p WHERE p.id = auth.uid())
        AND permissions IS NOT DISTINCT FROM (SELECT p.permissions FROM public.profiles p WHERE p.id = auth.uid())
        AND total_score IS NOT DISTINCT FROM (SELECT p.total_score FROM public.profiles p WHERE p.id = auth.uid())
    );

-- Yetki yönetimi yalnızca super_admin (admin kendini yükseltemez)
CREATE POLICY "Super admin profilleri gunceller" ON public.profiles
    FOR UPDATE TO authenticated
    USING      (public.get_auth_role() = 'super_admin')
    WITH CHECK (public.get_auth_role() = 'super_admin');

-- Sütun düzeyinde ikinci bariyer (RLS'ten bağımsız)
-- ⚠️ Sıra zorunlu: tablo düzeyinde UPDATE dururken `REVOKE UPDATE (sütun)` etkisizdir.
--    Önce tablo yetkisi alınır, sonra yalnızca serbest sütunlar geri verilir.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (display_name, email, avatar_url) ON public.profiles TO authenticated;
GRANT  SELECT, INSERT ON public.profiles TO authenticated;
REVOKE ALL ON public.profiles FROM anon;

-- Meşru yetki/rol değişim kapıları — detay: migrations/2026-08-22-security.sql
--   public.set_user_permission(target_id UUID, perm_key TEXT, perm_value BOOLEAN)
--   public.set_user_role(target_id UUID, new_role TEXT)


-- =====================
-- TABLE: flashcards
-- =====================
CREATE TABLE IF NOT EXISTS public.flashcards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_type   TEXT NOT NULL CHECK (question_type IN ('single_choice', 'multi_choice', 'free_text')),
    content         TEXT NOT NULL,
    options         JSONB,
    correct_answer  JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

-- Okuma: giriş yapmış kullanıcılar. 'anon' BİLEREK dışarıda —
-- USING (true) yazmak anon key'i olan herkese açmak demekti.
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

-- ⚠️ AÇIK KALAN: correct_answer hâlâ client'a iniyor (game.js select('*')).
-- Kapatmak için correct_answer'sız bir view + cevap doğrulayan bir RPC gerekiyor.
-- Detay ve tasarım: BULGULAR.md K-05.


-- =====================
-- TABLE: game_sessions
-- =====================
CREATE TABLE IF NOT EXISTS public.game_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE POLICY "Player kendi session'ını görebilir" ON public.game_sessions
    FOR SELECT USING (auth.uid() = player_id);

CREATE POLICY "Yöneticiler tüm session'ları okuyabilir" ON public.game_sessions
    FOR SELECT USING (public.get_auth_role() IN ('admin', 'super_admin'));

CREATE POLICY "Player yeni session ekleyebilir" ON public.game_sessions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

REVOKE ALL ON public.game_sessions FROM anon;

-- Puan sunucuda işleniyor: total_score client'a kapalı, artış bu trigger'dan geliyor.
-- Fonksiyon: public.apply_session_score() — score_delta'yı [-50, 50] aralığında doğrular.
DROP TRIGGER IF EXISTS trg_apply_session_score ON public.game_sessions;
CREATE TRIGGER trg_apply_session_score
    AFTER INSERT ON public.game_sessions
    FOR EACH ROW EXECUTE FUNCTION public.apply_session_score();


-- =====================
-- TABLE: reports
-- =====================
-- Dashboard Builder tarafından kaydedilen rapor şemaları
--
-- ⚠️ TARİHÇE: Bu tablo dosyada tanımlıydı ama canlıya 2026-08-22'ye kadar HİÇ uygulanmamıştı.
-- Sonucu: dashboard-builder'ın "Kaydet" düğmesi o güne kadar hiç çalışmadı (42P01).
-- Ders: bu dosya "source of truth" ama tek yönlü — yazılanın uygulandığını garanti etmiyor.
-- Şema değişikliğinden sonra migrations/ altına göç yaz ve gerçekten çalıştır.
CREATE TABLE IF NOT EXISTS public.reports (
    id          TEXT PRIMARY KEY,
    schema      JSONB NOT NULL DEFAULT '{}'::jsonb,
    owner_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Giris yapanlar raporlari okuyabilir" ON public.reports
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Yoneticiler rapor ekler" ON public.reports
    FOR INSERT TO authenticated
    WITH CHECK (public.get_auth_role() IN ('admin','super_admin') AND owner_id = auth.uid());

CREATE POLICY "Sahibi veya super_admin rapor gunceller" ON public.reports
    FOR UPDATE TO authenticated
    USING      (owner_id = auth.uid() OR public.get_auth_role() = 'super_admin')
    WITH CHECK (owner_id = auth.uid() OR public.get_auth_role() = 'super_admin');

CREATE POLICY "Yöneticiler rapor silebilir" ON public.reports
    FOR DELETE TO authenticated USING (public.get_auth_role() IN ('admin', 'super_admin'));

REVOKE ALL ON public.reports FROM anon;
