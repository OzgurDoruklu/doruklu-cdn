-- ============================================================
-- DORUKLU PLATFORM — correct_answer'ı client'a kapat (ADIM 2/2)
-- Tarih: 2026-08-22 · BULGULAR.md K-05 (ikinci yarı)
-- ============================================================
-- ⚠️ BU DOSYA YIKICIDIR. ÖNCE ŞU İKİSİ TAMAMLANMIŞ OLMALI:
--    1. migrations/2026-08-22d-cevap-dogrulama-rpc.sql çalıştırıldı
--    2. JS deploy edildi (game.js RPC kullanıyor, app.js admin_list_flashcards kullanıyor)
--
--    Aksi halde: eski game.js select('*') yapıyor → sorgu hata verir, oyun açılmaz.
--                eski app.js from('flashcards').select('*') yapıyor → admin paneli kart göstermez.
--
-- KONTROL: Aşağıdaki sorgu canlı JS'in hazır olduğunu göstermez; onu tarayıcıdan doğrula.
--          Oyunu bir kez oynayıp admin panelinde kartları gördükten SONRA burayı çalıştır.
-- ============================================================

-- ── correct_answer'ı SELECT'ten çıkar ───────────────────────
-- Kalıp, profiles'ta üç kez uygulananın aynısı: tablo düzeyi yetkiyi al,
-- yalnızca serbest sütunları geri ver. Tablo düzeyi SELECT dururken
-- sütun düzeyinde REVOKE yapmak ETKİSİZDİR.
REVOKE SELECT ON public.flashcards FROM authenticated;
GRANT  SELECT (id, question_type, content, options, created_at)
       ON public.flashcards TO authenticated;

-- INSERT / UPDATE / DELETE tablo düzeyinde kalıyor: RLS zaten bunları
-- admin/super_admin ile sınırlıyor ve yönetici cevap yazabilmek zorunda.
-- (Bkz. "Yoneticiler kart ekler/gunceller/siler" politikaları.)

-- anon zaten tamamen dışarıda — belgelemek için tekrarlanıyor
REVOKE ALL ON public.flashcards FROM anon;


-- ============================================================
DO $$ BEGIN RAISE NOTICE '[Doruklu] correct_answer artik client a inmiyor.'; END $$;


-- ============================================================
-- DOĞRULAMA — sonra ayrı çalıştır
-- ============================================================
-- 1) SELECT yalnızca beş sütunda görünmeli; correct_answer LİSTEDE OLMAMALI:
--
-- SELECT column_name FROM information_schema.column_privileges
-- WHERE table_schema='public' AND table_name='flashcards'
--   AND grantee='authenticated' AND privilege_type='SELECT'
-- ORDER BY column_name;
--
--    Beklenen: content, created_at, id, options, question_type
--
-- 2) Tablo düzeyinde SELECT KALMAMALI (INSERT/UPDATE/DELETE kalabilir):
--
-- SELECT privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='flashcards' AND grantee='authenticated'
-- ORDER BY privilege_type;
--
-- 3) Gerçek sızıntı denemesi — "permission denied" beklenir:
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"<GERCEK-KULLANICI-UUID>","role":"authenticated"}';
--   SELECT correct_answer FROM flashcards LIMIT 1;
-- ROLLBACK;
--
-- 4) Oyunun ihtiyaç duyduğu sorgu HÂLÂ çalışmalı (satır dönmeli):
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"<GERCEK-KULLANICI-UUID>","role":"authenticated"}';
--   SELECT id, question_type, content, options FROM flashcards LIMIT 3;
-- ROLLBACK;
--
-- ── GERİ ALMA (bir şey ters giderse) ────────────────────────
-- GRANT SELECT ON public.flashcards TO authenticated;
