// src/pages/Community.js

import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Community() {
  const navigate = useNavigate();

  // ==================================================
  // 모임 목록
  //
  // ★ isHost 필드 제거
  // (방장 여부는 이제 백엔드가 role로 내려줌)
  // ==================================================

  const [meetings, setMeetings] = useState([
    {
      id: 1,
      title: "상실과 성장에 대하여",
      book: "노르웨이의 숲",
      time: "오늘 19:00",
      members: "4 / 6명",
      status: "모임중",
      mood: "badge1",
    },

    {
      id: 2,
      title: "나를 찾아가는 시간",
      book: "데미안",
      time: "오늘 20:00",
      members: "3 / 6명",
      status: "모집중",
      mood: "badge2",
    },

    {
      id: 3,
      title: "작지만 소중한 것들",
      book: "어린왕자",
      time: "내일 18:00",
      members: "5 / 6명",
      status: "모집중",
      mood: "badge3",
    },
  ]);

  // ==================================================
  // 모임 생성 모달
  // ==================================================

  const [showModal, setShowModal] =
    useState(false);

  // ==================================================
  // 책 검색
  // ==================================================

  const [search, setSearch] =
    useState("");

  // ==================================================
  // 새 모임 정보
  // ==================================================

  const [newMeeting, setNewMeeting] =
    useState({
      meetingName: "",
      selectedBook: null,
      date: "",
      time: "",
      people: 6,
      mood: "badge1",
    });

  // ==================================================
  // 책 데이터
  // ==================================================

  const books = [
    {
      title: "노르웨이의 숲",
      author: "무라카미 하루키",
    },

    {
      title: "데미안",
      author: "헤르만 헤세",
    },

    {
      title: "어린왕자",
      author: "생텍쥐페리",
    },

    {
      title: "1984",
      author: "조지 오웰",
    },

    {
      title: "해변의 카프카",
      author: "무라카미 하루키",
    },
  ];

  // ==================================================
  // 책 검색 결과
  // ==================================================

  const filteredBooks =
    search.trim() === ""
      ? []
      : books.filter((book) =>
          book.title
            .toLowerCase()
            .includes(
              search.toLowerCase()
            )
        );

  // ==================================================
  // 모임 생성
  //
  // ★ isHost 설정 코드 제거
  //
  // 방 생성 API 호출 시, 로그인한 사용자를
  // 백엔드가 자동으로 hostId로 저장하므로
  // 프론트에서는 신경 쓸 필요 없음
  // ==================================================

  const addMeeting = () => {
    if (
      !newMeeting.meetingName ||
      !newMeeting.selectedBook
    ) {
      alert(
        "모임 이름과 책을 선택해주세요."
      );

      return;
    }

    const newRoom = {
      id: Date.now(),

      title:
        newMeeting.meetingName,

      book:
        newMeeting.selectedBook.title,

      time:
        `${newMeeting.date} ${newMeeting.time}`,

      members:
        `1 / ${newMeeting.people}명`,

      status: "모집중",

      mood:
        newMeeting.mood,

      // ------------------------------------------
      // ★ 나중에 백엔드 연결 시
      //
      // const response = await fetch(
      //   "http://localhost:8080/api/rooms",
      //   {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({
      //       title: newMeeting.meetingName,
      //       bookTitle: newMeeting.selectedBook.title,
      //       date: newMeeting.date,
      //       time: newMeeting.time,
      //       maxPeople: newMeeting.people,
      //       mood: newMeeting.mood,
      //     }),
      //   }
      // );
      //
      // → 이 요청을 보낸 로그인 사용자를
      //   백엔드가 hostId로 저장
      // ------------------------------------------

    };

    setMeetings((prev) => [
      ...prev,
      newRoom,
    ]);

    setShowModal(false);

    setSearch("");

    setNewMeeting({
      meetingName: "",
      selectedBook: null,
      date: "",
      time: "",
      people: 6,
      mood: "badge1",
    });
  };

  // ==================================================
  // 화면
  // ==================================================

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
          onClick={() =>
            setShowModal(true)
          }
        >
          + 모임 만들기
        </button>

      </div>


      {/* ==================================================
          안내
      ================================================== */}

      <div className="community-banner">
        ⏰ 모임 시작 10분 전까지
        참여 가능해요
      </div>


      {/* ==================================================
          모임 카드
      ================================================== */}

      {meetings.map((meeting) => (

        <div
          className="group-card"
          key={meeting.id}
        >

          {/* ------------------------------------------
              모임 정보
          ------------------------------------------ */}

          <div className="group-header">

            <div>

              <div className="group-title">
                {meeting.title}
              </div>

              <div className="meeting-book">
                📚 {meeting.book}
              </div>

              <div className="group-info">
                {meeting.time}
              </div>

            </div>


            {/* ------------------------------------------
                상태 / 분위기
            ------------------------------------------ */}

            <div className="badge-wrap">

              <div
                className={
                  meeting.status ===
                  "모임중"
                    ? "badge"
                    : "start-badge"
                }
              >
                {meeting.status}
              </div>


              <div
                className={meeting.mood}
              >

                {meeting.mood ===
                  "badge1" &&
                  "깊게 토론해요"}

                {meeting.mood ===
                  "badge2" &&
                  "부담없이 참여해요"}

                {meeting.mood ===
                  "badge3" &&
                  "함께 이야기해요"}

              </div>

            </div>

          </div>


          {/* ------------------------------------------
              하단
          ------------------------------------------ */}

          <div className="group-footer">

            <span>
              {meeting.members}
            </span>


            <button
              className="join-btn"
              onClick={() => {

                // ==================================================
                // ★ 이제 isHost를 프론트에서 안 넘김
                //
                // roomId만 넘기고,
                // MeetingRoom에서 roomId로
                // 방 입장 API를 호출해서
                // role(HOST / PARTICIPANT)을 받아옴
                //
                // title, mood는 API 응답을 받기 전
                // 화면에 바로 보여주기 위한
                // 임시 표시용으로만 같이 전달함
                // ==================================================

                navigate(
                  "/meeting",
                  {
                    state: {
                      roomId:
                        meeting.id,

                      title:
                        meeting.title,

                      mood:
                        meeting.mood,
                    },
                  }
                );

              }}
            >
              참여하기
            </button>

          </div>

        </div>

      ))}


      {/* ==================================================
          모임 생성 모달
      ================================================== */}

      {showModal && (

        <div className="meeting-modal">

          <div className="meeting-modal-box">

            <div className="modal-title">
              독서모임 만들기
            </div>


            {/* ------------------------------------------
                모임 이름
            ------------------------------------------ */}

            <input
              placeholder="모임 이름"
              value={
                newMeeting.meetingName
              }
              onChange={(e) =>
                setNewMeeting({
                  ...newMeeting,

                  meetingName:
                    e.target.value,
                })
              }
            />


            {/* ------------------------------------------
                책 검색
            ------------------------------------------ */}

            <div className="book-search">

              <input
                placeholder="책 제목 검색"
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
              />

            </div>


            {/* ------------------------------------------
                검색 결과
            ------------------------------------------ */}

            {filteredBooks.map(
              (book, index) => (

                <div
                  key={index}
                  className="search-item"
                  onClick={() => {

                    setNewMeeting({
                      ...newMeeting,

                      selectedBook:
                        book,
                    });

                    setSearch("");

                  }}
                >

                  <div className="search-cover">
                    📚
                  </div>


                  <div>

                    <div className="book-name">
                      {book.title}
                    </div>

                    <div className="book-author">
                      {book.author}
                    </div>

                  </div>

                </div>

              )
            )}


            {/* ------------------------------------------
                선택한 책
            ------------------------------------------ */}

            {newMeeting.selectedBook && (

              <div className="book-result">

                <div className="book-cover">
                  📚
                </div>


                <div>

                  <div className="book-name">

                    {
                      newMeeting
                        .selectedBook
                        .title
                    }

                  </div>


                  <div className="book-author">

                    {
                      newMeeting
                        .selectedBook
                        .author
                    }

                  </div>

                </div>

              </div>

            )}


            {/* ------------------------------------------
                날짜 / 시간
            ------------------------------------------ */}

            <div className="date-time-wrap">

              <input
                type="date"
                value={
                  newMeeting.date
                }
                onChange={(e) =>
                  setNewMeeting({
                    ...newMeeting,

                    date:
                      e.target.value,
                  })
                }
              />


              <input
                type="time"
                value={
                  newMeeting.time
                }
                onChange={(e) =>
                  setNewMeeting({
                    ...newMeeting,

                    time:
                      e.target.value,
                  })
                }
              />

            </div>


            {/* ------------------------------------------
                인원수
            ------------------------------------------ */}

            <div className="people-box">

              <div className="people-label">
                최대 인원
              </div>


              <div className="people-control">

                <button
                  onClick={() =>
                    setNewMeeting({
                      ...newMeeting,

                      people:
                        newMeeting.people >
                        2
                          ? newMeeting.people -
                            1
                          : 2,
                    })
                  }
                >
                  −
                </button>


                <span>
                  {newMeeting.people}명
                </span>


                <button
                  onClick={() =>
                    setNewMeeting({
                      ...newMeeting,

                      people:
                        newMeeting.people +
                        1,
                    })
                  }
                >
                  +
                </button>

              </div>

            </div>


            {/* ------------------------------------------
                토론 유형
            ------------------------------------------ */}

            <select
              value={
                newMeeting.mood
              }
              onChange={(e) =>
                setNewMeeting({
                  ...newMeeting,

                  mood:
                    e.target.value,
                })
              }
            >

              <option value="badge1">
                깊게 토론해요
              </option>

              <option value="badge2">
                부담없이 참여해요
              </option>

              <option value="badge3">
                함께 이야기해요
              </option>

            </select>


            {/* ------------------------------------------
                버튼
            ------------------------------------------ */}

            <div className="modal-btn-wrap">

              <button
                className="cancel-btn"
                onClick={() =>
                  setShowModal(false)
                }
              >
                취소
              </button>


              <button
                className="create-btn"
                onClick={addMeeting}
              >
                만들기
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default Community;