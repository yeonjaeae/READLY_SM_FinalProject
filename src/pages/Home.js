// src/pages/Home.js

import { useState, useEffect } from "react";

import {
  FiBell,
  FiSearch,
  FiPlus,
} from "react-icons/fi";

import {
  Swiper,
  SwiperSlide,
} from "swiper/react";

import { Autoplay } from "swiper/modules";

import "swiper/css";

import {
  getPopularBook,
  getBookClubs,
  statusLabel,
  typeToMood,
} from "../api/api";

function Home() {
  // ==================================================
  // ★ 인기 책 / 활동중인 모임
  //
  // 기존: 하나의 GET /api/home 으로 한번에 받아옴 (백엔드에 없는 API)
  //
  // 변경: 실제 백엔드 명세에 맞춰 두 개로 분리해서 호출
  //
  // 1) GET /api/books/popular
  //    → 홈 화면 인기 도서 "1건" (배열이 아님)
  //    { "name": "데미안", "coverImageUrl": "https://.../cover.jpg" }
  //
  // 2) GET /api/book-clubs
  //    → 전체 독서모임 목록 (가입 여부 무관)
  //    [{
  //      "clubId": 1, "name": "...", "bookId": 1, "bookName": "...",
  //      "bookCoverImageUrl": "...", "date": "2026-08-20", "time": "19:00:00",
  //      "currentMemberCount": 3, "maxCapacity": 8,
  //      "status": "PENDING" | "IN_PROGRESS" | "COMPLETED",
  //      "type": "PASSIONATE" | "MODERATE" | "CALM",
  //      "role": "HOST" | "PARTICIPANT" | null
  //    }]
  // ==================================================

  const [popularBook, setPopularBook] =
    useState(null);

  const [activeGroups, setActiveGroups] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let ignore = false;

    const fetchHome = async () => {
      setLoading(true);
      setError("");

      try {
        const [book, clubs] = await Promise.all([
          getPopularBook(),
          getBookClubs(),
        ]);

        if (!ignore) {
          setPopularBook(book || null);
          setActiveGroups(clubs || []);
        }
      } catch (err) {
        console.error(
          "홈 데이터 불러오기 오류:",
          err
        );

        if (!ignore) {
          setError(
            "데이터를 불러오지 못했습니다."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchHome();

    return () => {
      ignore = true;
    };
  }, []);

  const moodLabel = (mood) => {
    if (mood === "badge1")
      return "깊게 토론해요";

    if (mood === "badge2")
      return "부담없이 참여해요";

    if (mood === "badge3")
      return "함께 이야기해요";

    return "";
  };

  return (
    <div className="page">
      {/* 상단 */}
      <div className="top-bar">
        <div className="logo">
          READLY
        </div>

        <div className="icon-group">
          <FiPlus />
          <FiSearch />

          <div className="bell-wrap">
            <FiBell />
            <div className="bell-dot"></div>
          </div>
        </div>
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

      {/* 슬라이드 — 인기 도서가 1건뿐이라 loop/autoplay는 끔 */}

      {!loading && popularBook && (
        <Swiper
          modules={[Autoplay]}
          autoplay={false}
          loop={false}
          spaceBetween={14}
          slidesPerView={1}
          className="book-swiper"
        >
          <SwiperSlide>
            <div className="hero-card">
              <img
                src={popularBook.coverImageUrl}
                alt={popularBook.name}
                className="hero-image"
              />

              <div className="hero-title">
                {popularBook.name}
              </div>

              <div className="hero-sub">
                지금 가장 인기있는 책이에요
              </div>
            </div>
          </SwiperSlide>
        </Swiper>
      )}

      {/* 모임 카드 */}

      {!loading &&
        activeGroups.map((group) => {
          const mood = typeToMood(group.type);

          return (
            <div
              className="group-card"
              key={group.clubId}
            >
              <div className="group-header">
                <div>
                  <div className="group-title">
                    {group.name}
                  </div>

                  <div className="group-info">
                    {group.date} {group.time}
                  </div>
                </div>

                <div className="badge-wrap">
                  <div className="badge">
                    {statusLabel(group.status)}
                  </div>

                  <div className={mood}>
                    {moodLabel(mood)}
                  </div>
                </div>
              </div>

              <div className="line"></div>

              <div className="group-footer">
                <span>
                  {group.date}
                </span>

                <span>
                  {group.currentMemberCount}
                  /
                  {group.maxCapacity}명
                </span>
              </div>
            </div>
          );
        })}
    </div>
  );
}

export default Home;