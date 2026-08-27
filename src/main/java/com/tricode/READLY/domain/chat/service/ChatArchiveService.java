package com.tricode.READLY.domain.chat.service;

import com.tricode.READLY.domain.chat.entity.ChatArchive;
import com.tricode.READLY.domain.chat.entity.ChatMessage;
import com.tricode.READLY.domain.chat.repository.ChatArchiveRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.RedisKeyExpiredEvent;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 채팅 메시지의 뒷단 생명주기를 담당한다.
 *
 * 1) Redis TTL(7일)이 끝나 키가 만료되면 그 메시지를 PostgreSQL(chat_archive)로 옮긴다.
 * 2) 옮긴 지 30일이 지난 보관 행은 하루 한 번 지운다.
 *
 * 만료를 어떻게 알아채는가:
 *   Spring Data Redis의 키스페이스 이벤트를 켜면(RedisRepositoryConfig 참고) 키가 만료될 때
 *   RedisKeyExpiredEvent가 발행된다. 이때 스프링이 미리 떠 둔 사본(phantom key) 덕분에
 *   event.getValue()로 사라진 엔티티 내용을 그대로 받을 수 있다. 사본이 없으면 키 이름만 오고
 *   내용은 알 수 없으므로, 이 기능은 키스페이스 이벤트 설정에 의존한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatArchiveService {

    private final ChatArchiveRepository chatArchiveRepository;

    // 보관 후 이 기간이 지나면 영구 삭제한다 (요구사항: 1개월)
    @Value("${chat.archive.retention-days:30}")
    private int retentionDays;

    /**
     * Redis 키 만료 이벤트 처리. 채팅 메시지가 아닌 만료 이벤트는 그냥 흘려보낸다.
     *
     * 앱이 꺼져 있는 동안 만료된 키의 이벤트는 다시 오지 않는다(Redis Pub/Sub은 저장하지 않는다).
     * 그 메시지는 보관되지 못하고 사라진다. 30분짜리 단발 모임의 7일 지난 대화라 감수하기로 한 부분이고,
     * 더 확실히 하려면 만료 직전에 훑어 옮기는 배치가 따로 필요하다.
     */
    @EventListener
    @Transactional
    public void archiveExpiredChatMessage(RedisKeyExpiredEvent<?> event) {
        Object value = event.getValue();
        if (!(value instanceof ChatMessage message)) {
            return;
        }

        // 같은 메시지가 두 번 들어와도 행이 늘지 않게 한다 (PK가 메시지 UUID다)
        if (chatArchiveRepository.existsById(message.getId())) {
            return;
        }

        chatArchiveRepository.save(ChatArchive.from(message, LocalDateTime.now()));
        log.info("Redis에서 만료된 채팅을 보관했다 (messageId: {}, clubId: {})",
                message.getId(), message.getClubId());
    }

    /**
     * 보관 기간이 지난 채팅을 지운다. 기본값은 매일 새벽 4시.
     * 기준 시각은 "보낸 시각"이 아니라 "PostgreSQL에 보관한 시각"이다.
     */
    @Scheduled(cron = "${chat.archive.purge-cron:0 0 4 * * *}")
    @Transactional
    public void purgeExpiredArchives() {
        LocalDateTime threshold = LocalDateTime.now().minusDays(retentionDays);
        long deleted = chatArchiveRepository.deleteByArchivedAtBefore(threshold);

        if (deleted > 0) {
            log.info("보관 기간({}일)이 지난 채팅 {}건을 삭제했다", retentionDays, deleted);
        }
    }
}
