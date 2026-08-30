package com.tricode.READLY.domain.chat.service;

import com.tricode.READLY.domain.book.entity.BookClub;
import com.tricode.READLY.domain.book.repository.BookClubRepository;
import com.tricode.READLY.domain.book.repository.MemberBookClubRepository;
import com.tricode.READLY.domain.chat.dto.ChatDto;
import com.tricode.READLY.domain.chat.entity.ChatMessage;
import com.tricode.READLY.domain.chat.repository.ChatMessageRepository;
import com.tricode.READLY.domain.member.entity.Member;
import com.tricode.READLY.domain.member.repository.MemberRepository;
import com.tricode.READLY.global.exception.AiServerException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    // 채팅에 참여하는 AI 에이전트의 예약된 회원 ID
    public static final Long AI_MEMBER_ID = 999L;

    private final ChatProducer chatProducer;
    private final ChatMessageRepository chatMessageRepository;
    private final MemberBookClubRepository memberBookClubRepository;
    private final BookClubRepository bookClubRepository;
    private final MemberRepository memberRepository;
    // AI 전용 RestTemplate (타임아웃이 긴 빈). 필드 이름으로 주입 대상이 정해진다 - RestTemplateConfig 참고
    private final RestTemplate aiRestTemplate;

    @Value("${ai.base-url}")
    private String aiBaseUrl;

    private static final int RECENT_MESSAGE_LIMIT = 50; // AI에게 넘길 최근 대화 개수 제한

    // 채팅방 활성화 윈도우: 모임 시작 15분 전에 열리고, 30분짜리 모임이 끝난 뒤 15분 뒤에 닫힌다(총 60분).
    // 이 판정은 오직 백엔드에서만 한다. 프론트나 AI 서버에 상태를 넘겨 위임하지 않는다.
    // 구간 계산은 BookClub이 갖고 있다 (목록의 진행/종료 표시도 같은 값을 쓴다).

    public void sendMessage(Long clubId, Long memberId, String content) {
        BookClub bookClub = bookClubRepository.findById(clubId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 독서모임입니다."));

        validateClubMember(clubId, memberId);
        validateChatWindow(bookClub);

        // Redis에 들어갈 객체 조립 (ID는 UUID로 생성)
        ChatMessage message = ChatMessage.builder()
                .id(UUID.randomUUID().toString())
                .clubId(clubId)
                .memberId(memberId)
                .content(content)
                .createdAt(LocalDateTime.now())
                .build();

        // Redis 채널로 메시지 발행 (ChatConsumer가 구독해 저장/브로드캐스트/AI 전달을 처리한다)
        chatProducer.sendMessage(message);
    }

    /**
     * 채팅방 재입장 시 보여줄 지난 대화 조회.
     * STOMP 구독은 구독 이후의 메시지만 전달하므로, 과거 내역은 이 API로 따로 받아야 한다.
     * Redis TTL이 7일이라 남아 있는 것이 곧 최근 7일치다.
     */
    public List<ChatDto.HistoryItem> getChatHistory(Long clubId, Long memberId) {
        validateClubMember(clubId, memberId);

        List<ChatMessage> messages = getSortedMessages(clubId);
        Map<Long, String> memberNames = resolveMemberNames(messages);

        return messages.stream()
                .map(message -> toHistoryItem(message, memberNames))
                .toList();
    }

    /**
     * 메시지 한 건을 이력 조회와 똑같은 응답 형식으로 바꾼다.
     * ChatConsumer가 실시간 브로드캐스트에 쓴다. 두 경로의 형식이 갈리면
     * 프론트에서 실시간 메시지만 보낸 사람 이름이 비는 문제가 생긴다.
     */
    public ChatDto.HistoryItem toHistoryItem(ChatMessage message) {
        return toHistoryItem(message, resolveMemberNames(List.of(message)));
    }

    // 응답 조립은 이 한 곳에만 둔다 (목록 조회와 단건 브로드캐스트가 공유)
    private ChatDto.HistoryItem toHistoryItem(ChatMessage message, Map<Long, String> memberNames) {
        return new ChatDto.HistoryItem(
                message.getId(),
                message.getMemberId(),
                resolveSpeaker(message.getMemberId(), memberNames),
                message.getContent(),
                message.getCreatedAt());
    }

    /**
     * 모임장 전용: AI 진행자 개입 버튼.
     * 최근 대화(Redis)와 책 제목을 AI 서버에 보내고, 받은 응답을 AI 이름으로 채팅방에 바로 발행한다.
     *
     * AI 호출 경로는 이 메서드 하나뿐이다. 예전에는 참여자용(/meeting/assist)과 방장용(/ai-assist)이
     * 나뉘어 있었는데, 같은 AI 엔드포인트를 서로 다른 형식으로 부르다가 참여자 경로가 계속 422로 실패했다.
     * (known-issues #11)
     */
    public void requestMeetingAssist(Long clubId, Long memberId, String mode) {
        BookClub bookClub = bookClubRepository.findByIdWithBook(clubId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 독서모임입니다."));
        validateClubHost(bookClub, memberId);

        String bookTitle = bookClub.getBook() != null ? bookClub.getBook().getName() : null;

        List<ChatMessage> messages = getRecentMessages(clubId);
        Map<Long, String> memberNames = resolveMemberNames(messages);

        List<ChatDto.AiChatHistoryItem> chatHistory = messages.stream()
                .map(message -> new ChatDto.AiChatHistoryItem(
                        resolveSpeaker(message.getMemberId(), memberNames),
                        message.getContent()))
                .toList();

        // AI 서버가 요구하는 형식: { "book_title": ..., "chat_history": [{ "speaker", "text" }], "mode": ... }
        ChatDto.MeetingAssistApiRequest requestBody = new ChatDto.MeetingAssistApiRequest(bookTitle, chatHistory, mode);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<ChatDto.MeetingAssistApiRequest> requestEntity = new HttpEntity<>(requestBody, headers);

        // 사용자가 버튼을 눌러 발생한 동기 요청이다. 실패를 삼키고 200을 주면
        // 프론트가 성공한 것으로 표시하므로, 예외로 올려 503으로 응답한다.
        ChatDto.MeetingAssistApiResponse response;
        try {
            response = aiRestTemplate.postForObject(
                    aiBaseUrl + "/api/meeting/assist", requestEntity, ChatDto.MeetingAssistApiResponse.class);
        } catch (RestClientException e) {
            throw new AiServerException("AI 진행자 개입 요청 실패 (clubId: " + clubId + ")", e);
        }

        // 호출은 됐지만 쓸 내용이 없는 경우도 사용자 입장에서는 실패다
        if (response == null || response.result() == null) {
            throw new AiServerException("AI 진행자 개입 응답이 비어 있습니다 (clubId: " + clubId + ")");
        }

        // 기존 채팅 전송(sendMessage)과 동일한 방식으로 AI 응답을 채팅방에 발행
        sendMessage(clubId, AI_MEMBER_ID, response.result());
    }

    // createdAt이 비어 있는 과거 데이터가 섞여 있어도 정렬이 깨지지 않도록 nullsLast 사용
    private List<ChatMessage> getSortedMessages(Long clubId) {
        return chatMessageRepository.findByClubId(clubId).stream()
                .sorted(Comparator.comparing(ChatMessage::getCreatedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    private List<ChatMessage> getRecentMessages(Long clubId) {
        List<ChatMessage> messages = getSortedMessages(clubId);

        return messages.stream()
                .skip(Math.max(0, messages.size() - RECENT_MESSAGE_LIMIT))
                .toList();
    }

    // 메시지에 등장하는 회원들의 표시 이름을 한 번에 조회한다 (닉네임이 없으면 로그인 ID)
    private Map<Long, String> resolveMemberNames(List<ChatMessage> messages) {
        return memberRepository.findAllById(
                        messages.stream().map(ChatMessage::getMemberId).distinct().toList()).stream()
                .collect(Collectors.toMap(Member::getId,
                        m -> m.getNickname() != null ? m.getNickname() : m.getLoginId()));
    }

    // AI는 회원 테이블에 없으므로 고정 이름을 쓴다. 탈퇴 등으로 조회되지 않는 회원도 빈 값으로 두지 않는다.
    private String resolveSpeaker(Long memberId, Map<Long, String> memberNames) {
        if (AI_MEMBER_ID.equals(memberId)) {
            return "AI";
        }
        return memberNames.getOrDefault(memberId, "알 수 없는 사용자");
    }

    /**
     * 채팅방이 열려 있는 시간대인지 확인한다.
     *
     * 모임 시작 15분 전 ~ 종료(시작 + 30분) 15분 후, 총 60분 동안만 메시지를 받는다.
     * 조회(getChatHistory)는 이 제한을 받지 않는다. 모임이 끝난 뒤에도 7일 동안은 대화를 다시 볼 수 있어야 한다.
     *
     * AI가 보내는 메시지(AI_MEMBER_ID)도 똑같이 막는다. 창구를 하나로 두어야 우회 경로가 생기지 않고,
     * AI 응답은 방장이 모임 중에 요청한 것이라 정상 흐름에서는 윈도우 안에 들어온다.
     * (모임 종료 15분 전후로 요청한 AI 응답이 아주 늦게 도착하면 거부될 수 있다. 이 경우는 로그로만 남는다.)
     */
    private void validateChatWindow(BookClub bookClub) {
        LocalDateTime opensAt = bookClub.getChatOpensAt();
        LocalDateTime closesAt = bookClub.getChatClosesAt();

        // 날짜/시간이 비어 있는 과거 모임은 윈도우를 계산할 수 없다. 채팅을 막지 않고 그대로 통과시킨다.
        if (opensAt == null || closesAt == null) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        if (now.isBefore(opensAt)) {
            throw new IllegalStateException("아직 채팅방이 열리지 않았습니다. 모임 시작 15분 전부터 이용할 수 있습니다.");
        }
        if (now.isAfter(closesAt)) {
            throw new IllegalStateException("채팅방이 종료되었습니다. 지난 대화는 계속 확인할 수 있습니다.");
        }
    }

    // 가입하지 않은 북클럽의 채팅방은 이용할 수 없다 (AI 에이전트는 예외)
    private void validateClubMember(Long clubId, Long memberId) {
        if (AI_MEMBER_ID.equals(memberId)) {
            return;
        }
        if (!memberBookClubRepository.existsByMemberIdAndBookClubId(memberId, clubId)) {
            throw new IllegalStateException("가입하지 않은 독서모임입니다.");
        }
    }

    // AI 진행자 개입은 방장만 요청할 수 있다. 방장은 book_club.host_id에 명시돼 있다.
    // host는 LAZY 프록시지만 getId()는 추가 쿼리 없이 읽힌다.
    private void validateClubHost(BookClub bookClub, Long memberId) {
        if (bookClub.getHost() == null) {
            // host_id 백필(db/2026-08-17-add-bookclub-host.sql) 이전에 만들어진 모임
            throw new IllegalStateException("방장이 지정되지 않은 독서모임입니다.");
        }
        if (!bookClub.getHost().getId().equals(memberId)) {
            throw new IllegalStateException("방장만 AI 진행자를 호출할 수 있습니다.");
        }
    }
}
