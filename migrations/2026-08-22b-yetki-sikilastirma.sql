-- ============================================================
-- DORUKLU PLATFORM — Tablo yetkilerini asgariye indirme
-- Tarih: 2026-08-22 · 2026-08-22-security.sql'in devamı
-- ============================================================
-- ÇALIŞTIRMA: Supabase SQL Editor → tamamını yapıştır → Run. Idempotent.
--
-- NEDEN GEREKLİ
-- Supabase kurulumda `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`
-- uyguluyor. ALL, DELETE'in yanında TRUNCATE / TRIGGER / REFERENCES'i de kapsıyor.
-- İlk göç yalnızca UPDATE'i hedeflemişti; doğrulama sorgusu geri kalanları ortaya çıkardı:
--
--   authenticated → DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE
--
-- Risk değerlendirmesi:
--   • DELETE     → RLS bloke ediyor (profiles'ta DELETE politikası yok = 0 satır). Yine de gereksiz.
--   • TRUNCATE   → RLS'E TABİ DEĞİLDİR. PostgREST doğrudan çağıramadığı için bugün erişilemiyor,
--                  ama tabloyu komple boşaltabilecek bir yetkinin durmasının gerekçesi yok.
--   • TRIGGER    → tabloya trigger tanımlama yetkisi. Gereksiz.
--   • REFERENCES → yabancı anahtar kurma yetkisi. Şemayı biz yönetiyoruz, gereksiz.
--
-- YAKLAŞIM: Önce hepsini al, sonra yalnızca uygulamanın gerçekten kullandığını geri ver.
-- Bir yetkinin burada olmaması "unutuldu" değil, "kullanılmıyor" demektir.
-- ============================================================


-- ── Sıfırla ─────────────────────────────────────────────────
REVOKE ALL ON public.profiles      FROM authenticated, anon;
REVOKE ALL ON public.flashcards    FROM authenticated, anon;
REVOKE ALL ON public.game_sessions FROM authenticated, anon;
REVOKE ALL ON public.reports       FROM authenticated, anon;


-- ── profiles ────────────────────────────────────────────────
-- SELECT: kendi profili + admin'in tüm profilleri (RLS ayırıyor)
-- INSERT: ilk girişte profil oluşturma (syncProfileData)
-- UPDATE: yalnızca Google'dan senkronlanan üç alan.
--         role / permissions / total_score BİLEREK YOK — bunlar
--         set_user_permission() / set_user_role() / apply_session_score()
--         SECURITY DEFINER fonksiyonlarından geçiyor.
GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, email, avatar_url) ON public.profiles TO authenticated;


-- ── flashcards ──────────────────────────────────────────────
-- DELETE gerçekten kullanılıyor: admin panelindeki window.deleteCard.
-- Hepsi RLS ile admin/super_admin'e sınırlı.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;


-- ── game_sessions ───────────────────────────────────────────
-- Oyun yalnızca okur ve ekler. Oturum kaydı silinmez, güncellenmez —
-- puan trigger'ı INSERT'e bağlı olduğu için UPDATE puanı ikinci kez işlerdi.
GRANT SELECT, INSERT ON public.game_sessions TO authenticated;


-- ── reports ─────────────────────────────────────────────────
-- Builder upsert yapıyor (INSERT + UPDATE), silme admin işi.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;


-- ── anon ────────────────────────────────────────────────────
-- Hiçbir tabloya erişimi yok. Anon key public olduğu için burası bilinçli olarak boş.
-- Giriş yapmadan erişilmesi gereken bir veri doğarsa AYRI bir tabloya konur,
-- mevcut tablolara anon yetkisi geri verilmez.


-- ============================================================
DO $$ BEGIN RAISE NOTICE '[Doruklu] Yetkiler asgariye indirildi.'; END $$;


-- ============================================================
-- DOĞRULAMA — sonra ayrı çalıştır
-- ============================================================
-- Beklenen tablo düzeyi yetkiler:
--   profiles       authenticated → INSERT, SELECT
--   flashcards     authenticated → DELETE, INSERT, SELECT, UPDATE
--   game_sessions  authenticated → INSERT, SELECT
--   reports        authenticated → DELETE, INSERT, SELECT, UPDATE
--   anon           → hiç satır yok
--
-- SELECT table_name, grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND grantee IN ('authenticated','anon')
-- ORDER BY table_name, grantee, privilege_type;
--
-- profiles'ta UPDATE yalnızca şu üç sütunda görünmeli:
--   avatar_url, display_name, email
--
-- SELECT column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema='public' AND table_name='profiles'
--   AND grantee='authenticated' AND privilege_type='UPDATE'
-- ORDER BY column_name;
