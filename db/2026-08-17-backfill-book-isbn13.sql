-- book.isbn13 이 NULL 인 과거 행을 정리하는 반자동 백필 스크립트.
--
-- 배경:
--   알라딘 연동을 붙이면서 book.isbn13(unique)을 새로 추가했다.
--   ddl-auto: update 는 컬럼을 만들어 주지만 기존 행은 전부 NULL 로 남는다.
--   isbn13 이 NULL 인 행은 findByIsbn13 으로 절대 찾히지 않으므로,
--   같은 책을 다시 등록하면 알라딘에서 새로 받아 두 번째 행이 INSERT 된다.
--   그 결과 같은 책이 여러 행으로 갈라지고, 독서록/모임이 서로 다른 행에 매달린다.
--
--   신규 유입은 코드에서 막았다. 책 등록(POST /api/books)이 isbn13 만 받고
--   수기 입력을 지원하지 않으므로, 앞으로 isbn13 이 NULL 인 행은 생기지 않는다.
--   이 스크립트는 그 이전에 쌓인 행만 정리한다.
--
-- 왜 반자동인가:
--   ISBN 은 알라딘에만 있고 우리 DB 에는 제목/저자만 있다. 제목으로 자동 매칭하면
--   같은 제목의 다른 출판사·개정판을 잘못 붙일 수 있는데, 그러면 남의 독서록이
--   엉뚱한 책에 달리고 unique 제약 때문에 되돌리기도 어렵다.
--   그래서 매핑은 사람이 확인해서 아래 2단계에 직접 적어 넣는다.
--
-- 실행 순서:
--   1) 1단계만 먼저 실행해 대상 목록을 확인한다.
--   2) 각 책의 isbn13 을 알라딘에서 확인해 2단계 VALUES 에 채운다.
--   3) 스크립트 전체를 한 번 실행한다.
--      psql -h localhost -U postgres -d readly -f db/2026-08-17-backfill-book-isbn13.sql
--
--   dev DB 라 날려도 상관없다면 스키마를 통째로 지우고 재기동해도 된다.
--
-- 테이블 이름 주의 (2026-08-26 실행 중 발견):
--   AINote 엔티티에 @Table(name=...) 이 없어서 Hibernate 가 만드는 실제 테이블 이름은
--   ai_note 가 아니라 ainote 다. 이 스크립트도 ainote 로 맞춰 두었다.
--   (문서에서 "ai_note 테이블"이라고 부르는 것은 전부 이 ainote 테이블을 가리킨다.)

-- ============================================================
-- 1단계: 진단 — isbn13 이 비어 있는 책과 거기에 매달린 참조 수
-- ============================================================
-- 참조가 0 인 행은 아무도 쓰지 않는 껍데기이므로 매핑 없이 그냥 지워도 된다(5단계 참고).

SELECT b.book_id,
       b.name,
       b.writer,
       (SELECT count(*) FROM member_book mb WHERE mb.book_id = b.book_id) AS member_book_count,
       (SELECT count(*) FROM book_club bc WHERE bc.book_id = b.book_id)   AS book_club_count,
       (SELECT count(*) FROM book_note bn WHERE bn.book_id = b.book_id)   AS book_note_count,
       (SELECT count(*) FROM ainote an WHERE an.book_id = b.book_id)     AS ainote_count
FROM book b
WHERE b.isbn13 IS NULL
ORDER BY b.book_id;


BEGIN;

-- ============================================================
-- 2단계: 매핑 입력 — 여기에 (book_id, isbn13) 을 직접 적는다
-- ============================================================
-- 아래 주석 처리된 예시를 참고해 실제 값을 추가한다.
-- 마지막의 (NULL, NULL) 자리표시자는 VALUES 목록이 비면 문법 오류가 나기 때문에 둔 것이고,
-- WHERE 절에서 걸러지므로 지우지 않아도 된다.

CREATE TEMP TABLE isbn_backfill (
    book_id BIGINT PRIMARY KEY,
    isbn13  VARCHAR(13) NOT NULL
) ON COMMIT DROP;

INSERT INTO isbn_backfill (book_id, isbn13)
SELECT v.book_id, v.isbn13
FROM (VALUES
    -- (1::BIGINT, '9788937460449'::VARCHAR),   -- 데미안 (민음사)
    -- (2::BIGINT, '9788937462788'::VARCHAR),   -- 노인과 바다 (민음사)
    (NULL::BIGINT, NULL::VARCHAR)
) AS v(book_id, isbn13)
WHERE v.book_id IS NOT NULL;

-- ============================================================
-- 3단계: 병합 대상 판별
-- ============================================================
-- 채워 넣을 isbn13 을 이미 가진 다른 행이 있으면, NULL 행은 같은 책의 중복이다.
-- 이 경우 isbn13 을 그냥 UPDATE 하면 unique 제약에 걸리므로,
-- 참조를 기존 행(keep)으로 옮기고 NULL 행(old)을 지우는 병합으로 처리한다.

CREATE TEMP TABLE isbn_merge (
    old_book_id  BIGINT PRIMARY KEY,
    keep_book_id BIGINT NOT NULL
) ON COMMIT DROP;

INSERT INTO isbn_merge (old_book_id, keep_book_id)
SELECT bf.book_id, keep.book_id
FROM isbn_backfill bf
JOIN book keep ON keep.isbn13 = bf.isbn13
WHERE keep.book_id <> bf.book_id;

-- ============================================================
-- 4단계: 참조 이관
-- ============================================================
-- member_book 과 ainote 는 (회원, 책) 조합이 중복되면 안 되므로,
-- 옮겼을 때 충돌하는 행은 먼저 지운 뒤 나머지를 옮긴다.
-- 지우는 쪽은 항상 NULL 행(old)에 달려 있던 것이다. 살릴 행에 이미 같은 내용이 있기 때문이다.

-- member_book: 같은 회원이 두 행을 모두 담아 둔 경우
DELETE FROM member_book mb
USING isbn_merge m
WHERE mb.book_id = m.old_book_id
  AND EXISTS (
      SELECT 1 FROM member_book keep
      WHERE keep.book_id = m.keep_book_id
        AND keep.member_id = mb.member_id
  );

UPDATE member_book mb
SET book_id = m.keep_book_id
FROM isbn_merge m
WHERE mb.book_id = m.old_book_id;

-- ainote: (book_id, member_id) unique 제약이 걸려 있다.
-- 충돌하면 살릴 행 쪽 독서록을 남기고, NULL 행에 있던 것은 버린다.
DELETE FROM ainote an
USING isbn_merge m
WHERE an.book_id = m.old_book_id
  AND EXISTS (
      SELECT 1 FROM ainote keep
      WHERE keep.book_id = m.keep_book_id
        AND keep.member_id = an.member_id
  );

UPDATE ainote an
SET book_id = m.keep_book_id
FROM isbn_merge m
WHERE an.book_id = m.old_book_id;

-- book_note 는 한 회원이 같은 책에 여러 개를 남길 수 있어 제약이 없다. 전부 옮긴다.
UPDATE book_note bn
SET book_id = m.keep_book_id
FROM isbn_merge m
WHERE bn.book_id = m.old_book_id;

-- book_club 도 제약이 없다. 전부 옮긴다.
UPDATE book_club bc
SET book_id = m.keep_book_id
FROM isbn_merge m
WHERE bc.book_id = m.old_book_id;

-- 참조를 모두 넘겼으니 껍데기만 남은 NULL 행을 지운다
DELETE FROM book b
USING isbn_merge m
WHERE b.book_id = m.old_book_id;

-- ============================================================
-- 5단계: 중복이 아닌 행은 isbn13 만 채운다
-- ============================================================
-- 3단계에서 병합 대상으로 분류되지 않은(= 같은 ISBN 을 가진 행이 없던) 경우다.

UPDATE book b
SET isbn13 = bf.isbn13
FROM isbn_backfill bf
WHERE b.book_id = bf.book_id
  AND b.isbn13 IS NULL
  AND NOT EXISTS (SELECT 1 FROM isbn_merge m WHERE m.old_book_id = bf.book_id);

COMMIT;

-- ============================================================
-- 6단계: 확인
-- ============================================================
-- 여기 남는 행은 아직 매핑을 안 적었거나, 알라딘에서 찾을 수 없는 책이다.
-- 참조 수가 전부 0 이라면 아래 DELETE 로 정리해도 된다.

SELECT b.book_id, b.name, b.writer
FROM book b
WHERE b.isbn13 IS NULL
ORDER BY b.book_id;

-- 아무도 참조하지 않는 껍데기 행 정리 (필요할 때만 주석을 풀고 실행)
-- DELETE FROM book b
-- WHERE b.isbn13 IS NULL
--   AND NOT EXISTS (SELECT 1 FROM member_book mb WHERE mb.book_id = b.book_id)
--   AND NOT EXISTS (SELECT 1 FROM book_club  bc WHERE bc.book_id = b.book_id)
--   AND NOT EXISTS (SELECT 1 FROM book_note  bn WHERE bn.book_id = b.book_id)
--   AND NOT EXISTS (SELECT 1 FROM ainote    an WHERE an.book_id = b.book_id);
