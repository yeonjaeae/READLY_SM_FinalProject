package com.tricode.READLY.global.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
public class RestTemplateConfig {

    // 알라딘 등 일반 외부 호출용. 타임아웃을 주지 않으면 상대가 응답하지 않을 때
    // 요청 스레드가 무한정 붙잡힌다. 연결 3초 / 응답 대기 10초를 넘기면 RestClientException으로 실패시킨다.
    //
    // AI 호출은 응답이 훨씬 느려서 이 값으로는 부족하다. 아래 aiRestTemplate을 따로 쓴다.
    //
    // @Primary를 붙이면 안 된다. 스프링은 같은 타입 빈이 여럿일 때 필드(생성자 파라미터) 이름보다 @Primary를 먼저 보므로,
    // aiRestTemplate이라고 이름 붙인 필드까지 이 10초짜리 빈을 받는다. 실제로 그렇게 AI 호출이 10초에 끊겼다(known-issues #26).
    // @Primary가 없으면 이름으로 고르고, 어느 빈 이름과도 맞지 않는 필드는 기동 시점에 바로 실패한다.
    @Bean
    public RestTemplate restTemplate() {
        return http11Builder()
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

        return http11Builder()
                .connectTimeout(Duration.ofSeconds(connectTimeoutSeconds))
                .readTimeout(Duration.ofSeconds(readTimeoutSeconds))
                .build();
    }

    /**
     * HTTP/1.1로 고정한 RestTemplateBuilder.
     *
     * Boot 3.5의 RestTemplateBuilder는 기본으로 JDK HttpClient를 쓰는데, 이 클라이언트는 HTTP/2가 기본이라
     * http:// 주소에는 "Upgrade: h2c" 헤더를 붙여 보낸다. AI 서버(uvicorn)는 h2c 업그레이드를 지원하지 않아서
     * 요청 본문은 처리해 200을 남기면서도, 뒤에 남은 바이트를 새 요청으로 읽다가 곧바로
     * "400 Invalid HTTP request received."를 돌려줬다. 우리는 그 400을 먼저 받아 AI 독후감 생성이 매번 503이 됐다.
     * HTTP/1.1로 고정하면 업그레이드 헤더를 보내지 않는다. https(알라딘)에는 영향이 없다.
     */
    private RestTemplateBuilder http11Builder() {
        return new RestTemplateBuilder()
                .requestFactoryBuilder(ClientHttpRequestFactoryBuilder.jdk()
                        .withHttpClientCustomizer(builder -> builder.version(HttpClient.Version.HTTP_1_1)));
    }

}
