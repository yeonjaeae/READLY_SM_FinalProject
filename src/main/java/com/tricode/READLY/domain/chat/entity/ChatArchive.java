package com.tricode.READLY.domain.chat.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Redis에서 TTL(7일)이 끝나 사라지는 채팅 메시지를 옮겨 담는 보관용 JPA 엔티티.
 *
 * 흐름: 발행 → Redis 저장(@RedisHash, 7일) → 만료 시점에 이 테이블로 이관 → 이관 후 30일 뒤 삭제.
 * 즉 한 메시지의 총 보존 기간은 대략 7일 + 30일이다.
 *
 * 실시간 채팅과 최근 7일 조회는 전부 Redis만 본다. 이 테이블은 보관 목적이라
 * 조회 API가 아직 없다(필요해지면 clubId로 조회하는 경로를 추가하면 된다).
 *
 * id는 Redis에서 쓰던 메시지 UUID를 그대로 PK로 쓴다. 같은 메시지를 두 번 이관해도
 * 새 행이 생기지 않게 하려는 것이다.
 */
@Entity
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "chat_archive")
public class ChatArchive {

    @Id
    @Column(name = "message_id", length = 64)
    private String id;

    @Column(nullable = false)
    private Long clubId;

    @Column(nullable = false)
    private Long memberId;

    @Column(columnDefinition = "TEXT")
    private String content;

    // 메시지를 보낸 시각 (Redis에 저장돼 있던 값 그대로)
    private LocalDateTime createdAt;

    // PostgreSQL로 옮겨 담은 시각. 삭제 기준(30일)은 이 값을 쓴다.
    @Column(nullable = false)
    private LocalDateTime archivedAt;

    // JPA용 전체 생성자는 노출하지 않고, 변환은 이 팩토리 하나로만 한다
    private ChatArchive(String id, Long clubId, Long memberId, String content,
                        LocalDateTime createdAt, LocalDateTime archivedAt) {
        this.id = id;
        this.clubId = clubId;
        this.memberId = memberId;
        this.content = content;
        this.createdAt = createdAt;
        this.archivedAt = archivedAt;
    }

    public static ChatArchive from(ChatMessage message, LocalDateTime archivedAt) {
        return new ChatArchive(
                message.getId(),
                message.getClubId(),
                message.getMemberId(),
                message.getContent(),
                message.getCreatedAt(),
                archivedAt);
    }
}
