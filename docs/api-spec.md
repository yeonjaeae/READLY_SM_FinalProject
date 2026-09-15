# READLY API 명세서

- 기준 브랜치: `backend` — 커밋 `a0cc58a0` + 2026-08-23 문서 대조에서 나온 수정분(회원가입/로그인 입력값 검증, 검색어 누락 처리)
- 최종 갱신: 2026-08-23
- 소스: `domain/*/controller/*.java`, `domain/*/dto/*Dto.java`
- 코드에서 그대로 추출한 **현재 구현 기준** 명세다. 기획 문서가 아니라 실제 동작이다.
- Base URL: 로컬 `http://localhost:8080` (배포 주소는 별도 공유)

## 공통 사항

- 인증 방식: `Authorization: Bearer <accessToken>` 헤더. 인증 성공 시 서버가 쓰는 사용자 식별자는 토큰에서 꺼낸 `memberId`(Long)이며, 요청 바디로 `memberId`를 받는 API는 없다(사칭 방지).
- 인증 불필요(permitAll) 엔드포인트: `POST /api/members/signup`, `POST /api/members/login`, `POST /api/book-clubs/{clubId}/chats`(AI 콜백 전용).
- `ResponseEntity<Void>` 응답: 상태 200, 바디 없음.
- `ResponseEntity<Long>` 응답: 상태 200, 바디는 객체로 감싸지 않은 순수 숫자(JSON number). 예: `5`.

### CORS

- 허용 출처는 환경변수 `CORS_ALLOWED_ORIGINS`로 주입한다. 기본값은 `http://localhost:3000`이고, 콤마로 여러 개를 넣을 수 있다.
- 패턴 매칭이라 `https://*.vercel.app` 같은 미리보기 도메인도 와일드카드로 받는다.
- 허용 메서드: `GET` / `POST` / `PATCH` / `DELETE` / `OPTIONS`. 허용 헤더: 전체(`Authorization`, `X-AI-API-KEY` 포함).
- preflight(`OPTIONS`) 응답은 1시간 캐시된다. 프론트가 따로 처리할 것은 없다.
- **`allowCredentials`는 꺼져 있다.** 토큰은 쿠키가 아니라 `Authorization` 헤더로만 보낸다. 프론트에서 `withCredentials: true`를 켜면 CORS 오류가 난다.
- WebSocket 핸드셰이크(`/ws/chat`)도 같은 출처 목록을 쓴다.

### 공통 에러 코드

> `GlobalExceptionHandler` 기준. 에러 응답 바디 형식: `{ "message": "..." }`

| HTTP 상태 | 발생 조건 |
| --- | --- |
| 400 | `IllegalArgumentException`(잘못된 요청 값, 없는 리소스 id) 또는 `@Valid` 검증 실패(필드별 메시지 포함) |
| 401 | AI 콜백(`X-AI-API-KEY` 불일치) |
| 403 | 인증은 됐으나 권한 없음(`ForbiddenException`) — 예: 남의 AI 독서록 수정 시도 |
| 403(Security) | JWT 없음/무효 |
| 409 | `IllegalStateException` — 상태 충돌(중복 가입, 정원 초과, 방장 미지정 등) |
| 503 | `AiServerException` — AI 서버 연결 실패/타임아웃/오류 |
| 500 | 그 외 모든 예외. 메시지는 항상 `"서버 내부 오류가 발생했습니다."`로 고정이며 내부 사유는 노출하지 않는다 |

---

## 1. 회원 (`/api/members`)

### [POST] /api/members/signup

- 설명: 회원가입
- 인증: 불필요

**Request Body**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| loginId | String | Y | 로그인 아이디 (공백 불가) |
| email | String | Y | 이메일 (공백 불가, `@` 형식 검증) |
| password | String | Y | 비밀번호 (공백 불가) |

```json
{
  "loginId": "readly01",
  "email": "readly01@example.com",
  "password": "string"
}
```

**Response Body** — 생성된 `memberId` (순수 숫자, 객체로 감싸지 않음)

```json
5
```

> 400(검증): 값이 비었거나 이메일 형식이 아니면 `"loginId: 아이디는 필수입니다."`처럼 `필드명: 사유` 형태로 내려간다. 여러 개면 콤마로 이어진다
> 400(중복): `"이미 사용 중인 이메일입니다."` / `"이미 사용 중인 아이디입니다."`
> 닉네임은 요청에 없다. 가입 시 `loginId`와 같은 값으로 자동 설정되고, 이후 프로필 수정에서 바꾼다

---

### [POST] /api/members/login

- 설명: 로그인, 성공 시 JWT 발급
- 인증: 불필요

**Request Body**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| email | String | Y | 이메일 |
| password | String | Y | 비밀번호 |

```json
{ "email": "readly01@example.com", "password": "string" }
```

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| memberId | Long | 로그인한 회원 id |
| accessToken | String | JWT |

```json
{ "memberId": 5, "accessToken": "eyJhbGciOiJIUzI1NiJ9..." }
```

> 400(검증): 이메일/비밀번호가 비어 있으면 `"email: 이메일은 필수입니다."` 형태
> 400(인증 실패): `"가입되지 않은 이메일입니다."` / `"비밀번호가 일치하지 않습니다."` — 로그인 실패는 401이 아니라 **400**이다
> 토큰 유효기간은 `jwt.access-token-validity-in-seconds` 설정을 따르며, 리프레시 토큰은 없다

---

### [GET] /api/members/me

- 설명: 마이페이지에서 보여줄 내 프로필
- 인증: 필요 (조회 대상은 토큰의 `memberId`)
- `followerCount`/`followingCount`는 `Follow` 행을 실제로 세어 내려준다. 프론트가 팔로워/팔로잉 목록을 따로 불러 `length`를 세지 않아도 된다

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| memberId | Long | 내 회원 id |
| nickname | String | 닉네임 (가입 시 초기값은 로그인 아이디) |
| email | String | 이메일 |
| introduction | String | 자기소개 (없으면 null) |
| followerCount | Long | 나를 팔로우하는 사람 수 |
| followingCount | Long | 내가 팔로우하는 사람 수 |

```json
{
  "memberId": 5,
  "nickname": "책벌레",
  "email": "reader@example.com",
  "introduction": "소설 좋아함",
  "followerCount": 12,
  "followingCount": 7
}
```

---

### [GET] /api/members/{memberId}

- 설명: 다른 회원의 프로필
- 인증: 필요
- **이메일은 내려주지 않는다.** 대신 요청한 회원이 이미 팔로우 중인지를 `isFollowing`으로 준다

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| memberId | Long | Y | 조회 대상 회원 id |

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| memberId | Long | 대상 회원 id |
| nickname | String | 닉네임 |
| introduction | String | 자기소개 (없으면 null) |
| followerCount | Long | 대상을 팔로우하는 사람 수 |
| followingCount | Long | 대상이 팔로우하는 사람 수 |
| isFollowing | Boolean | 내가 이 회원을 팔로우 중인지 |

```json
{
  "memberId": 3,
  "nickname": "독서왕",
  "introduction": "고전 위주로 읽어요",
  "followerCount": 4,
  "followingCount": 9,
  "isFollowing": false
}
```

> 400: 존재하지 않는 회원

---

### [GET] /api/members/{memberId}/followers

- 설명: 그 회원을 팔로우하는 사람 목록
- 인증: 필요
- 경로의 `memberId`는 본인·타인 모두 가능하다. 인증만 되어 있으면 타인 프로필 화면에서도 그대로 쓸 수 있다

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| memberId | Long | Y | 조회 대상 회원 id |

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| memberId | Long | 팔로워의 회원 id |
| nickname | String | 팔로워 닉네임 |
| introduction | String | 팔로워 자기소개 |

```json
[
  { "memberId": 3, "nickname": "책벌레", "introduction": "소설 좋아함" }
]
```

---

### [GET] /api/members/{memberId}/followings

- 설명: 그 회원이 팔로우하는 사람 목록
- 인증: 필요
- 응답 형식은 `/followers`와 동일(`memberId`, `nickname`, `introduction` 배열). 마찬가지로 타인의 목록도 조회된다

---

### [POST] /api/members/{followingId}/follow

- 설명: 팔로우하기. 팔로우 주체는 토큰의 `memberId`로 고정되며 경로/바디로 지정 불가(사칭 방지)
- 인증: 필요

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| followingId | Long | Y | 팔로우할 대상 회원 id |

**Response Body**: 없음 (200)

> 400: 자기 자신을 팔로우, 또는 존재하지 않는 회원
> 409: 이미 팔로우 중

---

### [DELETE] /api/members/{followingId}/follow

- 설명: 팔로우 취소. 경로는 팔로우와 같고 HTTP 메서드만 다르다
- 인증: 필요 (취소 주체는 토큰의 `memberId`)

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| followingId | Long | Y | 팔로우를 취소할 대상 회원 id |

**Response Body**: 없음 (200)

> 409: 팔로우하지 않은 사용자

---

### [PATCH] /api/members/me/profile

- 설명: 내 프로필 수정 (본인만 가능, 로그인 아이디는 여기서 변경 불가)
- 인증: 필요
- 보내지 않은(`null`) 필드는 기존 값을 유지한다. 부분 수정만 가능하다
- `nickname`은 빈 문자열/공백만 보내면 무시된다(기존 닉네임 유지). `introduction`은 빈 문자열이면 빈 값으로 저장된다
- 즉 **닉네임을 지우는 것은 불가능**하고, 소개글은 `""`를 보내면 지울 수 있다

**Request Body**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| nickname | String | N | 닉네임 |
| introduction | String | N | 자기소개 |

```json
{ "nickname": "새닉네임", "introduction": "새 소개글" }
```

**Response Body**: 없음 (200)

---

## 2. 도서 (`/api/books`)

- 도서 등록 흐름은 **검색 → 선택 → 등록** 고정이다. 수기 입력(제목/저자 직접 입력)은 지원하지 않는다.

### [GET] /api/books/popular

- 설명: 홈 화면 인기 도서 1건
- 인증: 필요

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| name | String | 책 제목 |
| coverImageUrl | String | 표지 이미지 URL |

```json
{ "name": "데미안", "coverImageUrl": "https://.../cover.jpg" }
```

> 400: 등록된 책이 한 권도 없으면 `"등록된 책이 없습니다."` — 홈 첫 진입에서도 날 수 있으니 프론트에서 방어해야 한다

---

### [GET] /api/books/my-list

- 설명: 내가 읽은 책 목록 (마이페이지)
- 인증: 필요

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| bookId | Long | 책 id |
| name | String | 책 제목 |
| coverImageUrl | String | 표지 이미지 URL |

```json
[
  { "bookId": 1, "name": "데미안", "coverImageUrl": "https://.../cover.jpg" }
]
```

---

### [GET] /api/books/members/{memberId}/list

- 설명: 다른 회원이 읽은 책 목록 (타인 프로필 화면의 책장)
- 인증: 필요
- 응답 형식은 `/api/books/my-list`와 동일하다 (`bookId`, `name`, `coverImageUrl` 배열)

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| memberId | Long | Y | 조회 대상 회원 id |

---

### [GET] /api/books/search

- 설명: 제목으로 책 검색 (알라딘 ItemSearch). **아무것도 저장하지 않음.** 응답의 `isbn13`을 그대로 등록 요청에 사용
- 인증: 필요
- 한 번에 최대 **20건**을 반환한다. 검색 결과가 없으면 오류가 아니라 빈 배열 `[]`

**Query Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| keyword | String | Y | 검색어(책 제목) |

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| isbn13 | String | ISBN13 |
| name | String | 책 제목 |
| writer | String | 저자 |
| coverImageUrl | String | 표지 이미지 URL |

```json
[
  { "isbn13": "9788937460449", "name": "데미안", "writer": "헤르만 헤세", "coverImageUrl": "https://.../cover.jpg" }
]
```

> 400: `keyword`가 비어 있거나 파라미터 자체가 없으면 `"검색어를 입력해 주세요."`
> 409: 알라딘이 오류 코드를 돌려주거나 응답이 비어 있음/해석 불가
> 503: 알라딘 서버 연결 실패·타임아웃 → `"외부 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."`

---

### [POST] /api/books

- 설명: 검색 결과에서 고른 책을 DB에 등록(이미 있으면 재사용, 없으면 알라딘 ItemLookUp으로 서지정보 조회 후 저장)
- 인증: 필요
- 제목/저자/표지 등은 클라이언트가 보내지 않는다. 전부 알라딘에서 다시 조회한다(수기 입력 경로 차단)

**Request Body**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| isbn13 | String | Y | 등록할 책의 ISBN13 (공백 시 400) |

```json
{ "isbn13": "9788937460449" }
```

**Response Body**: 등록/재사용된 `bookId` (순수 숫자)

```json
1
```

> 400: `isbn13`이 비어 있을 때 → `"isbn13: isbn13은 필수입니다."` / 알라딘에 없는 ISBN → `"알라딘에서 찾을 수 없는 ISBN입니다: ..."`
> 409: 알라딘 응답이 비었거나 오류 코드를 돌려줌
> 503: 알라딘 서버 연결 실패·타임아웃

---

### [GET] /api/books/isbn/{isbn13}

- 설명: ISBN13으로 책 조회 (DB에 없으면 알라딘에서 가져와 저장). `POST /api/books`와 사실상 동일 동작이며 레거시로 남아 있음
- 인증: 필요

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| isbn13 | String | Y | 조회할 ISBN13 |

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| bookId | Long | 책 id |
| isbn13 | String | ISBN13 |
| name | String | 책 제목 |
| writer | String | 저자 |
| coverImageUrl | String | 표지 이미지 URL |
| pageCount | Integer | 총 페이지 수 |
| width | Double | 판형 가로(mm) |
| height | Double | 판형 세로(mm) |

```json
{
  "bookId": 1, "isbn13": "9788937460449", "name": "데미안", "writer": "헤르만 헤세",
  "coverImageUrl": "https://.../cover.jpg", "pageCount": 240, "width": 128.0, "height": 188.0
}
```

> `pageCount` / `width` / `height`는 알라딘이 상세 정보를 주지 않으면 `null`이다
> 에러 코드는 `POST /api/books`와 같다 (400 / 409 / 503)

---

### [POST] /api/books/{bookId}/my-list

- 설명: 내가 읽은 책 목록에 추가
- 인증: 필요

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| bookId | Long | Y | 추가할 책 id |

**Response Body**: 없음 (200)

> 400: `"존재하지 않는 책입니다."`
> 409: `"이미 목록에 담은 책입니다."` — 같은 책을 두 번 담을 수 없다

---

## 3. 독서모임 (`/api/book-clubs`)

- 역할은 `HOST`/`PARTICIPANT` 둘뿐이다(리더/오너 등 다른 명칭 없음).
- `status` 값: **`PENDING` / `FULL` / `IN_PROGRESS` / `COMPLETED`** (2026-08-30 `FULL` 추가)

  | 값 | 화면 라벨 | 조건 |
  | --- | --- | --- |
  | `PENDING` | 모집중 | 모임 시작 전 + 자리 남음 |
  | `FULL` | **모집완료** | 모임 시작 전 + `currentMemberCount >= maxCapacity` |
  | `IN_PROGRESS` | 모임중 | 시작 15분 전 ~ 종료(시작+30분) 15분 후 |
  | `COMPLETED` | 종료 | 그 뒤 |

  DB 컬럼이 아니라 **조회할 때마다 인원과 모임 시각으로 계산해서** 내려준다. 예전에는 저장된 값이 `PENDING`에서 바뀌지 않아 정원이 차도, 모임이 끝나도 "모집중"으로 보였다. 날짜/시간이 비어 있는 옛 모임은 인원만 보고 `PENDING`/`FULL`을 정한다.

  > **프론트 수정 필요 (한 줄)**: `src/api/api.js`의 `statusLabel`에 `if (status === "FULL") return "모집완료";`를 추가한다. 없으면 문자열 `"FULL"`이 그대로 화면에 나온다.

- `type` 값: `PASSIONATE` / `MODERATE` / `CALM`
- 모든 응답에서 `bookId` / `bookName` / `bookCoverImageUrl`은 **null일 수 있다.** 책 컬럼이 생기기 전에 만들어진 모임이 남아 있기 때문이며, 새로 만드는 모임은 항상 값이 있다.
- 같은 이유로 `hostId`도 null일 수 있다(방장 컬럼 백필 이전 모임). 이 경우 `role`은 `PARTICIPANT`로 계산되고, AI 진행자 호출은 409로 막힌다.

### [GET] /api/book-clubs

- 설명: 홈 화면 독서모임 목록 (가입 여부 무관 전체 조회)
- 인증: 필요
- `role`은 **가입한 모임만 값이 있고 나머지는 `null`**이다(모임마다 가입 여부를 확인하면 쿼리가 늘어나서 생략)

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| clubId | Long | 모임 id |
| name | String | 모임 이름 |
| bookId | Long | 선정 도서 id |
| bookName | String | 선정 도서 제목 |
| bookCoverImageUrl | String | 선정 도서 표지 |
| date | LocalDate | 모임 날짜 |
| time | LocalTime | 모임 시각 |
| currentMemberCount | int | 현재 인원 |
| maxCapacity | int | 정원 |
| status | String(enum) | PENDING / FULL / IN_PROGRESS / COMPLETED |
| type | String(enum) | PASSIONATE / MODERATE / CALM |
| role | String(enum) or null | HOST / PARTICIPANT / null(미가입) |

```json
[
  {
    "clubId": 1, "name": "데미안 완독반", "bookId": 1, "bookName": "데미안",
    "bookCoverImageUrl": "https://.../cover.jpg", "date": "2026-08-20", "time": "19:00:00",
    "currentMemberCount": 3, "maxCapacity": 8,
    "status": "PENDING", "type": "PASSIONATE", "role": null
  }
]
```

---

### [GET] /api/book-clubs/my-list

- 설명: 내가 가입한 독서모임 목록
- 인증: 필요
- 응답 형식은 `GET /api/book-clubs`와 동일(`role`은 항상 값이 있음)

---

### [GET] /api/book-clubs/{clubId}

- 설명: 독서모임 상세 (방 입장). `role`로 방장 전용 UI 노출 여부를 판단
- 인증: 필요
- **가입한 회원만 조회 가능** (미가입 시 409)

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| clubId | Long | Y | 모임 id |

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| clubId | Long | 모임 id |
| name | String | 모임 이름 |
| bookId | Long | 선정 도서 id |
| bookName | String | 선정 도서 제목 |
| bookCoverImageUrl | String | 선정 도서 표지 |
| date | LocalDate | 모임 날짜 |
| time | LocalTime | 모임 시각 |
| currentMemberCount | int | 현재 인원 |
| maxCapacity | int | 정원 |
| status | String(enum) | PENDING / FULL / IN_PROGRESS / COMPLETED |
| type | String(enum) | PASSIONATE / MODERATE / CALM |
| hostId | Long | 방장 회원 id |
| role | String(enum) | HOST / PARTICIPANT |

```json
{
  "clubId": 1, "name": "데미안 완독반", "bookId": 1, "bookName": "데미안",
  "bookCoverImageUrl": "https://.../cover.jpg", "date": "2026-08-20", "time": "19:00:00",
  "currentMemberCount": 3, "maxCapacity": 8,
  "status": "PENDING", "type": "PASSIONATE", "hostId": 5, "role": "HOST"
}
```

> 409: 미가입 회원이 조회 시도 → `"가입하지 않은 독서모임입니다."`
> 존재하지 않는 `clubId`도 가입 여부를 먼저 확인하므로 400이 아니라 **409**로 나간다

---

### [POST] /api/book-clubs

- 설명: 독서모임 생성. 생성자는 자동 가입되며 방장(`host`)으로 지정됨
- 인증: 필요

**Request Body**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| name | String | Y | 모임 이름 |
| bookId | Long | Y | 선정 도서 id (null이면 400) |
| date | LocalDate | Y | 모임 날짜 |
| time | LocalTime | Y | 모임 시각 |
| maxCapacity | int | Y | 정원 |
| type | String(enum) | Y | PASSIONATE / MODERATE / CALM |

```json
{
  "name": "데미안 완독반", "bookId": 1, "date": "2026-08-20", "time": "19:00:00",
  "maxCapacity": 8, "type": "PASSIONATE"
}
```

**Response Body**: 생성된 `clubId` (순수 숫자)

```json
1
```

> 400: `bookId`가 null → `"독서모임을 만들려면 책을 선택해야 합니다."` / 존재하지 않는 `bookId` → `"존재하지 않는 책입니다."`

---

### [POST] /api/book-clubs/{clubId}/join

- 설명: 독서모임 가입
- 인증: 필요

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| clubId | Long | Y | 가입할 모임 id |

**Response Body**: 없음 (200)

> 400: `"존재하지 않는 독서모임입니다."`
> 409: `"이미 가입한 독서모임입니다."` / `"이미 종료된 독서모임입니다."` / `"정원이 가득 찬 독서모임입니다."`
> **진행중(`IN_PROGRESS`) 모임은 막지 않는다.** 가입을 거부하는 상태는 `COMPLETED`뿐이라 늦게 들어오는 참여자도 가입할 수 있다

---

## 4. 독서록 (`/api/notes`)

- `BookNote`(직접/OCR 입력 메모)와 `AINote`(AI가 취합해 쓴 글, `(bookId, memberId)`당 1건)는 별개 리소스다.

### [POST] /api/notes/books/{bookId}

- 설명: 독서록 작성 (직접 입력 또는 OCR로 추출한 텍스트)
- 인증: 필요

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| bookId | Long | Y | 대상 책 id |

**Request Body**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| phrase | String | N | 인상 깊은 구절 |
| feeling | String | N | 그에 대한 느낌 |

```json
{ "phrase": "새는 알을 깨고 나온다.", "feeling": "성장에 대한 은유가 인상적이었다." }
```

**Response Body**: 생성된 `noteId` (순수 숫자)

```json
7
```

> 400: `"존재하지 않는 책입니다."` — 책을 먼저 등록(`POST /api/books`)해서 받은 `bookId`를 써야 한다
> `phrase`/`feeling` 둘 다 비워도 서버는 막지 않는다(검증 없음)

---

### [GET] /api/notes/books/{bookId}

- 설명: 내가 그 책에 쓴 독서록 목록
- 인증: 필요

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| noteId | Long | 독서록 id |
| phrase | String | 인상 깊은 구절 |
| feeling | String | 느낌 |

```json
[
  { "noteId": 7, "phrase": "새는 알을 깨고 나온다.", "feeling": "성장에 대한 은유가 인상적이었다." }
]
```

---

### [GET] /api/notes/books/{bookId}/ai-note

- 설명: 그 책에 대한 내 AI 독서록 조회
- 인증: 필요
- 아직 생성 전이면 404가 아니라 `exists: false`로 200 응답 (생성 버튼 노출 판단용)

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| exists | boolean | AI 독서록 존재 여부 |
| aiNoteId | Long or null | AI 독서록 id |
| content | String or null | AI가 작성한 본문 |
| tags | String[] | 성향 태그 목록. DB에 콤마로 이어붙여 저장된 값을 그대로 잘라 주며(앞뒤 공백 정리 없음), 없으면 `[]` |
| edited | boolean | 회원이 직접 수정했으면 true. 재생성(`ai-generate`)하면 다시 false로 돌아간다 |

```json
{ "exists": true, "aiNoteId": 3, "content": "이 책은...", "tags": ["성장", "고전"], "edited": false }
```

---

### [GET] /api/notes/books/{bookId}/members/{memberId}/ai-note

- 설명: **다른 회원**이 그 책에 쓴 AI 독서록 조회 (타인 프로필 화면용)
- 인증: 필요 (로그인만 하면 되고, 팔로우 여부는 보지 않는다 — AI 독서록은 공개 정보)
- 응답 형식은 위 `GET /api/notes/books/{bookId}/ai-note`와 완전히 동일하다
- 그 회원이 아직 만들지 않았으면 `exists: false`로 200 응답

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| bookId | Long | Y | 책 id |
| memberId | Long | Y | 독서록을 쓴 회원 id |

```json
{ "exists": true, "aiNoteId": 3, "content": "이 책은...", "tags": ["성장", "고전"], "edited": false }
```

> 400: `"회원을 찾을 수 없습니다."` — 없는 `memberId`

---

### [POST] /api/notes/books/{bookId}/ai-generate

- 설명: 그 책에 대한 내 독서록들을 취합해 AI 독후감 생성 요청
- 인증: 필요
- 요청 본문은 없다
- 이미 AI 독서록이 있으면 새로 만들지 않고 **내용을 덮어쓴다.** 이때 회원이 수정했던 본문은 사라지고 `edited`가 false로 돌아간다
- 내부적으로 AI 서버를 **두 번** 호출한다. 독후감 본문(`/api/review/generate`)을 받은 뒤, 그 본문을 다시 보내 감정 태그(`/api/analysis/emotion-tags`)를 받아 함께 저장한다. 태그 호출만 실패하면 본문은 그대로 저장되고 `tags`만 `[]`로 나간다

**Response Body**: 생성된(또는 갱신된) `aiNoteId` (순수 숫자)

```json
3
```

> 400: `"존재하지 않는 책입니다."`
> 409: `"AI 독서록을 만들려면 독서록이 최소 1개 필요합니다."` — 먼저 `POST /api/notes/books/{bookId}`로 독서록을 남겨야 한다
> 503: AI 서버 연결 실패/응답 없음(`AiServerException`). 이 경우 AI 독서록 행은 만들어지지 않는다

---

### [PATCH] /api/notes/ai-notes/{aiNoteId}

- 설명: AI가 작성한 독서록 직접 수정
- 인증: 필요
- 본인 소유가 아니면 403

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| aiNoteId | Long | Y | 수정할 AI 독서록 id |

**Request Body**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| newAiContent | String | Y | 수정할 본문 |

```json
{ "newAiContent": "수정된 독후감 본문" }
```

**Response Body**: 없음 (200)

> 400: `"AI 독서록을 찾을 수 없습니다."`
> 403: 본인 소유가 아닌 AI 독서록 수정 시도 → `"내 AI 독서록만 수정할 수 있습니다."`
> 수정에 성공하면 `edited`가 true가 된다

---

## 5. 채팅

- 흐름: Redis Pub/Sub(`chat-group` 채널) → Redis 저장(7일 TTL, `ChatMessage` 해시) → STOMP 브로드캐스트.
  (2026-08-26에 Kafka를 걷어내고 Redis Pub/Sub으로 바꿨다. **API 계약은 그대로라 프론트 변경 사항은 없다.**)
- 보관: Redis에서 7일이 지나 만료되면 PostgreSQL(`chat_archive`)로 옮겨 30일 더 보관하고 삭제한다.
  **이 보관본을 읽는 API는 없다.** 프론트가 보는 대화는 언제나 Redis에 남아 있는 최근 7일치다.
- STOMP 구독은 구독 시점 이후 메시지만 전달하므로, 지난 대화는 별도 REST 이력 조회로 받는다.
- 아래 STOMP 항목은 HTTP 요청이 아니라 WebSocket 프레임이라 표기를 `[STOMP] <프레임> <destination>` 형식으로 맞췄다.

### 채팅방 활성화 시간 (2026-08-26 추가)

**메시지 전송은 정해진 시간대에만 된다.** 모임 시작 15분 전에 열리고, 30분 진행이 끝난 15분 뒤에 닫힌다(총 60분).
기준 시각은 모임 생성 시 지정한 `date` + `time`이다.

- 판정은 **백엔드에서만** 한다. 프론트나 AI 서버로 상태를 넘기지 않는다.
  프론트가 버튼을 미리 잠가 두는 것은 UX 문제이고, 잠그지 않아도 서버가 거부한다.
- 시간대를 벗어난 전송은 거부된다.
  - REST(`POST /api/book-clubs/{clubId}/chats`) → **409** + `message`
  - STOMP(`SEND /pub/chat/clubs/{clubId}`) → 메시지가 발행되지 않고, **보낸 사람에게만**
    `/user/sub/errors`로 `{ "message": "..." }`가 온다. 이 경로를 구독하지 않으면 실패를 알 수 없다.
- 메시지 예시
  - 열리기 전: `"아직 채팅방이 열리지 않았습니다. 모임 시작 15분 전부터 이용할 수 있습니다."`
  - 닫힌 후: `"채팅방이 종료되었습니다. 지난 대화는 계속 확인할 수 있습니다."`
- **조회(`GET /api/book-clubs/{clubId}/chats`)는 제한이 없다.** 모임이 끝난 뒤에도 7일간 볼 수 있다.
- AI가 보내는 메시지도 같은 제한을 받는다(우회 경로를 두지 않기 위해).

### [POST] /api/book-clubs/{clubId}/chats

- 설명: AI 에이전트가 답변을 보낼 때만 사용하는 콜백 API. 일반 회원은 사용하지 않음
- 인증: 불필요(permitAll). 대신 `X-AI-API-KEY` 헤더로 인증
- 보낸 사람은 항상 `AI_MEMBER_ID`(999)로 고정되어 다른 회원 사칭 불가

**Path Parameters**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| clubId | Long | Y | 메시지를 보낼 모임 id |

**Headers**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| X-AI-API-KEY | String | Y | 사전 공유된 AI 서버 인증키 |

**Request Body**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| content | String | Y | 메시지 내용 |

```json
{ "content": "이 책에서 가장 인상 깊은 장면은 어디였나요?" }
```

**Response Body**: 없음 (200)

> 401: `X-AI-API-KEY` 값 불일치 또는 헤더 누락. 이 응답만 **바디가 아예 없다**(`{ "message": ... }` 형식이 아니다)
> AI는 가입 검사(`validateClubMember`)를 건너뛰므로 없는 `clubId`로 보내도 200이 나간다. 대신 그 방을 구독한 사람이 없어 아무에게도 도착하지 않는다

---

### [GET] /api/book-clubs/{clubId}/chats

- 설명: 채팅 이력 조회 (재입장 시 사용). Redis에 남아 있는 것 전부(=최근 7일치, 기간 파라미터 없음), `createdAt` 오름차순
- 인증: 필요, 가입 회원만 호출 가능

**Response Body**

| 필드명 | 타입 | 설명 |
| --- | --- | --- |
| messageId | String | 메시지 id(UUID) |
| memberId | Long | 발신자 회원 id (AI는 999) |
| senderName | String | 발신자 표시 이름. 닉네임이 없으면 로그인 아이디, 탈퇴 등으로 조회 불가 시 "알 수 없는 사용자", AI는 "AI" |
| content | String | 메시지 내용 |
| createdAt | LocalDateTime | 전송 시각 |

```json
[
  { "messageId": "a1b2c3", "memberId": 5, "senderName": "책벌레", "content": "안녕하세요", "createdAt": "2026-08-20T19:01:00" }
]
```

> 409: 미가입 회원이 조회 시도 → `"가입하지 않은 독서모임입니다."` (없는 `clubId`도 같은 409)
> 메시지가 하나도 없으면 빈 배열 `[]`

---

### [POST] /api/book-clubs/{clubId}/meeting/assist

- 설명: **방장 전용** AI 진행자 개입. 최근 대화 최대 50개와 책 제목을 AI 서버(`{ai.base-url}/api/meeting/assist`)로 보내고, 받은 응답을 AI(`memberId: 999`) 이름으로 채팅방에 바로 발행한다
- 인증: 필요, 방장(`host`)만 호출 가능
- **AI를 호출하는 엔드포인트는 이것 하나다.** 예전에 있던 방장용 `POST /api/book-clubs/{clubId}/ai-assist`는 이 경로와 하는 일이 같아 **삭제됐다**(2026-08-22). 참여자용/방장용으로 나뉘어 있던 것을 하나로 합친 것이라, 참여자는 더 이상 이 API를 호출할 수 없다

**Request Body**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| mode | String | Y | `"question"`(토론 질문 제안) 또는 `"summary"`(대화 요약) |

```json
{ "mode": "question" }
```

**Response Body**: 없음 (성공 시 200)

AI 응답은 이 요청의 응답 본문이 아니라, `/sub/chat/clubs/{clubId}` 구독으로 도착한다.

> 400: `"존재하지 않는 독서모임입니다."`
> 409: `"방장이 지정되지 않은 독서모임입니다."`(레거시 데이터, 백필 필요) / `"방장만 AI 진행자를 호출할 수 있습니다."`
> 503: AI 서버 연결 실패, 또는 응답은 왔지만 내용이 비어 있음

참고로 AI 서버로 나가는 요청 형식은 다음과 같다(우리 API의 요청 형식이 아니다).

```json
{
  "book_title": "데미안",
  "chat_history": [ { "speaker": "책벌레", "text": "안녕하세요" } ],
  "mode": "question"
}
```

---

### [STOMP] CONNECT /ws/chat

- 설명: WebSocket(STOMP) 연결 시작
- 인증: 필요 — HTTP 핸드셰이크 자체는 `permitAll`(브라우저가 핸드셰이크에 커스텀 헤더를 못 넣음), 대신 STOMP `CONNECT` 프레임 헤더로 인증
- 같은 경로에 **두 방식이 모두 등록돼 있다**
  - 순수 WebSocket: `ws://<host>/ws/chat` — `@stomp/stompjs`의 `brokerURL` 방식(현재 프론트가 쓰는 방식)
  - SockJS 폴백: `http://<host>/ws/chat` — SockJS 클라이언트가 `/ws/chat/info`부터 호출한다
- 허용 출처는 REST와 같은 `CORS_ALLOWED_ORIGINS` 목록을 쓴다. `Origin` 헤더를 보내지 않는 비브라우저 클라이언트(Node 스크립트 등)는 그대로 통과한다

**STOMP Headers**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | Y | `Bearer <accessToken>` (stomp.js `connectHeaders`로 전달) |

> 토큰 없음/무효: `ERROR` 프레임 후 연결 종료

---

### [STOMP] SUBSCRIBE /sub/chat/clubs/{clubId}

- 설명: 특정 모임의 실시간 채팅 구독
- 인증: 필요, 가입 회원만 가능

> 비가입 회원이 구독 시도: `ERROR` 프레임 후 연결 종료

---

### [STOMP] SEND /pub/chat/clubs/{clubId}

- 설명: 실시간 채팅 메시지 전송 (매핑: `@MessageMapping("/chat/clubs/{clubId}")`)
- 인증: 필요 — 보낸 사람은 `CONNECT`에서 검증된 토큰의 `memberId`로 고정(요청 바디로 지정 불가)

**Payload**

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| content | String | Y | 메시지 내용 |

```json
{ "content": "안녕하세요" }
```

- 브로드캐스트 목적지: `/sub/chat/clubs/{clubId}`, 페이로드는 `GET /api/book-clubs/{clubId}/chats` 응답의 항목과 동일한 필드.

### [STOMP] SUBSCRIBE /user/sub/errors (2026-08-26 추가)

- 설명: 내가 보낸 전송이 거부됐을 때 사유를 받는 개인 경로. 다른 사람에게는 가지 않는다.
- 프론트가 이 경로를 구독해 두면 채팅방 활성화 시간이 아닐 때 사용자에게 안내를 띄울 수 있다.
  구독하지 않으면 STOMP 전송 실패가 화면에서 조용히 사라진다.

```json
{ "message": "아직 채팅방이 열리지 않았습니다. 모임 시작 15분 전부터 이용할 수 있습니다." }
```

---

## 변경 이력

### 2026-08-23 — 코드 재대조 후 수정

첫 초안(2026-08-20, 커밋 `a0cc58a0` 기준)을 컨트롤러·서비스 코드와 다시 대조해 아래를 고쳤다. 엔드포인트 목록 자체는 그대로이고, **틀린 설명과 빠진 에러 응답을 채운 것**이다.

- 백엔드 코드도 함께 고친 것 (문서만 바꾼 게 아니다)
  - 회원가입·로그인 요청에 검증(`@Valid` + `@NotBlank`/`@Email`)을 붙였다. 전에는 필드가 비면 DB 제약에 걸려 **500**이 나갔고, 이제 **400 + `"필드명: 사유"`**가 나간다.
  - `GET /api/books/search`에서 `keyword` 파라미터 자체가 빠지면 500이 나가던 것을 400(`"검색어를 입력해 주세요."`)으로 통일했다.
  - 알라딘 서버 연결 실패/타임아웃이 500으로 나가던 것을 **503**으로 바꿨다(AI 서버 장애와 같은 기준).
- 문서만 고친 것
  - `POST /api/book-clubs/{clubId}/join`: "진행중인 모임은 가입 불가"는 **사실이 아니었다.** 가입을 막는 상태는 `COMPLETED`뿐이다.
  - `PATCH /api/members/me/profile` 아래의 "프로필 조회 API는 현재 없음"은 오래된 문장이라 삭제했다(`GET /api/members/me`, `GET /api/members/{memberId}`가 있다).
  - CORS 절과 STOMP 연결 방식(순수 WebSocket + SockJS)을 새로 넣었다.
  - 각 엔드포인트의 400/409/503 응답과 실제 메시지 문자열, null이 될 수 있는 필드를 채웠다.

---

## 참고: FE(develop)와의 현재 불일치

`docs/fe-be-endpoint-mismatch.md`에 develop 브랜치 프론트엔드와의 전체 대조표가 있다. 이 명세서 기준으로 FE `src/api/api.js`가 갱신되어야 한다.
