# FE(develop) ↔ BE(backend) 연동 대조

- 최초 확인일: 2026-08-20 / **재검토일: 2026-08-22**
- FE 소스: upstream(`yeonjaeae/READLY_SM_FinalProject`) `develop` 브랜치 `c19737f9`(2026-08-21 21:43)
- BE 소스: 이 레포 `backend` 브랜치
- 재검토 결과: **엔드포인트 경로 불일치는 전부 해소됐다.** 남은 것은 경로가 아니라 동작·응답 형식 문제다.

## 1. 이전 결론("일치 0개")이 왜 나왔나

프론트 쪽에서 "이미 개발한 기능인데 왜 없다고 했느냐"는 지적이 있어 근거를 다시 확인했다.

- 2026-08-20 대조 시점의 `develop` HEAD는 `52d609b8`(2026-08-19 16:04, "백엔드 연동 로직 마련")이었다.
  그 커밋의 `src/api/api.js`에는 실제로 `/api/auth/login`, `/api/auth/signup`, `/api/rooms`가 들어 있다
  (`git show 52d609b8:src/api/api.js`로 확인 가능).
- 그 뒤 프론트가 두 번에 걸쳐 백엔드 명세에 맞춰 다시 작성했다.
  - `3343c825` (2026-08-20 17:39) "백엔드 프론트엔드 엔드 포인트 맞춤"
  - `c19737f9` (2026-08-21 21:43) "백엔드 프론트엔드 엔드 포인트 맞춤&프론트엔드 없던 부분 추가"
- 현재 `api.js` 첫머리에 `★ 백엔드 API 명세 기준 (backend 브랜치, 2026-08-20)`이라고 적혀 있다.
  우리가 만든 `docs/api-spec.md`를 보고 맞춘 결과물이다.

**정리**: 이전 결론은 "프론트가 기능을 안 만들었다"는 뜻이 아니라, 화면 기능은 다 있는데 호출 경로가
자체 추정 스펙이었다는 뜻이었다. 그리고 그 지적은 `52d609b8` 스냅샷 기준으로는 사실이었다.
프론트가 08-20/08-21 커밋으로 이미 고쳤으므로 **이 문서의 옛 대조표는 폐기한다.**

## 2. 현재 경로 대조 (전부 일치)

| 기능 | FE 호출 | BE 엔드포인트 | 상태 |
| --- | --- | --- | --- |
| 회원가입 | `POST /api/members/signup` `{loginId,email,password}` | 동일 | 일치 |
| 로그인 | `POST /api/members/login` → `{memberId,accessToken}` | 동일 | 일치 |
| 팔로워/팔로잉 목록 | `GET /api/members/{id}/followers`, `/followings` | 동일 | 일치 |
| 팔로우 | `POST /api/members/{followingId}/follow` | 동일 | 일치 |
| 프로필 수정 | `PATCH /api/members/me/profile` | 동일 | 일치 |
| 인기 도서 | `GET /api/books/popular` | 동일 | 일치 |
| 내 읽은 책 | `GET /api/books/my-list` | 동일 | 일치 |
| 도서 검색 | `GET /api/books/search?keyword=` | 동일 | 일치 |
| 도서 등록 | `POST /api/books` `{isbn13}` | 동일 | 일치 |
| 내 목록 담기 | `POST /api/books/{bookId}/my-list` | 동일 | 일치 |
| 모임 목록 | `GET /api/book-clubs` | 동일 | 일치(단 §3-4 참고) |
| 내 모임 목록 | `GET /api/book-clubs/my-list` | 동일 | 일치 |
| 모임 상세 | `GET /api/book-clubs/{clubId}` | 동일 | 일치 |
| 모임 생성 | `POST /api/book-clubs` `{name,bookId,date,time,maxCapacity,type}` | 동일 | 일치 |
| 모임 가입 | `POST /api/book-clubs/{clubId}/join` | 동일 | 일치 |
| 독서록 작성/조회 | `POST` · `GET` `/api/notes/books/{bookId}` | 동일 | 일치 |
| AI 독서록 조회 | `GET /api/notes/books/{bookId}/ai-note` | 동일 | 일치 |
| AI 독서록 생성 | `POST /api/notes/books/{bookId}/ai-generate` | 동일 | 일치 |
| AI 독서록 수정 | `PATCH /api/notes/ai-notes/{aiNoteId}` | 동일 | 일치 |
| 채팅 이력 | `GET /api/book-clubs/{clubId}/chats` | 동일 | 일치 |
| AI 진행자 개입(방장) | `POST /api/book-clubs/{clubId}/ai-assist` `{mode}` | `POST /api/book-clubs/{clubId}/meeting/assist` `{mode}` | 본문은 이미 일치. **FE 경로 한 줄 수정 필요**(§3-5) |
| 참여자 AI 개입 | `requestMeetingAssist(clubId)` (호출하는 화면 없음) | 삭제 — 이제 방장 전용 | 죽은 코드라 영향 없음(§3-5) |
| 실시간 채팅 | STOMP `/ws/chat`, SUB `/sub/chat/clubs/{id}`, PUB `/pub/chat/clubs/{id}` | 동일 | 프리픽스는 일치, 연결 불가(§3-2) |

enum 값(`PASSIONATE`/`MODERATE`/`CALM`, `PENDING`/`IN_PROGRESS`/`COMPLETED`), `role: "HOST"|"PARTICIPANT"`,
`AI_MEMBER_ID = 999`도 FE 쪽 상수와 일치한다.

## 3. 지금 연결하면 실제로 깨지는 것 (BE 수정 필요)

### 3-1. CORS 설정이 아예 없음 — 2026-08-22 해결 (known-issues #12)

- 위치: `global/config/SecurityConfig.java`
- FE는 `http://localhost:3000`, BE는 `http://localhost:8080`. `.cors(...)` 설정도, `@CrossOrigin`도,
  `WebMvcConfigurer#addCorsMappings`도 코드 전체에 없다(`grep -i cors` 결과 0건).
- 결과: 브라우저에서 **로그인부터 모든 요청이 CORS로 차단**된다. Postman으로만 되는 상태.
  `Authorization` 헤더를 붙이므로 GET조차 preflight(OPTIONS)를 탄다.
- 조치: `SecurityConfig`에 `CorsConfigurationSource` 빈을 만들어 `http.cors(...)`에 물렸다.
  허용 출처는 `cors.allowed-origins`(`${CORS_ALLOWED_ORIGINS:http://localhost:3000}`)로 주입한다.
  preflight는 `CorsFilter`가 체인 앞단에서 직접 응답하므로 OPTIONS를 permitAll 하지 않았다.
  자세한 내용은 known-issues #12.

### 3-2. WebSocket 엔드포인트가 SockJS 전용 — 2026-08-22 해결 (known-issues #13)

- 위치: `global/config/WebSocketConfig.java` — `registry.addEndpoint("/ws/chat")...withSockJS()` 하나뿐이다.
- FE `src/api/chatSocket.js`는 `@stomp/stompjs`의 `brokerURL: ws://localhost:8080/ws/chat`로 **순수 WebSocket**을 연다.
  SockJS 엔드포인트는 순수 소켓 경로가 `/ws/chat/websocket`이라, 지금 FE 코드로는 핸드셰이크가 실패한다.
- 조치: SockJS 엔드포인트를 남기고 순수 WebSocket 엔드포인트를 같은 경로에 하나 더 등록했다.
  두 등록의 URL 키가 `"/ws/chat"`과 `"/ws/chat/**"`로 갈려 충돌하지 않는다(자세한 근거와 주의점은 known-issues #13).
  허용 출처도 `cors.allowed-origins`로 통일했다.

### 3-3. STOMP로 브로드캐스트되는 메시지 형식이 이력 조회와 다름 — 2026-08-22 해결 (known-issues #14)

- 위치: `domain/chat/service/ChatConsumer.java` — `messagingTemplate.convertAndSend(..., message)`로
  `ChatMessage` **엔티티 원본**을 그대로 보낸다. 즉 `{id, clubId, memberId, content, createdAt}`.
- FE `MeetingRoom.js`의 `mapServerMessage`는 이력 조회 응답과 같은 형식
  `{messageId, memberId, senderName, content, createdAt}`을 기대한다.
- 결과: 실시간으로 도착한 메시지만 **보낸 사람 이름이 비고(`senderName` 없음), React key도 undefined**가 된다.
  새로고침해서 이력으로 다시 받으면 정상으로 보이는, 헷갈리는 증상이다.
- 조치: 컨슈머가 `chatService.toHistoryItem(message)`로 변환해 발행한다.
  응답 조립은 `ChatService`의 private 헬퍼 한 곳에만 두어 이력 조회와 공유한다(known-issues #14).

### 3-4. `GET /api/book-clubs`의 `role`이 항상 null → 이미 가입한 모임에 재입장 불가 — 2026-08-22 해결 (known-issues #15)

- 위치: `domain/book/service/BookClubService.getHomeBookClubs()` — `role`에 `null`을 고정으로 넣는다.
- FE `Community.js`의 `handleJoin`은 `if (!meeting.role) await joinBookClub(...)`으로 판단한다.
  `role`이 항상 null이므로 **이미 가입한 모임을 눌러도 join을 다시 호출**하고, BE는 409(이미 가입)를 준다.
  FE는 그 메시지를 alert으로 띄우고 입장을 막는다. 즉 자기가 만든 모임에도 못 들어간다.
- 원래 null로 둔 이유는 "모임마다 가입 여부를 확인하면 쿼리가 모임 수만큼 늘어난다"였는데,
  `MemberBookClubRepository.findAllByMemberIdWithBookClub(memberId)` 한 번으로 내가 가입한 clubId 집합을
  만들어 두면 추가 쿼리는 1회뿐이다.
- 조치: `getHomeBookClubs(memberId)`가 가입한 모임에는 실제 역할(`host_id`와 비교해 HOST/PARTICIPANT)을,
  미가입 모임에는 null을 채운다. 컨트롤러가 `@AuthenticationPrincipal Long memberId`를 받는다.
  검토했지만 택하지 않은 안("가입하면 무조건 PARTICIPANT")과 남은 한계는 known-issues #15에 적어 뒀다.

### 3-5. `/meeting/assist`는 항상 503 — 2026-08-22 해결, 단 **FE 수정 필요** (known-issues #11)

- 형식만 맞추는 대신 **AI 호출 엔드포인트를 하나로 합쳤다.** `/meeting/assist`만 남기고 `/ai-assist`는 삭제했다.
- 남은 엔드포인트는 **방장 전용**이고, 요청 본문으로 `{ "mode": "question" | "summary" }`를 받는다.
  AI 서버로는 `{ book_title, chat_history: [{ speaker, text }], mode }` 형식으로 나가고,
  응답은 채팅방에 AI 이름으로 발행되어 STOMP 구독으로 도착한다.
- **프론트가 고쳐야 하는 것은 경로 한 줄뿐이다.** 방장 버튼은 이미 `{ mode: "question" }`을 보내고 있어
  화면 코드(`MeetingRoom.js`)는 그대로 둬도 된다.
  - `api.js`의 `requestHostAiAssist` 안에서 `/ai-assist` → `/meeting/assist`로 경로만 교체(함수명 유지 가능).
  - `requestMeetingAssist(clubId)`는 부르는 화면이 없는 죽은 export다. 본문 없이 호출하면 이제 400이므로 삭제 권장.

## 4. FE가 화면은 만들었지만 BE에 API가 없던 것 — 2026-08-22 추가됨 (known-issues #16)

프로필 이미지를 제외하고 전부 추가했다. **FE가 이제 이 엔드포인트들을 붙이면 된다.**

| 필요했던 것 | FE 위치 | 추가된 엔드포인트 |
| --- | --- | --- |
| 내 프로필 조회 | `Profile.js` | `GET /api/members/me` → `{ memberId, nickname, email, introduction, followerCount, followingCount }` |
| 타인 프로필 조회 | `OtherProfile.js` | `GET /api/members/{memberId}` → `{ memberId, nickname, introduction, followerCount, followingCount, isFollowing }` (이메일 미포함) |
| 언팔로우 | `OtherProfile.js` | `DELETE /api/members/{followingId}/follow` → 200, 본문 없음 |
| 타인의 읽은 책 목록 | `OtherProfile.js` | `GET /api/books/members/{memberId}/list` → my-list와 같은 형식 |
| 프로필 이미지 | `Profile.js`, `OtherProfile.js` | **보류.** `Member`에 이미지 컬럼이 없고 파일 업로드·저장소 결정이 필요하다 |

- `followerCount`/`followingCount`는 서버가 `Follow` 행을 세어 내려주므로, 팔로워/팔로잉 목록을 따로 불러
  `length`를 세던 임시 처리를 없앨 수 있다.
- `isFollowing`이 생겼으므로 팔로우 버튼을 `POST`/`DELETE` 토글로 만들 수 있다.
  새로고침해도 상태가 유지된다.

OCR 교정(`POST /api/ocr/correct`)은 **더 이상 필요 없다.** FE가 Tesseract를 브라우저에서 직접 돌리고
사용자가 textarea에서 고치는 방식으로 바꿨다(`AIWrite.js` 주석에 명시). BE 작업 대상에서 제외한다.

## 5. 백엔드 작업 현황 (2026-08-22 기준)

| # | 항목 | 상태 |
| --- | --- | --- |
| 1 | CORS 설정 (§3-1) | 완료 |
| 2 | 순수 WebSocket 엔드포인트 추가 (§3-2) | 완료 |
| 3 | 브로드캐스트 payload를 `HistoryItem`으로 통일 (§3-3) | 완료 |
| 4 | 홈 목록 `role` 채우기 (§3-4) | 완료 |
| 5 | AI 호출 엔드포인트 통합 (§3-5) | 완료 — **FE 경로 한 줄 수정 필요** |
| 6 | 내/타인 프로필 조회, 언팔로우, 타인 책장 (§4) | 완료 |
| 7 | 프로필 이미지 (§4) | 보류 — 기획 확정 후 |

전부 `compileJava`까지만 확인했고, 실제 브라우저·소켓 왕복 검증은 아직이다.
프론트를 로컬에서 띄워 로그인 → 모임 입장 → 채팅 한 번이면 1·2·3·4가 한꺼번에 확인된다.

### FE가 해야 할 일

1. `api.js`의 `requestHostAiAssist` 경로를 `/ai-assist` → `/meeting/assist`로 교체 (§3-5).
2. 죽은 `requestMeetingAssist(clubId)` export 삭제 (§3-5).
3. §4의 새 엔드포인트 4개를 `api.js`에 추가하고 `Profile.js`/`OtherProfile.js`의 임시 처리를 걷어내기.
