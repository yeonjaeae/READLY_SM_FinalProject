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

import { apiFetch } from "../api/api";

function Home() {
  // ==================================================
  // ★ 인기 책 / 활동중인 모임
  //
  // 기존: 하드코딩된 books 배열 + group-card 3개 고정
  //
  // 변경: 백엔드에서 받아옴
  //
  // 요청: GET /api/home
  // 응답:
  // {
  //   "popularBooks": [
  //     { "title": "노르웨이의 숲", "image": "/images/노르웨이의숲.jpeg" }
  //   ],
  //   "activeGroups": [
  //     {
  //       "id": 1,
  //       "title": "<프로젝트 헤밍웨이>",
  //       "timeRange": "12:00 ~ 01:00",
  //       "status": "모임중",
  //       "mood": "badge1",
  //       "date": "2026.05.30",
  //       "currentMembers": 5,
  //       "maxMembers": 10
  //     }
  //   ]
  // }
  // ==================================================

  const [popularBooks, setPopularBooks] =
    useState([]);

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
        const data = await apiFetch(
          "/api/home",
          { method: "GET" }
        );

        if (!ignore) {
          setPopularBooks(
            data.popularBooks || []
          );

          setActiveGroups(
            data.activeGroups || []
          );
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

      {/* 슬라이드 */}

      {!loading &&
        popularBooks.length > 0 && (
          <Swiper
            modules={[Autoplay]}
            autoplay={{
              delay: 2500,
              disableOnInteraction: false,
            }}
            loop={true}
            spaceBetween={14}
            slidesPerView={1}
            className="book-swiper"
          >
            {popularBooks.map(
              (book, index) => (
                <SwiperSlide
                  key={index}
                >
                  <div className="hero-card">
                    <img
                      src={book.image}
                      alt={book.title}
                      className="hero-image"
                    />

                    <div className="hero-title">
                      {book.title}
                    </div>

                    <div className="hero-sub">
                      지금 가장 인기있는 책이에요
                    </div>
                  </div>
                </SwiperSlide>
              )
            )}
          </Swiper>
        )}

      {/* 모임 카드 */}

      {!loading &&
        activeGroups.map((group) => (
          <div
            className="group-card"
            key={group.id}
          >
            <div className="group-header">
              <div>
                <div className="group-title">
                  {group.title}
                </div>

                <div className="group-info">
                  {group.timeRange}
                </div>
              </div>

              <div className="badge-wrap">
                <div className="badge">
                  {group.status}
                </div>

                <div
                  className={
                    group.mood
                  }
                >
                  {moodLabel(
                    group.mood
                  )}
                </div>
              </div>
            </div>

            <div className="line"></div>

            <div className="group-footer">
              <span>
                {group.date}
              </span>

              <span>
                {group.currentMembers}
                /
                {group.maxMembers}명
              </span>
            </div>
          </div>
        ))}
    </div>
  );
}

export default Home;