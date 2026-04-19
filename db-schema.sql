-- ============================================================
-- DORUKLU PLATFORM — SUPABASE DATABASE SCHEMA
-- Source of Truth — Son güncelleme: 2026-04-19 (RLS Fix)
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
    email         TEXT,
    avatar_url    TEXT,
    total_score   INTEGER DEFAULT 0,
    permissions   JSONB DEFAULT '{}'::jsonb,  -- Uygulama bazlı izinler
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- RLS Politikaları:
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Herkes kendi profilini görebilir
CREATE POLICY "Herkes kendi profilini görebilir" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Kullanıcıların kendi profilini oluşturabilmesine izin ver (YENİ)
CREATE POLICY "Kullanıcılar kendi profilini oluşturabilir" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Kullanıcıların kendi profilini güncelleyebilmesine izin ver (YENİ)
CREATE POLICY "Kullanıcılar kendi profilini güncelleyebilir" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Yönetici erişim politikası (REKÜRSİYON DÜZELTMESİ - SECURITY DEFINER ile)
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE POLICY "Yöneticiler tüm profilleri görebilir" ON public.profiles
    FOR SELECT USING (
        public.get_auth_role() IN ('admin', 'super_admin')
    );

-- Yöneticiler profil güncelleyebilir (yetki yönetimi)
CREATE POLICY "Yöneticiler profilleri güncelleyebilir" ON public.profiles
    FOR UPDATE USING (
        public.get_auth_role() IN ('admin', 'super_admin')
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

-- Yöneticiler kart ekleyebilir/güncelleyebilir/silebilir
CREATE POLICY "Yöneticiler kart ekleyebilir" ON public.flashcards
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

CREATE POLICY "Yöneticiler kart güncelleyebilir" ON public.flashcards
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

CREATE POLICY "Yöneticiler kart silebilir" ON public.flashcards
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
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

CREATE POLICY "Player kendi session'ını görebilir" ON public.game_sessions
    FOR SELECT USING (auth.uid() = player_id);

CREATE POLICY "Yöneticiler tüm session'ları okuyabilir" ON public.game_sessions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

CREATE POLICY "Player yeni session ekleyebilir" ON public.game_sessions
    FOR INSERT WITH CHECK (auth.uid() = player_id);
