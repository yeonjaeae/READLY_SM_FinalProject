// src/api/chatSocket.js
//
// ==================================================
// ★ 실시간 채팅 (STOMP over WebSocket)
//
// 백엔드 명세:
// - CONNECT /ws/chat
//   → HTTP 핸드셰이크는 permitAll(브라우저가 핸드셰이크에
//     커스텀 헤더를 못 넣기 때문), 대신 STOMP CONNECT 프레임의
//     Authorization 헤더로 인증
// - SUBSCRIBE /sub/chat/clubs/{clubId} : 가입 회원만 가능
// - SEND /pub/chat/clubs/{clubId} : { "content": "..." }
//   보낸 사람은 토큰의 memberId로 서버가 고정
//
// ★ 채팅방 활성화 시간 제약 (2026-08-26 문서)
// 메시지 전송은 모임 시작 15분 전 ~ 종료 15분 후(총 60분)에만 허용됨.
// 이 판정은 서버에서만 하고, 서버가 전송을 거부해도 STOMP는 발신자에게
// 아무것도 알려주지 않기 때문에 발신자 전용 에러 채널이 따로 있음:
// - SUBSCRIBE /user/sub/errors : 본인이 보낸 메시지가 거부됐을 때만 옴
//   페이로드: { "message": "..." } (예: 아직 열리기 전 / 이미 닫힌 뒤)
//   다른 참여자에게는 전달되지 않음. 구독 안 해도 동작엔 문제없지만,
//   전송 실패가 화면에 안 보이고 메시지가 조용히 사라진 것처럼 보임.
//
// 설치 필요: npm install @stomp/stompjs
// ==================================================

import { Client } from "@stomp/stompjs";
import { API_BASE_URL, getToken } from "./api";

const WS_URL = API_BASE_URL.replace(/^http/, "ws") + "/ws/chat";

// STOMP 클라이언트 생성 + 연결 + 구독까지 한번에 처리
export function createChatClient({
  clubId,
  onMessage,
  onConnect,
  onError,
  onSendRejected,
}) {
  const client = new Client({
    brokerURL: WS_URL,

    connectHeaders: {
      Authorization: `Bearer ${getToken()}`,
    },

    reconnectDelay: 3000,

    onConnect: () => {
      // 구독은 구독 시점 "이후" 메시지만 전달됨
      // (지난 대화는 REST GET /api/book-clubs/{clubId}/chats로 별도 조회)
      client.subscribe(`/sub/chat/clubs/${clubId}`, (message) => {
        try {
          const body = JSON.parse(message.body);
          onMessage(body);
        } catch (e) {
          console.error("채팅 메시지 파싱 오류:", e);
        }
      });

      // 내가 보낸 메시지가 서버에 의해 거부됐을 때만 오는 전용 채널
      // (채팅방 미개장/종료 시간대에 SEND했을 때 등)
      client.subscribe("/user/sub/errors", (message) => {
        try {
          const { message: reason } = JSON.parse(message.body);
          onSendRejected?.(reason);
        } catch (e) {
          console.error("전송 거부 알림 파싱 오류:", e);
        }
      });

      if (onConnect) {
        onConnect();
      }
    },

    onStompError: (frame) => {
      // 토큰 없음/무효 → ERROR 프레임 후 연결 종료
      console.error("STOMP 오류:", frame);

      if (onError) {
        onError(frame);
      }
    },
  });

  client.activate();

  return client;
}

export function sendChatMessage(client, clubId, content) {
  if (!client || !client.connected) {
    console.warn("채팅 소켓이 연결되어 있지 않습니다.");
    return;
  }

  client.publish({
    destination: `/pub/chat/clubs/${clubId}`,
    body: JSON.stringify({ content }),
  });
}

export function disconnectChatClient(client) {
  if (client) {
    client.deactivate();
  }
}