package com.tricode.READLY.global.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.RedisKeyValueAdapter;
import org.springframework.data.redis.repository.configuration.EnableRedisRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Redis 리포지토리(@RedisHash) 설정.
 *
 * 기본값으로 두면 스프링 부트가 알아서 켜 주지만, 여기서는 **키 만료 이벤트**가 필요해서 직접 선언한다.
 * ChatMessage는 TTL 7일이 지나면 Redis에서 사라지는데, 사라지는 순간을 알아야
 * PostgreSQL(chat_archive)로 옮길 수 있기 때문이다(ChatArchiveService).
 *
 * - enableKeyspaceEvents = ON_STARTUP: 앱이 뜰 때 Redis에 만료 이벤트 구독을 걸고,
 *   서버의 notify-keyspace-events 설정도 필요한 값으로 맞춰 준다(CONFIG SET).
 *   **관리형 Redis에서 CONFIG 명령이 막혀 있으면 이 자동 설정이 실패한다.**
 *   그런 환경에서는 서버 쪽에서 notify-keyspace-events에 Ex(또는 EA)를 직접 넣어야 한다.
 * - 이 설정을 켜면 스프링이 원본 키와 별개로 사본(phantom key)을 TTL + 5분으로 함께 저장한다.
 *   만료 이벤트에서 사라진 값의 내용을 읽을 수 있는 이유가 이 사본이다.
 *   대신 채팅 한 건당 Redis 키가 하나 더 생긴다(메모리를 조금 더 쓴다).
 *
 * basePackages를 명시하는 이유: @EnableRedisRepositories를 직접 선언하면 부트의 자동 설정이 물러나므로,
 * ChatMessageRepository가 있는 패키지를 여기서 지정해 줘야 한다.
 *
 * @EnableScheduling은 보관 기간이 지난 채팅을 지우는 @Scheduled 작업(ChatArchiveService) 때문에 필요하다.
 */
@Configuration
@EnableScheduling
@EnableRedisRepositories(
        basePackages = "com.tricode.READLY.domain.chat.repository",
        enableKeyspaceEvents = RedisKeyValueAdapter.EnableKeyspaceEvents.ON_STARTUP)
public class RedisRepositoryConfig {
}
