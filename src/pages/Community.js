// src/pages/Community.js

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import {
  getBookClubs,
  searchBooks,
  registerBook,
  createBookClub,
  joinBookClub,
  statusLabel,
  typeToMood,
  moodToType,
} from "../api/api";

function Community() {
  const navigate = useNavigate();

  // ==================================================
  // 모임 목록
  //
  // ★ GET /api/book-clubs (백엔드 실제 엔드포인트)
  //
  // 응답: [{
  //   clubId, name, bookId, bookName, bookCoverImageUrl,
  //   date, time, currentMemberCount, maxCapacity,
  //   status, type, role
  // }]
  //
  // 화면에서 쓰는 필드명(title/book/time/members/status/mood)에
  // 맞춰 매핑해서 씀
  // ==================================================

  const [meetings, setMeetings] =
    useState([]);

  const [listLoading, setListLoading] =
    useState(true);

  const [listError, setListError] =
    useState("");

  const mapClub = (club) => ({
    id: club.clubId,
    title: club.name,
    book: club.bookName,
    time: `${club.date} ${club.time}`,
    members: `${club.currentMemberCount} / ${club.maxCapacity}명`,
    status: statusLabel(club.status),
    mood: typeToMood(club.type),
    role: club.role, // "HOST" | "PARTICIPANT" | null(미가입)
  });

  const fetchMeetings = async () => {
    setListLoading(true);
    setListError("");

    try {
      const data = await getBookClubs();

      setMeetings((data || []).map(mapClub));
    } catch (err) {
      console.error(
        "모임 목록 조회 오류:",
        err
      );

      setListError(
        "모임 목록을 불러오지 못했습니다."
      );
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
    // 마운트 시 1회만 실행. fetchMeetings는 렌더마다 새로 만들어지는
    // 함수라 deps에 넣으면 계속 재실행되므로 의도적으로 제외함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==================================================
  // 모임 생성 모달
  // ==================================================

  const [showModal, setShowModal] =
    useState(false);

  // ==================================================
  // 책 검색
  //
  // ★ GET /api/books/search?keyword= (백엔드 실제 엔드포인트)
  //
  // 응답: [{ isbn13, name, writer, coverImageUrl }]
  // (기존 로컬 하드코딩 books 배열 → 실제 검색 API로 교체)
  // ==================================================

  const [search, setSearch] =
    useState("");

  const [searchResults, setSearchResults] =
    useState([]);

  const [searchLoading, setSearchLoading] =
    useState(false);

  useEffect(() => {
    if (search.trim() === "") {
      setSearchResults([]);
      return;
    }

    let ignore = false;

    const timer = setTimeout(async () => {
      setSearchLoading(true);

      try {
        const data = await searchBooks(
          search.trim()
        );

        if (!ignore) {
          setSearchResults(data || []);
        }
      } catch (err) {
        console.error(
          "책 검색 오류:",
          err
        );

        if (!ignore) {
          setSearchResults([]);
        }
      } finally {
        if (!ignore) {
          setSearchLoading(false);
        }
      }
    }, 350); // 디바운스

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [search]);

  // ==================================================
  // 새 모임 정보
  //
  // selectedBook: { isbn13, name, writer, coverImageUrl, bookId }
  // → 책 선택 시점에 POST /api/books로 등록해서 bookId까지 미리 받아둠
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

  const [
    bookRegisterLoading,
    setBookRegisterLoading,
  ] = useState(false);

  const handleSelectBook = async (book) => {
    setBookRegisterLoading(true);

    try {
      const bookId = await registerBook(
        book.isbn13
      );

      setNewMeeting((prev) => ({
        ...prev,
        selectedBook: { ...book, bookId },
      }));

      setSearch("");
      setSearchResults([]);
    } catch (err) {
      console.error(
        "책 등록 오류:",
        err
      );

      alert(
        "책 정보를 등록하지 못했습니다. 다시 시도해주세요."
      );
    } finally {
      setBookRegisterLoading(false);
    }
  };

  // ==================================================
  // ★ 모임 생성 요청 중 상태
  // ==================================================

  const [
    createLoading,
    setCreateLoading,
  ] = useState(false);

  const [createError, setCreateError] =
    useState("");

  // ==================================================
  // 모임 생성
  //
  // ★ POST /api/book-clubs (백엔드 실제 엔드포인트)
  //
  // 요청: { name, bookId, date, time, maxCapacity, type }
  // 응답: 생성된 clubId (순수 숫자, 전체 객체가 아님)
  //
  // → 응답이 숫자뿐이라 목록에 바로 이어붙일 수 없어서
  //   생성 성공 후 목록을 다시 조회함
  // ==================================================

  const addMeeting = async () => {
    if (
      !newMeeting.meetingName ||
      !newMeeting.selectedBook
    ) {
      alert(
        "모임 이름과 책을 선택해주세요."
      );

      return;
    }

    if (!newMeeting.date || !newMeeting.time) {
      alert(
        "모임 날짜와 시간을 입력해주세요."
      );

      return;
    }

    if (createLoading) {
      return;
    }

    setCreateLoading(true);
    setCreateError("");

    try {
      await createBookClub({
        name: newMeeting.meetingName,
        bookId: newMeeting.selectedBook.bookId,
        date: newMeeting.date,
        time: newMeeting.time,
        maxCapacity: newMeeting.people,
        type: moodToType(newMeeting.mood),
      });

      await fetchMeetings();

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
    } catch (err) {
      console.error(
        "모임 생성 오류:",
        err
      );

      setCreateError(
        err.message ||
          "모임 생성 중 오류가 발생했습니다."
      );
    } finally {
      setCreateLoading(false);
    }
  };

  // ==================================================
  // 모임 참여
  //
  // ★ POST /api/book-clubs/{clubId}/join
  //
  // role이 이미 있으면(HOST/PARTICIPANT) 가입된 상태이므로
  // join을 다시 호출하지 않고 바로 입장.
  // role이 null(미가입)이면 join 호출 후 입장.
  // (GET /api/book-clubs/{clubId} 상세 조회는 가입 회원만
  // 가능하므로, 미가입 상태로 방에 들어가면 409가 남)
  // ==================================================

  const [joinLoadingId, setJoinLoadingId] =
    useState(null);

  const handleJoin = async (meeting) => {
    if (joinLoadingId) {
      return;
    }

    try {
      if (!meeting.role) {
        setJoinLoadingId(meeting.id);
        await joinBookClub(meeting.id);
      }

      navigate("/meeting", {
        state: {
          roomId: meeting.id,
          title: meeting.title,
          mood: meeting.mood,
        },
      });
    } catch (err) {
      console.error(
        "모임 참여 오류:",
        err
      );

      alert(
        err.message ||
          "모임 참여 중 오류가 발생했습니다."
      );
    } finally {
      setJoinLoadingId(null);
    }
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

      {/* 목록 로딩 / 에러 */}

      {listLoading && (
        <div
          style={{
            padding: "20px",
            fontSize: "13px",
            color: "#888",
          }}
        >
          모임 목록을 불러오는 중...
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


      {/* ==================================================
          모임 카드
      ================================================== */}

      {!listLoading &&
        meetings.map((meeting) => (

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
              disabled={
                joinLoadingId === meeting.id
              }
              onClick={() =>
                handleJoin(meeting)
              }
            >
              {joinLoadingId === meeting.id
                ? "참여하는 중..."
                : meeting.role
                ? "입장하기"
                : "참여하기"}
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

            {searchLoading && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#888",
                  padding: "6px 2px",
                }}
              >
                검색 중...
              </div>
            )}

            {/* ------------------------------------------
                검색 결과
            ------------------------------------------ */}

            {searchResults.map(
              (book) => (

                <div
                  key={book.isbn13}
                  className="search-item"
                  onClick={() =>
                    handleSelectBook(book)
                  }
                >

                  <div className="search-cover">
                    {book.coverImageUrl ? (
                      <img
                        src={book.coverImageUrl}
                        alt={book.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      "📚"
                    )}
                  </div>


                  <div>

                    <div className="book-name">
                      {book.name}
                    </div>

                    <div className="book-author">
                      {book.writer}
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
                  {newMeeting.selectedBook
                    .coverImageUrl ? (
                    <img
                      src={
                        newMeeting
                          .selectedBook
                          .coverImageUrl
                      }
                      alt={
                        newMeeting
                          .selectedBook
                          .name
                      }
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    "📚"
                  )}
                </div>


                <div>

                  <div className="book-name">

                    {
                      newMeeting
                        .selectedBook
                        .name
                    }

                  </div>


                  <div className="book-author">

                    {
                      newMeeting
                        .selectedBook
                        .writer
                    }

                  </div>

                </div>

              </div>

            )}

            {bookRegisterLoading && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#888",
                  padding: "6px 2px",
                }}
              >
                책 정보를 등록하는 중...
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
                생성 에러
            ------------------------------------------ */}

            {createError && (
              <div
                style={{
                  marginTop: "10px",
                  color: "#e57373",
                  fontSize: "13px",
                }}
              >
                {createError}
              </div>
            )}


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
                disabled={
                  createLoading
                }
              >
                {createLoading
                  ? "만드는 중..."
                  : "만들기"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default Community;