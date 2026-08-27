package com.tricode.READLY.domain.chat.service;

import com.tricode.READLY.domain.chat.entity.ChatMessage;
import com.tricode.READLY.domain.chat.repository.ChatMessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * Redis Pub/Sub "chat-group" 채널 구독자.
 * RedisSubConfig가 이 빈을 RedisMessageListenerContainer에 등록한다.
 * (예전에는 @KafkaListener였다 — known-issues #19)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatConsumer implements MessageListener {

    // AI 전용 RestTemplate (타임아웃이 긴 빈). 필드 이름으로 주입 대상이 정해진다 - RestTemplateConfig 참고
    private final RestTemplate aiRestTemplate;
    private final ChatMessageRepository chatMessageRepository;
    private final SimpMessageSendingOperations messagingTemplate; // 추가됨: STOMP 브로드캐스팅 객체
    private final ChatService chatService; // 브로드캐스트 형식을 이력 조회와 맞추기 위해 응답 변환을 빌려 쓴다
    private final Jackson2JsonRedisSerializer<ChatMessage> chatMessageSerializer; // 발행 쪽과 같은 직렬화기

    @Value("${ai.base-url}")
    private String aiBaseUrl;

    // Redis 구독 콜백. 페이로드를 ChatMessage로 되돌린 뒤 기존 처리 흐름을 그대로 탄다.
    @Override
    public void onMessage(Message redisMessage, byte[] pattern) {
        ChatMessage message = chatMessageSerializer.deserialize(redisMessage.getBody());
        if (message == null) {
            log.warn("Redis 채널에서 빈 메시지를 받아 무시한다");
            return;
        }
        consume(message);
    }

    public void consume(ChatMessage message) {
        log.info("Redis 채널로부터 수신된 메세지: {}", message.getContent());

        // 1. Redis에 저장 (기존 로직)
        chatMessageRepository.save(message);

        // 2. WebSocket 구독자들에게 실시간 브로드캐스팅 (필수!)
        // "/sub/chat/clubs/{clubId}" 를 구독하고 있는 클라이언트들에게 메시지 전송.
        // 엔티티를 그대로 보내면 messageId/senderName이 없어 이력 조회(GET .../chats) 응답과 형식이 달라지므로
        // 반드시 HistoryItem으로 바꿔서 보낸다. 프론트는 두 경로를 같은 코드로 처리한다.
        messagingTemplate.convertAndSend(
                "/sub/chat/clubs/" + message.getClubId(), chatService.toHistoryItem(message));

        // 3. AI 에이전트에게 메시지 전달 (AI가 보낸 메시지가 아닐 때만)
        //
        // 2026-08-26 현재 AI 서버에 이 경로(/api/ai/chat)가 없어서 채팅 한 건마다 404가 나고
        // 스택 트레이스만 로그에 쌓인다(known-issues #20). 그래서 호출만 잠시 꺼 둔다.
        // 삭제하지 않는 이유는 AI 서버가 이 엔드포인트를 구현하면 그대로 되살릴 코드이기 때문이다.
        // 되살릴 때는 아래 두 줄의 주석만 풀면 되고, sendToAiAgent 메서드는 그대로 남겨 뒀다.
        // if (!ChatService.AI_MEMBER_ID.equals(message.getMemberId())) {
        //     sendToAiAgent(message);
        // }
    }

    // 현재 호출부가 주석 처리돼 있어 실행되지 않는다 (위 3번 주석 / known-issues #20 참고).
    //
    // 여기는 Redis 구독 리스너에서 도는 비동기 경로라 사용자에게 돌려줄 응답이 없다.
    // 이미 Redis 저장과 브로드캐스트는 끝난 뒤이므로, AI 전달 실패는 로그만 남기고 삼킨다.
    // (사용자가 직접 호출하는 ChatService의 assist 경로는 반대로 503을 던진다)
    @SuppressWarnings("unused")
    private void sendToAiAgent(ChatMessage message) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            // AI 서버로 보낼 JSON 데이터 구조체 생성
            AiMessageRequest requestBody = new AiMessageRequest(
                    message.getClubId(),
                    message.getMemberId(),
                    message.getContent()
            );

            HttpEntity<AiMessageRequest> requestEntity = new HttpEntity<>(requestBody, headers);

            aiRestTemplate.postForEntity(aiBaseUrl + "/api/ai/chat", requestEntity, String.class);
            log.info("AI 에이전트로 메시지 전송 성공 (clubId: {})", message.getClubId());

        } catch (Exception e) {
            log.error("AI 에이전트로 메시지 전송 실패: ", e);
        }
    }

    // AI 서버로 보낼 JSON DTO (record 사용)
    public record AiMessageRequest(Long clubId, Long memberId, String content) {}
}
