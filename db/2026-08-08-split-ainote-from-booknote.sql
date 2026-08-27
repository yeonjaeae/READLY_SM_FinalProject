-- BookNote에 섞여 있던 AI 독서록을 별도 AINote 엔티티로 분리하면서 남은 뒷정리.
--
-- 배경:
--   ddl-auto: update 는 컬럼을 추가만 하고 절대 삭제하지 않는다.
--   엔티티에서 isAiGenerated/aiContent 를 제거해도 DB에는
--   book_note.is_ai_generated (NOT NULL) 컬럼이 그대로 남아,
--   INSERT 시 NOT NULL 제약 위반으로 독서록 저장이 전부 실패한다.
--
-- 실행 방법:
--   1) 앱을 한 번 기동해 Hibernate가 AINote 테이블을 만들게 한다.
--      (엔티티에 @Table(name=...) 이 없어 실제 테이블 이름은 ai_note 가 아니라 ainote 다 — 2026-08-26 확인)
--   2) 아래 스크립트를 readly DB에 대해 한 번 실행한다.
--      psql -h localhost -U postgres -d readly -f db/2026-08-08-split-ainote-from-booknote.sql
--
--   dev DB라 날려도 상관없다면, 이 스크립트 대신 스키마를 통째로 지우고
--   앱을 재기동해도 된다 (ddl-auto: update 가 엔티티 기준으로 다시 만들어 준다).

BEGIN;

-- (선택) 기존 AI 독서록 내용을 새 ainote 테이블로 옮긴다.
-- 지금까지 저장된 aiContent 가 하드코딩된 placeholder 문자열뿐이라면 건너뛰어도 된다.
INSERT INTO ainote (book_id, member_id, content, edited)
SELECT bn.book_id, bn.member_id, bn.ai_content, false
FROM book_note bn
WHERE bn.is_ai_generated = true
  AND bn.ai_content IS NOT NULL
ON CONFLICT (book_id, member_id) DO NOTHING;

-- 옮겨간 AI 독서록 행은 book_note 에서 제거 (이제 일반 독서록만 남는다)
DELETE FROM book_note WHERE is_ai_generated = true;

-- 엔티티에서 사라진 컬럼 정리
ALTER TABLE IF EXISTS book_note DROP COLUMN IF EXISTS is_ai_generated;
ALTER TABLE IF EXISTS book_note DROP COLUMN IF EXISTS ai_content;

COMMIT;
