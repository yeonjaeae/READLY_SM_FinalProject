// src/pages/MeetingRoom.js

import { useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";

// ==================================================
// ★ 테스트용 임시 role
//
// 백엔드 연결 전까지만 프론트 테스트용으로 사용
// 실제 연결되면 API 응답의 role 값으로 대체됨
//
// "HOST" | "PARTICIPANT"
// ==================================================

const TEST_ROLE = "HOST";

function MeetingRoom() {
  const location = useLocation();

  // ==================================================
  // Community에서 전달받은 최소 정보
  //
  // ★ isHost는 더 이상 여기서 받지 않음
  // (백엔드가 role로 내려주기 때문)
  // ==================================================

  const roomId = location.state?.roomId;

  const roomTitle =
    location.state?.title || "독서모임";

  const roomMood =
    location.state?.mood || "badge1";

  // ==================================================
  // ★ 역할 (방장 / 일반 참가자)
  //
  // 방 입장/조회 API가 아래 형태로 내려주는 값
  //
  // {
  //   "roomId": 123,
  //   "role": "HOST" | "PARTICIPANT"
  // }
  //
  // → role === "HOST" 일 때만 AI 진행자 버튼 표시
  // ==================================================

  const [role, setRole] = useState(null);

  const [roleLoading, setRoleLoading] =
    useState(true);

  useEffect(() => {
    let ignore = false;

    const fetchRoomRole = async () => {
      setRoleLoading(true);

      try {
        // ==================================================
        // ★ 실제 백엔드 연결 시 사용할 코드
        //
        // 방 입장 / 방 정보 조회 API 호출
        // ==================================================

        /*
        const response = await fetch(
          `http://localhost:8080/api/rooms/${roomId}/enter`
        );

        if (!response.ok) {
          throw new Error(
            "방 정보를 불러오지 못했습니다."
          );
        }

        const data = await response.json();

        // data: { roomId: 123, role: "HOST" | "PARTICIPANT" }

        if (!ignore) {
          setRole(data.role);
        }
        */

        // ==================================================
        // 현재는 백엔드 연결 전 - 프론트 테스트용
        //
        // ★ 나중에 위 fetch 블록의 주석만 풀고
        // 이 아래 두 줄만 지우면 됨
        // ==================================================

        if (!ignore) {
          setRole(TEST_ROLE);
        }
      } catch (error) {
        console.error(
          "방 역할을 불러오는 중 오류:",
          error
        );

        // ------------------------------------------
        // 실패 시 안전하게 일반 참가자로 처리
        // (AI 버튼 등 방장 전용 기능이 잘못 노출되지 않도록)
        // ------------------------------------------

        if (!ignore) {
          setRole("PARTICIPANT");
        }
      } finally {
        if (!ignore) {
          setRoleLoading(false);
        }
      }
    };

    fetchRoomRole();

    return () => {
      ignore = true;
    };
  }, [roomId]);

  // ==================================================
  // ★ isHost는 이제 role에서 파생된 값
  // ==================================================

  const isHost = role === "HOST";

  // ==================================================
  // 입력
  // ==================================================

  const [input, setInput] = useState("");

  // ==================================================
  // AI 로딩
  // ==================================================

  const [aiLoading, setAiLoading] =
    useState(false);

  // ==================================================
  // 메시지
  // ==================================================

  const [messages, setMessages] = useState([
    {
      id: 1,
      user: "AI",
      type: "ai",
      text:
        "모임원들의 독후감과 기록을 먼저 정리했어요 ✨\n\n• 외로움과 연결감\n• 상실 이후의 성장\n• 잔잔하지만 깊은 감정선\n• 현실적인 인간 관계",
    },

    {
      id: 2,
      user: "AI",
      type: "ai",
      text:
        "오늘은 가장 기억에 남았던 문장을 함께 이야기해볼게요 🙂",
    },

    {
      id: 3,
      user: "민지",
      type: "other",
      color: "#FFB6C1",
      text:
        "저는 마지막 장면이 가장 슬펐어요.",
    },

    {
      id: 4,
      user: "현우",
      type: "other",
      color: "#87CEEB",
      text:
        "문장이 진짜 고요해서 좋았어요.",
    },

    {
      id: 5,
      user: "서연",
      type: "other",
      color: "#C3E88D",
      text:
        "와타나베 감정선이 너무 현실적이었어요.",
    },
  ]);

  // ==================================================
  // 채팅 영역 DOM 참조
  // ==================================================

  const chatAreaRef = useRef(null);

  // ==================================================
  // 메시지 추가 → 채팅 영역만 부드럽게 맨 아래로 스크롤
  // ==================================================

  useEffect(() => {
    const chatArea = chatAreaRef.current;

    if (!chatArea) {
      return;
    }

    chatArea.scrollTo({
      top: chatArea.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // ==================================================
  // 일반 메시지 보내기
  // ==================================================

  const sendMessage = () => {
    const text = input.trim();

    if (!text) {
      return;
    }

    const myMessage = {
      id: Date.now(),
      user: "나",
      type: "me",
      text: text,
    };

    setMessages((prev) => [
      ...prev,
      myMessage,
    ]);

    setInput("");
  };

  // ==================================================
  // AI 진행자 요청
  //
  // ★ 방장만 실행 가능
  // ==================================================

  const requestAI = async () => {
    if (!isHost) {
      return;
    }

    if (aiLoading) {
      return;
    }

    setAiLoading(true);

    // 현재 대화 내용
    const conversation =
      messages.map((message) => ({
        user: message.user,
        type: message.type,
        text: message.text,
      }));

    // 나중에 백엔드로 전달할 데이터
    const requestData = {
      roomId: roomId,
      roomTitle: roomTitle,
      mood: roomMood,
      messages: conversation,
    };

    console.log(
      "AI 진행자 요청 데이터:",
      requestData
    );

    // ==================================================
    // 현재는 프론트 테스트용
    // ==================================================

    setTimeout(() => {
      const aiReply = {
        id: Date.now(),
        user: "AI",
        type: "ai",
        text:
          "좋은 의견들이 나오고 있네요 🌿\n\n지금까지 이야기한 내용을 보면 인물의 감정과 상실에 대한 이야기가 많이 나온 것 같아요.\n\n여러분은 이 책에서 가장 공감했던 인물의 감정이 무엇이었나요?",
      };

      setMessages((prev) => [
        ...prev,
        aiReply,
      ]);

      setAiLoading(false);
    }, 500);
  };

  // ==================================================
  // 화면
  // ==================================================

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "430px",

        height: "100vh",

        margin: "0 auto",

        display: "flex",

        flexDirection: "column",

        background: "#ffffff",

        boxSizing: "border-box",

        overflow: "hidden",
      }}
    >
      {/* ==================================================
          새 메시지가 아래에서 살짝 떠오르며 등장하는 애니메이션
      ================================================== */}

      <style>{`
        @keyframes chatRowIn {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* ==================================================
          헤더
      ================================================== */}

      <div
        className="meeting-header"
        style={{
          flexShrink: 0,
        }}
      >
        <div className="meeting-room-name">
          📚 {roomTitle}
        </div>
      </div>

      {/* ==================================================
          채팅 영역
      ================================================== */}

      <div
        ref={chatAreaRef}
        className="meeting-chat-area"
        style={{
          flex: "1 1 0",

          minHeight: 0,

          height: 0,

          overflowY: "auto",

          overflowX: "hidden",

          boxSizing: "border-box",

          // ------------------------------------------
          // 하단 고정 요소(입력창 / AI버튼)에
          // 마지막 메시지가 가려지지 않도록 여백 확보
          //
          // 네비(72px) + 입력창(~74px)
          //           + (방장이면) AI버튼(~60px)
          //
          // ★ isHost가 로딩 전이라 아직 확정되지 않았을 수 있으니
          // roleLoading 중에는 넉넉하게 host 기준 여백을 사용
          // ------------------------------------------

          padding:
            isHost || roleLoading
              ? "15px 14px 216px"
              : "15px 14px 156px",
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-row ${
              msg.type === "me"
                ? "right"
                : "left"
            }`}
            style={{
              animation:
                "chatRowIn 0.35s ease",
            }}
          >
            {/* 프로필 */}

            {msg.type !== "me" && (
              <div
                className="chat-profile"
                style={{
                  background:
                    msg.type === "ai"
                      ? "#9bd44e"
                      : msg.color,
                }}
              >
                {msg.user[0]}
              </div>
            )}

            {/* 이름 + 말풍선 */}

            <div className="chat-content">
              {msg.type !== "me" && (
                <div className="chat-name">
                  {msg.user}
                </div>
              )}

              <div
                className={`chat-bubble ${
                  msg.type === "me"
                    ? "user-chat"
                    : msg.type === "ai"
                    ? "ai-chat"
                    : "other-chat"
                }`}
                style={{
                  whiteSpace: "pre-line",
                }}
              >
                {msg.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ==================================================
          AI 진행자 버튼

          ★ role === "HOST" 일 때만 표시
          (로딩 끝난 뒤에만 판단해서 깜빡임 방지)
      ================================================== */}

      {!roleLoading && isHost && (
        <div
          style={{
            position: "fixed",

            bottom: "146px",

            left: 0,
            right: 0,

            margin: "0 auto",

            width: "100%",
            maxWidth: "430px",

            padding: "8px 12px",

            background: "#ffffff",

            borderTop:
              "1px solid #eeeeee",

            boxSizing: "border-box",

            zIndex: 100,
          }}
        >
          <button
            type="button"
            onClick={requestAI}
            disabled={aiLoading}
            style={{
              width: "100%",

              height: "44px",

              border: "none",

              borderRadius: "14px",

              background:
                aiLoading
                  ? "#e5e5e5"
                  : "#eef7da",

              color:
                aiLoading
                  ? "#999999"
                  : "#6a8c2f",

              fontSize: "14px",

              fontWeight: "700",

              cursor:
                aiLoading
                  ? "default"
                  : "pointer",

              display: "flex",

              alignItems: "center",

              justifyContent: "center",

              boxSizing: "border-box",
            }}
          >
            {aiLoading
              ? "✨ AI가 생각하고 있어요..."
              : "✨ AI 진행자에게 질문하기"}
          </button>
        </div>
      )}

      {/* ==================================================
          채팅 입력창

          ★ CSS의 .meeting-input-wrap 그대로 사용
          (position: fixed; bottom: 72px)
      ================================================== */}

      <div className="meeting-input-wrap">
        <input
          value={input}
          onChange={(e) =>
            setInput(e.target.value)
          }
          placeholder="생각을 입력해보세요"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();

              sendMessage();
            }
          }}
        />

        <button
          type="button"
          onClick={sendMessage}
        >
          전송
        </button>
      </div>
    </div>
  );
}

export default MeetingRoom;