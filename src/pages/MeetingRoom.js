// src/pages/MeetingRoom.js

import { useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";

import {
  getBookClubDetail,
  getChatHistory,
  requestHostAiAssist,
  getMemberId,
} from "../api/api";

import {
  createChatClient,
  sendChatMessage,
  disconnectChatClient,
} from "../api/chatSocket";

// AI 발신자 고정 memberId (백엔드 명세: AI_MEMBER_ID = 999)
const AI_MEMBER_ID = 999;

function MeetingRoom() {
  const location = useLocation();

  // ==================================================
  // Community에서 전달받은 최소 정보
  //
  // title/mood는 API 응답을 받기 전까지 화면에 바로
  // 보여주기 위한 임시 표시용. 정확한 값은 방 상세 조회로 갱신.
  // ==================================================

  const roomId = location.state?.roomId;

  const [roomTitle, setRoomTitle] = useState(
    location.state?.title || "독서모임"
  );

  const myMemberId = getMemberId();

  // ==================================================
  // ★ 방 상세 (역할 / 방장 정보)
  //
  // GET /api/book-clubs/{clubId}
  // → { ..., hostId, role: "HOST" | "PARTICIPANT" }
  //
  // 가입하지 않은 회원이 조회하면 409가 남
  // (Community.js에서 참여 시 join을 먼저 호출하므로
  // 이 화면에 들어왔다는 것 자체가 가입된 상태라는 전제)
  // ==================================================

  const [role, setRole] = useState(null);

  const [roleLoading, setRoleLoading] =
    useState(true);

  const [roomError, setRoomError] =
    useState("");

  useEffect(() => {
    let ignore = false;

    const fetchRoomDetail = async () => {
      if (!roomId) {
        setRoleLoading(false);
        return;
      }

      setRoleLoading(true);
      setRoomError("");

      try {
        const data = await getBookClubDetail(roomId);

        if (!ignore) {
          setRole(data.role);
          setRoomTitle(data.name);
        }
      } catch (error) {
        console.error(
          "방 정보를 불러오는 중 오류:",
          error
        );

        // 실패 시 안전하게 일반 참가자로 처리
        // (AI 진행자 버튼 등 방장 전용 기능이 잘못 노출되지 않도록)
        if (!ignore) {
          setRole("PARTICIPANT");
          setRoomError(
            "방 정보를 불러오지 못했습니다."
          );
        }
      } finally {
        if (!ignore) {
          setRoleLoading(false);
        }
      }
    };

    fetchRoomDetail();

    return () => {
      ignore = true;
    };
  }, [roomId]);

  const isHost = role === "HOST";

  // ==================================================
  // 입력
  // ==================================================

  const [input, setInput] = useState("");

  // ==================================================
  // AI 로딩 (방장 전용 AI 진행자 요청)
  // ==================================================

  const [aiLoading, setAiLoading] =
    useState(false);

  const [aiError, setAiError] =
    useState("");

  // ==================================================
  // 메시지
  //
  // ★ 채팅 이력 (GET /api/book-clubs/{clubId}/chats)으로
  // 초기 목록을 받아온 뒤, STOMP 구독으로 실시간 메시지를 이어붙임
  //
  // 서버 응답 형식:
  // { messageId, memberId, senderName, content, createdAt }
  // ==================================================

  const [messages, setMessages] = useState([]);

  const [historyLoading, setHistoryLoading] =
    useState(true);

  const mapServerMessage = (m) => ({
    id: m.messageId,
    user: m.senderName,
    type:
      m.memberId === AI_MEMBER_ID
        ? "ai"
        : m.memberId === myMemberId
        ? "me"
        : "other",
    text: m.content,
  });

  useEffect(() => {
    let ignore = false;

    const fetchHistory = async () => {
      if (!roomId) {
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);

      try {
        const data = await getChatHistory(roomId);

        if (!ignore) {
          setMessages((data || []).map(mapServerMessage));
        }
      } catch (error) {
        console.error(
          "채팅 이력 조회 오류:",
          error
        );
      } finally {
        if (!ignore) {
          setHistoryLoading(false);
        }
      }
    };

    fetchHistory();

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ==================================================
  // ★ 실시간 채팅 (STOMP)
  //
  // CONNECT /ws/chat → SUBSCRIBE /sub/chat/clubs/{clubId}
  // 구독은 "구독 시점 이후" 메시지만 전달되므로,
  // 위의 REST 이력 조회와 합쳐서 화면에 보여줌
  // ==================================================

  const chatClientRef = useRef(null);

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    const client = createChatClient({
      clubId: roomId,
      onMessage: (body) => {
        setMessages((prev) => [
          ...prev,
          mapServerMessage(body),
        ]);
      },
      onError: () => {
        console.error(
          "실시간 채팅 연결에 실패했습니다."
        );
      },
    });

    chatClientRef.current = client;

    return () => {
      disconnectChatClient(client);
      chatClientRef.current = null;
    };
    // mapServerMessage는 렌더마다 새로 만들어지는 함수라 deps에 넣으면
    // 소켓이 계속 재연결되므로 의도적으로 제외함. roomId가 바뀔 때만 재연결.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

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
  //
  // ★ SEND /pub/chat/clubs/{clubId} — { content }
  //
  // 보낸 사람은 서버가 토큰의 memberId로 고정하므로
  // 클라이언트에서 화면에 즉시 낙관적으로 추가하지 않고,
  // 구독으로 돌아오는 브로드캐스트(내가 보낸 것 포함)로만 반영함
  // ==================================================

  const sendMessage = () => {
    const text = input.trim();

    if (!text) {
      return;
    }

    if (!roomId) {
      return;
    }

    sendChatMessage(
      chatClientRef.current,
      roomId,
      text
    );

    setInput("");
  };

  // ==================================================
  // AI 진행자 요청
  //
  // ★ POST /api/book-clubs/{clubId}/ai-assist — { mode }
  // 방장만 호출 가능(호출자가 방장이 아니면 409)
  //
  // 이 API는 응답 바디가 없고, AI 응답은 AI 이름으로 채팅방에
  // 바로 발행되어 위의 STOMP 구독을 통해 도착함
  // ==================================================

  const requestAI = async (mode = "question") => {
    if (!isHost) {
      return;
    }

    if (aiLoading) {
      return;
    }

    setAiLoading(true);
    setAiError("");

    try {
      await requestHostAiAssist(roomId, mode);
      // 응답은 채팅으로 브로드캐스트되므로 여기서 메시지를 추가하지 않음
    } catch (error) {
      console.error(
        "AI 진행자 요청 오류:",
        error
      );

      setAiError(
        error.message ||
          "AI 진행자 요청 중 오류가 발생했습니다."
      );
    } finally {
      setAiLoading(false);
    }
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

      {roomError && (
        <div
          style={{
            padding: "8px 14px",
            fontSize: "12px",
            color: "#e57373",
          }}
        >
          {roomError}
        </div>
      )}

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
        {historyLoading && (
          <div
            style={{
              fontSize: "13px",
              color: "#888",
              textAlign: "center",
              padding: "20px 0",
            }}
          >
            대화 내용을 불러오는 중...
          </div>
        )}

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
                      : "#87CEEB",
                }}
              >
                {msg.user?.[0]}
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
            onClick={() => requestAI("question")}
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

          {aiError && (
            <div
              style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "#e57373",
                textAlign: "center",
              }}
            >
              {aiError}
            </div>
          )}
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