-- ============================================================
-- DORUKLU PLATFORM — SUPABASE DATABASE SCHEMA
-- Source of Truth — Son güncelleme: 2026-04-12
-- ============================================================
-- Bu dosya veritabanının gerçek şemasını yansıtır.
-- Her DB değişikliğinde bu dosya da güncellenmelidir.
-- ============================================================

-- =====================
-- TABLE: profiles
-- =====================
-- Auth.users ile 1:1 bağlantılı kullanıcı profili
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role          TEXT DEFAULT 'player' CHECK (role IN ('super_admin', 'admin', 'player')),
    display_name  TEXT,
    avatar_url    TEXT,
    total_score   INTEGER DEFAULT 0,
    permissions   JSONB DEFAULT '{}'::jsonb,  -- Uygulama bazlı izinler
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Permissions JSONB yapısı:
-- {
--   "toprak_game": true/false,
--   "ozgur_dashboard": true/false,
--   "nurcan_app": true/false
-- }
-- NOT: super_admin rolü permissions'dan bağımsız tüm uygulamalara erişir.

-- RLS Politikaları:
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Herkes kendi profilini görebilir
CREATE POLICY "Herkes kendi profilini görebilir" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Admin/Super_admin tüm profilleri görebilir
CREATE POLICY "Yöneticiler tüm profilleri görebilir" ON public.profiles
    FOR SELECT USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    );

-- Yöneticiler profil güncelleyebilir (yetki yönetimi)
CREATE POLICY "Yöneticiler profilleri güncelleyebilir" ON public.profiles
    FOR UPDATE USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    );


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

-- Herkes kartları okuyabilir
CREATE POLICY "Herkes kartları okuyabilir" ON public.flashcards
    FOR SELECT USING (true);

-- Yöneticiler kart ekleyebilir
CREATE POLICY "Yöneticiler kart ekleyebilir" ON public.flashcards
    FOR INSERT WITH CHECK (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    );

-- Yöneticiler kart güncelleyebilir
CREATE POLICY "Yöneticiler kart güncelleyebilir" ON public.flashcards
    FOR UPDATE USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    );

-- Yöneticiler kart silebilir
CREATE POLICY "Yöneticiler kart silebilir" ON public.flashcards
    FOR DELETE USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    );


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

-- Player kendi session'ını görebilir
CREATE POLICY "Player kendi session'ını görebilir" ON public.game_sessions
    FOR SELECT USING (auth.uid() = player_id);

-- Yönetici tüm session'ları okuyabilir
CREATE POLICY "Yöneticiler tüm session'ları okuyabilir" ON public.game_sessions
    FOR SELECT USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    );

-- Player yeni session ekleyebilir
CREATE POLICY "Player yeni session ekleyebilir" ON public.game_sessions
    FOR INSERT WITH CHECK (auth.uid() = player_id);
