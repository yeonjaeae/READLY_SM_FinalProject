package com.tricode.READLY.domain.chat.controller;

import com.tricode.READLY.domain.chat.dto.ChatDto;
import com.tricode.READLY.domain.chat.service.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @Value("${ai.api-key}")
    private String aiApiKey;

    /**
     * AI 에이전트가 답변을 보낼 때 사용하는 REST API.
     * AI 서버는 로그인 사용자가 아니라 JWT가 없으므로, 약속된 API 키 헤더로 확인한다.
     * 보낸 사람은 항상 AI로 고정하므로, 이 API로는 다른 회원인 척할 수 없다.
     */
    @PostMapping("/api/book-clubs/{clubId}/chats")
    public ResponseEntity<Void> sendChatMessageFromAi(
            @PathVariable Long clubId,
            @RequestHeader(value = "X-AI-API-KEY", required = false) String apiKey,
            @RequestBody ChatDto.MessageRequest request) {

        if (!aiApiKey.equals(apiKey)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        chatService.sendMessage(clubId, ChatService.AI_MEMBER_ID, request.content());
        return ResponseEntity.ok().build();
    }

    /**
     * 일반 사용자들이 실시간으로 채팅을 보낼 때 사용하는 STOMP 엔드포인트.
     * 보낸 사람 ID는 요청 본문이 아니라 WebSocket 연결 시 검증된 토큰에서 가져온다.
     */
    @MessageMapping("/chat/clubs/{clubId}")
    public void sendWebSocketMessage(
            @DestinationVariable Long clubId,
            @Payload ChatDto.MessageRequest request,
            Principal principal) {

        Long memberId = (Long) ((Authentication) principal).getPrincipal();
        chatService.sendMessage(clubId, memberId, request.content());
    }

    /**
     * STOMP 전송이 거부됐을 때 보낸 사람에게 사유를 돌려준다.
     *
     * @MessageMapping 안에서 예외가 나면 스프링은 로그만 남기고 클라이언트에는 아무것도 보내지 않는다.
     * 채팅방 활성화 시간(모임 시작 15분 전 ~ 종료 15분 후)을 벗어난 전송을 조용히 삼키면
     * 사용자는 메시지가 사라진 것으로 보이므로, 보낸 사람 전용 경로로 사유를 통보한다.
     *
     * 클라이언트 구독 경로: /user/sub/errors (@SendToUser가 사용자별 목적지로 바꿔 준다)
     */
    @MessageExceptionHandler({IllegalStateException.class, IllegalArgumentException.class})
    @SendToUser("/sub/errors")
    public ChatDto.ErrorResponse handleSendRejected(RuntimeException e) {
        return new ChatDto.ErrorResponse(e.getMessage());
    }

    /**
     * 채팅방 재입장 시 지난 대화를 불러오는 REST API.
     * 가입한 회원만 조회할 수 있고, Redis TTL(7일)이 지난 메시지는 이미 사라진 상태다.
     */
    @GetMapping("/api/book-clubs/{clubId}/chats")
    public ResponseEntity<List<ChatDto.HistoryItem>> getChatHistory(
            @PathVariable Long clubId,
            @AuthenticationPrincipal Long memberId) {
        return ResponseEntity.ok(chatService.getChatHistory(clubId, memberId));
    }

    /**
     * 모임장 전용 AI 진행자 개입 버튼.
     * 최근 대화와 책 제목을 AI 서버로 보내고, 응답을 AI 이름으로 채팅방에 바로 발행한다.
     * 응답 본문이 없는 이유는 결과가 STOMP 구독으로 도착하기 때문이다.
     *
     * AI를 호출하는 엔드포인트는 이것 하나뿐이다.
     * 예전에 있던 방장용 /ai-assist는 이 경로와 하는 일이 같아 삭제했다(known-issues #11).
     */
    @PostMapping("/api/book-clubs/{clubId}/meeting/assist")
    public ResponseEntity<Void> requestMeetingAssist(
            @PathVariable Long clubId,
            @AuthenticationPrincipal Long memberId,
            @RequestBody ChatDto.MeetingAssistRequest request) {
        chatService.requestMeetingAssist(clubId, memberId, request.mode());
        return ResponseEntity.ok().build();
    }
}
