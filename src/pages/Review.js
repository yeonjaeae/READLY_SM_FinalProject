// src/pages/Review.js

import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { getAiNote, getMemberAiNote } from "../api/api";

// ==================================================
// ★ 독후감 읽기 화면 (읽기 전용)
//
// 두 군데에서 들어올 수 있음:
// 1) 내 프로필(Profile.js) 책장 → { bookId, name, coverImageUrl }
//    GET /api/notes/books/{bookId}/ai-note (토큰 소유자 본인 것)
// 2) 다른 사람 프로필(OtherProfile.js) 책장
//    → { bookId, memberId, name, coverImageUrl }
//    GET /api/notes/books/{bookId}/members/{memberId}/ai-note
//    ⚠️ 이 두 번째 엔드포인트는 2026-08 기준 백엔드에 요청해둔
//    상태라 아직 없음 — 실제로 생기기 전까지는 404가 날 수 있음.
//
// 여기서는 수정하지 않음 — 책 표지/제목, AI가 독후감을 바탕으로
// 뽑아준 감정 태그, 그리고 완성된 독후감 본문을 순서대로 보여주기만 함.
// (이어서 쓰거나 고치는 건 독후감 목록(AIWriteList.js) → 작성 화면(AIWrite.js)에서,
// 그것도 본인 것만 가능함)
// ==================================================

function Review() {
  const location = useLocation();
  const navigate = useNavigate();

  const bookId = location.state?.bookId;
  const memberId = location.state?.memberId; // 있으면 "타인 것 보기" 모드
  const bookName = location.state?.name;
  const coverImageUrl = location.state?.coverImageUrl;

  const [content, setContent] = useState("");
  const [tags, setTags] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ★ "아직 안 씀"은 에러가 아니라 정상적인 빈 상태라 따로 관리
  // (빨간 에러 문구로 보이지 않게 분리)
  const [notWritten, setNotWritten] =
    useState(false);

  useEffect(() => {
    let ignore = false;

    const fetchAiNote = async () => {
      if (!bookId) {
        setError("책 정보를 찾을 수 없어요.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setNotWritten(false);

      try {
        const data = memberId
          ? await getMemberAiNote(bookId, memberId)
          : await getAiNote(bookId);

        if (!ignore) {
          if (data?.exists) {
            setContent(data.content || "");
            setTags(data.tags || []);
          } else {
            setNotWritten(true);
          }
        }
      } catch (err) {
        console.error(
          "독후감 조회 오류:",
          err
        );

        if (!ignore) {
          setError(
            "독후감을 불러오지 못했습니다."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchAiNote();

    return () => {
      ignore = true;
    };
  }, [bookId, memberId]);

  return (
    <div className="page">
      {/* 상단 */}

      <div className="top-bar">
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            padding: 0,
            color: "#333",
          }}
        >
          ←
        </button>

        <div className="logo">
          READLY
        </div>

        <div style={{ width: 24 }} />
      </div>

      {/* 로딩 / 에러 */}

      {loading && (
        <div
          style={{
            padding: "20px",
            fontSize: "13px",
            color: "#888",
          }}
        >
          불러오는 중...
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "20px",
            fontSize: "13px",
            color: "#e57373",
          }}
        >
          {error}
        </div>
      )}

      {/* ==================================================
          아직 독후감을 안 쓴 책 — 에러가 아니라 정상적인 빈 상태이므로
          차분한 회색 톤 + 안내 문구로 표시 (memberId 없을 때만
          "쓰러 가기" 버튼 노출 — 남의 책은 대신 써줄 수 없으므로)
      ================================================== */}

      {notWritten && (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "32px",
              marginBottom: "10px",
            }}
          >
            📖
          </div>

          <div
            style={{
              fontSize: "14px",
              color: "#999",
              marginBottom: memberId ? "0" : "16px",
            }}
          >
            아직 이 책의 독후감을 쓰지 않았어요.
          </div>

          {!memberId && (
            <button
              type="button"
              onClick={() =>
                navigate("/write/detail", {
                  state: {
                    bookId,
                    name: bookName,
                    coverImageUrl,
                  },
                })
              }
              style={{
                border: "none",
                borderRadius: "20px",
                padding: "10px 22px",
                background: "linear-gradient(135deg, #7bc142, #5aab35)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              지금 써보기
            </button>
          )}
        </div>
      )}

      {!loading && !error && !notWritten && (
        <>
          {/* 책 */}

          <div className="review-hero">
            <div className="review-cover">
              {coverImageUrl ? (
                <img
                  src={coverImageUrl}
                  alt={bookName}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                "📘"
              )}
            </div>

            <div>
              <div
                className="review-book"
                style={{ fontSize: "16px" }}
              >
                {bookName}
              </div>

              <div className="review-author">
                AI 독후감 기록
              </div>
            </div>
          </div>

          {/* ==================================================
              오늘의 감정 태그

              ★ 하드코딩 제거 — AI가 독후감 내용을 바탕으로 뽑아준
              tags[]를 그대로 씀. 지금은 백엔드가 항상 빈 배열을
              주기 때문에(2026-08-26 문서), 태그가 채워지기 전까지는
              이 섹션 자체가 보이지 않음.
          ================================================== */}

          {tags.length > 0 && (
            <div className="emotion-card">
              <div className="emotion-title">
                오늘의 감정
              </div>

              <div className="emotion-tags">
                {tags.map((tag, idx) => (
                  <span key={idx}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* 독후감 본문 (읽기 전용) */}

          <div className="review-card">
            <div className="review-title">
              ✨ 나의 독후감
            </div>

            <div className="review-content">
              {content}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Review;