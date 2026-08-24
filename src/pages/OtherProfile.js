// src/pages/OtherProfile.js

import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  getOtherProfile,
  getMemberBookList,
  getFollowers,
  getFollowings,
  follow,
  unfollow,
} from "../api/api";

// book-spine 색상/높이는 Profile.js와 동일하게 맞춤
const heights = [180, 220, 160, 200, 175, 215, 165, 190, 205];
const colors = ["#7bc142", "#a8d84e", "#5aab35", "#c5e87a", "#68b83e", "#b2de5f", "#4e9e2f", "#d4f09a", "#89c94f"];

function OtherProfile() {
  const navigate = useNavigate();
  const location = useLocation();

  // ==================================================
  // ★ 다른 사람 프로필 (백엔드 연동)
  //
  // GET /api/members/{memberId}
  // → { memberId, nickname, introduction, followerCount, followingCount, isFollowing }
  // (본인 프로필과 달리 이메일은 내려주지 않음)
  //
  // GET /api/books/members/{memberId}/list
  // → [{ bookId, name, coverImageUrl }] (my-list와 동일 형식)
  //
  // 팔로우 / 언팔로우
  //   POST   /api/members/{followingId}/follow   → 200, 바디 없음
  //   DELETE /api/members/{followingId}/follow   → 200, 바디 없음
  //   isFollowing으로 초기 상태를 정확히 알 수 있어 토글로 동작함
  // ==================================================

  const userId = location.state?.userId;

  const [profile, setProfile] = useState({
    nickname: "",
    introduction: "",
    followers: 0,
    following: 0,
    books: [],
  });

  const [isFollowing, setIsFollowing] = useState(false);

  // 팔로워/팔로잉 "명단"은 모달을 열 때만 조회 (숫자는 profile에서 옴)
  const [followerList, setFollowerList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listModal, setListModal] = useState(null); // "followers" | "followings" | null

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    const fetchProfile = async () => {
      if (!userId) {
        setError("사용자 정보를 찾을 수 없어요.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [other, books] = await Promise.all([
          getOtherProfile(userId),
          getMemberBookList(userId),
        ]);

        if (!ignore) {
          setProfile({
            nickname: other?.nickname || "",
            introduction: other?.introduction || "",
            followers: other?.followerCount ?? 0,
            following: other?.followingCount ?? 0,
            // my-list와 동일 형식: { bookId, name, coverImageUrl }
            books: (books || []).map((b) => ({
              bookId: b.bookId,
              title: b.name,
              coverImageUrl: b.coverImageUrl,
            })),
          });

          setIsFollowing(Boolean(other?.isFollowing));
        }
      } catch (err) {
        console.error("프로필 조회 오류:", err);

        if (!ignore) {
          setError("프로필을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      ignore = true;
    };
  }, [userId]);

  const openListModal = async (type) => {
    setListModal(type);
    setListLoading(true);

    try {
      const data =
        type === "followers"
          ? await getFollowers(userId)
          : await getFollowings(userId);

      if (type === "followers") {
        setFollowerList(data || []);
      } else {
        setFollowingList(data || []);
      }
    } catch (err) {
      console.error("팔로워/팔로잉 목록 조회 오류:", err);
    } finally {
      setListLoading(false);
    }
  };

  const [followLoading, setFollowLoading] = useState(false);

  // ==================================================
  // ★ 팔로우 / 언팔로우 토글 (백엔드 연동)
  //
  // POST   /api/members/{followingId}/follow   → 팔로우
  // DELETE /api/members/{followingId}/follow   → 언팔로우
  //
  // 자기 자신 팔로우 → 400, 이미 팔로우 중에 POST → 409,
  // 팔로우 안 한 상태에서 DELETE → 409 (isFollowing이 정확해서
  // 실제로는 거의 발생하지 않음)
  // ==================================================

  const handleFollowToggle = async () => {
    if (followLoading || !userId) {
      return;
    }

    setFollowLoading(true);

    try {
      if (isFollowing) {
        await unfollow(userId);

        setIsFollowing(false);
        setProfile((prev) => ({
          ...prev,
          followers: Math.max(0, prev.followers - 1),
        }));
      } else {
        await follow(userId);

        setIsFollowing(true);
        setProfile((prev) => ({
          ...prev,
          followers: prev.followers + 1,
        }));
      }
    } catch (err) {
      console.error("팔로우/언팔로우 요청 오류:", err);
      alert(
        err.message || "요청 중 오류가 발생했습니다."
      );
    } finally {
      setFollowLoading(false);
    }
  };

  // 드래그 슬라이드 — Profile.js와 동일
  const shelfRef   = useRef(null);
  const isDragging = useRef(false);
  const startX     = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e) => {
    isDragging.current = true;
    startX.current = e.pageX - shelfRef.current.offsetLeft;
    scrollLeft.current = shelfRef.current.scrollLeft;
    shelfRef.current.style.cursor = "grabbing";
  };
  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - shelfRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.2;
    shelfRef.current.scrollLeft = scrollLeft.current - walk;
  };
  const onMouseUp = () => {
    isDragging.current = false;
    if (shelfRef.current) shelfRef.current.style.cursor = "grab";
  };

  return (
    <>
      <style>{`
        /* ── Profile.js 스타일 그대로 ── */
        .profile-page {
          display: flex;
          flex-direction: column;
          height: 100vh;
          padding-bottom: 72px;
          box-sizing: border-box;
          overflow: hidden;
          background: #fff;
        }
        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px 8px;
          flex-shrink: 0;
        }
        .profile-image {
          width: 75px; height: 75px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
          border: 2px solid #eee;
          margin-left: 12px;
        }
        .profile-name {
          font-size: 18px; font-weight: 700;
          display: flex; align-items: center; gap: 6px;
          margin-bottom: 8px;
        }
        .follow-wrap { display: flex; gap: 20px; }
        .follow-box { text-align: center; }
        .follow-num { font-size: 15px; font-weight: 700; }
        .follow-text { font-size: 12px; color: #888; }
        .profile-desc {
          padding: 10px 20px 10px;
          font-size: 13px; color: #555; line-height: 1.6;
          flex-shrink: 0;
          white-space: pre-line;
        }
        .divider {
          height: 1px; background: #eee;
          margin: 0 20px;
          flex-shrink: 0;
        }

        /* 팔로우 버튼 (OtherProfile 전용) */
        .follow-btn-wrap {
          margin-top: 8px;
        }
        .follow-action-btn {
          padding: 6px 22px;
          border-radius: 20px;
          font-size: 13px; font-weight: 700;
          border: none; cursor: pointer;
          transition: all 0.18s;
        }
        .follow-action-btn.off {
          background: linear-gradient(135deg, #7bc142, #5aab35);
          color: #fff;
          box-shadow: 0 3px 10px rgba(90,171,53,0.28);
        }
        .follow-action-btn.on {
          background: #f0f0f0; color: #666;
        }
        .follow-action-btn:disabled {
          opacity: 0.6; cursor: default;
        }

        /* 책장 영역 */
        .bookshelf-area {
          flex: 1;
          background:
            radial-gradient(ellipse at 80% 0%, rgba(255,220,120,0.22) 0%, transparent 55%),
            radial-gradient(ellipse at 10% 80%, rgba(200,160,80,0.1) 0%, transparent 50%),
            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(180,140,90,0.07) 39px, rgba(180,140,90,0.07) 40px),
            repeating-linear-gradient(180deg, transparent, transparent 39px, rgba(180,140,90,0.07) 39px, rgba(180,140,90,0.07) 40px),
            #f5ede0;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          overflow: hidden;
          min-height: 0;
        }
        .lamp-wrap {
          position: absolute;
          top: 20px; right: 40px;
          display: flex; flex-direction: column; align-items: center;
        }
        .lamp-rod { width: 2px; height: 28px; background: #b89060; }
        .lamp-head {
          width: 44px; height: 20px;
          background: #c9a055;
          border-radius: 0 0 22px 22px;
          position: relative;
        }
        .lamp-glow {
          position: absolute; bottom: -50px; left: 50%;
          transform: translateX(-50%);
          width: 140px; height: 80px;
          background: radial-gradient(ellipse, rgba(255,210,80,0.28) 0%, transparent 70%);
          pointer-events: none;
        }
        .book-scroll {
          display: flex;
          align-items: flex-end;
          gap: 0px;
          overflow-x: auto;
          overflow-y: visible;
          padding: 0 16px;
          cursor: grab;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding-top: 60px;
        }
        .book-scroll::-webkit-scrollbar { display: none; }
        .book-item {
          flex-shrink: 0;
          cursor: pointer;
          transition: transform 0.22s cubic-bezier(.34,1.56,.64,1), filter 0.2s ease;
        }
        .book-item:hover {
          transform: translateY(-12px) scale(1.05);
          filter: brightness(1.1) drop-shadow(0 10px 14px rgba(80,60,20,0.25));
          z-index: 10;
        }
        .book-item:active { transform: translateY(-4px) scale(0.97); }
        .book-spine {
          border-radius: 5px 5px 0 0;
          display: flex;
          justify-content: center;
          align-items: center;
          color: rgba(60,50,30,0.82);
          font-size: 11px;
          font-weight: 700;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          overflow: hidden;
          padding: 10px 0;
          box-shadow: inset -3px 0 6px rgba(0,0,0,0.1), inset 2px 0 4px rgba(255,255,255,0.25);
        }
        .shelf-board {
          height: 14px;
          background: linear-gradient(to bottom, #c8974a, #a87840);
          border-radius: 3px;
          box-shadow: 0 4px 10px rgba(120,80,30,0.22);
          flex-shrink: 0;
        }

        /* 팔로워/팔로잉 목록 모달 */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.35);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 100;
        }
        .modal-sheet {
          width: 100%;
          max-width: 480px;
          background: #fff;
          border-radius: 18px 18px 0 0;
          padding: 18px 18px 14px;
          box-sizing: border-box;
        }
        .modal-title {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 10px;
        }
        .modal-actions {
          margin-top: 14px;
          display: flex;
          justify-content: flex-end;
        }
        .modal-actions .btn-cancel {
          border: none;
          background: #f0f0f0;
          color: #666;
          padding: 8px 18px;
          border-radius: 18px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
      `}</style>

      <div className="profile-page">

        {/* 헤더 — ← 뒤로가기 + READLY 가운데 */}
        <div className="profile-header">
          <button
            onClick={() => navigate(-1)}
            style={{ background:"none", border:"none", fontSize:"20px", cursor:"pointer", padding:0, color:"#333" }}
          >←</button>
          <div className="logo">READLY</div>
          <div style={{ width: 24 }} />
        </div>

        {/* 로딩 / 에러 */}

        {loading && (
          <div style={{ padding: "20px", fontSize: "13px", color: "#888" }}>
            불러오는 중...
          </div>
        )}

        {error && (
          <div style={{ padding: "20px", fontSize: "13px", color: "#e57373" }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* 프로필 — Profile.js .profile-top과 동일 구조 */}
            <div className="profile-top">
              <div className="profile-image" />
              <div className="profile-info">
                <div className="profile-name">
                  {profile.nickname || "닉네임 정보 없음"}
                </div>
                <div className="follow-wrap">
                  <div
                    className="follow-box"
                    style={{ cursor: "pointer" }}
                    onClick={() => openListModal("followers")}
                  >
                    <div className="follow-num">{profile.followers}</div>
                    <div className="follow-text">팔로워</div>
                  </div>
                  <div
                    className="follow-box"
                    style={{ cursor: "pointer" }}
                    onClick={() => openListModal("followings")}
                  >
                    <div className="follow-num">{profile.following}</div>
                    <div className="follow-text">팔로잉</div>
                  </div>
                </div>
                <div className="follow-btn-wrap">
                  <button
                    className={`follow-action-btn ${isFollowing ? "on" : "off"}`}
                    onClick={handleFollowToggle}
                    disabled={followLoading}
                  >
                    {isFollowing ? "팔로잉 ✓" : "팔로우"}
                  </button>
                </div>
              </div>
            </div>

            {/* 소개 */}
            <div className="profile-desc">{profile.introduction}</div>
            <div className="divider" />

            {/* 책장 */}
            <div className="bookshelf-area">
              <div className="lamp-wrap">
                <div className="lamp-rod" />
                <div className="lamp-head">
                  <div className="lamp-glow" />
                </div>
              </div>

              <div
                ref={shelfRef}
                className="book-scroll"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
              >
                {(profile.books || []).map((book, index) => {
                  const h = heights[index % heights.length];
                  const bg = colors[index % colors.length];
                  return (
                    <div
                      key={book.bookId ?? index}
                      className="book-item"
                    >
                      <div
                        className="book-spine"
                        style={{ width: "48px", height: `${h}px`, background: bg }}
                      >
                        {book.title}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="shelf-board" />
            </div>
          </>
        )}

      </div>

      {/* 팔로워 / 팔로잉 목록 모달 */}
      {listModal && (
        <div
          className="modal-backdrop"
          onClick={(e) =>
            e.target === e.currentTarget && setListModal(null)
          }
        >
          <div className="modal-sheet">
            <div className="modal-title">
              {listModal === "followers" ? "팔로워" : "팔로잉"}
            </div>

            {listLoading && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: "13px",
                  color: "#888",
                  padding: "20px 0",
                }}
              >
                불러오는 중...
              </div>
            )}

            {!listLoading &&
              (listModal === "followers"
              ? followerList
              : followingList
            ).length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: "13px",
                  color: "#888",
                  padding: "20px 0",
                }}
              >
                {listModal === "followers"
                  ? "아직 팔로워가 없어요."
                  : "아직 팔로우한 사람이 없어요."}
              </div>
            )}

            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {(listModal === "followers"
                ? followerList
                : followingList
              ).map((person) => (
                <div
                  key={person.memberId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 4px",
                    borderBottom: "1px solid #f0f0f0",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setListModal(null);
                    navigate("/other-profile", {
                      state: {
                        userId: person.memberId,
                        nickname: person.nickname,
                      },
                    });
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      background: "#eef7da",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "700" }}>
                      {person.nickname}
                    </div>
                    <div style={{ fontSize: "12px", color: "#888" }}>
                      {person.introduction}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setListModal(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default OtherProfile;