package com.tricode.READLY.domain.chat.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;
import java.util.List;

public class ChatDto {

    // [기능 6] 채팅 전송 요청용
    // 보낸 사람(memberId)은 본문으로 받지 않는다.
    // 사용자는 WebSocket 연결 시 검증된 토큰에서, AI는 서버가 고정값으로 넣는다.
    public record MessageRequest(
            String content
    ) {}

    // 채팅방 재입장 시 보여줄 지난 대화 한 건.
    // Redis TTL이 7일이라 별도 기간 조건 없이 남아 있는 것이 곧 최근 7일치다.
    public record HistoryItem(
            String messageId,
            Long memberId,
            String senderName,
            String content,
            LocalDateTime createdAt
    ) {}

    // STOMP 전송이 거부됐을 때 보낸 사람에게만 돌려주는 알림.
    // REST는 GlobalExceptionHandler가 상태코드로 알려주지만, STOMP는 예외를 던져도 클라이언트에
    // 아무것도 가지 않아 조용한 실패가 된다. 그래서 보낸 사람의 /user/sub/errors 로 사유를 보낸다.
    public record ErrorResponse(
            String message
    ) {}

    // 모임장이 AI 진행자 개입 버튼을 누를 때 보내는 요청 (POST /api/book-clubs/{clubId}/meeting/assist)
    public record MeetingAssistRequest(
            String mode // "question"(토론 질문 제안) 또는 "summary"(대화 요약)
    ) {}

    // AI 서버 POST /api/meeting/assist 요청 바디
    public record MeetingAssistApiRequest(
            @JsonProperty("book_title") String bookTitle,
            @JsonProperty("chat_history") List<AiChatHistoryItem> chatHistory,
            String mode
    ) {}

    public record AiChatHistoryItem(
            String speaker,
            String text
    ) {}

    // AI 서버 POST /api/meeting/assist 응답 바디
    public record MeetingAssistApiResponse(
            String mode,
            String result
    ) {}
}
