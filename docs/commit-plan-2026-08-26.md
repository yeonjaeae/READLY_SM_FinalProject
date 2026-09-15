# 커밋 분리 계획 (2026-08-26 작업분)

작업 트리에 쌓인 변경을 의미 단위로 나눈 것이다. 커밋은 직접 하고, 아래는 순서와 메시지 초안이다.
`CLAUDE.md`는 `.gitignore` 대상이라 어떤 커밋에도 들어가지 않는다.

`src/main/resources/application.yaml`은 여러 주제에 걸쳐 수정돼 있다. 아래 1·6·7·9번이 각각
다른 블록을 건드리므로, 정확히 나누려면 `git add -p`로 해당 hunk만 골라야 한다.
번거로우면 yaml 변경 전체를 9번(설정 커밋) 하나로 몰아도 된다.

---

## 1. Kafka 제거, Redis Pub/Sub 전환

```
refactor(chat): 채팅 브로커를 Kafka에서 Redis Pub/Sub으로 교체

프로듀서와 컨슈머가 같은 애플리케이션이고 토픽 로그를 다시 읽는 코드도 없어서
브로커를 두는 이점이 없었다. 배포 환경의 kafka 설정 블록이 spring: 밖에 있어
무시되던 문제도 함께 해소된다.

- ChatProducer: KafkaTemplate.send -> RedisTemplate.convertAndSend
- ChatConsumer: @KafkaListener -> MessageListener (처리 3단계는 그대로)
- RedisSubConfig 추가: 리스너 컨테이너 + ChatMessage 전용 JSON 직렬화
  (createdAt이 LocalDateTime이라 JavaTimeModule 등록이 필수)
- build.gradle에서 spring-kafka, spring-kafka-test 제거
- application.yaml의 최상위 kafka 블록 제거

REST/STOMP 계약은 그대로라 프론트 변경은 없다.
```

대상: `build.gradle`, `application.yaml`(kafka 블록), `ChatProducer.java`, `ChatConsumer.java`(리스너 부분),
`RedisSubConfig.java`(신규), `ChatMessage.java`(주석), `ChatService.java`(주석)

## 2. AI 자동 개입 호출 비활성화

```
fix(chat): AI 자동 개입 호출을 임시 비활성화

배포된 AI 서버에 /api/ai/chat 경로가 없어 채팅 한 건마다 404 응답과
스택 트레이스가 로그에 쌓였다. 호출부만 주석 처리하고 sendToAiAgent와
DTO는 그대로 남겨 뒀다. AI 서버가 해당 경로를 제공하면 주석만 풀면 된다.

현재 AI가 말하는 경로는 방장이 호출하는 /meeting/assist 하나뿐이다.
```

대상: `ChatConsumer.java`

## 3. 모임 목록 인원수 N+1 제거

```
perf(bookclub): 모임 목록의 인원수 조회를 쿼리 한 번으로 통합

목록을 만드는 루프에서 모임마다 countByBookClubId를 불러 COUNT 쿼리가
모임 수만큼 나가고 있었다. GROUP BY 한 번으로 모아 Map으로 조회한다.

- MemberBookClubRepository.countByBookClubIds + ClubMemberCount 프로젝션 추가
- 가입자가 0명인 모임은 결과에 없으므로 읽는 쪽에서 0으로 채운다
- 응답 형식은 변화 없음
```

대상: `MemberBookClubRepository.java`, `BookClubService.java`

## 4. AI 독후감 요청 필드명 수정

```
fix(book): AI 독후감 생성 요청 필드명을 book_title로 수정

AI 서버가 snake_case를 요구하는데 bookTitle로 보내고 있어 422가 났고,
그 결과 AI 독후감 생성이 항상 503으로 실패했다. 채팅 쪽 MeetingAssistApiRequest와
같은 방식으로 @JsonProperty를 붙였다.

AI 서버 응답에는 tags가 없어 AINote.tags는 계속 비어 있다.
```

대상: `BookNoteDto.java`

## 5. 채팅방 활성화 시간 제한

```
feat(chat): 모임 시간대에만 채팅 전송을 허용

모임 시작 15분 전부터 종료(시작 +30분) 15분 후까지 60분 동안만 전송을 받는다.
판정은 백엔드에서만 하고 프론트나 AI 서버로 상태를 넘기지 않는다.

- ChatService.validateChatWindow 추가, 검사 위치는 sendMessage 한 곳
  (STOMP/AI 콜백/AI 응답이 모두 이 메서드를 지나 우회 경로가 없다)
- 조회는 제한하지 않는다. 종료 후에도 7일치 대화를 볼 수 있어야 한다
- STOMP는 예외를 던져도 클라이언트에 아무것도 가지 않으므로,
  @MessageExceptionHandler + @SendToUser("/sub/errors")로 보낸 사람에게 사유를 통보
- 날짜/시간이 비어 있는 과거 모임은 검사를 건너뛴다

프론트는 /user/sub/errors 구독이 필요하다 (docs/fe-handoff-2026-08-26.md).
```

대상: `ChatService.java`, `ChatController.java`, `ChatDto.java`

## 6. 채팅 보관(PostgreSQL) 및 삭제

```
feat(chat): Redis에서 만료된 채팅을 PostgreSQL로 이관하고 30일 후 삭제

Redis TTL 7일은 그대로 두고, 만료 시점에 chat_archive 테이블로 옮긴다.
삭제 기준은 보낸 시각이 아니라 보관 시각(archived_at)이다.

- ChatArchive(JPA) / ChatArchiveRepository / ChatArchiveService 추가
- RedisRepositoryConfig: @EnableRedisRepositories(enableKeyspaceEvents = ON_STARTUP)
  + @EnableScheduling. 키 만료 이벤트와 사본(phantom key)이 있어야
  사라진 값을 읽어 옮길 수 있다
- 보관 기간과 삭제 주기는 chat.archive.* 설정으로 조정

주의: CONFIG 명령이 막힌 관리형 Redis에서는 notify-keyspace-events를
서버 쪽에서 직접 켜야 한다. 앱이 꺼진 동안 만료된 메시지는 이관되지 않는다.
```

대상: `ChatArchive.java`, `ChatArchiveRepository.java`, `ChatArchiveService.java`,
`RedisRepositoryConfig.java`(모두 신규), `application.yaml`(chat.archive 블록)

## 7. AI 호출 타임아웃 연장

```
fix(ai): AI 호출 전용 RestTemplate을 분리하고 타임아웃 연장

기존에는 RestTemplate 하나를 알라딘과 AI가 공유해 응답 대기가 10초였다.
LLM 생성과 콜드 스타트가 겹치면 정상 응답도 타임아웃으로 실패한다.

- aiRestTemplate 빈 추가 (연결 10초 / 응답 120초, ai.*-timeout-seconds로 조정)
- 기존 restTemplate은 @Primary로 두고 3초/10초 유지
  (알라딘까지 늘리면 검색 장애에도 사용자가 2분을 기다린다)
- AI를 호출하는 ChatService, BookNoteService, ChatConsumer가 새 빈을 쓴다
  (주입은 필드 이름으로 구분한다)
```

대상: `RestTemplateConfig.java`, `ChatService.java`, `BookNoteService.java`, `ChatConsumer.java`,
`application.yaml`(ai 타임아웃)

## 8. 백필 스크립트 수정

```
chore(db): 백필 스크립트가 참조하는 테이블명을 ainote로 수정

AINote 엔티티에 @Table(name=...)이 없어 실제 테이블 이름은 ai_note가 아니라
ainote다. 스크립트가 ai_note를 참조하고 있어 isbn13 백필은 첫 SELECT에서
바로 실패했다. 실행해 본 적이 없어 드러나지 않았던 문제다.
```

대상: `db/2026-08-08-split-ainote-from-booknote.sql`, `db/2026-08-17-backfill-book-isbn13.sql`

## 9. DB 접속 URL 환경변수화

```
chore(config): datasource URL을 환경변수로 주입할 수 있게 변경

redis/ai/cors와 달리 datasource URL만 localhost로 하드코딩돼 있었다.
DB_URL로 주입하고 기본값은 로컬 주소를 유지한다.
```

대상: `application.yaml`(datasource), `README.md`의 환경변수 표

## 10. 문서

```
docs: 채팅 파이프라인 변경과 검증 결과 정리

- known-issues.md: 19번(Redis 전환) 해결·검증, 17번 해결, 20번 보류 처리,
  21번(AI 독후감 필드명) 추가, 백필 스크립트 실행 결과, 전 기능 검증 결과표
- api-spec.md: 채팅방 활성화 시간과 /user/sub/errors 추가
- fe-handoff-2026-08-26.md: 프론트 전달 사항 (필수 작업은 에러 채널 구독 1건)
- README.md: 기술 스택과 환경변수 표 갱신
```

대상: `docs/`(디렉터리 전체가 아직 untracked다), `README.md`

---

## 참고

- 순서는 1 → 10을 권장한다. 1번(브로커 교체)이 나머지 채팅 변경의 전제다.
- 8·9번은 독립적이라 언제 넣어도 된다.
- 백필 SQL은 **로컬 DB에만 실행했다.** 배포 DB에는 따로 실행해야 하고,
  isbn13 매핑은 그 DB의 진단 결과를 보고 새로 적어야 한다.