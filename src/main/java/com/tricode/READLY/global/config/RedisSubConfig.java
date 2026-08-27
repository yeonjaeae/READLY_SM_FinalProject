package com.tricode.READLY.global.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.tricode.READLY.domain.chat.entity.ChatMessage;
import com.tricode.READLY.domain.chat.service.ChatConsumer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/**
 * 채팅 메시지 발행/구독(Redis Pub/Sub) 설정.
 *
 * 예전에는 Kafka 토픽 "chat-group"으로 발행하고 @KafkaListener가 받았다.
 * 프로듀서와 컨슈머가 같은 애플리케이션이고 토픽 로그를 다시 읽는 코드도 없어서,
 * 브로커를 걷어내고 이미 쓰고 있던 Redis로 옮겼다 (known-issues #19).
 */
@Configuration
public class RedisSubConfig {

    // Kafka 토픽 이름을 그대로 채널 이름으로 쓴다
    public static final String CHAT_CHANNEL = "chat-group";

    /**
     * pub/sub 페이로드 직렬화기.
     *
     * 이 채널로는 ChatMessage만 오가므로 타입을 고정한 Jackson2JsonRedisSerializer를 쓴다.
     * (GenericJackson2JsonRedisSerializer는 @class 타입 정보를 함께 실어야 해서 불필요하게 복잡하다.)
     * ChatMessage.createdAt이 LocalDateTime이라 JavaTimeModule 등록이 필수다. 빠뜨리면 직렬화가 깨진다.
     */
    @Bean
    public Jackson2JsonRedisSerializer<ChatMessage> chatMessageSerializer() {
        ObjectMapper objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        return new Jackson2JsonRedisSerializer<>(objectMapper, ChatMessage.class);
    }

    /**
     * 발행용 템플릿. ChatProducer가 convertAndSend로 쓴다.
     * 자동설정이 만드는 redisTemplate은 RedisTemplate&lt;Object, Object&gt;라 타입이 달라 충돌하지 않는다.
     * (@RedisHash 저장 경로는 Spring Data Redis의 별도 컨버터를 쓰므로 이 설정과 무관하다.)
     */
    @Bean
    public RedisTemplate<String, ChatMessage> chatRedisTemplate(
            RedisConnectionFactory connectionFactory,
            Jackson2JsonRedisSerializer<ChatMessage> chatMessageSerializer) {

        RedisTemplate<String, ChatMessage> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(chatMessageSerializer);
        return template;
    }

    /**
     * 구독 컨테이너. ChatConsumer를 "chat-group" 채널에 붙인다.
     * Kafka 컨슈머 그룹과 달리 Pub/Sub은 구독한 모든 인스턴스에 팬아웃되므로,
     * 나중에 인스턴스를 늘려도 STOMP 브로드캐스트가 한 대에만 가는 문제가 없다.
     */
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            RedisConnectionFactory connectionFactory, ChatConsumer chatConsumer) {

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(chatConsumer, new ChannelTopic(CHAT_CHANNEL));
        return container;
    }
}
