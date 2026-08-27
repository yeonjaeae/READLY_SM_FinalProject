# READLY Backend

독서모임/소셜 리딩 앱 READLY의 백엔드. Spring Boot 3.5(Java 17) 기반 REST API와, Redis로 구성된 STOMP 실시간 채팅 파이프라인을 제공한다.

## 기술 스택

- **Language / Runtime**: Java 17
- **Framework**: Spring Boot 3.5 (Web, Data JPA, Data Redis, Security, WebSocket, Validation)
- **DB**: PostgreSQL (JPA, `ddl-auto: update`)
- **Cache / Store**: Redis (채팅 메시지 저장 7일 TTL + 발행/구독 Pub/Sub)
- **인증**: JWT (`jjwt`)
- **외부 연동**: 알라딘 Open API(도서 검색/조회), 외부 AI 에이전트 서버
- **빌드**: Gradle (wrapper)

## 아키텍처

패키지는 `com.tricode.READLY` 아래 `domain/*`(기능 단위)와 `global/*`(공통 설정)로 나뉜다. 각 도메인은 `controller / dto / entity / repository / service` 구조를 따른다.

- `domain/member` — 회원가입/로그인, JWT 발급·검증, 팔로우
- `domain/book` — 도서(알라딘 연동), 독서모임, 독서록(BookNote), AI 독서록(AINote)
- `domain/chat` — Redis Pub/Sub → Redis 저장 → STOMP 실시간 채팅 + AI 에이전트 연동
- `global/config` — 보안, WebSocket/STOMP, Redis 구독, RestTemplate 설정
- `global/exception` — 전역 예외 처리 (`@RestControllerAdvice`)

### 채팅 파이프라인

메시지는 STOMP 또는 REST(AI 콜백)로 들어와 Redis Pub/Sub 채널(`chat-group`)에 발행되고, 같은 앱의 구독자(`ChatConsumer`)가 Redis에 저장(7일 TTL) 후 STOMP 구독자에게 브로드캐스트하며 동시에 외부 AI 서버로 전달한다.

전송은 **모임 시작 15분 전 ~ 종료(시작 + 30분) 15분 후**의 60분 동안만 허용된다(백엔드에서만 판정). 조회는 시간 제한이 없다.

Redis에서 7일 TTL이 끝난 메시지는 만료 시점에 PostgreSQL `chat_archive`로 옮겨 30일 더 보관한 뒤 삭제된다(`ChatArchiveService`).

### 인증

`Authorization: Bearer <accessToken>` 헤더 기반 JWT 인증. 인증 주체는 `UserDetails`가 아니라 원시 `memberId`(Long)이며, 컨트롤러는 `@AuthenticationPrincipal Long memberId`로 받는다. WebSocket(STOMP)은 HTTP 인증 체인 밖에 있어 `CONNECT` 프레임에서 별도로 검증하고, AI 에이전트의 채팅 콜백은 JWT 대신 `X-AI-API-KEY` 헤더로 인증한다.

## 시작하기

### 요구 사항

- JDK 17
- 로컬 PostgreSQL, Redis (채팅 발행/구독도 이 Redis를 쓴다. 별도 메시지 브로커는 필요 없다)

### 환경변수 설정

비밀값은 코드/설정 파일에 평문으로 두지 않는다. `src/main/resources/application-local.yaml.example`을 복사해 `application-local.yaml`(gitignore 대상)을 만들고 실제 값을 채우거나, 아래 환경변수를 직접 주입한다.

```powershell
copy src\main\resources\application-local.yaml.example src\main\resources\application-local.yaml
```

| 변수 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `DB_URL` | N | `jdbc:postgresql://localhost:5432/readly` | PostgreSQL JDBC URL (배포 환경에서는 필수) |
| `DB_USERNAME` | N | `postgres` | PostgreSQL 계정 |
| `DB_PASSWORD` | Y | 없음 | PostgreSQL 비밀번호 |
| `REDIS_HOST` | N | `localhost` | Redis 호스트 |
| `REDIS_PORT` | N | `6379` | Redis 포트 |
| `REDIS_PASSWORD` | N | 빈 값 | Redis 비밀번호 |
| `JWT_SECRET` | Y | 없음 | JWT 서명 키 (32바이트 이상) |
| `ALADIN_TTB_KEY` | Y | 없음 | 알라딘 Open API 키 |
| `AI_BASE_URL` | N | `http://localhost:8001` | 외부 AI 에이전트 서버 주소 |
| `AI_API_KEY` | N | `default-readly-key` | AI 서버가 콜백 시 보내야 하는 공유 비밀키 |
| `AI_CONNECT_TIMEOUT_SECONDS` | N | `10` | AI 서버 연결 타임아웃 |
| `AI_READ_TIMEOUT_SECONDS` | N | `120` | AI 서버 응답 대기 타임아웃 (LLM 생성이 오래 걸려 길게 잡는다) |
| `CHAT_ARCHIVE_RETENTION_DAYS` | N | `30` | PostgreSQL로 옮긴 채팅을 보관하는 기간 |
| `CHAT_ARCHIVE_PURGE_CRON` | N | `0 0 4 * * *` | 보관 기간이 지난 채팅을 지우는 주기 |

### DB

`readly`라는 이름의 PostgreSQL 데이터베이스가 필요하다(`jdbc:postgresql://localhost:5432/readly`). 스키마는 `ddl-auto: update`로 엔티티에서 자동 생성되며, **컬럼 삭제/이름변경은 자동 반영되지 않는다**. 과거 스키마 변경에 대한 수동 백필 스크립트는 `db/` 디렉터리에 있다.

### 빌드 / 실행

```powershell
# 빌드 (컴파일 + 테스트)
.\gradlew.bat build

# 로컬 실행 (Postgres/Redis가 떠 있어야 함)
.\gradlew.bat bootRun

# 전체 테스트
.\gradlew.bat test

# 특정 테스트 클래스/메서드
.\gradlew.bat test --tests "com.tricode.READLY.ReadlyApplicationTests"
```

알라딘 실서버를 호출하는 라이브 테스트는 기본적으로 건너뛴다. 실행하려면:

```powershell
.\gradlew.bat test --tests "*AladinBookClientLiveTest" "-Daladin.live=true"
```

## 문서

- `db/*.sql` — 스키마 변경에 따른 수동 백필 스크립트 (Flyway/Liquibase 미사용)
