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
// 설치 필요: npm install @stomp/stompjs
// ==================================================

import { Client } from "@stomp/stompjs";
import { API_BASE_URL, getToken } from "./api";

const WS_URL = API_BASE_URL.replace(/^http/, "ws") + "/ws/chat";

// STOMP 클라이언트 생성 + 연결 + 구독까지 한번에 처리
export function createChatClient({ clubId, onMessage, onConnect, onError }) {
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