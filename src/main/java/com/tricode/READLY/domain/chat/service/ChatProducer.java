package com.tricode.READLY.domain.chat.service;

import com.tricode.READLY.domain.chat.entity.ChatMessage;
import com.tricode.READLY.global.config.RedisSubConfig;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ChatProducer {

    private final RedisTemplate<String, ChatMessage> chatRedisTemplate;

    public void sendMessage(ChatMessage message) {
        // ChatMessage 객체를 Redis 채널로 발행한다. 같은 애플리케이션의 ChatConsumer가 구독해 처리한다.
        chatRedisTemplate.convertAndSend(RedisSubConfig.CHAT_CHANNEL, message);
    }
}
