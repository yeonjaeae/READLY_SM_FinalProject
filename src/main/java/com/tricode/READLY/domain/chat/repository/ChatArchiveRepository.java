package com.tricode.READLY.domain.chat.repository;

import com.tricode.READLY.domain.chat.entity.ChatArchive;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;

/**
 * Redis에서 만료된 채팅을 보관하는 PostgreSQL 테이블 접근.
 * (같은 chat 도메인에 있지만 ChatMessageRepository는 Redis, 이쪽은 JPA다)
 */
public interface ChatArchiveRepository extends JpaRepository<ChatArchive, String> {

    // 보관 후 일정 기간이 지난 행을 지운다. 반환값은 지운 행 수
    long deleteByArchivedAtBefore(LocalDateTime threshold);
}
