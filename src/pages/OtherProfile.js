// src/pages/OtherProfile.js

import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  getFollowers,
  getFollowings,
  follow,
} from "../api/api";

// heights/colors(책 스파인 랜덤 색상)는 Profile.js에서만 씀.
// 이 화면은 타인의 읽은 책 목록을 조회하는 API가 없어서
// 책장이 항상 비어있으므로 여기선 사용하지 않음.

function OtherProfile() {
  const navigate = useNavigate();
  const location = useLocation();

  // ==================================================
  // ★ 다른 사람 프로필 (백엔드 연동)
  //
  // ⚠️ 중요: 백엔드 명세서에 "특정 회원의 프로필(닉네임/소개/
  // 이미지)을 조회"하는 GET API가 존재하지 않음.
  // (PATCH /api/members/me/profile은 "내" 프로필 수정 전용)
  //
  // 그래서 지금 이 화면에서 실제로 연결 가능한 건:
  // - 팔로워/팔로잉 수
  //   GET /api/members/{memberId}/followers → [{ memberId, nickname, introduction }]
  //   GET /api/members/{memberId}/followings → 위와 동일 형식
  //   (원한다면 여기서 nickname/introduction을 팔로워 카드용으로 쓸 수는 있지만,
  //   "이 사람 자신"의 닉네임/소개가 필요한 이 화면 목적에는 맞지 않음)
  // - 팔로우
  //   POST /api/members/{followingId}/follow (성공 시 200, 바디 없음)
  //   ⚠️ 언팔로우(취소) API는 현재 백엔드에 없음 → 한번 팔로우하면
  //   이 화면에서 되돌릴 방법이 없어서, 버튼을 다시 누를 수 없게 처리함
  // - 이름 / 소개 / 프로필 이미지 / 읽은 책 목록
  //   → 조회할 방법이 없음 (백엔드에 GET 프로필 조회 API 추가 필요)
  // ==================================================

  const userId = location.state?.userId;

  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    const fetchFollowCounts = async () => {
      if (!userId) {
        setError("사용자 정보를 찾을 수 없어요.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [followerList, followingList] =
          await Promise.all([
            getFollowers(userId),
            getFollowings(userId),
          ]);

        if (!ignore) {
          setFollowers((followerList || []).length);
          setFollowing((followingList || []).length);
        }
      } catch (err) {
        console.error("팔로우 정보 조회 오류:", err);

        if (!ignore) {
          setError("프로필을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchFollowCounts();

    return () => {
      ignore = true;
    };
  }, [userId]);

  const [followLoading, setFollowLoading] = useState(false);

  // ==================================================
  // ★ 팔로우 (백엔드 연동)
  //
  // POST /api/members/{followingId}/follow
  // 응답: 없음(200)
  //
  // 언팔로우 API가 없어서 토글이 아니라 "1회성" 팔로우로만 동작.
  // 이미 팔로우한 상태면 버튼을 비활성화함.
  // ==================================================

  const handleFollow = async () => {
    if (followLoading || !userId || isFollowing) {
      return;
    }

    setFollowLoading(true);

    try {
      await follow(userId);

      setIsFollowing(true);
      setFollowers((n) => n + 1);
    } catch (err) {
      console.error("팔로우 요청 오류:", err);
      alert(
        err.message || "팔로우 요청 중 오류가 발생했습니다."
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
                {/*
                  ⚠️ 닉네임을 조회할 API가 없어서 표시할 수 없음.
                  Community.js / MeetingRoom.js 등에서 navigate 할 때
                  state로 nickname을 같이 넘겨주면 최소한의 이름만
                  임시로 보여줄 수 있음 (그 전까지는 비워둠)
                */}
                <div className="profile-name">
                  {location.state?.nickname || "닉네임 정보 없음"}
                </div>
                <div className="follow-wrap">
                  <div className="follow-box">
                    <div className="follow-num">{followers}</div>
                    <div className="follow-text">팔로워</div>
                  </div>
                  <div className="follow-box">
                    <div className="follow-num">{following}</div>
                    <div className="follow-text">팔로잉</div>
                  </div>
                </div>
                <div className="follow-btn-wrap">
                  <button
                    className={`follow-action-btn ${isFollowing ? "on" : "off"}`}
                    onClick={handleFollow}
                    disabled={followLoading || isFollowing}
                  >
                    {isFollowing ? "팔로잉 ✓" : "팔로우"}
                  </button>
                </div>
              </div>
            </div>

            {/* 소개 — 조회 API가 없어 비워둠 */}
            <div className="profile-desc" />
            <div className="divider" />

            {/* 책장 — 타인의 읽은 책 목록을 조회하는 API가 없어 비워둠 */}
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
              />

              <div className="shelf-board" />
            </div>
          </>
        )}

      </div>
    </>
  );
}

export default OtherProfile;