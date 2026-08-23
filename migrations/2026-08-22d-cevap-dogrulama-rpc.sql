-- ============================================================
-- DORUKLU PLATFORM — Cevap doğrulamayı sunucuya taşı (ADIM 1/2)
-- Tarih: 2026-08-22 · BULGULAR.md K-05 (ikinci yarı)
-- ============================================================
-- ÇALIŞTIRMA: Supabase SQL Editor → tamamını yapıştır → Run. Idempotent.
--
-- ⚠️ BU DOSYA YIKICI DEĞİLDİR — yalnızca fonksiyon ekler.
--    Canlıdaki oyun bu adımdan sonra da aynen çalışmaya devam eder.
--
-- SIRA (geçen seferkinin TERSİ):
--    1. BU DOSYA            → RPC'ler oluşur, hiçbir şey kırılmaz
--    2. JS deploy           → oyun RPC'yi kullanmaya başlar, correct_answer'ı çekmeyi bırakır
--    3. ...e-cevap-gizle.sql → correct_answer sütunu client'a kapatılır
--
--    Ters sırada çalıştırılırsa canlıdaki oyun anında kırılır: mevcut game.js
--    hâlâ select('*') yapıyor ve sütun yetkisi kalkınca sorgu hata verir.
-- ============================================================


-- ============================================================
-- Yardımcı: JSONB dizisini sıralı text[]'e çevir
-- ============================================================
-- multi_choice karşılaştırmasında sıra önemsiz olmalı. Dizi değilse NULL döner.
CREATE OR REPLACE FUNCTION public._jsonb_sirali_dizi(v JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
    SELECT CASE
        WHEN jsonb_typeof(v) = 'array' THEN (
            SELECT array_agg(btrim(e) ORDER BY btrim(e))
            FROM jsonb_array_elements_text(v) AS e
        )
        ELSE NULL
    END;
$fn$;

-- Doğrudan çağrılmasına gerek yok; SECURITY DEFINER fonksiyonlar içeriden kullanıyor.
REVOKE ALL ON FUNCTION public._jsonb_sirali_dizi(JSONB) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- K-05 — Cevap doğrulama RPC'si
-- ============================================================
-- Yalnızca BOOLEAN döner; doğru cevap hiçbir koşulda dışarı sızmaz.
-- Karşılaştırma mantığı game.js'deki eski client tarafı mantığın birebir karşılığı:
--   single_choice → metin eşitliği
--   multi_choice  → küme eşitliği (sıra önemsiz, eleman sayısı eşit)
--   free_text     → büyük/küçük harf ve baştaki/sondaki boşluk duyarsız
CREATE OR REPLACE FUNCTION public.check_flashcard_answer(p_card_id UUID, p_answer JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_type   TEXT;
    v_dogru  JSONB;
    a TEXT[];
    b TEXT[];
BEGIN
    -- Giriş yapmamış kimse cevap doğrulayamaz
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Yetkisiz';
    END IF;

    SELECT question_type, correct_answer
      INTO v_type, v_dogru
      FROM public.flashcards
     WHERE id = p_card_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kart bulunamadi: %', p_card_id;
    END IF;

    IF v_type = 'multi_choice' THEN
        a := public._jsonb_sirali_dizi(v_dogru);
        b := public._jsonb_sirali_dizi(p_answer);
        RETURN a IS NOT NULL AND b IS NOT NULL AND a = b;

    ELSIF v_type = 'free_text' THEN
        RETURN lower(btrim(COALESCE(p_answer #>> '{}', '')))
             = lower(btrim(COALESCE(v_dogru  #>> '{}', '')));

    ELSE  -- single_choice
        RETURN btrim(COALESCE(p_answer #>> '{}', ''))
             = btrim(COALESCE(v_dogru  #>> '{}', ''));
    END IF;
END;
$fn$;

REVOKE ALL     ON FUNCTION public.check_flashcard_answer(UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_flashcard_answer(UUID, JSONB) TO authenticated;


-- ============================================================
-- Admin paneli için tam okuma kapısı
-- ============================================================
-- Adım 3'te `authenticated` rolünden correct_answer SELECT'i alınacak. Ama admin/super_admin
-- paneli cevapları göstermek zorunda. `authenticated` tek bir Postgres rolü olduğu için
-- sütun yetkisi admin'i ayıramaz — ayrım SECURITY DEFINER fonksiyonda yapılıyor.
CREATE OR REPLACE FUNCTION public.admin_list_flashcards()
RETURNS SETOF public.flashcards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF public.get_auth_role() NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Yetkisiz: yalnizca yoneticiler kart listesini goruntuleyebilir';
    END IF;

    RETURN QUERY
        SELECT * FROM public.flashcards ORDER BY created_at DESC;
END;
$fn$;

REVOKE ALL     ON FUNCTION public.admin_list_flashcards() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_flashcards() TO authenticated;


-- ============================================================
DO $$ BEGIN RAISE NOTICE '[Doruklu] Cevap dogrulama RPC leri hazir. Simdi JS deploy edilebilir.'; END $$;


-- ============================================================
-- DOĞRULAMA — göç bittikten SONRA ayrı çalıştır
-- ============================================================
-- Gerçek bir kartla dene. Önce bir kart seç:
--
-- SELECT id, question_type, content, options, correct_answer
-- FROM flashcards ORDER BY created_at DESC LIMIT 3;
--
-- Sonra o kartın ID'siyle (SQL Editor postgres rolünde çalıştığı için auth.uid()
-- NULL döner ve fonksiyon 'Yetkisiz' der — bu BEKLENEN. Rol taklidiyle dene):
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"<GERCEK-KULLANICI-UUID>","role":"authenticated"}';
--   -- doğru cevabı ver → true beklenir
--   SELECT public.check_flashcard_answer('<KART-ID>'::uuid, '"DOGRU CEVAP"'::jsonb);
--   -- yanlış cevap → false beklenir
--   SELECT public.check_flashcard_answer('<KART-ID>'::uuid, '"saçma"'::jsonb);
--   -- multi_choice için sıra karışık ama doğru küme → true beklenir
--   SELECT public.check_flashcard_answer('<KART-ID>'::uuid, '["B","A"]'::jsonb);
-- ROLLBACK;
--
-- Admin kapısı (yönetici olmayan bir UUID ile 'Yetkisiz' beklenir):
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"<SUPER-ADMIN-UUID>","role":"authenticated"}';
--   SELECT count(*) FROM public.admin_list_flashcards();
-- ROLLBACK;
--
-- NOT: Bu RPC kaba kuvvete karşı hız sınırı içermiyor. Bir oyuncu şıkları tek tek
-- deneyerek doğruyu bulabilir — ama artık cevabı TOPLUCA indiremiyor ve her deneme
-- bir ağ isteği. Aile içi bir oyun için bu eşik yeterli kabul edildi.
