// src/pages/Profile.js

import { useState, useRef, useEffect } from "react";
import { FiSettings } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import {
  getMemberId,
  getFollowers,
  getFollowings,
  getMyBookList,
  updateMyProfile,
} from "../api/api";

const heights = [180, 220, 160, 200, 175, 215, 165, 190, 205];
const colors = ["#7bc142", "#a8d84e", "#5aab35", "#c5e87a", "#68b83e", "#b2de5f", "#4e9e2f", "#d4f09a", "#89c94f"];

function Profile() {
  const navigate = useNavigate();

  // ==================================================
  // ★ 내 프로필 (백엔드 연동)
  //
  // ⚠️ 중요: 백엔드 명세서에 "내 프로필 조회" GET API가
  // 존재하지 않음. 있는 건 PATCH /api/members/me/profile
  // (닉네임/소개 "수정"만) 뿐이고, 응답도 바디가 없음(200, Void).
  //
  // 그래서 지금은:
  // - 닉네임 / 소개 / 프로필 이미지 → 표시할 방법이 없음
  //   (편집 모달에서 입력한 값을 이 세션 동안만 기억)
  // - 팔로워/팔로잉 수 → GET /api/members/{memberId}/followers,
  //   /followings 로 대체 조회(개수만 사용)
  // - 읽은 책 목록 → GET /api/books/my-list
  //
  // → 백엔드에 GET /api/members/me (또는 유사) 프로필 조회
  //   API가 추가되면 이 부분을 그걸로 교체해야 함
  // ==================================================

  const memberId = getMemberId();

  const [profile, setProfile] = useState({
    name: "",
    desc: "",
    image: "",
    followers: 0,
    following: 0,
    books: [],
  });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const fetchProfile = async () => {
    if (!memberId) {
      setError("로그인 정보를 찾을 수 없어요.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [followers, followings, books] =
        await Promise.all([
          getFollowers(memberId),
          getFollowings(memberId),
          getMyBookList(),
        ]);

      setProfile((prev) => ({
        ...prev,
        followers: (followers || []).length,
        following: (followings || []).length,
        // my-list 응답은 { bookId, name, coverImageUrl }라
        // book-spine에서 쓰는 title 필드로 맞춰줌
        // (review 텍스트는 이 API에 없어서 비워둠)
        books: (books || []).map((b) => ({
          bookId: b.bookId,
          title: b.name,
          coverImageUrl: b.coverImageUrl,
          review: "",
        })),
      }));
    } catch (err) {
      console.error(
        "프로필 조회 오류:",
        err
      );

      setError(
        "프로필을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editImgPreview, setEditImgPreview] = useState("");
  const [editImgFile, setEditImgFile] = useState(null);

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");

  const fileInputRef = useRef(null);

  // 드래그 슬라이드
  const shelfRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
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

  // 이미지 선택
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setEditImgFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setEditImgPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // ==================================================
  // ★ 저장 (백엔드 연동)
  //
  // PATCH /api/members/me/profile
  // 요청: { nickname, introduction } (둘 다 선택값)
  // 응답: 없음 (200)
  //
  // ⚠️ 이 API는 이미지를 받지 않음. 프로필 이미지 업로드는
  // 백엔드 명세에 아직 없어서, 선택한 이미지는 이 화면 안에서만
  // 미리보기로 반영되고 서버에는 저장되지 않음.
  // (별도 이미지 업로드 API가 생기면 연결해야 함)
  // ==================================================

  const handleSave = async () => {
    if (saveLoading) {
      return;
    }

    setSaveLoading(true);
    setSaveError("");

    try {
      await updateMyProfile({
        nickname: editName,
        introduction: editDesc,
      });

      // 응답 바디가 없어서, 화면에는 입력한 값을 그대로 반영
      setProfile((prev) => ({
        ...prev,
        name: editName,
        desc: editDesc,
        image: editImgFile
          ? editImgPreview
          : prev.image,
      }));

      setShowModal(false);
    } catch (err) {
      console.error(
        "프로필 저장 오류:",
        err
      );

      setSaveError(
        err.message ||
          "프로필 저장 중 오류가 발생했습니다."
      );
    } finally {
      setSaveLoading(false);
    }
  };

  // 모달 열기
  const openModal = () => {
    setEditName(profile?.name || "");
    setEditDesc(profile?.desc || "");
    setEditImgPreview(
      profile?.image || ""
    );
    setEditImgFile(null);
    setSaveError("");
    setShowModal(true);
  };

  return (
    <>
      <style>{`
        .profile-page {
          display: flex;
          flex-direction: column;
          height: 100vh;
          padding-bottom: 72px; /* 네비바 높이만큼 확보 */
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
        .pencil-btn {
          background: none; border: none; padding: 0;
          cursor: pointer; font-size: 14px; line-height: 1;
          display: flex; align-items: center;
          transition: transform 0.15s;
        }
        .pencil-btn:hover { transform: rotate(-15deg) scale(1.2); }
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

        /* 선반 */
        .shelf-board {
          height: 14px;
          background: linear-gradient(to bottom, #c8974a, #a87840);
          border-radius: 3px;
          box-shadow: 0 4px 10px rgba(120,80,30,0.22);
          flex-shrink: 0;
        }

        /* ── 모달 ── */
        .modal-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.45);
          z-index: 200;
          display: flex; align-items: flex-end; justify-content: center;
        }
        .modal-sheet {
          background: #fff;
          width: 100%; max-width: 430px;
          border-radius: 24px 24px 0 0;
          padding: 28px 24px 40px;
          animation: slideUp 0.28s cubic-bezier(.34,1.2,.64,1);
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .modal-title {
          font-size: 17px; font-weight: 800;
          margin-bottom: 24px; text-align: center;
        }
        .modal-avatar-wrap {
          display: flex; justify-content: center;
          margin-bottom: 24px;
        }
        .modal-avatar {
          width: 88px; height: 88px;
          border-radius: 50%; overflow: hidden;
          border: 3px solid #e8e8e8;
          position: relative; cursor: pointer;
        }
        .modal-avatar img {
          width: 100%; height: 100%; object-fit: cover;
        }
        .avatar-overlay {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.32);
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
          font-size: 22px;
          opacity: 0;
          transition: opacity 0.18s;
        }
        .modal-avatar:hover .avatar-overlay { opacity: 1; }
        .modal-label {
          font-size: 12px; color: #999; font-weight: 600;
          margin-bottom: 6px; margin-top: 14px;
          letter-spacing: 0.5px;
        }
        .modal-input {
          width: 100%; box-sizing: border-box;
          border: 1.5px solid #e5e5e5;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
          font-family: inherit;
          resize: none;
        }
        .modal-input:focus { border-color: #7bc142; }
        .modal-actions {
          display: flex; gap: 10px;
          margin-top: 24px;
        }
        .btn-cancel {
          flex: 1; padding: 13px 0;
          border: 1.5px solid #e5e5e5;
          border-radius: 14px;
          background: #fff;
          font-size: 15px; font-weight: 600;
          color: #666; cursor: pointer;
        }
        .btn-save {
          flex: 2; padding: 13px 0;
          border: none; border-radius: 14px;
          background: linear-gradient(135deg, #7bc142, #5aab35);
          font-size: 15px; font-weight: 700;
          color: #fff; cursor: pointer;
          box-shadow: 0 4px 12px rgba(90,171,53,0.3);
          transition: opacity 0.15s;
        }
        .btn-save:hover { opacity: 0.88; }
        .btn-save:disabled { opacity: 0.6; cursor: default; }
      `}</style>

      <div className="profile-page">

        {/* 상단 헤더 */}
        <div className="profile-header">
          <div className="logo">READLY</div>
          <FiSettings className="setting-icon" />
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
            {/* 프로필 */}
            <div className="profile-top">
              <div className="profile-image">
                {profile.image && (
                  <img src={profile.image} alt="프로필" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              <div className="profile-info">
                <div className="profile-name">
                  {profile.name || "닉네임을 설정해주세요"}
                  <button className="pencil-btn" onClick={openModal} aria-label="프로필 수정">✏️</button>
                </div>
                <div className="follow-wrap">
                  <div className="follow-box">
                    <div className="follow-num">{profile.followers}</div>
                    <div className="follow-text">팔로워</div>
                  </div>
                  <div className="follow-box">
                    <div className="follow-num">{profile.following}</div>
                    <div className="follow-text">팔로잉</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 소개 */}
            <div className="profile-desc">{profile.desc}</div>

            <div className="divider" />

            {/* 책장 */}
            <div className="bookshelf-area">

              {/* 조명 */}
              <div className="lamp-wrap">
                <div className="lamp-rod" />
                <div className="lamp-head">
                  <div className="lamp-glow" />
                </div>
              </div>

              {/* 책 스크롤 */}
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
                      onClick={() => navigate("/review", { state: { title: book.title, review: book.review } })}
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

              {/* 나무 선반 */}
              <div className="shelf-board" />
            </div>
          </>
        )}
      </div>

      {/* 프로필 수정 모달 */}
      {showModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-sheet">
            <div className="modal-title">프로필 수정</div>

            {/* 프로필 사진 */}
            <div className="modal-avatar-wrap">
              <div className="modal-avatar" onClick={() => fileInputRef.current.click()}>
                {editImgPreview && (
                  <img src={editImgPreview} alt="프로필 미리보기" />
                )}
                <div className="avatar-overlay">📷</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageChange}
              />
            </div>

            {/* 이름(닉네임) */}
            <div className="modal-label">닉네임</div>
            <input
              className="modal-input"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="닉네임을 입력하세요"
            />

            {/* 소개글 */}
            <div className="modal-label">소개글</div>
            <textarea
              className="modal-input"
              rows={3}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="소개글을 입력하세요"
            />

            {editImgFile && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: "#e0a44d" }}>
                ⚠️ 프로필 이미지는 아직 서버에 저장되는 기능이 없어서, 화면 미리보기로만 반영돼요.
              </div>
            )}

            {saveError && (
              <div style={{ marginTop: "10px", color: "#e57373", fontSize: "13px" }}>
                {saveError}
              </div>
            )}

            {/* 버튼 */}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>취소</button>
              <button className="btn-save" onClick={handleSave} disabled={saveLoading}>
                {saveLoading ? "저장 중..." : "저장하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Profile;