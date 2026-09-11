// src/pages/AIWriteList.js

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import {
  getMyBookList,
  getAiNote,
} from "../api/api";

// ==================================================
// ★ 독후감 목록 화면
//
// 하단 네비의 연필 아이콘(독서록 메뉴)을 누르면 이 화면이 뜸.
// Community.js의 "모임 목록"이랑 똑같은 패턴:
// - 상단에 "+ 독후감 작성하기" 버튼 → 새 책을 검색해서 시작 (AIWrite.js)
// - 카드 목록 → 지금까지 작성 중이거나 완성한 책들, 누르면 그 책의
//   작성/수정 화면(AIWrite.js)으로 들어가서 이어서 쓸 수 있음
//
// 데이터 구성:
// 1) GET /api/books/my-list → [{ bookId, name, coverImageUrl }]
//    (내가 등록한 모든 책. AIWrite.js에서 책을 검색해서 고르는 순간
//    바로 이 목록에 들어가도록 되어 있음)
// 2) 각 책마다 GET /api/notes/books/{bookId}/ai-note로 완성 여부(exists) 확인
//    → 완성/작성중 뱃지에 사용. 이 API엔 날짜 필드가 없어서
//    모임 카드처럼 날짜/시간은 표시하지 않음.
// ==================================================

function AIWriteList() {
  const navigate = useNavigate();

  const [books, setBooks] = useState([]);

  const [noteStatus, setNoteStatus] =
    useState({}); // { [bookId]: { exists: boolean } }

  const [listLoading, setListLoading] =
    useState(true);

  const [listError, setListError] =
    useState("");

  useEffect(() => {
    let ignore = false;

    const fetchBooksAndStatus = async () => {
      setListLoading(true);
      setListError("");

      try {
        const bookList = await getMyBookList();

        if (ignore) {
          return;
        }

        setBooks(bookList || []);

        // 책마다 완성 여부를 병렬로 조회
        const statusEntries = await Promise.all(
          (bookList || []).map(async (book) => {
            try {
              const aiNote = await getAiNote(
                book.bookId
              );

              return [
                book.bookId,
                { exists: Boolean(aiNote?.exists) },
              ];
            } catch (error) {
              console.error(
                `AI 독후감 상태 조회 오류 (bookId: ${book.bookId}):`,
                error
              );

              return [
                book.bookId,
                { exists: false },
              ];
            }
          })
        );

        if (!ignore) {
          setNoteStatus(
            Object.fromEntries(statusEntries)
          );
        }
      } catch (error) {
        console.error(
          "독후감 목록 조회 오류:",
          error
        );

        if (!ignore) {
          setListError(
            "목록을 불러오지 못했습니다."
          );
        }
      } finally {
        if (!ignore) {
          setListLoading(false);
        }
      }
    };

    fetchBooksAndStatus();

    return () => {
      ignore = true;
    };
  }, []);

  const openBook = (book) => {
    navigate("/write/detail", {
      state: {
        bookId: book.bookId,
        name: book.name,
        coverImageUrl: book.coverImageUrl,
      },
    });
  };

  return (
    <div className="page">

      {/* ==================================================
          상단
      ================================================== */}

      <div className="top-bar">
        <div className="logo">
          READLY
        </div>

        <button
          className="add-meeting-btn"
          onClick={() => navigate("/write/detail")}
        >
          + 독후감 작성하기
        </button>
      </div>

      {/* 목록 로딩 / 에러 */}

      {listLoading && (
        <div
          style={{
            padding: "20px",
            fontSize: "13px",
            color: "#888",
          }}
        >
          독후감 목록을 불러오는 중...
        </div>
      )}

      {listError && (
        <div
          style={{
            padding: "20px",
            fontSize: "13px",
            color: "#e57373",
          }}
        >
          {listError}
        </div>
      )}

      {!listLoading &&
        !listError &&
        books.length === 0 && (
          <div
            style={{
              padding: "40px 20px",
              fontSize: "13px",
              color: "#888",
              textAlign: "center",
            }}
          >
            아직 작성한 독후감이 없어요.
            <br />
            위 버튼으로 첫 독후감을 시작해보세요!
          </div>
        )}

      {/* ==================================================
          독후감 카드 목록
      ================================================== */}

      {!listLoading &&
        books.map((book) => {
          const status =
            noteStatus[book.bookId];

          const isDone = status?.exists;

          return (
            <div
              className="group-card"
              key={book.bookId}
              onClick={() => openBook(book)}
              style={{ cursor: "pointer" }}
            >
              <div className="group-header">
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: "44px",
                      height: "60px",
                      borderRadius: "6px",
                      overflow: "hidden",
                      flexShrink: 0,
                      background: "#f0f0f0",
                    }}
                  >
                    {book.coverImageUrl && (
                      <img
                        src={book.coverImageUrl}
                        alt={book.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    )}
                  </div>

                  <div className="group-title">
                    {book.name}
                  </div>
                </div>

                <div className="badge-wrap">
                  <div
                    className={
                      isDone ? "badge" : "start-badge"
                    }
                  >
                    {status
                      ? isDone
                        ? "완성"
                        : "작성중"
                      : "확인 중..."}
                  </div>
                </div>
              </div>

              <div className="group-footer">
                <span>
                  {isDone
                    ? "완성된 독후감 보기"
                    : "구절/느낌 이어서 쓰기"}
                </span>

                <button
                  className="join-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    openBook(book);
                  }}
                >
                  {isDone ? "보러가기" : "이어서 쓰기"}
                </button>
              </div>
            </div>
          );
        })}
    </div>
  );
}

export default AIWriteList;