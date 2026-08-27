package com.tricode.READLY.global.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class RestTemplateConfig {

    // 알라딘 등 일반 외부 호출용. 타임아웃을 주지 않으면 상대가 응답하지 않을 때
    // 요청 스레드가 무한정 붙잡힌다. 연결 3초 / 응답 대기 10초를 넘기면 RestClientException으로 실패시킨다.
    //
    // AI 호출은 응답이 훨씬 느려서 이 값으로는 부족하다. 아래 aiRestTemplate을 따로 쓴다.
    @Bean
    @Primary
    public RestTemplate restTemplate() {
        return new RestTemplateBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .readTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * AI 서버 전용 RestTemplate.
     *
     * AI 서버는 LLM 응답을 생성해서 돌려주고, 무료 플랜에서는 콜드 스타트까지 겹쳐
     * 응답에 수십 초가 걸린다. 기존 공용 빈의 10초 제한으로는 정상 응답도 타임아웃으로 실패했다.
     * 그래서 AI 호출만 넉넉한 타임아웃을 쓰고, 알라딘 호출은 기존 값을 유지한다
     * (알라딘까지 늘리면 단순 검색 장애에도 사용자가 2분을 기다리게 된다).
     *
     * 주입은 이름으로 맞춘다. 필드 이름을 aiRestTemplate으로 두면 이 빈이 주입된다.
     */
    @Bean
    public RestTemplate aiRestTemplate(
            @Value("${ai.connect-timeout-seconds:10}") long connectTimeoutSeconds,
            @Value("${ai.read-timeout-seconds:120}") long readTimeoutSeconds) {

        return new RestTemplateBuilder()
                .connectTimeout(Duration.ofSeconds(connectTimeoutSeconds))
                .readTimeout(Duration.ofSeconds(readTimeoutSeconds))
                .build();
    }

}
