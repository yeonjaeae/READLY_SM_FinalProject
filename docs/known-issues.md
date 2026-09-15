# 미해결 이슈 목록

2026-08-14 로컬 통합 점검(Docker Postgres/Redis/Kafka + 실제 API 호출)에서 시작해 이후 세션에서 추가된 문제들.
위에서부터 심각도 순이다.

2026-08-17 기준으로 목록의 모든 항목이 코드상으로는 해결됐다. 다만 상당수가 **실제 서버를 띄워
호출해 본 검증은 아직**이고, 백필 SQL 두 개(`db/2026-08-17-add-bookclub-host.sql`,
`db/2026-08-17-backfill-book-isbn13.sql`)는 한 번도 실행하지 않았다.
남은 확인 항목은 문서 맨 아래 "다음 세션에서 할 일"에 모아 뒀다.

2026-08-26 기준 현황: 19번(Kafka → Redis Pub/Sub 전환)은 **해결하고 실제 서버로 검증까지 마쳤고**,
17번(모임 목록 인원수 N+1)도 같은 날 고쳤다. 20번(AI 서버에 `/api/ai/chat`이 없음)은 우리 쪽 호출을
주석 처리해 404가 나지 않게 해 뒀고, AI 서버가 그 경로를 제공하면 주석만 풀면 된다.
같은 날 전 기능을 실제 서버로 검증하다 21번(AI 독후감 생성이 필드명 불일치로 항상 503)을 찾아 고쳤다.
검증 결과 표는 문서 맨 아래 "2026-08-26 전 기능 실동작 검증"에 있다.

## 1. 브라우저에서 WebSocket 연결 불가 (2026-08-16 해결)

- 위치: `global/config/SecurityConfig.java`, `global/config/StompAuthChannelInterceptor.java`
- 증상: `/ws/chat/**` 경로가 `permitAll` 목록에 없어 `anyRequest().authenticated()`에 걸렸다.
  토큰 없이 `GET /ws/chat/info` 호출 시 403, `Authorization` 헤더를 붙이면 200.
- 왜 문제인가: 브라우저의 WebSocket/SockJS는 핸드셰이크 요청에 커스텀 헤더(`Authorization`)를 넣을 수 없다.
  즉 실제 프론트엔드는 핸드셰이크 단계에서 무조건 403을 받는다.
  `StompAuthChannelInterceptor`는 CONNECT 프레임에서 토큰을 검증하도록 설계돼 있는데,
  그보다 앞선 HTTP 단계가 먼저 막아버리는 모순 구조였다.
- 점검 당시 테스트가 통과한 이유: Node의 `ws` 클라이언트는 핸드셰이크에 헤더를 넣을 수 있어서 통과했다.
  브라우저 환경이 아니었을 뿐이다.
- 조치: `SecurityConfig`에 `.requestMatchers("/ws/chat/**").permitAll()` 추가.
  핸드셰이크는 열고, 인증은 원래 설계대로 CONNECT 프레임(`StompAuthChannelInterceptor`)에서만 한다.
  SockJS는 `/ws/chat/info`, `/ws/chat/{server}/{session}/websocket` 등 하위 경로를 쓰므로 `/**`가 필요하다.
  토큰은 프론트에서 stomp.js `connectHeaders`로 넘긴다(STOMP 프레임 헤더는 브라우저에서도 자유롭게 설정 가능).
- 검증(2026-08-16, 실제 서버 + Node 22 내장 `WebSocket`. 이 클라이언트는 브라우저처럼 핸드셰이크 헤더를 못 넣는다):
  - 토큰 없이 `GET /ws/chat/info` → 200
  - 토큰 없는 CONNECT → `ERROR` 프레임("유효하지 않은 토큰입니다") 후 close 1002
  - 유효 토큰 CONNECT → `CONNECTED` (`user-name:2`)
  - CONNECT → SUBSCRIBE `/sub/chat/clubs/1` → SEND `/pub/chat/clubs/1` → `MESSAGE` 수신까지 왕복 성공.
    본문의 `memberId`는 토큰에서 온 값이라 위조 불가.
  - 회귀 확인: 토큰 없는 `GET /api/book-clubs/my-list` → 여전히 403
- 남은 약점: 인증 없이도 소켓 자체는 열린다(CONNECT 전까지). 유휴 소켓 자원 소모 정도라 현재 범위에서는 수용.

## 2. AI 서버 다운 시 엔드포인트별 동작 불일치 (2026-08-16 해결)

- 위치: `domain/chat/service/ChatService.java`(`requestMeetingAssist`, `requestAiAssist`)
- 증상: AI 서버(`localhost:8001`)가 꺼진 상태에서
  - `POST /api/book-clubs/{clubId}/meeting/assist` → 200 (`requestMeetingAssist`가 예외를 잡아 로그만 남김)
  - `POST /api/book-clubs/{clubId}/ai-assist` → 500 (`restTemplate.postForObject`에 try/catch 없음)
- 두 경로의 실패 처리 방침이 서로 달랐다.
- 결정: **실패를 알리는 쪽으로 통일**한다. 둘 다 사용자가 버튼을 눌러 발생하는 동기 요청이라,
  200을 주면 프론트가 "AI 호출됨"으로 표시하는데 실제로는 아무 일도 일어나지 않는 조용한 실패가 된다.
  다만 우리 서버의 버그가 아니라 업스트림 장애이므로 500이 아니라 **503 Service Unavailable**로 내보낸다.
- 조치:
  - `global/exception/AiServerException`(`RuntimeException` 직속)을 추가하고,
    `GlobalExceptionHandler`에서 503 + `"AI 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."`로 매핑했다.
    `IllegalArgumentException`(400)/`IllegalStateException`(409)과 계층이 겹치지 않아 기존 매핑에는 영향이 없다.
  - 두 메서드 모두 `RestClientException`을 잡아 `AiServerException`으로 바꿔 던진다.
    연결 거부·타임아웃(`ResourceAccessException`)과 AI 서버의 4xx/5xx가 모두 이 타입 아래에 들어온다.
  - `requestAiAssist`에서 응답이 비어 있으면 조용히 `return`하던 것도 같은 예외로 바꿨다.
    버튼을 눌렀는데 아무 반응이 없는 것은 사용자 입장에서 실패다.
- `ChatConsumer.sendToAiAgent`는 그대로 로그만 남기고 삼킨다. Kafka 리스너에서 도는 비동기 경로라
  사용자에게 돌려줄 응답이 없고, 이미 Redis 저장과 브로드캐스트는 끝난 뒤이기 때문이다.
  예외를 밖으로 던지면 컨슈머가 재시도 루프를 탄다. 코드에 이 이유를 주석으로 남겼다.
- 같이 처리한 것: `RestTemplateConfig`에 타임아웃이 없어서 AI 서버가 응답하지 않으면 요청 스레드가
  무한정 붙잡혔다. 연결 3초 / 응답 대기 10초를 넣었다. `restTemplate` 빈을 공유하므로 알라딘 호출에도 적용된다.
  이때 `RestTemplateBuilder`를 빈 파라미터로 주입받으면 `AladinBookClientLiveTest`의 축소 컨텍스트에
  해당 빈이 없어 기동에 실패한다. `new RestTemplateBuilder()`로 직접 생성해서 피했다.
- 미검증: 실제 503 응답. 정적 검증(컴파일, `AladinBookClientTest`)만 했고 앱을 띄워 확인하지는 않았다.

## 3. AI 독서록 본문이 하드코딩 스텁 (2026-08-16 해결)

- 위치: `domain/book/service/BookNoteService.java`(`generateAiBookNote`)
- 증상: `String aiGeneratedContent = "이 부분에 AI API 응답값이 들어갑니다.";`
  실제 AI 호출 없이 이 문자열이 그대로 `ai_note.content`에 저장됐다.
- 같은 메서드의 `analyzeTags`만 실제로 AI 서버를 호출했는데, 서버가 없으면 예외를 잡고 `null`을 반환해
  `ai_note.tags`가 NULL로 남았다.
- 조치: 스텁 문자열을 없애고 `generateReview`를 통해 AI 서버를 실제로 호출한다.
  한 회원이 그 책에 남긴 `BookNote`를 전부 보내고, 독후감 본문과 성향 태그를 **한 번의 요청**으로 받는다.
  별도였던 `/api/preference/analyze` 호출(`analyzeTags`)과 `TagAnalyzeRequest`/`TagAnalyzeResponse` DTO는 삭제했다.
- 정한 계약 (AI 서버 스펙이 없어서 기존 명명 규칙에 맞춰 우리가 먼저 정했다. 스펙이 나오면 DTO 필드명만 바꾸면 된다):

  ```
  POST {ai.base-url}/api/review/generate
  요청: { "bookTitle": "데미안",
          "notes": [ { "phrase": "...", "feeling": "..." }, ... ] }
  응답: { "review": "...", "tags": ["성장", "고전"] }
  ```

  **2026-08-26 정정**: 실제 AI 서버는 요청 필드를 `book_title`(snake_case)로 받고, 응답에 `tags`가 없다.
  위 계약은 스펙 없이 우리가 먼저 정했던 것이고, 실물과 맞춘 내용은 21번 항목에 있다.

- 실패 처리: 호출 실패, 응답 없음, `review`가 빈 문자열이면 `AiServerException`을 던져 503으로 나간다(2번 참고).
  본문 생성이 이 기능의 핵심이라 삼키지 않는다. 반대로 `tags`는 부가 정보라서 비어 있으면 `null`로 두고 본문만 저장한다.
- `AINote` 행은 AI 호출이 성공한 뒤에 만든다. 실패했는데 빈 행만 남는 것을 막기 위해서다.
- 미검증: 실제 AI 서버 응답. AI 서버가 이 경로를 아직 제공하지 않아 호출 성공 경로는 확인하지 못했다.

## 4. Kafka 브로커 주소 이중 설정 (2026-08-16 해결)

- 위치: `global/config/KafkaConfig.java`(삭제됨)
- 증상: `ProducerConfig.BOOTSTRAP_SERVERS_CONFIG`에 `"localhost:9092"`가 하드코딩돼 있었다.
  `application.yaml`의 `spring.kafka.bootstrap-servers`는 이 프로듀서에 적용되지 않았다.
  직렬화 설정(`key-serializer`/`value-serializer`)도 yaml과 중복이었다.
- 결과: 배포 환경에서 yaml만 바꾸면 컨슈머는 따라가지만 프로듀서는 계속 localhost를 봤다.
- 조치: `KafkaConfig`를 **삭제**했다. 이 클래스가 손으로 만들던 `ProducerFactory`/`KafkaTemplate`은
  스프링 부트 자동설정이 `spring.kafka.*`만 보고 그대로 만들어 준다. 이제 설정이 yaml 한 곳에만 있다.
- 함께 변경: `bootstrap-servers`를 `${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}`로 바꿔 환경변수로 주입할 수 있게 했다.
  기본값이 있으므로 로컬은 그대로 동작한다.
- `ChatProducer`는 수정하지 않았다. 자동설정이 등록하는 빈의 타입이 `KafkaTemplate<?, ?>`이고
  와일드카드는 어떤 파라미터화에도 매칭되므로, `KafkaTemplate<String, ChatMessage>` 주입이 그대로 동작한다.
- 검증: 이 제네릭 주입은 컴파일로는 드러나지 않는 런타임 문제라,
  `KafkaAutoConfiguration`과 `ChatProducer`만 올리는 임시 테스트를 만들어 주입 성공을 확인한 뒤 그 테스트는 삭제했다.
  Kafka 브로커 없이도 확인된다(프로듀서는 실제 전송 시점에야 브로커에 접속한다).

## 5. AI 독서록 수정 시 소유자 검증 없음 (2026-08-16 해결)

- 위치: `domain/book/service/BookNoteService.java`(`updateAiBookNote`),
  `domain/book/controller/BookNoteController.java`
- 증상: `PATCH /api/notes/ai-notes/{aiNoteId}`가 `aiNoteId`만 보고 수정했다.
  컨트롤러가 `@AuthenticationPrincipal`을 아예 받지 않아, 호출자와 AINote 주인이 같은지 확인할 수 없었다.
- 결과: 로그인만 하면 남의 AI 독서록을 임의로 수정할 수 있었다. `aiNoteId`는 1씩 증가하는 PK라 추측도 쉽다.
- 조치:
  - `global/exception/ForbiddenException`을 추가하고 `GlobalExceptionHandler`에서 403으로 매핑했다.
    인증 없음(401)이나 상태 충돌(409)과 구분하기 위해서다.
  - 컨트롤러가 `@AuthenticationPrincipal Long memberId`를 받아 서비스로 넘기고,
    `updateAiBookNote(aiNoteId, memberId, newAiContent)`가 주인이 아니면 403을 던진다.
    `Member`가 LAZY이지만 `getId()`는 프록시에서 추가 쿼리 없이 읽힌다.
- 403과 400(없는 리소스)을 구분하므로 `aiNoteId` 열거로 **존재 여부**는 알아낼 수 있다.
  다만 내용·소유자는 드러나지 않는다(수정 API는 본문 없이 200만 반환). 에러 원인을 명확히 하는 쪽을 택했다.
- 다른 곳은 이미 안전하다. `generateAiBookNote`는 `(bookId, memberId)`로 조회하고,
  `createBookNote`도 토큰의 `memberId`를 쓴다.

## 5-1. 독서록 조회 API 부재 (2026-08-16 추가)

- 5번을 보다가 발견했다. `BookNote`와`AINote` 모두 **읽는 API가 하나도 없었다**.
  쓰기만 가능하고 본인이 쓴 것조차 다시 볼 수 없었다.
- 추가한 엔드포인트 (둘 다 조회 조건에 `memberId`가 들어가 남의 것은 결과에 나오지 않는다):

  ```
  GET /api/notes/books/{bookId}          → [{ noteId, phrase, feeling }, ...]
  GET /api/notes/books/{bookId}/ai-note  → { exists, aiNoteId, content, tags[], edited }
  ```

- AINote가 아직 없으면 404가 아니라 200 + `exists: false`를 준다.
  "아직 생성하지 않음"은 오류가 아니라 정상 상태이고, 프론트가 이 값으로 생성 버튼 노출을 판단할 수 있다.
- `tags`는 DB에 콤마로 이어붙여 저장되므로 응답에서 배열로 풀어준다.
- 리포지토리는 기존 `findAllByBookIdAndMemberId`(BookNote), `findByBookIdAndMemberId`(AINote)를 그대로 썼다.
- 미검증: 실제 응답. 컴파일만 확인했고 앱을 띄워 호출해 보지는 않았다.

## 6. 채팅 구독에 가입 검증 없음 (2026-08-17 해결)

- 위치: `global/config/StompAuthChannelInterceptor.java`
- 증상: 발행(`/pub/chat/clubs/{clubId}`)은 `ChatService.validateClubMember`로 막지만,
  구독(`/sub/chat/clubs/{clubId}`)은 아무 검증이 없었다.
- 정확한 노출 범위: 완전한 비로그인은 아니다. CONNECT 단계에서 토큰을 요구하므로 소켓을 열려면 로그인은 해야 한다.
  문제는 **로그인만 한 아무 회원**이 `clubId`만 알면 남의 모임을 구독할 수 있었다는 점이다.
  `clubId`는 1씩 증가하는 PK라 추측이 쉽다. 보이는 것은 구독 이후의 실시간 메시지이고,
  발행은 이미 막혀 있었으므로 훔쳐듣기만 가능했다.
- 조치: CONNECT 검증을 하던 `StompAuthChannelInterceptor`에 `SUBSCRIBE` 분기를 추가했다.
  별도 인터셉터를 만들지 않은 이유는 CONNECT에서 심어둔 인증 객체를 꺼내는 코드가 그대로 필요해서다.
  - 목적지가 `/sub/chat/clubs/`로 시작할 때만 검사한다. 그 외 구독 경로는 그대로 통과시킨다.
  - 접두사 뒤를 `Long`으로 파싱한다. 숫자가 아니거나 하위 경로가 더 붙으면 거부한다.
  - CONNECT 때 세션에 심은 principal에서 `memberId`를 꺼내고, 없으면 거부한다.
  - `MemberBookClubRepository.existsByMemberIdAndBookClubId`로 확인한다.
    발행 쪽(`validateClubMember`)과 같은 리포지토리·같은 기준이다.
  - 실패는 `MessageDeliveryException`이라 ERROR 프레임 후 연결이 끊긴다. CONNECT 실패와 동일한 방식이다.
- `accessor` null 검사를 메서드 앞으로 빼서 CONNECT/SUBSCRIBE 두 분기가 공유하게 했다.
- 미검증: 실제 ERROR 프레임. 컴파일(`compileJava`/`compileTestJava`)만 확인했고 앱을 띄워 구독해 보지는 않았다.

## 6-1. 채팅 내역 조회 API 부재 (2026-08-17 추가·해결)

- 6번을 보다가 발견했다. 채팅 내역을 **읽는 API가 하나도 없었다**.
  `ChatMessage`는 `@RedisHash(timeToLive = 604800)`으로 7일간 보관되는데,
  `ChatMessageRepository.findByClubId`는 `ChatService` 내부(AI assist)에서만 쓰였고 밖으로 나가는 경로가 없었다.
- 결과: STOMP 구독은 구독한 시점 이후의 메시지만 전달하므로,
  채팅방에 잠깐 나갔다 들어오면 화면이 비었다. 7일치가 Redis에 쌓여 있는데 꺼낼 문이 없는 상태였다.
- **업무 규칙**: 모임장과 참여자는 재입장해도 최대 7일치 대화(본인·다른 참여자·AI 전부)를 볼 수 있어야 한다.
  따라서 `ChatMessage`의 TTL을 줄이거나 이 조회 경로를 없애면 요구사항이 깨진다.
- 추가한 엔드포인트:

  ```
  GET /api/book-clubs/{clubId}/chats
  → [{ messageId, memberId, senderName, content, createdAt }, ...]
  ```

- 가입 회원만 조회할 수 있다(`ChatService.validateClubMember`). 6번의 구독 검증과 같은 기준이다.
- `SecurityConfig`는 손대지 않았다. AI 콜백의 `permitAll`이 `HttpMethod.POST` 한정이라 같은 경로의 GET은 이미 인증이 필요하다.
- 기간 필터는 넣지 않았다. Redis TTL이 7일이므로 남아 있는 것이 곧 최근 7일치다.
- 정렬은 `createdAt` 오름차순이고, `getRecentMessages`에 있던 정렬 로직을 `getSortedMessages`로 분리해 공유한다
  (조회는 전체, AI assist는 뒤 50개).
- 발신자 이름 매핑도 `resolveMemberNames`/`resolveSpeaker`로 분리해 `requestAiAssist`와 공유한다.
  이 과정에서 조회되지 않는 회원(탈퇴 등)의 이름이 `null`로 나가던 것을 "알 수 없는 사용자"로 바꿨다.
  AI는 회원 테이블에 없으므로 `AI_MEMBER_ID`(999)면 "AI"로 표기한다.
- 미검증: 실제 응답. 컴파일만 확인했고, Redis에 메시지가 쌓인 상태에서 재입장 시나리오를 돌려보지는 않았다.

## 7. 방장(모임장) 판정이 가입 순서에 의존하는 암묵 규칙 (2026-08-17 해결)

- 위치: `domain/book/entity/BookClub.java`, `domain/book/service/BookClubService.java`,
  `domain/chat/service/ChatService.java`(`validateClubHost`)
- 증상: 방장을 나타내는 컬럼이 없었다. `member_book_club.id`가 가장 작은 행의 회원을 방장으로 봤다
  (`BookClubService.createBookClub`이 생성자를 가장 먼저 저장하기 때문).
- 결과: 방장이 탈퇴하면 두 번째 가입자가 자동으로 방장이 됐다. 방장 위임도 불가능했다.
  DB 제약이 아니라 코드 관례라서 조인 테이블 행이 삭제/재생성되면 방장이 바뀌었다.

### 선택한 안: A안 (`BookClub.host` FK)

2026-08-15에 보류했던 두 안을 다시 비교하고 A안으로 정했다.

| 비교 항목 | A안: `BookClub.host` FK | B안: `MemberBookClub`에 역할 enum |
| --- | --- | --- |
| 스키마 | `book_club.host_id` 컬럼 1개 | `member_book_club.role` 컬럼 1개 |
| 방장 판정 | 이미 로드된 엔티티에서 바로 (`club.getHost()`) | 조인 테이블 조회 1번 |
| "한 모임에 방장 1명" | FK가 하나라 구조적으로 보장 | DB가 보장하지 못함 (HOST 2행 가능) |
| 위임 | 필드 교체 한 줄 | 두 행 UPDATE (강등 + 승격) |
| 방장 탈퇴 | `host_id`가 남아 명시적 처리를 강제 | 행이 사라지면 방장 없는 모임이 조용히 생김 |
| 역할 확장 | 구조 변경 필요 | 쉬움 |

지금 필요한 역할이 방장/참여자 둘뿐이고, 이 이슈의 핵심이 "방장이 암묵적으로 바뀌는 것"이라
단일성 보장을 우선했다. B안은 그 문제를 완전히 막지 못한다.

### 명칭

식별자는 `leader`가 아니라 **`host` / `participant`**로 통일했다. 프론트엔드가 `role: "HOST" | "PARTICIPANT"`를
기대하고 있어, 백엔드가 다른 어휘를 쓰면 계층마다 번역이 생기기 때문이다.
한국어 주석에서는 "방장"이라는 표현을 그대로 쓴다.

### 조치

- `BookClub.host`(`@ManyToOne(LAZY)`, 컬럼 `host_id`, nullable) 추가.
  nullable인 이유는 이 컬럼이 생기기 전에 만들어진 모임이 남아 있기 때문이다.
  백필 후에도 NOT NULL은 걸지 않았다. 가입자가 한 명도 없는 모임은 방장을 채울 근거가 없다.
- `BookClubService.createBookClub`이 요청을 보낸 회원을 `host`로 저장한다. 가입 순서에 기대지 않는다.
- `ChatService.validateClubLeader` → `validateClubHost(bookClub, memberId)`. `host_id`로 판정한다.
  `host`가 LAZY 프록시지만 `getId()`는 추가 쿼리 없이 읽힌다.
  `host`가 null이면 예전 규칙으로 조용히 되돌아가지 않고 409 + `"방장이 지정되지 않은 독서모임입니다."`를 던진다.
  **즉 백필을 돌리지 않으면 기존 모임의 AI 진행자 호출이 막힌다.** 이 편이 방장이 뒤바뀌는 것보다 낫다고 봤다.
- 더 이상 쓰이지 않는 `MemberBookClubRepository.findFirstByBookClubIdOrderByIdAsc`를 삭제해
  옛 규칙이 다시 쓰일 여지를 없앴다.
- 백필: `db/2026-08-17-add-bookclub-host.sql`. 기존 규칙 그대로 조인 테이블에서 `id`가 가장 작은 행의 회원을
  `host_id`에 채우고(PostgreSQL `DISTINCT ON`), `member(member_id)`로 FK 제약을 건다.
  마지막에 아직 방장이 없는 모임을 확인하는 SELECT가 붙어 있다.

### 프론트가 "내가 방장인지" 아는 방법

- `BookClubDto.ClubRole{HOST, PARTICIPANT}`를 추가하고, 응답에 `role` 필드를 넣었다.
  별도의 `my-role` 엔드포인트는 만들지 않았다. 방 정보를 받을 때 같이 오는 편이 요청 수가 적다.
- 새 엔드포인트 (방 입장 시 사용):

  ```
  GET /api/book-clubs/{clubId}
  → { clubId, name, bookId, bookName, bookCoverImageUrl, date, time,
      currentMemberCount, maxCapacity, status, type, hostId, role }
  ```

- 상세 조회는 **가입한 회원만** 허용한다(미가입 시 409). 그래야 `role`이 HOST/PARTICIPANT 둘 중 하나로 정확해진다.
  미가입자에게도 열어 주면 PARTICIPANT가 사실과 다른 값이 된다. 미가입 상태에서 모임을 훑는 것은 홈 목록이 담당한다.
- `HomeListResponse`에도 `role`을 추가했다. `GET /api/book-clubs/my-list`는 전부 가입한 모임이라 실제 값이 들어가고,
  `GET /api/book-clubs`(홈 목록)는 `null`이다. 홈 목록에는 가입하지 않은 모임이 섞여 있고,
  모임마다 가입 여부를 확인하면 쿼리가 모임 수만큼 늘어나기 때문이다.
- 미검증: 실제 응답과 백필 SQL 실행. 컴파일(`compileJava`/`compileTestJava`)만 확인했다.

## 8. 알라딘 TTB Key가 설정 파일에 평문으로 있음 (2026-08-15 해결)

- 위치: `src/main/resources/application.yaml`의 `aladin.ttb-key`
- 조치: `ttb-key`를 `${ALADIN_TTB_KEY:}`로 바꿨다. `jwt.secret`(`JWT_SECRET`),
  `ai.api-key`(`AI_API_KEY`), DB 계정(`DB_USERNAME`/`DB_PASSWORD`)도 같이 환경변수로 뺐다.
- 실제 값은 `spring.config.import: optional:classpath:application-local.yaml`로 읽는
  `application-local.yaml`에 둔다. 이 파일은 `.gitignore` 대상이고,
  형식은 `application-local.yaml.example`을 복사해서 쓴다.
- 우선순위는 환경변수 > `application-local.yaml` > `application.yaml` 기본값이다.
- 커밋 이력에는 키가 없다(`git log -S`로 확인). 저장소 히스토리 세탁은 불필요.

## 9. 기존 book 행의 isbn13이 NULL (2026-08-17 해결)

- 위치: `domain/book/entity/Book.java`(`isbn13`), `domain/book/service/BookService.java`,
  `domain/book/client/AladinBookClient.java`
- 증상: 알라딘 연동을 붙이면서 `book.isbn13`(unique)을 새로 추가했다. `ddl-auto: update`가 컬럼은
  만들어 주지만 기존 행은 전부 NULL로 남는다.
- 결과: 이미 등록돼 있던 책을 ISBN으로 조회하면 DB에서 못 찾고 알라딘에서 새로 받아 중복 INSERT 된다.
  같은 책이 여러 행으로 갈라지고 독서록/모임이 서로 다른 행에 매달린다.
- **문제가 과거 데이터만이 아니었다**: `BookService.registerBook`(`POST /api/books`)이 `isbn13`을 아예 받지 않고
  제목·저자·표지를 그대로 저장했다. 즉 백필을 해도 이 경로로 NULL 행이 계속 새로 만들어졌다.

### 기획 변경: 수기 입력 제거

2026-08-17에 도서 등록에서 **수기 입력을 완전히 없애고 알라딘 검색 결과 선택만 지원**하기로 정했다.
확정된 흐름은 `검색 → 선택 → 등록`이다.

- `GET /api/books/search?keyword=` — 알라딘 ItemSearch 호출. **아무것도 저장하지 않는다.**

  ```
  → [{ isbn13, name, writer, coverImageUrl }, ...]
  ```

- `POST /api/books` — 요청 본문은 `{ "isbn13": "..." }` 하나뿐이다.
  `BookDto.CreateRequest`에서 `name`/`writer`/`coverImageUrl`/`pageCount`/`width`/`height`를 전부 지웠다.
  필드를 남겨 두면 결국 그 경로로 수기 입력이 다시 들어오기 때문이다.
  서지 정보는 등록 시점에 ItemLookUp으로 다시 받는다.
- `book` 행이 만들어지는 시점은 **사용자가 검색 결과에서 책을 고를 때(`POST /api/books`)** 하나뿐이다.
  독서록 작성(`BookNoteService.createBookNote`)과 모임 생성은 `bookId`로 조회만 하고 책을 만들지 않는다.
  따라서 프론트는 독서록·모임을 만들기 전에 등록을 먼저 호출해 `bookId`를 받아야 한다.
  (대안으로 독서록/모임 API가 `bookId` 대신 `isbn13`을 받아 서버가 내부에서 `getOrCreate`하는 안도 논의했으나,
  기획이 "검색 → 선택 → 등록"으로 확정돼 현재 방식을 유지하기로 했다.)

### 조치 (코드)

- `aladin.search-url`(`ItemSearch.aspx`) 설정 추가. 기존 `base-url`(`ItemLookUp.aspx`)은 그대로 둔다.
- `AladinBookClient.searchByTitle(keyword, maxResults)` 추가. 검색 결과 0건은 오류가 아니라 빈 목록으로 돌려준다.
  알라딘이 `errorCode`를 내려줄 때만 예외를 던진다.
  목록에는 페이지 수·판형이 필요 없어 `OptResult`를 넘기지 않는다(상세는 등록 시점에 채운다).
  `parse()`를 조회/검색 두 경로가 공유하게 되면서 두 번째 파라미터가 더 이상 ISBN이 아니게 되어
  로그 라벨(`"isbn13: ..."` 또는 `"keyword: ..."`)을 받도록 이름을 `context`로 바꿨다.
- `AladinDto.LookUpResponse`를 검색 응답 파싱에도 재사용한다. 두 API의 응답 뼈대가 같고 `item` 길이만 다르다.
- `CreateRequest.isbn13`에 `@NotBlank`, 컨트롤러에 `@Valid`.
- `GlobalExceptionHandler`에 `MethodArgumentNotValidException` → 400 핸들러를 추가했다.
  이 핸들러가 없어서 검증 실패가 마지막 `Exception` 핸들러로 떨어져 500이 될 뻔했다.
  응답 메시지는 `"isbn13: isbn13은 필수입니다."`처럼 필드명과 사유를 그대로 담는다.
- `registerBook`은 `getOrCreateBookByIsbn13`에 위임한다. 있으면 재사용, 없으면 알라딘 조회 후 저장.
- `GET /api/books/isbn/{isbn13}`은 그대로 뒀다. `POST /api/books`와 하는 일이 같아 지금은 중복이며,
  알라딘 연동을 검증하려고 먼저 만든 것이다. 정리 여부는 미결.

### 조치 (기존 데이터)

- `db/2026-08-17-backfill-book-isbn13.sql`. 자동 매칭은 하지 않는다.
  ISBN은 알라딘에만 있고 우리 DB에는 제목/저자뿐인데, 제목으로 자동 매칭하면 같은 제목의
  다른 출판사·개정판을 잘못 붙일 수 있다. 잘못 붙으면 남의 독서록이 엉뚱한 책에 달리고
  unique 제약 때문에 되돌리기도 어렵다. 그래서 매핑은 사람이 확인해 스크립트에 직접 적는다.
- 스크립트 구성:
  1. 진단 — `isbn13`이 NULL인 책과 거기 매달린 참조 수(`member_book`/`book_club`/`book_note`/`ai_note`).
  2. 매핑 입력 — `(book_id, isbn13)`을 `VALUES`에 적는다. 목록이 비면 문법 오류가 나므로
     걸러지는 `(NULL, NULL)` 자리표시자를 하나 남겨 뒀다.
  3. 병합 대상 판별 — 적어 넣은 ISBN을 이미 가진 다른 행이 있으면 단순 UPDATE가 unique 제약에 걸린다.
     이 경우는 중복이므로 병합으로 처리한다.
  4. 참조 이관 — 네 테이블의 `book_id`를 살릴 행으로 옮긴다.
     `member_book`과 `ai_note`는 (회원, 책) 중복이 생기므로 충돌 행을 먼저 삭제한다.
     **삭제되는 쪽은 항상 NULL 행에 달려 있던 것이다.** 살릴 행에 이미 같은 내용이 있고 둘 다 남길 방법이 없다.
     `book_note`는 한 회원이 같은 책에 여러 개를 남길 수 있어 제약이 없으므로 전부 옮긴다.
     이관이 끝나면 껍데기가 된 NULL 행을 지운다.
  5. 병합 대상이 아닌 행은 `isbn13`만 UPDATE.
  6. 확인 — 남은 NULL 행 조회. 아무도 참조하지 않는 껍데기를 지우는 DELETE를 주석으로 넣어 뒀다(자동 실행 안 함).
- 미검증: 알라딘 ItemSearch 실제 호출, 400 응답, SQL 실행.
  컴파일과 기존 단위 테스트(`AladinBookClientTest`, `BookIsbnServiceTest`)만 확인했다.

---

## 다음 세션에서 할 일

**2026-08-26에 이 목록을 전부 실제 서버로 확인했다.** 아래 "2026-08-26 전 기능 실동작 검증" 절에 결과가 있다.
남은 것은 백필 스크립트 실행뿐이다.

- ~~**알라딘 ItemSearch 실제 호출 확인**~~ → 확인. `GET /api/books/search?keyword=데미안`이
  `isbn13`이 채워진 목록을 돌려준다(민음사판 `9788937460449` 포함). https 리다이렉트 문제 없음.
- ~~`POST /api/books`에 `isbn13` 없이 요청 → 400~~ → 확인. `{"message":"isbn13: isbn13은 필수입니다."}`
- ~~`GET /api/book-clubs/{clubId}` → `role`이 HOST/PARTICIPANT로 나오는지~~ → 확인. 방장 HOST, 참여자 PARTICIPANT.
- ~~`GET /api/book-clubs/{clubId}/chats` → 재입장 시 지난 대화~~ → 확인(19번 검증).
- ~~가입하지 않은 모임 `/sub/chat/clubs/{id}` 구독 → ERROR 프레임~~ → 확인(19번 검증).
- ~~백필 스크립트 두 개는 아직 한 번도 실행하지 않았다~~ → **2026-08-26 로컬 DB에 실행했다.**
  결과와 그 과정에서 발견한 스크립트 버그는 아래 "2026-08-26 백필 스크립트 실행" 절에 있다.
  **배포 DB에는 아직 실행하지 않았다.** 백필은 DB마다 한 번씩 필요하다.

## 10. bookId 없이 독서모임 생성 시 500 (2026-08-16 해결)

- 위치: `domain/book/service/BookClubService.createBookClub`
- 증상: `CreateRequest.bookId()`가 null인 채로 `POST /api/book-clubs`를 호출하면
  `IllegalArgumentException: The given id must not be null`이 나고 500으로 떨어졌다.
- 원인: 서비스가 null 검사 없이 `findById(bookId)`를 불렀다. 이때 나는 `IllegalArgumentException`을
  스프링 데이터가 `InvalidDataAccessApiUsageException`으로 감싸는데, 이는 `DataAccessException`이라
  `GlobalExceptionHandler`의 400 매핑에 걸리지 않고 마지막 `Exception` 핸들러로 떨어져 500이 됐다.
- **업무 규칙**: 독서모임을 만들 때 책 선택은 필수다. `BookClub.book`이 nullable `ManyToOne`이고
  조회 코드가 `book != null`을 방어하는 것은 책이 연결되지 않은 과거 행이 남아 있기 때문이지,
  새 모임에서 책을 생략해도 된다는 뜻이 아니다. 스키마가 허용한다고 업무 규칙까지 허용되는 것은 아니다.
- 조치: `findById` 호출 전에 `bookId`가 null인지 직접 검사하고,
  `IllegalArgumentException("독서모임을 만들려면 책을 선택해야 합니다.")`를 던져 400으로 응답한다.
- 사용자 입장에서의 변화: 모임이 만들어지지 않는 것은 전과 같지만, 이유를 알 수 있게 됐다.
  전에는 500 + `"서버 내부 오류가 발생했습니다."`라서 서버가 고장 난 것처럼 보였고 다시 눌러도 같은 실패였다.
  이제는 400 + `"독서모임을 만들려면 책을 선택해야 합니다."`가 나가므로,
  프론트가 이 `message`를 그대로 띄우면 사용자가 책을 고른 뒤 다시 시도할 수 있다.
  없는 `bookId`를 보낸 경우는 전과 같이 400 + `"존재하지 않는 책입니다."`이다.
- 2026-08-16 WebSocket 검증 중 발견해 같은 날 수정했다.
- 미검증: 실제 응답. 컴파일만 확인했고 앱을 띄워 호출해 보지는 않았다.

## 11. `/meeting/assist`가 AI 서버 스펙과 다른 요청 body를 보냄 (2026-08-22 해결)

- 위치: `domain/chat/service/ChatService.java`(`requestMeetingAssist`), `domain/chat/dto/ChatDto.java`
  (`MeetingAssistRequest`/`ChatLog` vs `MeetingAssistApiRequest`/`AiChatHistoryItem`)
- 증상: 2026-08-18 Render 배포 서버에 Postman으로 `POST /api/book-clubs/{clubId}/meeting/assist`를 직접 호출해
  검증하던 중 발견. AI 서버(`{AI_BASE_URL}/api/meeting/assist`)가 422 Unprocessable Entity를 반환했다.

  ```
  {"detail":[
    {"loc":["body","book_title"], "msg":"Field required", "input":{"clubId":2,"messages":[]}},
    {"loc":["body","chat_history"], "msg":"Field required", "input":{"clubId":2,"messages":[]}}
  ]}
  ```

  `input`에 찍힌 값이 실제로 우리가 보낸 body(`{"clubId":2,"messages":[]}`)다. FastAPI/Pydantic 검증 오류 형식으로 보아
  AI 서버는 `book_title`, `chat_history` 필드를 요구하는데 우리는 안 보내고 있다.
- 원인: 같은 AI 엔드포인트(`{AI_BASE_URL}/api/meeting/assist`)를 우리 코드 두 곳에서 서로 다른 형식으로 호출한다.
  - `requestMeetingAssist`(3번, 일반 참여자용 `/meeting/assist`) → `ChatDto.MeetingAssistRequest(clubId, messages)`,
    즉 `{clubId, messages: [{memberId, content, createdAt}]}` 형식으로 보낸다.
  - `requestAiAssist`(4번, 방장 전용 `/ai-assist`) → `ChatDto.MeetingAssistApiRequest(bookTitle, chatHistory, mode)`를
    `@JsonProperty("book_title")`/`@JsonProperty("chat_history")`로 매핑해 보낸다. 이쪽 필드명이 AI 서버 스펙과 일치한다.

  즉 4번 코드가 만들어질 때 AI 서버 스펙에 맞춰 새 DTO(`MeetingAssistApiRequest`)를 썼는데,
  3번(`requestMeetingAssist`)은 예전 형식(`MeetingAssistRequest`/`ChatLog`) 그대로 남아 갱신되지 않은 것으로 보인다.
- 결과: **일반 참여자가 호출하는 `/meeting/assist`는 항상 422 → `AiServerException` → 503으로 실패한다.**
  방장이 호출하는 `/ai-assist`만 정상 동작한다(형식이 맞아서). 참여자용 AI 개입 요청 기능이 사실상 동작하지 않는 상태다.
- 이번 검증에서 같이 확인된 것(참고, 이 이슈와는 별개로 이미 정리됨):
  - Render `application.yaml`의 `spring.data.redis.host/port`가 `localhost` 하드코딩이었던 것을
    `${REDIS_HOST:localhost}`/`${REDIS_PORT:6379}`/`${REDIS_PASSWORD:}`로 바꿔 배포 환경변수 주입이 가능해졌다.
  - Render의 Redis 내부 호스트 값(`REDIS_HOST`)에 `redis://...:6379` 전체 URL을 그대로 넣으면
    `UnknownHostException: Name does not resolve`가 난다. 스킴·포트를 뺀 순수 호스트명만 넣어야 한다.
  - 이 두 가지를 고친 뒤에야 AI 서버까지 실제로 도달해서 이번 422를 확인할 수 있었다.
### 조치: 형식 통일이 아니라 엔드포인트 통합 (2026-08-22)

두 경로의 형식을 각각 맞추는 대신, **AI 호출 엔드포인트를 하나로 합치기로 기획에서 정했다.**
남겨 둔 쪽은 `/meeting/assist`이고, 이제 **방장 전용**이다.

- 권한: `validateClubMember` → `validateClubHost`로 교체했다. 참여자는 더 이상 AI를 호출할 수 없다.
- 형식: AI 서버가 요구하는 `MeetingAssistApiRequest`로 보낸다.
  `@JsonProperty` 매핑 덕분에 직렬화 결과가 아래 그대로다.

  ```json
  {
    "book_title": "데미안",
    "chat_history": [ { "speaker": "책벌레", "text": "안녕하세요" } ],
    "mode": "question"
  }
  ```

- 응답: `sendMessage(clubId, AI_MEMBER_ID, response.result())`로 채팅방에 발행한다.
  REST 응답 본문은 비어 있고, 결과는 `/sub/chat/clubs/{clubId}` 구독으로 도착한다.
- 요청 본문: `POST /api/book-clubs/{clubId}/meeting/assist`가 `{ "mode": "question" | "summary" }`를 받는다.
  예전에는 본문이 없었으므로 **프론트가 호출부를 바꿔야 한다**(아래 참고).
- 삭제한 것:
  - 엔드포인트 `POST /api/book-clubs/{clubId}/ai-assist`와 `ChatService.requestAiAssist`
  - 옛 송신 DTO `ChatDto.MeetingAssistRequest(clubId, messages)`와 `ChatDto.ChatLog`
  - `ChatDto.AiAssistRequest`는 이름을 `MeetingAssistRequest`로 바꿔 통합된 엔드포인트의 요청 본문으로 쓴다
    (`*ApiRequest`는 AI 서버로 나가는 것, 접미사 없는 쪽은 우리 API가 받는 것이라는 기존 명명 규칙 유지)
- 남은 위험이 사라진 이유: 같은 AI 엔드포인트를 부르는 코드가 한 곳뿐이라, 한쪽만 낡아 형식이 갈리는
  이번 같은 문제가 구조적으로 생기지 않는다.

### 프론트가 고쳐야 할 것 — 경로 문자열 한 줄

프론트(`c19737f9`)를 확인한 결과 바꿀 것이 거의 없다.

- `MeetingRoom.js`의 방장 버튼("✨ AI 진행자에게 질문하기")은 `requestAI("question")` →
  `requestHostAiAssist(roomId, mode)`를 부르고, **이미 `{ mode: "question" }`을 본문에 실어 보낸다.**
  통합된 엔드포인트가 요구하는 형식과 같으므로 화면 코드는 손대지 않아도 된다.
- 따라서 필요한 수정은 `src/api/api.js`의 `requestHostAiAssist` 안에서 경로를 바꾸는 것뿐이다.

  ```
  /api/book-clubs/{clubId}/ai-assist  →  /api/book-clubs/{clubId}/meeting/assist
  ```

  함수 이름(`requestHostAiAssist`)까지 바꿀 필요는 없다.
- `requestMeetingAssist(clubId)`는 `api.js`에 정의만 있고 **호출하는 화면이 없다**(참여자용 버튼이 UI에 없다).
  본문 없이 호출하면 이제 400이 나므로 죽은 export는 지우는 편이 낫다.
- `mode: "summary"`를 쓰는 버튼은 아직 UI에 없다. `requestAI(mode)`가 이미 인자를 받으므로
  나중에 버튼만 추가하면 된다.

- 미검증: 실제 AI 서버 응답(200 경로)과 채팅방 발행. `compileJava`만 확인했다.
  2026-08-18에 확인된 422가 사라졌는지는 배포 후 다시 호출해 봐야 한다.

---

## 2026-08-15 알라딘 ItemLookUp 연동에서 확인/수정된 것

- 알라딘 API는 반드시 `https`로 호출해야 한다. `http`로 부르면 CloudFront가 301(https로 이동)을 주는데
  `RestTemplate`의 기본 `HttpURLConnection`은 http→https 리다이렉트를 따라가지 않아
  응답 본문이 HTML 에러 페이지로 들어오고 JSON 파싱이 실패한다.
  `application.yaml`의 `aladin.base-url`을 https로 두는 것으로 해결했다.
  curl이나 PowerShell `Invoke-WebRequest`는 리다이렉트를 따라가므로 이 문제가 드러나지 않는다.
- 실서버 호출 검증은 `AladinBookClientLiveTest`로 한다. 네트워크와 유효한 키가 필요하므로
  평소 빌드에서는 건너뛰고 `-Daladin.live=true`를 줄 때만 실행된다
  (`.\gradlew.bat test --tests "*AladinBookClientLiveTest" "-Daladin.live=true"`).
  PowerShell에서는 `-D...` 인자를 따옴표로 감싸지 않으면 Gradle 태스크 이름으로 잘못 해석된다.
- 데미안(민음사)의 ISBN13은 `9788937460449`다. `9788937462788`은 노인과 바다이므로 샘플로 쓰면 안 된다.
- 아직 검증하지 못한 것: 실제 PostgreSQL 저장. 점검 시점에 로컬 5432가 떠 있지 않아
  JPA 저장 테스트는 H2로 돌렸다. Postgres를 띄운 뒤
  `GET /api/books/isbn/9788937460449`로 실제 INSERT를 확인해야 한다.

---

## 참고: 2026-08-14 점검에서 정상 확인된 것

- PostgreSQL 저장: 회원가입/로그인/책 등록/내 목록/모임 생성·가입/팔로우/독서록 전부 실제 행 생성 확인. 한글 정상.
- 팔로우 카운터 더티체킹, `Follow.createdAt` `@PrePersist` 반영 확인.
- Kafka: `chat-group` 토픽에 메시지 적재, 컨슈머 그룹 `reading-group` LAG 0.
- Redis: `chat:<uuid>` 해시 저장 + `chat:clubId:{id}` 인덱스 + TTL 약 7일 확인.
- 권한 게이트: 토큰 없음 403, 비회원의 모임 API 409, 중복 가입 409, 잘못된 `X-AI-API-KEY` 401.
- `book_note` 테이블에 구버전 잔여 컬럼(`is_ai_generated`/`ai_content`) 없음. 현재 DB는 AINote 분리 이후 생성됨.

---

# 프론트엔드 연동에서 나온 항목 (2026-08-22 추가)

upstream `develop` 브랜치의 프론트엔드(`c19737f9`, 2026-08-21)와 이 브랜치를 대조하다 나왔다.
경로 불일치는 프론트가 08-20/08-21 커밋으로 전부 맞췄고(자세한 경위와 전체 대조표는
`docs/fe-be-endpoint-mismatch.md`), 아래는 **경로는 맞는데 실제로 붙이면 깨지는 것**들이다.
12~15번은 이것부터 고치지 않으면 브라우저에서 아무 화면도 동작하지 않는 순서로 적었다.

## 12. CORS 설정이 아예 없음 (2026-08-22 해결)

- 위치: `global/config/SecurityConfig.java`
- 증상: 코드 전체에 `.cors(...)`도, `@CrossOrigin`도, `WebMvcConfigurer#addCorsMappings`도 없다
  (`grep -i cors` 결과 0건).
- 결과: 프론트(`http://localhost:3000`)에서 백엔드(`http://localhost:8080`)로 가는 **모든 요청이
  브라우저에서 차단**된다. 로그인부터 실패한다. 지금까지 Postman과 Node 스크립트로만 검증해서 드러나지 않았다.
- 요청에 `Authorization` 헤더를 붙이므로 단순 GET도 preflight(`OPTIONS`)를 탄다.
  다만 `OPTIONS`를 따로 `permitAll` 할 필요는 없었다. `http.cors(...)`를 켜면 스프링 시큐리티가
  `CorsFilter`를 필터 체인 맨 앞에 넣고 preflight를 거기서 바로 응답하고 끝내기 때문에,
  인가 규칙이나 `JwtAuthenticationFilter`까지 내려오지 않는다.
  (`OPTIONS`를 permitAll로 열면 실제 OPTIONS 핸들러까지 노출되므로 넣지 않는 편이 낫다.)
- 조치:
  - `SecurityConfig`에 `CorsConfigurationSource` 빈을 추가하고 `http.cors(...)`에 연결했다.
  - 허용 출처는 하드코딩하지 않고 `@Value("${cors.allowed-origins}")`로 주입한다.
    `application.yaml`에 `cors.allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:3000}`을 넣었으므로
    로컬은 그대로 동작하고, 배포 환경에서는 환경변수로 실제 도메인을 넣는다. 콤마로 여러 개를 줄 수 있다.
  - `setAllowedOrigins`가 아니라 `setAllowedOriginPatterns`를 썼다. `https://*.vercel.app` 같은
    미리보기 도메인을 와일드카드로 받을 수 있어서다.
  - 메서드는 GET/POST/PATCH/DELETE/OPTIONS, 헤더는 `*`(`Authorization`, `X-AI-API-KEY` 포함), `maxAge`는 3600초.
  - `allowCredentials`는 켜지 않았다. 토큰을 쿠키가 아니라 헤더로 보내므로 필요 없고,
    켜면 출처 와일드카드를 쓸 수 없게 된다.
- `WebSocketConfig`의 `setAllowedOriginPatterns("*")`는 손대지 않았다. STOMP 핸드셰이크는 별도 경로다(13번).
- 미검증: 실제 브라우저 요청. `compileJava`만 확인했고, 프론트를 띄워 호출해 보지는 않았다.

## 13. WebSocket 엔드포인트가 SockJS 전용이라 프론트가 연결하지 못함 (2026-08-22 해결)

- 위치: `global/config/WebSocketConfig.java`
- 증상: 등록된 엔드포인트가 `registry.addEndpoint("/ws/chat")...withSockJS()` 하나뿐이다.
  프론트 `src/api/chatSocket.js`는 `@stomp/stompjs`의 `brokerURL: ws://localhost:8080/ws/chat`으로
  **순수 WebSocket**을 연다. SockJS 엔드포인트에서 순수 소켓 경로는 `/ws/chat/websocket`이라 핸드셰이크가 실패한다.
- 1번 이슈에서 SockJS 하위 경로를 고려해 `permitAll` 범위를 `/ws/chat/**`로 잡아 둔 상태라
  `SecurityConfig`와 `StompAuthChannelInterceptor`는 손대지 않아도 된다.
- 조치: SockJS 엔드포인트는 그대로 두고, **같은 경로에 순수 WebSocket 엔드포인트를 하나 더 등록**했다
  (`registry.addEndpoint("/ws/chat").setAllowedOriginPatterns(allowedOrigins)`, `withSockJS()` 없이).
  프론트에게 `/ws/chat/websocket`으로 바꾸라고 하는 방법도 있었지만, 서버가 둘 다 받아 주는 편이 재발이 없다.
  SockJS 쪽을 지우지 않은 것은 폴백 경로가 필요할 수 있어서다.
- 같이 조인 것: 출처가 `setAllowedOriginPatterns("*")`라 아무 사이트나 소켓을 열 수 있었다.
  12번에서 만든 `cors.allowed-origins` 목록을 그대로 주입해 REST와 기준을 맞췄다.
  CONNECT 프레임의 JWT 검증은 그대로이므로 인증 자체는 달라지지 않고, 유휴 소켓 노출만 줄어든다.
  Origin 헤더를 보내지 않는 비브라우저 클라이언트(Node 테스트 등)는 계속 통과한다.

### 같은 경로를 두 번 등록해도 충돌하지 않는 이유 (그리고 주의할 점)

`WebMvcStompWebSocketEndpointRegistration.getMappings()`가 두 경우를 **서로 다른 URL 키**로 등록한다.

- `withSockJS()` 없음 → 경로 그대로: `"/ws/chat"` → `WebSocketHttpRequestHandler`
- `withSockJS()` 있음 → 경로 뒤에 `/**`를 붙임: `"/ws/chat/**"` → `SockJsHttpRequestHandler`

이 항목들이 하나의 `urlMap`으로 모여 `SimpleUrlHandlerMapping`에 들어가는데, 키가 달라 덮어쓰기가 없다.
요청은 `ws://.../ws/chat`이면 정확 매칭으로 순수 WebSocket 핸들러에,
`/ws/chat/info`나 `/ws/chat/{server}/{session}/websocket`이면 `"/ws/chat/**"`로 SockJS 핸들러에 간다
(`AbstractUrlHandlerMapping`이 패턴 매칭보다 정확 매칭 조회를 먼저 한다).
SockJS 클라이언트는 맨 경로를 요청하지 않고 `/info`부터 부르므로 겹칠 일이 없다.

**주의**: 같은 키로 두 번 등록하면(예: 두 등록 모두 `withSockJS()`를 붙이거나, 둘 다 붙이지 않는 경우)
`urlMap.put`이 **조용히 덮어쓴다.** 예외도 경고 로그도 없어서, 나중에 등록한 쪽만 살아남은 것을
연결이 실패할 때까지 알아채지 못한다. 이 엔드포인트를 손볼 때는 두 등록 중 **정확히 하나만**
`withSockJS()`를 갖고 있는지 먼저 확인한다.

## 14. STOMP 브로드캐스트 payload가 이력 조회 응답과 형식이 다름 (2026-08-22 해결)

- 위치: `domain/chat/service/ChatConsumer.java`(`consume`)
- 증상: `messagingTemplate.convertAndSend("/sub/chat/clubs/" + clubId, message)`가
  `ChatMessage` **엔티티 원본**을 그대로 보낸다. 즉 `{id, clubId, memberId, content, createdAt}`.
  반면 `GET /api/book-clubs/{clubId}/chats`는 `ChatDto.HistoryItem`
  (`{messageId, memberId, senderName, content, createdAt}`)을 준다.
- 결과: 프론트 `MeetingRoom.js`는 두 경로를 같은 `mapServerMessage`로 처리하므로,
  **실시간으로 도착한 메시지만 보낸 사람 이름이 비고**(`senderName`이 없음) React key도 `undefined`가 된다.
  새로고침해서 이력으로 다시 받으면 정상으로 보여서 원인을 찾기 어려운 증상이다.
- 조치: 컨슈머가 `chatService.toHistoryItem(message)`로 변환해 발행한다.
  - `ChatService`에 단건 변환 `public ChatDto.HistoryItem toHistoryItem(ChatMessage)`를 추가하고,
    응답 조립 자체는 private `toHistoryItem(message, memberNames)` 한 곳에만 두어
    목록 조회(`getChatHistory`)와 단건 브로드캐스트가 같은 코드를 쓰게 했다.
  - 별도 매퍼 클래스로 빼는 안도 검토했으나, 그러면 `AI_MEMBER_ID` 상수까지 옮겨야 하고
    (`ChatController`·`ChatConsumer`·문서가 `ChatService.AI_MEMBER_ID`를 참조한다) 파장이 커서 택하지 않았다.
  - `ChatConsumer`가 `ChatService`를 주입받는다. 빈 순환은 없다.
    `ChatService`는 `ChatProducer`만 알고 컨슈머의 존재를 모른다.
- 성능: 단건 변환마다 회원 이름 조회(`findAllById`) SELECT가 1회 추가된다. PK 조회 1건이고,
  같은 메서드가 이미 Redis 쓰기 + AI 서버로의 **동기 HTTP POST**(연결 3초/응답 10초 타임아웃)를 하고 있어
  상대적으로 무시할 수준이다. 컨슈머 처리량이 문제가 된다면 병목은 이 SELECT가 아니라 AI 전송이다.
  그래도 없애려면 `ChatMessage`에 `senderName`을 넣어 발신 시점에 한 번만 조회해 저장하는 방법이 있는데,
  기존 Redis 데이터가 최대 7일간 `senderName` 없이 남아 폴백이 필요하므로 지금은 하지 않았다.
- 미검증: 실제 브로드캐스트 payload. `compileJava`만 확인했다.

## 15. 홈 목록의 `role`이 항상 null이라 가입한 모임에 재입장이 막힘 (2026-08-22 해결)

- 위치: `domain/book/service/BookClubService.getHomeBookClubs()`,
  `domain/book/controller/BookClubController.getHomeBookClubs()`
- 증상: `GET /api/book-clubs`는 `role`에 `null`을 고정으로 넣는다(7번에서 의도적으로 그렇게 정했다).
  프론트 `Community.js`의 `handleJoin`은 `if (!meeting.role) await joinBookClub(...)`으로 가입 여부를 판단한다.
- 결과: 이미 가입한 모임을 눌러도 `join`을 다시 호출해 409(`이미 가입한 독서모임입니다`)를 받고,
  프론트가 그 메시지를 alert으로 띄우며 입장을 막는다. **자기가 만든 모임에도 못 들어간다.**
- 7번에서 null로 둔 근거는 "모임마다 가입 여부를 확인하면 쿼리가 모임 수만큼 늘어난다"였는데,
  `MemberBookClubRepository.findAllByMemberIdWithBookClub(memberId)` **한 번**으로 내가 가입한 clubId 집합을
  만들어 두면 추가 쿼리는 1회로 끝난다. 즉 그때 걱정한 N+1은 피할 수 있다.
- 조치: `getHomeBookClubs(Long memberId)`가 `findAllByMemberIdWithBookClub(memberId)`로 내가 가입한 clubId 집합을
  **쿼리 한 번** 만들어 두고, 가입한 모임에는 실제 역할(`book_club.host_id`와 비교해 HOST/PARTICIPANT)을,
  미가입 모임에는 `null`을 채운다. 컨트롤러에 `@AuthenticationPrincipal Long memberId`를 추가했다.
  `role`의 의미("가입한 모임에서만 값이 있다")는 그대로여서 프론트 코드는 고치지 않아도 된다.

### 검토했지만 택하지 않은 안: "가입하면 무조건 PARTICIPANT"

가입 여부만 보고 `PARTICIPANT`를 넣으면 프론트의 `if (!meeting.role)` 판단은 통과한다. 그런데 그렇게 하면
**방장이 홈 목록에서는 PARTICIPANT로, 상세 조회에서는 HOST로 보인다.** 같은 모임의 역할이 엔드포인트마다
달라지는 셈이라, 7번 이슈에서 없애려 했던 문제(역할이 상황에 따라 조용히 바뀜)를 다시 들이는 것이다.
게다가 정확히 계산하는 비용이 사실상 0이다. `club.getHost().getId()`는 LAZY 프록시에서 추가 쿼리 없이 읽힌다.

`member_book_club`에 role 컬럼을 두고 가입 시점에 HOST/PARTICIPANT를 적어 넣는 안(7번의 B안)도 다시 논의했다.
"모임은 예정 시간에 30분 정도만 진행되므로 방장 탈퇴 승계는 신경 쓸 필요가 없다"는 제품 전제까지 확인했지만,
그렇더라도 바꿔서 얻는 것이 없어 현행을 유지했다. `book_club.host_id`가 이미 단일 진실 소스이고,
컬럼을 옮기면 새 컬럼과 백필 SQL만 늘어난다.

### 남은 한계

`host_id`가 비어 있는(백필 이전) 모임은 `resolveRole`이 PARTICIPANT를 돌려준다
(`memberId.equals(null)`이 false이기 때문). 상세 조회도 이미 같게 동작하므로 새로 생긴 문제는 아니고,
`db/2026-08-17-add-bookclub-host.sql` 백필로만 해소된다.

- 미검증: 실제 응답. `compileJava`만 확인했다.

## 16. 프론트 화면은 있는데 백엔드에 없는 API (2026-08-22 해결 — 프로필 이미지만 보류)

프론트 코드 주석에 "백엔드에 없어서 못 했다"고 명시돼 있던 것들이다. 프로필 이미지를 뺀 네 개를 추가했다.

### 추가한 엔드포인트

```
GET    /api/members/me                    → { memberId, nickname, email, introduction, followerCount, followingCount }
GET    /api/members/{memberId}            → { memberId, nickname, introduction, followerCount, followingCount, isFollowing }
DELETE /api/members/{followingId}/follow  → 200, 본문 없음
GET    /api/books/members/{memberId}/list → [{ bookId, name, coverImageUrl }]  (my-list와 같은 형식)
```

- `MemberDto.ProfileResponse`는 이미 정의만 돼 있고 쓰이지 않던 것을 그대로 살렸다.
- 타인 프로필은 별도 DTO(`OtherProfileResponse`)를 만들었다. **남의 이메일을 내려줄 이유가 없어서 뺐고**,
  대신 `isFollowing`을 넣었다. 지금 프론트는 팔로우 여부를 알 방법이 없어 "누르면 버튼 비활성화"로 버티고
  있는데, 새로고침하면 그 상태가 사라진다. `existsByFollowerIdAndFollowingId` 한 번이면 정확히 그릴 수 있다.
- 타인의 읽은 책 목록은 **서비스 수정이 필요 없었다.** `BookService.getMyReadBooks(memberId)`가 원래부터
  `memberId`를 파라미터로 받고 있어서 컨트롤러 매핑만 추가했다.
- 경로 충돌은 없다. `/api/members/me`는 리터럴이라 `/api/members/{memberId}` 템플릿보다 먼저 매칭된다.

### 팔로워/팔로잉 수를 카운터 컬럼에서 읽지 않은 이유

`Member`에는 `followerCount`/`followingCount` 컬럼이 있지만, 프로필 응답은 이 값을 쓰지 않고
`FollowRepository.countByFollowingId`/`countByFollowerId`로 **실제 `Follow` 행을 센다.**

카운터는 팔로우 시점에만 증가시켜 온 값이라 과거 데이터가 어긋나 있을 수 있다. 지금 프론트는 팔로워 목록
API의 `length`(항상 정확한 값)로 숫자를 세고 있으므로, 틀릴 수 있는 값으로 바꾸면 오히려 후퇴다.
FK 인덱스를 타는 COUNT 두 번이라 비용도 문제되지 않는다.

카운터 컬럼은 그대로 유지하고 언팔로우 시 감소시킨다(`Member.decreaseFollowerCount`/`decreaseFollowingCount`,
과거 데이터 때문에 음수로 내려가지 않게 가드를 뒀다). 두 값이 더 벌어지지 않게 하려는 것이고,
컬럼을 지우려면 `ddl-auto: update`상 수동 SQL이 필요해 지금은 남겨 뒀다.

### 프론트가 할 일

- `Profile.js`: 팔로워/팔로잉 목록을 세어 숫자를 만들던 것을 `GET /api/members/me` 하나로 대체할 수 있다.
  닉네임·소개도 이제 서버에서 받아 표시할 수 있다(세션 동안만 기억하던 임시 처리 제거).
- `OtherProfile.js`: `GET /api/members/{memberId}`로 이름·소개·팔로우 여부를 받고,
  책장은 `GET /api/books/members/{memberId}/list`로 채운다.
  팔로우 버튼은 `isFollowing` 값에 따라 `POST`/`DELETE`를 골라 부르는 토글로 바꿀 수 있다.

### 보류: 프로필 이미지

`Member` 엔티티에 이미지 컬럼 자체가 없다. 파일 업로드와 저장소(로컬 디스크/S3 등) 결정이 필요해
범위가 크므로 기획 확정 후에 판단한다. 그때까지 프론트는 기본 이미지를 쓴다.

- 미검증: 실제 응답. `compileJava`만 확인했다.

OCR 교정(`POST /api/ocr/correct`)은 **백엔드 작업 대상이 아니다.** 프론트가 Tesseract를 브라우저에서 직접 돌리고
사용자가 textarea에서 고치는 방식으로 바꿨다(`AIWrite.js` 주석에 명시).

## 18. 사용자 입력 오류가 500으로 나가던 경로 (2026-08-23 해결)

`docs/api-spec.md` 초안을 코드와 다시 대조하다 나왔다. 셋 다 **사용자/외부 잘못인데 서버 잘못(500)으로 응답**하던 것이다.

- `POST /api/members/signup`, `POST /api/members/login`: `SignUpRequest`/`LoginRequest`에 검증 애너테이션이 없고
  컨트롤러에도 `@Valid`가 없어, `loginId`/`email`/`password`가 비면 `MemberService`를 통과해 DB NOT NULL 제약에서 터졌다.
  → `@NotBlank`(+ 이메일에 `@Email`)와 `@Valid`를 붙였다. 이제 400 + `"loginId: 아이디는 필수입니다."` 형식으로 나간다.
  `BookDto.CreateRequest`가 이미 쓰던 방식과 같아 새로 도입한 기술은 없다.
- `GET /api/books/search`: `keyword`가 `@RequestParam`(필수)이라 파라미터 자체가 빠지면
  `MissingServletRequestParameterException`이 나고, 전용 핸들러가 없어 마지막 `Exception` 핸들러로 떨어져 500이 됐다.
  → `required = false`로 받아 `null`을 서비스로 넘긴다. 빈 검색어와 같은 400(`"검색어를 입력해 주세요."`)으로 통일했다.
  핸들러를 새로 추가하는 대신 이 방법을 쓴 것은 현재 쿼리 파라미터를 쓰는 API가 이 하나뿐이기 때문이다.
- 알라딘 서버 연결 실패/타임아웃: `AladinBookClient`는 `RestClientException`을 잡지 않으므로 그대로 500이 됐다.
  AI 서버 장애를 503으로 내보내기로 한 2번 결정과 기준이 어긋난다.
  → `GlobalExceptionHandler`에 `RestClientException` → 503 핸들러를 추가했다.
  AI 호출부는 이미 `AiServerException`으로 감싸 던지므로 더 구체적인 기존 핸들러가 먼저 잡는다(동작 변화 없음).

함께 확인했지만 **바꾸지 않은 것**: `BookClubService.joinBookClub`은 `COMPLETED` 모임만 가입을 거부하고
`IN_PROGRESS` 모임은 그대로 받는다. 문서 초안에는 "진행중인 모임도 가입 불가"로 잘못 적혀 있었는데,
모임이 예정 시간에 30분 정도만 진행되는 단발성 세션이라 늦게 들어오는 참여자를 막을 이유가 없다고 보고
코드가 아니라 문서를 고쳤다. 막아야 한다면 조건 한 줄만 추가하면 된다.

- 미검증: 실제 응답. `compileJava`와 기존 단위 테스트만 확인했다.
  `ReadlyApplicationTests.contextLoads`는 로컬 Postgres가 떠 있지 않아 실패하는데, 이 변경 전부터 같은 이유로 실패한다.

## 17. 독서모임 목록의 인원수 조회가 모임 수만큼 쿼리를 날린다 (2026-08-26 해결)

- 위치: `domain/book/service/BookClubService.java`(`getHomeBookClubs`, `getMyBookClubs`)
- 증상: 목록을 만드는 루프 안에서 모임마다 `memberBookclubRepository.countByBookClubId(club.getId())`를 부른다.
  모임이 N개면 COUNT 쿼리가 N번 나가는 전형적인 N+1이다.
- 15번을 고치면서 발견했지만 **일부러 그대로 뒀다.** 15번의 범위는 `role` 값이 틀린 것이고,
  이 N+1은 그 전부터 있던 별개의 성능 문제다. 한 번에 섞으면 변경 이유가 불분명해진다.
- 지금 당장 문제가 되지 않는 이유: 모임 수가 적고, 목록 조회는 홈 화면 진입 시 1회다.
- 고칠 때의 방향: `member_book_club`을 `bookClubId`로 `GROUP BY`해 `(clubId, count)`를 한 번에 가져오는
  쿼리를 `MemberBookClubRepository`에 추가하고, 그 결과를 `Map<Long, Integer>`으로 받아 루프에서 조회만 한다.
  15번에서 가입 clubId 집합을 미리 만든 것과 같은 방식이다.
- 판단 기준이었던 것: 홈 목록이 눈에 띄게 느려지거나 모임 수가 수백 단위가 되면 그때 처리한다.

### 조치 (2026-08-26)

미뤄 뒀던 위 방향 그대로 고쳤다.

- `MemberBookClubRepository.countByBookClubIds(List<Long>)` 추가.
  `select mbc.bookClub.id, count(mbc) ... where mbc.bookClub.id in :clubIds group by mbc.bookClub.id`이고,
  결과는 `Object[]` 대신 프로젝션 인터페이스 `ClubMemberCount`(`getClubId`/`getMemberCount`)로 받는다.
- `BookClubService.countMembersByClub(List<BookClub>)`가 이 결과를 `Map<Long, Integer>`으로 만들고,
  `getHomeBookClubs`와 `getMyBookClubs`가 루프 안에서 조회만 한다.
  즉 목록 API의 COUNT 쿼리가 **모임 수 N번 → 1번**이 된다.
- **가입자가 0명인 모임은 GROUP BY 결과에 아예 나오지 않는다.** 그래서 읽는 쪽은 `getOrDefault(id, 0)`을 쓴다.
  이 경우는 실제로는 잘 생기지 않는다(모임을 만들면 만든 사람이 자동 가입된다). 조인 행이 지워진 과거 데이터 대비다.
- 빈 목록을 `in` 절에 넘기면 DB에 따라 문법 오류가 나므로 `clubs.isEmpty()`면 빈 Map을 돌려준다.
- `getBookClubDetail`(단건 조회)은 그대로 `countByBookClubId`를 쓴다. 모임 하나라 N+1이 아니다.
  `joinBookClub`의 정원 확인도 마찬가지다.
- 응답 형식은 바뀌지 않는다. 프론트 변경 없음.

## 19. Kafka 설정이 `spring:` 밖에 있어 무시된다 + Redis Pub/Sub 전환 (2026-08-25 결정 · 2026-08-26 해결·검증 완료)

AWS EC2 배포(Docker로 Postgres/Redis/Kafka 기동)를 준비하면서 검토한 내용이다.
**전환하기로 결정했고, 작업 시점은 나중으로 미뤘다.**

### 지금 깨져 있는 것

- 위치: `src/main/resources/application.yaml:40`
- 증상: Confluent Cloud로 옮기면서 넣은 `kafka:` 블록이 **`spring:` 하위가 아니라 최상위**에 있다.
  스프링부트는 `spring.kafka.*`만 읽으므로 이 블록 전체(브로커 주소, SASL 인증정보, 직렬화 설정)가 무시된다.
  `application-local.yaml`에도 `spring.kafka`는 없다.
- 결과: 자동설정 기본값(`localhost:9092`, key/value 모두 `StringSerializer`)으로 뜬다.
  `ChatMessage` 객체를 `StringSerializer`로 발행하면 런타임 직렬화 예외가 난다.
  즉 **배포 환경의 채팅 발행 경로는 동작하지 않을 가능성이 높다.**
  (4번 항목에서 `KafkaConfig`를 지우고 설정을 yaml 한 곳으로 모았는데, Confluent 전환 때 들여쓰기가 빠진 것으로 보인다.)
- 실서버를 호출해 확인하지는 못했다. 되고 있다면 확인하지 못한 다른 설정 경로가 있다는 뜻이다.
- 아래 전환을 하면 이 블록 자체가 사라지므로 같이 해소된다. 다만 **전환 전에 배포해야 한다면
  이 한 가지는 먼저 고쳐야 한다**(블록을 `spring:` 아래로 들여쓰기).

### 왜 Kafka를 걷어내는가

- Kafka 접점은 세 곳뿐이다: `ChatProducer`(파일 전체), `ChatConsumer.consume`의 `@KafkaListener` 한 줄,
  `build.gradle` 두 줄. Kafka 관련 테스트는 없다.
- **Kafka의 내구성·리플레이를 쓰고 있지 않다.** 채팅 이력은 `@RedisHash` 엔티티에서 읽는다(`getChatHistory`).
  토픽 로그를 다시 읽는 코드는 없다.
- 프로듀서와 컨슈머가 같은 애플리케이션이다. 자기 자신에게 네트워크 왕복을 한 번 한다.
  실제로 얻는 효과는 **AI HTTP 호출을 요청 스레드에서 떼어내는 비동기화** 하나뿐이다.
- `WebSocketConfig`가 `enableSimpleBroker`(JVM 인메모리)를 쓰므로 앱은 이미 단일 인스턴스 전제다.
  Kafka가 주는 확장성 이점을 지금 구조에서는 쓸 수 없다.
- 리소스: Kafka(KRaft 단일 노드)는 JVM 힙만 500MB~1GB에 디스크 로그가 붙는다.
  t3.micro(1GB)에 Spring Boot + Postgres + Redis까지 얹으면 들어가지 않는다.
  Redis Pub/Sub은 컨테이너 추가가 없고 메모리 추가도 사실상 없다(pub/sub은 저장하지 않는다).
- 오히려 **나중에 인스턴스를 늘릴 때 Redis Pub/Sub이 더 맞다.** Kafka 컨슈머 그룹(`reading-group`)은
  메시지를 한 인스턴스에만 준다 → 다른 인스턴스에 붙은 구독자에게 STOMP 브로드캐스트가 가지 않는다.
  Redis Pub/Sub은 모든 인스턴스에 팬아웃되므로 브로드캐스트 의미에 맞다.
- 잃는 것: 앱 재시작 순간의 인플라이트 메시지 1건 유실 가능성.
  독서모임이 30분짜리 단발 세션이라 허용 범위로 판단했다.

### 검토했지만 택하지 않은 대안

- **브로커를 아예 없애고 `@Async`로 직접 호출**: 수정량은 더 적지만, 나중에 인스턴스를 늘릴 때
  STOMP 릴레이 자리가 비어 버린다. Redis Pub/Sub은 그 자리를 그대로 채운다.
- **Confluent Cloud 유지**: EC2 리소스는 0이고 yaml 들여쓰기 한 번이면 되지만,
  외부 의존과 무료 티어 한도, 네트워크 홉이 남는다.

### 할 일 (확정된 범위)

- `build.gradle` — `spring-kafka`, `spring-kafka-test` 두 줄 삭제
- `application.yaml` — 최상위 `kafka:` 블록 삭제
- `ChatProducer` — `KafkaTemplate.send(TOPIC, message)` → `RedisTemplate.convertAndSend("chat-group", message)`
- `ChatConsumer` — `@KafkaListener` → `MessageListener.onMessage`.
  내부 3단계(Redis 저장 / STOMP 브로드캐스트 / AI 전달)와 AI 실패를 삼키는 정책은 **그대로 둔다**
- 신규 `global/config/RedisSubConfig` — `RedisMessageListenerContainer` + 메시지 직렬화(약 35줄)
- `ChatMessage`의 클래스 상단 주석(Kafka 흐름 설명), `CLAUDE.md`, `README.md`, `docs/api-spec.md`,
  `docs/fe-handoff-2026-08-23.md`의 Kafka 언급 정리
- **프론트엔드 변경 없음.** REST/STOMP 계약은 바뀌지 않는다. 기존 테스트 수정도 없다.

### 작업할 때 걸릴 함정

- `ChatMessage.createdAt`이 `LocalDateTime`이다. pub/sub 직렬화에 `GenericJackson2JsonRedisSerializer`를 쓰면
  `JavaTimeModule`을 등록해야 한다. 빠뜨리면 시간 필드가 깨진다.
  (`jackson-datatype-jsr310`은 `spring-boot-starter-web`에 이미 들어 있다.)
- `@RedisHash` 저장 경로는 Spring Data Redis의 별도 컨버터를 쓰므로 pub/sub 직렬화 설정과 서로 영향이 없다.

### 실제 조치 (2026-08-26)

위 "할 일" 범위 그대로 작업했고, 직렬화만 계획과 다르게 정했다.

- `build.gradle`에서 `spring-kafka`, `spring-kafka-test` 삭제.
- `application.yaml`에서 최상위 `kafka:` 블록과 주석으로 남아 있던 옛 블록을 모두 삭제.
  Kafka 관련 환경변수(`KAFKA_BOOTSTRAP_SERVERS`, `KAFKA_API_KEY`, `KAFKA_API_SECRET`)도 README 표에서 뺐다.
- `ChatProducer` → `RedisTemplate<String, ChatMessage>.convertAndSend(RedisSubConfig.CHAT_CHANNEL, message)`.
- `ChatConsumer` → `implements MessageListener`. `onMessage`에서 페이로드를 `ChatMessage`로 되돌린 뒤
  기존 `consume(ChatMessage)`를 그대로 부른다. 3단계(Redis 저장 / STOMP 브로드캐스트 / AI 전달)와
  AI 실패를 로그만 남기고 삼키는 정책은 손대지 않았다.
- 신규 `global/config/RedisSubConfig` — `RedisMessageListenerContainer` + 발행용 `RedisTemplate` + 직렬화기.
  채널 이름은 설정값이 아니라 상수 `RedisSubConfig.CHAT_CHANNEL`("chat-group")이다.
- **직렬화는 계획의 `GenericJackson2JsonRedisSerializer` 대신 `Jackson2JsonRedisSerializer<ChatMessage>`를 썼다.**
  이 채널로는 `ChatMessage`만 오가므로 타입이 고정이고, 그러면 payload에 `@class` 타입 정보를 실을 필요가 없다.
  `JavaTimeModule` 등록은 계획대로 했다.
- 문서(`CLAUDE.md`, `README.md`, `docs/api-spec.md`, `docs/fe-handoff-2026-08-23.md`)의 Kafka 서술 정리.
- 프론트엔드 변경 없음(REST/STOMP 계약 불변). 기존 테스트 수정 없음.

### 검증 (2026-08-26, 실제 서버 · 로컬 Postgres/Redis Docker · **Kafka 컨테이너는 정지시킨 상태**)

Kafka 브로커를 내려 둔 채로 전부 통과했다. 즉 더 이상 Kafka에 의존하지 않는다.

- `.\gradlew.bat test` — 전체 통과(`ReadlyApplicationTests.contextLoads` 포함). 알라딘 라이브 테스트는 평소대로 SKIP.
- 회원 2명(방장 A, 참여자 B)이 같은 모임에 STOMP로 접속 → **양쪽이 서로의 메시지를 실시간 수신**.
  `senderName`, `messageId`, `createdAt`(LocalDateTime) 모두 정상. 시간 필드가 깨지지 않았다.
- `GET /api/book-clubs/{clubId}/chats` — 두 메시지가 순서대로 반환(재입장 시나리오).
- Redis 키 확인 — `chat:{uuid}`, `chat:clubId:{id}` 인덱스 생성, TTL 604766초(약 7일) 유지.
- **AI 경로(실제 배포 AI 서버 `https://readly-sm-finalproject.onrender.com` 사용)**:
  방장이 `POST /api/book-clubs/{clubId}/meeting/assist`(`mode: "question"`, `"summary"` 둘 다) 호출 →
  200 → AI 응답이 `memberId: 999`, `senderName: "AI"`로 채팅방에 발행되고 **두 구독자 모두 실시간 수신**.
  참여자 대화 내용을 인용한 답변이 와서 `chat_history` 전달도 제대로 되고 있음을 확인했다.
- AI 콜백 `POST /api/book-clubs/{clubId}/chats` — 올바른 `X-AI-API-KEY`면 200 + 브로드캐스트,
  틀린 키면 401. (원격 AI 서버는 로컬 8080에 접속할 수 없어 이 경로는 콜백을 흉내 내 검증했다.)
- 회귀: 가입하지 않은 회원(C)의 `/sub/chat/clubs/{id}` 구독 → `ERROR` 프레임
  ("가입하지 않은 독서모임의 채팅방은 구독할 수 없습니다.") 후 close 1002.
  같은 회원의 `GET .../chats`도 409.

### 검증 중 확인한 것

- `application-local.yaml`의 `ai.base-url` 끝에 슬래시가 있어 호출 URL이 `..//api/meeting/assist`가 되는데,
  **실제로는 문제가 없었다**(200). 같은 이중 슬래시 URL을 PowerShell로 직접 호출하면 404가 나므로
  Spring 쪽에서 경로가 정규화되는 것으로 보인다. 근거는 실측이고 정규화 지점을 코드로 확인하지는 않았다.
- STOMP를 손으로 만든 Node 테스트 스크립트에서, 프레임 종료 문자(NUL, `\0`)를 공백으로 잘못 넣으면
  서버가 프레임을 완성되지 않은 것으로 보고 **아무 응답도 주지 않는다**(CONNECTED도 ERROR도 없음).
  서버 문제로 오인하기 쉬우니 다음에 같은 방식으로 검증할 때 먼저 확인할 것.

## 20. AI 서버에 `/api/ai/chat`이 없어 채팅마다 404가 난다 (2026-08-26 발견 · 미해결)

- 위치: `domain/chat/service/ChatConsumer.sendToAiAgent`
- 증상: 19번 검증 중 애플리케이션 로그에서 발견했다. 회원이 채팅을 한 건 보낼 때마다

  ```
  HttpClientErrorException$NotFound: 404 Not Found on POST request for
  "https://readly-sm-finalproject.onrender.com/api/ai/chat": {"detail":"Not Found"}
  ```

  가 찍힌다. 배포된 AI 서버가 이 경로를 제공하지 않는다(`/api/meeting/assist`는 200으로 정상 동작).
- 지금 당장 기능이 깨지지는 않는다. 이 호출은 실패해도 로그만 남기고 삼키도록 되어 있고(2번 항목의 결정),
  Redis 저장과 STOMP 브로드캐스트는 이미 끝난 뒤다. 사용자에게 보이는 채팅은 정상이다.
- 그래도 방치하면 안 되는 이유:
  - **모든 채팅 메시지마다** 외부 서버로 왕복 요청이 나가고, 그때마다 스택 트레이스가 로그에 쌓인다.
  - 원래 의도였던 "AI가 대화에 자동으로 끼어든다"는 흐름(CLAUDE.md 채팅 파이프라인 4단계)이
    실제로는 동작한 적이 없다는 뜻이다. 지금 AI가 말하는 경로는 방장이 버튼을 누르는 `/meeting/assist` 하나뿐이다.
### 조치 (2026-08-26): 호출만 주석 처리, 코드는 남긴다

- `ChatConsumer.consume`의 3단계(`sendToAiAgent` 호출)를 **주석 처리**했다. 삭제하지 않은 이유는
  AI 서버가 `/api/ai/chat`을 구현하면 그대로 되살릴 코드이기 때문이다. 주석에 그 사정과
  되살리는 방법(두 줄의 주석만 풀면 됨)을 적어 뒀다.
- `sendToAiAgent` 메서드와 `AiMessageRequest`도 그대로 남겨 뒀다. 호출부가 없어 IDE가 미사용 경고를
  낼 수 있으므로 `@SuppressWarnings("unused")`를 붙였다.
- 이제 채팅 흐름은 **저장 → 브로드캐스트** 두 단계다. 사용자에게 보이는 동작은 전과 같고,
  매 메시지마다 나가던 404 요청과 스택 트레이스만 사라진다.
- 되살릴 때 확인할 것: AI 서버가 답변을 우리 `POST /api/book-clubs/{clubId}/chats`로 되돌려주는지
  (그 경로는 `X-AI-API-KEY` 헤더로 인증한다), 그리고 배포 환경에서 AI 서버가 우리 서버 주소에 접근 가능한지.
- 참고: 이 비동기 호출은 AI 서버가 우리 `POST /api/book-clubs/{clubId}/chats`로 되부르는 것을 전제한다.
  로컬 개발 환경에서는 원격 AI 서버가 `localhost:8080`에 접속할 수 없으므로, 이 경로 전체는
  배포 환경에서만 실제로 검증할 수 있다.

## 21. AI 독후감 생성이 항상 503으로 실패한다 (2026-08-26 발견·해결)

- 위치: `domain/book/dto/BookNoteDto.ReviewGenerateRequest`, `BookNoteService.generateAiBookNote`
- 증상: `POST /api/notes/books/{bookId}/ai-generate`가 503으로 떨어진다. 로그를 보면 원인은 AI 서버의 422다.

  ```
  422 Unprocessable Entity on POST ".../api/review/generate":
  {"detail":[{"type":"missing","loc":["body","book_title"],"msg":"Field required",
              "input":{"bookTitle":"데미안","notes":[{"phrase":"...","feeling":"..."}]}}]}
  ```

- 원인: 3번 항목에서 **AI 서버 스펙이 없어 우리가 먼저 계약을 정할 때** 자바 관례대로 `bookTitle`(camelCase)로
  적었는데, 실제 AI 서버는 `book_title`(snake_case)을 요구한다. 11번(채팅 `/meeting/assist`가 `book_title`을
  안 보내 422가 나던 문제)과 **완전히 같은 종류의 불일치**다. 그때 채팅 쪽만 고치고 독서록 쪽은 남아 있었다.
- 조치: `ReviewGenerateRequest.bookTitle`에 `@JsonProperty("book_title")`을 붙였다.
  채팅 쪽 `MeetingAssistApiRequest`가 쓰던 방식과 같다. `notes` / `phrase` / `feeling`은 그대로 통과하므로
  건드리지 않았다.
- 검증(2026-08-26, 실제 AI 서버):
  - 고치기 전: 503 + `"AI 서버에 연결할 수 없습니다..."`
  - 고친 뒤: 200, `GET /api/notes/books/{bookId}/ai-note`에서 실제 AI가 쓴 373자 독후감이 나온다.
  - `PATCH /api/notes/ai-notes/{id}`로 수정하면 `edited: true`가 되고, 남의 것을 수정하면 403.
- 남은 사실 하나: **AI 서버 응답에 `tags`가 없다.** 확인한 응답은 `{"review": "..."}` 하나뿐이라
  `ai_note.tags`는 계속 비어 있고 조회 응답의 `tags`는 `[]`로 나간다.
  3번에서 "tags는 부가 정보라 비면 본문만 저장한다"고 정해 둔 대로 동작하는 것이라 기능은 깨지지 않는다.
  태그가 필요하면 AI 서버에 `tags` 필드를 추가해 달라고 요청해야 한다.

---

# 2026-08-26 전 기능 실동작 검증

19번(Redis Pub/Sub 전환) 이후, 채팅 외의 나머지 기능도 실제 서버를 띄워 확인했다.
로컬 Postgres/Redis(Docker), AI는 실제 배포 서버(`https://readly-sm-finalproject.onrender.com`),
알라딘은 실제 API를 썼다. **Kafka 컨테이너는 정지 상태**다.

| 영역 | 확인한 것 | 결과 |
| --- | --- | --- |
| 회원 | 회원가입 / 로그인(이메일+비밀번호) | 200, memberId 반환 |
| 회원 | `GET /api/members/me`, `PATCH /api/members/me/profile` | 닉네임·소개 수정 후 재조회에 반영됨 |
| 회원 | `GET /api/members/{id}` (타인 프로필) | 이메일 없음, `isFollowing` 정확 |
| 팔로우 | 팔로우 → 언팔로우 → 재조회 | `isFollowing` true→false, `followerCount` 1→0, 팔로워 목록에 반영 |
| 도서 | `GET /api/books/search?keyword=데미안` (알라딘 ItemSearch) | `isbn13` 채워진 목록 반환 |
| 도서 | `GET /api/books/search` (파라미터 누락) | 400 |
| 도서 | `POST /api/books` (`{}`) | 400 + `"isbn13: isbn13은 필수입니다."` |
| 도서 | `POST /api/books` (`isbn13`), `POST /api/books/{id}/my-list` | 등록·담기 성공, 내 책장/타인 책장 조회 정상 |
| 모임 | 생성 / 가입 / 홈 목록 / 내 목록 / 상세 | 인원수 정확, `role`이 HOST·PARTICIPANT·null로 정확 |
| 모임 | 미가입자 상세 조회 / 중복 가입 / 정원 초과 | 각각 409 + 사유 메시지 |
| 모임 | `bookId` 없이 생성 | 400 + `"독서모임을 만들려면 책을 선택해야 합니다."` |
| 독서록 | 작성 / 목록 조회 / AI 독후감 생성·조회·수정 | 정상 (21번 수정 후) |
| 독서록 | 남의 AI 독서록 수정 | 403 |
| 채팅 | 2인 실시간 송수신 / 이력 조회 / TTL | 19번 절 참고 |
| 채팅 | 방장 AI 진행자 호출 / 참여자가 호출 | 200 + 방에 발행 / 409 |
| 인증 | 토큰 없이 API 호출 | 403 |
| 빌드 | `.\gradlew.bat test` | 전체 통과 |

확인하지 못한 것:
- 브라우저에서의 실제 CORS 동작(12번). Node/PowerShell 클라이언트는 CORS를 적용받지 않는다.
- AI 서버가 우리 서버로 되부르는 비동기 콜백(20번). 원격 AI가 `localhost:8080`에 닿지 못한다.

---

# 2026-08-26 백필 스크립트 실행

로컬 `readly` DB(Docker Postgres 17)에 두 스크립트를 실제로 실행했다.
**배포 DB에는 아직 실행하지 않았다.** 백필은 데이터베이스마다 한 번씩 필요하다.

## 실행 전에 고친 것: 테이블 이름이 `ai_note`가 아니라 `ainote`다

- `AINote` 엔티티에 `@Table(name = ...)`이 없어서, Hibernate 기본 전략이 만드는 실제 테이블 이름은
  **`ainote`**다(`\dt`로 확인). 그런데 백필 스크립트들은 `ai_note`를 참조하고 있었다.
- 그대로 실행하면 `db/2026-08-17-backfill-book-isbn13.sql`은 1단계 진단 SELECT에서
  `relation "ai_note" does not exist`로 즉시 실패한다. **즉 이 스크립트는 지금까지 한 번도
  실행될 수 없는 상태였다.** 실행해 보지 않았기 때문에 드러나지 않았다.
- 조치: `2026-08-17-backfill-book-isbn13.sql`과 `2026-08-08-split-ainote-from-booknote.sql`의
  테이블 이름을 `ainote`로 고치고, 왜 그런지 주석으로 남겼다.
- 문서에서 "ai_note 테이블"이라고 부르는 것은 전부 이 `ainote` 테이블을 가리킨다.
  이름을 `ai_note`로 바꾸고 싶다면 엔티티에 `@Table(name = "ai_note")`를 달고 다시 백필해야 하므로
  지금은 건드리지 않았다.

## `db/2026-08-17-add-bookclub-host.sql`

- 대상: `host_id`가 NULL이던 모임 1개(`club_id = 1`, 이전 세션에서 만들어진 행).
- 결과: `UPDATE 1`. 가장 먼저 가입한 회원(`member_id = 1`)이 방장으로 채워졌고,
  `fk_book_club_host` 외래키가 생성됐다. 확인용 SELECT는 0행(방장 없는 모임 없음).
- 컬럼은 이미 있어서 `ADD COLUMN IF NOT EXISTS`가 NOTICE만 남기고 넘어갔다. 재실행해도 안전하다.
- API로 확인: 백필 전에는 `club_id = 1`에 AI 진행자를 호출하면 `"방장이 지정되지 않은 독서모임입니다."`가
  나왔어야 하는데, 백필 후에는 `"방장만 AI 진행자를 호출할 수 있습니다."`가 나온다.
  즉 `host_id`를 읽어 실제로 판정하고 있다.

## `db/2026-08-17-backfill-book-isbn13.sql`

- 대상: `isbn13`이 NULL인 책 1행(`book_id = 1`, "데미안 / 헤르만 헤세" — 수기 입력 시절 데이터).
  참조는 `member_book` 1, `book_club` 1, `book_note` 1, `ainote` 1건이었다.
- **매핑은 레포의 스크립트에 적지 않았다.** 자리표시자 `(NULL, NULL)`을 그대로 두고,
  스크래치 디렉터리에 사본을 만들어 거기에만 `(1, '9788937460449')`를 적어 실행했다.
  매핑은 DB마다 다르고, 이 값은 로컬 테스트 데이터에만 해당하기 때문이다.
  배포 DB에 실행할 때는 그 DB의 1단계 진단 결과를 보고 매핑을 새로 적어야 한다.
- 실행 전에 `pg_dump`로 백업을 떠 두고 진행했다.
- 결과: `book_id = 2`가 이미 같은 ISBN(`9788937460449`)을 갖고 있어 **병합 경로**를 탔다.
  참조 네 종류가 전부 `book_id = 2`로 옮겨졌고(각 `UPDATE 1`), 껍데기가 된 `book_id = 1`이 삭제됐다.
  충돌로 버려진 행은 없었다(`DELETE 0` 두 번). 확인용 SELECT는 0행.
- API로 확인: 홈 목록에서 `club_id = 1`의 `bookId`가 2로 바뀌어 나오고, 독서록 조회도 정상이다.
  즉 같은 책이 두 행으로 갈라져 있던 상태가 실제로 하나로 합쳐졌다.

---

# 2026-08-26 요구사항 3건 반영 (채팅 보관 / 활성화 시간 / AI 타임아웃)

## A. 채팅 생명주기: Redis 7일 → PostgreSQL 30일

- Redis TTL(7일)은 그대로다. 최근 7일 조회(`GET .../chats`)는 계속 Redis만 본다.
- 만료되는 순간 PostgreSQL `chat_archive`로 옮긴다. 새로 추가한 것:
  - `domain/chat/entity/ChatArchive`(JPA, 테이블 `chat_archive`) — PK는 Redis에서 쓰던 메시지 UUID.
    같은 메시지를 두 번 이관해도 행이 늘지 않는다.
  - `ChatArchiveRepository`(JPA) — `deleteByArchivedAtBefore`
  - `ChatArchiveService` — 만료 이벤트 수신(이관) + `@Scheduled` 삭제 작업
  - `global/config/RedisRepositoryConfig` — `@EnableRedisRepositories(enableKeyspaceEvents = ON_STARTUP)` + `@EnableScheduling`
- 삭제 기준은 **보낸 시각이 아니라 PostgreSQL에 옮긴 시각(`archived_at`)** 이다. 기본 30일이고
  `chat.archive.retention-days`로 바꾼다. 작업 주기는 `chat.archive.purge-cron`(기본 매일 04:00).
  결과적으로 한 메시지의 총 보존 기간은 대략 7일 + 30일이다.

### 만료를 어떻게 알아채는가 (그리고 걸리는 조건들)

Spring Data Redis의 키스페이스 이벤트를 켜면 키가 만료될 때 `RedisKeyExpiredEvent`가 오고,
스프링이 함께 저장해 둔 **사본(phantom key)** 덕분에 사라진 값의 내용을 그대로 읽을 수 있다.
실제로 켜졌는지는 `redis-cli config get notify-keyspace-events`로 확인했다(값 `xE`).

주의할 점 네 가지:

1. `@EnableRedisRepositories`를 직접 선언하면 부트의 자동 설정이 물러난다.
   `basePackages`에 `domain/chat/repository`를 반드시 유지해야 한다.
2. 사본 때문에 채팅 한 건당 Redis 키가 하나 더 생긴다(`chat:{id}:phantom`, TTL은 원본 + 5분).
3. 이 설정은 기동 시 `CONFIG SET notify-keyspace-events`를 실행한다.
   **관리형 Redis에서 `CONFIG` 명령이 막혀 있으면 자동 설정이 실패하므로 서버 쪽에서 직접 켜야 한다.**
4. **앱이 꺼져 있는 동안 만료된 키의 이벤트는 다시 오지 않는다.** 그 메시지는 보관되지 못하고 사라진다.
   확실히 하려면 만료 직전(예: 6일차)에 훑어 옮기는 배치가 따로 필요하다. 지금은 넣지 않았다.

### 검증 (2026-08-26, 실제 서버)

TTL 7일을 기다릴 수 없으므로 Redis에서 해당 키만 `EXPIRE 1`로 강제 만료시켜 확인했다(사본은 그대로 남아 있다).

- 만료 직후 `chat_archive`에 행이 생겼고 `content`/`created_at`이 보존됐다. `archived_at`은 이관 시각.
- 삭제 작업은 `CHAT_ARCHIVE_RETENTION_DAYS=0`, `CHAT_ARCHIVE_PURGE_CRON=0/20 * * * * *`로 앱을 띄워 확인했다.
  20초 뒤 로그에 삭제 기록이 남고 테이블이 비었다.
- `chat_archive`를 읽는 API는 만들지 않았다. 요구사항이 "보관"이라서다. 필요해지면 `club_id` 조회를 추가하면 된다.

## B. 채팅방 활성화 시간 (백엔드 단독 판정)

- `ChatService.validateChatWindow`: 모임 시작 15분 전 ~ 종료(시작 + 30분) 15분 후, 총 60분만 전송을 허용한다.
  상수 세 개(`MEETING_DURATION_MINUTES`, `WINDOW_OPEN_BEFORE_MINUTES`, `WINDOW_CLOSE_AFTER_MINUTES`)로 정의했다.
- 검사 위치를 `sendMessage` **한 곳**으로 잡았다. STOMP·AI 콜백·AI 진행자 응답이 전부 이 메서드를 지나므로
  우회 경로가 생기지 않는다. AI 메시지도 예외로 두지 않았다.
  대신 모임 끝 무렵에 요청한 AI 응답이 아주 늦게 도착하면 거부될 수 있다(로그만 남는다).
- **조회는 막지 않는다.** 7일치 대화를 다시 볼 수 있어야 한다는 기존 요구사항과 충돌하기 때문이다.
- 날짜/시간이 비어 있는 과거 모임은 윈도우를 계산할 수 없어 통과시킨다.
- 검사 때문에 `sendMessage`가 `bookClubRepository.findById`를 한 번 더 부른다(메시지당 SELECT 1회 추가).

### STOMP 전송 실패를 알리는 방법을 추가했다

처음 구현하고 실제로 눌러 보니 **STOMP로 보낸 메시지는 거부돼도 클라이언트에 아무 응답이 가지 않았다**
(서버 로그에만 예외가 남는다). 사용자 입장에서는 메시지가 그냥 사라지는 셈이라,
`ChatController.handleSendRejected`(`@MessageExceptionHandler` + `@SendToUser("/sub/errors")`)를 추가해
**보낸 사람에게만** 사유를 보낸다. 프론트는 `/user/sub/errors`를 구독하면 된다(`docs/api-spec.md`에 적었다).

### 검증

- 20:00 모임(윈도우 19:45~20:45)에 14:20에 전송 → REST 409 + `"아직 채팅방이 열리지 않았습니다..."`,
  STOMP는 발행되지 않고 `/user/sub/errors`로 같은 메시지 수신.
- 시작 시각을 현재로 잡은 모임에서는 2인 실시간 송수신이 그대로 동작.
- 윈도우 밖 모임의 이력 조회는 정상(11건).

## C. AI 호출 타임아웃

- **바꾸기 전 값: 연결 3초 / 응답 대기 10초.** `RestTemplateConfig`의 `RestTemplate` 하나를
  알라딘과 AI가 공유하고 있었다(2번 항목에서 무한 대기를 막으려고 넣은 값).
- LLM 응답 생성에 콜드 스타트까지 겹치면 수십 초가 걸리므로 10초로는 정상 응답도 실패한다.
- 조치: **AI 전용 빈 `aiRestTemplate`을 분리**하고 기본값을 **연결 10초 / 응답 대기 120초**로 잡았다.
  `ai.connect-timeout-seconds` / `ai.read-timeout-seconds`(환경변수 `AI_CONNECT_TIMEOUT_SECONDS`,
  `AI_READ_TIMEOUT_SECONDS`)로 조정할 수 있다.
- 알라딘 등 일반 호출은 기존 빈(3초/10초)을 그대로 쓴다. (당시엔 `@Primary`였고, 그 때문에 이 분리가 동작하지 않았다 → 26번)
  **한 빈의 타임아웃만 늘리지 않은 이유**는, 그러면 알라딘 검색이 죽었을 때도 사용자가 2분을 기다리기 때문이다.
- 주입은 **필드 이름**으로 구분한다(`aiRestTemplate`이라고 쓰면 느린 빈). ※ `@Primary`가 붙어 있는 동안은 이름보다 `@Primary`가 우선해서 실제로는 전부 10초 빈이 주입됐다(26번).
  AI를 호출하는 세 곳(`ChatService`, `BookNoteService`, `ChatConsumer`)을 전부 바꿨다.
- 검증: AI 진행자 호출 200(5초), AI 독후감 생성 200(4초), 알라딘 검색 20건 정상.
  이번 호출들은 원래 10초 안에 끝나는 것들이라 **늘어난 한도 자체가 실제로 쓰이는 상황(60초 이상 걸리는 응답)은
  재현하지 못했다.** 설정값이 적용된 것은 코드 경로로만 확인했다.

# 프론트엔드 실연동 중 발견 (2026-08-30)

## 22. 배포 서버에서 WebSocket 핸드셰이크가 400으로 실패한다 (2026-08-30 원인 확인 · 서버 설정 조치 필요)

브라우저 콘솔에 다음이 반복해서 찍혔다.

```
WebSocket connection to 'wss://readly-backend.duckdns.org/ws/chat' failed:
Error during WebSocket handshake: Unexpected response code: 400
채팅 소켓이 연결되어 있지 않습니다.
```

두 번째 줄은 프론트 `src/api/chatSocket.js`의 `sendChatMessage`가 `client.connected`가 false일 때
찍는 경고다. 즉 **소켓이 안 붙어서 메시지가 아예 발행되지 않았다.** "채팅 내역이 바로바로 안 보인다"는
증상은 이 하나에서 나온 결과이고, 별개의 버그가 아니다.

### 원인 (EC2 nginx가 Upgrade 헤더를 백엔드로 넘기지 않는다)

배포 서버에 직접 요청을 보내 좁혔다 (2026-08-30, `nginx/1.24.0 (Ubuntu)`).

| 요청 | 응답 |
|---|---|
| `GET /ws/chat/info` (SockJS 정보 엔드포인트) | `200` — nginx도 앱도 살아 있다 |
| `GET /ws/chat` + Upgrade 헤더 + 허용되지 않은 `Origin` | `403 Invalid CORS request` — 요청이 스프링까지 도달한다 |
| `GET /ws/chat` + Upgrade 헤더, `Origin` 없음 | `400 Can "Upgrade" only to "WebSocket".` |

세 번째 줄이 결정적이다. 그 메시지는 스프링 `AbstractHandshakeHandler`가 **`Upgrade` 헤더를 못 받았을 때**
내는 것이다. 우리는 분명히 보냈으므로 중간의 nginx가 지웠다는 뜻이다. `Upgrade`/`Connection`은 hop-by-hop
헤더라 nginx가 기본적으로 프록시 대상에 전달하지 않는다(기본 `proxy_http_version`도 1.0이다).

두 번째 줄은 CORS 필터가 핸드셰이크 핸들러보다 앞에 있어 먼저 403을 내는 것뿐이고, 프론트는 허용된
출처라 CORS를 통과한 뒤 같은 400을 맞는다.

**백엔드 코드 문제가 아니다.** `WebSocketConfig`는 `/ws/chat`을 순수 WebSocket과 SockJS로 모두 등록해 두었고
`SecurityConfig`는 `/ws/chat/**`를 permitAll 한다. 고칠 곳은 EC2의 nginx 사이트 설정이다.

```nginx
location /ws/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;   # 기본 60초면 조용한 방의 연결이 끊긴다
    proxy_send_timeout 3600s;
}
```

`sudo nginx -t && sudo systemctl reload nginx` 후 위 표의 세 번째 요청이 `101 Switching Protocols`로
바뀌면 해결된 것이다.

### 남는 주의사항

- 소켓이 붙어도 **채팅 창 시간(모임 시작 15분 전 ~ 종료 15분 후)** 밖이면 전송은 거부된다(위 B 항목).
  프론트는 `/user/sub/errors`를 구독하지 않고 있어 그 사유가 화면에 안 나온다. 테스트할 때
  모임 시각을 현재로 잡지 않으면 "여전히 안 된다"로 보일 수 있다.
- `proxy_read_timeout`을 늘리지 않으면 60초 무통신마다 끊기고 stompjs가 3초 뒤 재연결한다.

## 23. 정원이 다 찬 모임이 계속 "모집중"으로 보인다 (2026-08-30 해결)

`BookClub.status`는 `createBookClub`에서 `PENDING`으로 저장된 뒤 **어디에서도 바뀌지 않았다.**
프론트(`src/api/api.js`의 `statusLabel`)는 `PENDING → "모집중"`으로 그리므로, 정원이 차든 모임이 끝나든
목록에는 영원히 "모집중"이 붙었다.

### 조치: `ClubStatus`에 `FULL`을 추가하고, 상태를 조회 시점에 계산한다

정원이 6명인 모임에 6명이 모이면 **그 즉시 "모집완료"로 보여야 한다**는 요구사항이다.
`BookClub.resolveStatus(now, currentMemberCount)`를 추가해 저장된 컬럼 대신 조회할 때마다 계산한다.

| 반환 값 | 조건 |
| --- | --- |
| `COMPLETED` | 지금이 종료(시작+30분) 15분 뒤를 지났다 |
| `IN_PROGRESS` | 시작 15분 전 ~ 위 시각 사이 |
| `FULL` | 아직 시작 전이고 `currentMemberCount >= memberCapacity` |
| `PENDING` | 그 외 |

시각 판정이 인원 판정보다 먼저다. 정원이 찬 모임도 시작 시각이 되면 "모임중"으로 넘어가야 하기 때문이다.
날짜/시간이 비어 있는 옛 모임은 시각을 계산할 수 없어 인원만 보고 `PENDING`/`FULL`을 정한다.

**별도 `full` boolean을 두지 않고 `status` 값 자체에 넣었다.** 프론트가
`full && status === "PENDING"` 같은 조합식을 쓰게 하는 대신, 상태 하나만 라벨로 바꾸면 되게 했다.
프론트가 `status`를 쓰는 곳은 `statusLabel` 하나뿐이고 `status === "PENDING"` 같은 분기 로직이
없어서(2026-08-30 `upstream/develop` `bfdb0815` 확인) 값 추가로 깨지는 코드가 없다.

"정원이 찼다"는 판정은 `BookClub.isFull()` 한 곳에서만 나오고 `joinBookClub`도 같은 메서드를 쓴다.
두 곳이 갈리면 "모집중으로 보이는데 누르면 409"가 된다.
`joinBookClub`의 종료 검사도 저장된 값 대신 `resolveStatus`를 쓴다(기존에는 `COMPLETED`가 된 적이
없어 지난 모임에도 가입이 됐다).

구간 상수(30/15/15)는 `ChatService`에 있던 것을 `BookClub`으로 옮겨 채팅 허용 구간과 상태 표시가
같은 값을 쓰게 했다. `ChatService.validateChatWindow`는 `getChatOpensAt()`/`getChatClosesAt()`을 부른다.

**DB의 `book_club.status` 컬럼은 여전히 `PENDING`으로 남는다.** 응답에서만 계산하므로 백필 SQL은 없다.
`FULL`은 저장되지 않는 값이라 `ddl-auto: update`가 건드릴 것도 없다.

### 프론트에 필요한 변경 (한 줄)

`src/api/api.js`의 `statusLabel`에 한 줄 추가. 응답 필드 구성은 그대로다.

```js
if (status === "FULL") return "모집완료";
```

없으면 문자열 `"FULL"`이 뱃지에 그대로 노출된다(`statusLabel`의 마지막 `return status`).

---

# 2026-09-13 AI 연동 3건 (남 프로필 독후감 / API 키 헤더 / 감정 태그)

## 22. 감정 태그는 `/api/analysis/emotion-tags`를 따로 불러야 한다

- 위치: `domain/book/service/BookNoteService.generateAiBookNote`
- 그동안 `ai_note.tags`가 항상 비어 있던 이유(21번 끝부분의 "남은 사실")가 확인됐다.
  `/api/review/generate`는 **원래부터 태그를 주지 않는 경로**다. 우리가 응답에 `tags`가
  딸려 올 것이라 가정하고 만들어 둔 것이고, AI 서버는 그렇게 만든 적이 없다.
- 2026-09-13 AI 담당자가 알려준 실제 구성은 경로 세 개다.

  | 경로 | 입력 | 출력 | 용도 |
  | --- | --- | --- | --- |
  | `/api/review/generate` | 구절·느낌 목록 | 독후감 본문 | "AI 독서록 생성" 버튼 |
  | `/api/analysis/emotion-tags` | **생성된 독후감 본문** | 감정 태그(2~4글자) | 책장에서 책을 눌렀을 때 |
  | `/api/preference/analyze` | 여러 독후감 | 취향 태그 + 한 줄 요약 | 마이페이지 성향 분석 |

- 조치: `generateAiBookNote`를 2단계로 바꿨다. 1단계로 본문을 받고, 그 본문을 그대로
  2단계(`analyzeEmotionTags`)에 넘겨 태그를 받아 `AINote`에 저장한다.
  응답 형식(`tags[]`)은 그대로라 **프론트 변경은 없다.**
- 실패 처리는 본문과 태그를 다르게 뒀다. 본문 실패는 503으로 올리고, 태그 실패는 로그만 남기고
  태그 없이 저장한다(3번에서 정한 방침). 이미 받아 둔 독후감까지 버리는 것이 사용자에게 더 손해다.
- `ReviewGenerateResponse.tags` 필드는 지우지 않고 남겨 뒀다. AI 서버가 나중에 함께 내려줘도 깨지지 않는다.
- **미검증 2건 — AI 담당자에게 확인 필요:**
  1. 요청 본문의 필드명. 지금은 `{ "review": "<본문>" }`로 보낸다. AI 서버가 `text` 같은 다른 이름을
     기대하면 422가 나고, 그러면 태그만 조용히 비게 된다(위 실패 처리 때문에 사용자에겐 안 보인다).
  2. 응답이 `{ "tags": [...] }` 형태인지.
- 참고: `/api/preference/analyze`(마이페이지 성향 분석)는 **아직 구현하지 않았다.** 요구사항이 나오면 별도 작업이다.

## 23. AI 서버로 나가는 요청에 `X-AI-API-KEY`가 없었다

- 위치: `BookNoteService.generateReview`, `ChatService.requestMeetingAssist`, `ChatConsumer.sendToAiAgent`
- AI 서버가 이 헤더를 필수로 요구하도록 바뀌었는데, 우리는 콜백을 **받을 때만** 이 키를 검사하고
  **보낼 때는** 붙이지 않았다. 세 곳 모두 `@Value("${ai.api-key}")`를 주입해 헤더에 넣었다.
- 진단을 어렵게 만든 지점: `AiServerException`이 잡는 `RestClientException`에는 연결 실패뿐 아니라
  AI 서버가 돌려준 4xx/5xx도 들어온다. 그래서 **401을 받아도 화면에는 "AI 서버에 연결할 수 없습니다"**가 뜬다.
  이 메시지를 네트워크 장애로 단정하면 안 된다. 실제 상태 코드는 `docker logs spring-app`에서 확인한다.
- 미검증: 배포 환경에서 실제로 200이 오는지. 컴파일만 확인했다.

## 24. 남의 AI 독후감 조회 엔드포인트 추가

- 프론트 요청으로 `GET /api/notes/books/{bookId}/members/{memberId}/ai-note`를 추가했다.
  기존 `GET /api/notes/books/{bookId}/ai-note`는 토큰 주인 것만 보므로 타인 프로필에 쓸 수 없었다.
- 응답 형식은 기존과 동일(`exists`, `aiNoteId`, `content`, `tags`, `edited`).
  없는 `memberId`는 400, 그 회원이 아직 안 만들었으면 `exists: false`로 200.
- **공개 범위 결정**: 팔로우 여부를 보지 않는다. 로그인만 했으면 누구나 남의 AI 독후감을 읽을 수 있다.
  비공개 기능이 필요해지면 `AINote`에 공개 여부 필드를 추가해야 한다.

---

# 2026-09-15 AI 호출이 HTTP/2 업그레이드 헤더 때문에 400으로 실패

## 25. AI 서버는 200을 남기는데 우리는 `400 Invalid HTTP request received.`를 받는다 (2026-09-15 원인 확인·수정, 배포 후 검증 필요)

- 위치: `global/config/RestTemplateConfig` (영향: `aiRestTemplate`을 쓰는 `BookNoteService.generateReview`·`analyzeEmotionTags`, `ChatService.requestMeetingAssist`)
- 증상: "AI 독서록 생성" 버튼이 503. `docker logs spring-app`에는 요청 후 **16ms 만에** 아래 에러가 찍힌다.
  그런데 같은 시각 **AI 서버 로그에는 200**이 남는다.

  ```
  HttpClientErrorException$BadRequest: 400 Bad Request on POST request for
  "http://13.125.223.216:8001/api/review/generate": "Invalid HTTP request received."
  ```

- 23번 미검증 항목(배포 환경에서 200이 오는지)의 답이 이것이었다. 키(`default-readly-key`)·주소·body는 문제가 없었다.
  EC2에서 같은 body로 `curl`을 보내면 200과 독후감이 정상으로 온다.
- 원인: Boot 3.5의 `new RestTemplateBuilder()`는 JDK `HttpClient`(`JdkClientHttpRequestFactory`)를 쓰고, 이 클라이언트는
  HTTP/2가 기본이라 `http://` 주소에 `Connection: Upgrade, HTTP2-Settings` / `Upgrade: h2c`를 붙여 보낸다.
  로컬에서 가짜 소켓 서버로 원문을 찍어 확인했다. uvicorn은 h2c를 지원하지 않아 요청은 처리(→ 200 로그)하면서도
  뒤에 남은 바이트를 새 요청으로 읽다 실패해 **즉시 400을 같은 연결로 보낸다.** 클라이언트는 먼저 온 400을 응답으로 받고,
  몇 초 뒤의 200(독후감)은 버려진다. curl은 업그레이드 헤더를 보내지 않아서 성공했다.
- 조치: `RestTemplateConfig.http11Builder()`에서 `HttpClient.Version.HTTP_1_1`로 고정하고 두 빈 모두 이걸 쓰게 했다.
  같은 방법으로 원문을 다시 찍어 업그레이드 헤더 3개가 사라진 것을 확인했다. body는 여전히 `Transfer-encoding: chunked`인데
  표준 HTTP/1.1이라 uvicorn이 처리한다. 알라딘은 https라 h2c 업그레이드 대상이 아니므로 영향이 없다.
- 교훈: 우리 쪽 4xx 로그와 상대 서버 로그가 어긋나면 **요청 원문**을 먼저 의심한다. `"Invalid HTTP request received."`는
  FastAPI가 아니라 uvicorn이 HTTP 파싱 단계에서 내는 문구다.
- 미검증: 배포 후 실제 버튼에서 200이 오는지. `/meeting/assist`도 같은 원인으로 실패하고 있었을 가능성이 높으니 함께 확인한다.

## 26. AI 독후감 생성이 정확히 10초 만에 타임아웃된다 (2026-09-15 원인 확인·수정, 배포 후 검증 필요)

- 위치: `global/config/RestTemplateConfig`
- 증상: 25번을 고친 뒤 짧은 독후감은 성공하지만, 오래 걸리는 책은 매번 실패한다. 로그의 시작(`AI API KEY ...`)과
  에러 사이가 두 번 모두 **정확히 10.0초**다. AI 전용 한도(120초)가 아니라 공용 빈 한도(10초)다.

  ```
  11:08:25.819 AI API KEY 길이=18 ...
  11:08:35.826 AI 서버 호출 실패 ... Caused by: java.net.http.HttpTimeoutException: Request cancelled
  ```

- 원인: 공용 `restTemplate`에 `@Primary`가 붙어 있었다. 스프링은 같은 타입 빈이 여럿이면 **`@Primary`를 필드(생성자 파라미터)
  이름보다 먼저** 본다. 그래서 `private final RestTemplate aiRestTemplate;`로 선언한 세 곳(`BookNoteService`, `ChatService`,
  `ChatConsumer`) 모두 10초짜리 빈을 받았다. 8843d334에서 빈을 나눈 뒤로 **한 번도 120초가 적용된 적이 없다.**
  그동안은 25번의 400이 16ms 만에 먼저 터져서 드러나지 않았다.
- 확인: 로컬에서 `RestTemplateConfig`만 올린 컨텍스트에 `aiRestTemplate`/`restTemplate` 필드를 가진 빈을 넣어 주입 대상을 비교했다.
  `@Primary`가 있을 때는 둘 다 `restTemplate`, 없앤 뒤에는 각자 이름대로 주입됐다.
- 조치: `@Primary`를 제거했다. 이제 이름으로만 고르고, 두 빈 이름 어느 쪽과도 맞지 않는 `RestTemplate` 필드는 기동 시점에 실패한다
  (조용히 엉뚱한 빈을 받는 것보다 낫다). 현재 주입 지점은 알라딘 1곳(`restTemplate`)과 AI 3곳(`aiRestTemplate`)뿐이다.
- 미검증: 배포 후 오래 걸리는 책("생각의 도약")에서 10초를 넘겨도 성공하는지. 120초를 넘기면 그때는 AI 서버 쪽 지연을 봐야 한다.

---

# 2026-09-15 채팅 누락 메시지 (알고 있는 한계)

## 27. 채팅방에 있는 채로 연결이 끊겼다 붙으면, 끊긴 동안의 메시지가 새로고침 전까지 안 보인다 (2026-09-15 확인 · 프론트 개선 과제, 보류)

- 위치(프론트): 부모 저장소 `yeonjaeae/READLY_SM_FinalProject`의 `develop` 브랜치(`96433e19`, 2026-09-12 기준)
  `src/pages/MeetingRoom.js`, `src/api/chatSocket.js`
- 배경: 채팅은 **저장**(Redis, 접속 여부와 무관하게 전부 저장)과 **배달**(STOMP, 그 순간 구독 중인 연결에만 전송)이 따로 움직인다.
  STOMP는 구독 이후 메시지만 보내므로, 놓친 메시지는 `GET /api/book-clubs/{clubId}/chats`로 다시 받아 합쳐야 한다. 백엔드는 이미 준비돼 있다.
- 지금 되는 것: `MeetingRoom.js`가 화면에 들어올 때마다 `getChatHistory`를 부르므로, **페이지를 나갔다 다시 입장 / 새로고침 /
  브라우저 재시작 / 재로그인** 후에는 이전 메시지와 없는 동안 올라온 메시지가 모두 보인다.
- 안 되는 것:
  1. **재연결 시 이력 재조회 없음.** `chatSocket.js`는 `reconnectDelay: 3000`으로 자동 재연결·재구독하지만, 이력은 입장 시 한 번만 부른다.
     네트워크 순단, 폰 화면 꺼짐·앱 전환, **서버 배포(모든 연결이 끊긴다)** 때 끊긴 동안의 메시지가 빠진 채로 대화가 이어진다.
     사용자는 끊긴 줄 모르므로 누락을 알아챌 방법이 없다.
  2. **입장 순간 경쟁 상태.** 이력 조회 `useEffect`와 소켓 연결 `useEffect`가 동시에 따로 시작된다. 이력이 먼저 오고 구독이 늦으면
     그 사이(1초 안팎) 메시지가 빠지고, 실시간 메시지가 먼저 오면 늦게 온 이력의 `setMessages(...)`가 목록을 통째로 덮어써 사라진다.
     실시간 메시지는 `messageId` 확인 없이 뒤에 붙이기만 해서 중복 표시될 수도 있다.
  3. (참고) `connectHeaders`의 토큰을 클라이언트 생성 시 한 번만 넣어, 토큰 만료 후 끊기면 만료 토큰으로 3초마다 재연결을 반복하며
     조용히 실패한다. 리프레시 토큰이 없어 이 경우는 재로그인이 필요하다(액세스 토큰은 같은 날 1시간 → 2시간으로 늘렸다).
- 결정: **당장은 이대로 둔다.** 30분짜리 모임이라 PC 웹 기준으로는 드물다. 대신 운영 수칙 두 가지를 지킨다.
  - **모임 진행 중에는 `backend`에 push(배포)하지 않는다.**
  - 테스트·시연 중 메시지가 이상하면 새로고침한다.
  폰 사용자가 늘거나 시연을 앞두면 그 전에 아래를 반영한다. 리프레시 토큰은 도입하지 않기로 했다.
- 프론트 수정 방향(백엔드 변경 없음): **`onConnect`마다(구독 직후) 이력을 다시 불러와 `messageId`로 합치고 `createdAt`으로 정렬**한다.
  `createChatClient`는 이미 subscribe 후 `onConnect`를 부르므로 순서가 자연스럽게 맞고, 입장·재연결·배포 복구가 한 번에 해결된다.

  ```js
  const mergeMessages = (prev, incoming) => {
    const map = new Map(prev.map((m) => [m.id, m]));
    incoming.forEach((m) => map.set(m.id, m));
    return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  };
  // mapServerMessage에 createdAt: m.createdAt 추가
  // onMessage: (body) => setMessages((prev) => mergeMessages(prev, [mapServerMessage(body)]))
  // onConnect: async () => {
  //   const data = await getChatHistory(roomId);
  //   setMessages((prev) => mergeMessages(prev, (data || []).map(mapServerMessage)));
  // }
  // chatSocket.js: beforeConnect: () => { client.connectHeaders = { Authorization: `Bearer ${getToken()}` }; }
  ```

- 백엔드만으로 못 고치는 이유: 서버는 어느 연결이 언제부터 끊겼고 무엇을 놓쳤는지 모르고, 화면 목록은 프론트 상태다.
  "구독 시 서버가 이력을 사용자에게 밀어주기"도 가능하지만 프론트가 그걸 받아 합치는 코드가 똑같이 필요해 이점이 없다.
