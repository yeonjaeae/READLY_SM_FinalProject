# 프론트엔드 전달 사항 (2026-08-23)

- **BE 기준**: 이 레포 `backend` 브랜치 `a0cc58a0`(2026-08-23) + 아직 커밋 안 한 작업트리 변경(§5)
- **FE 기준**: upstream(`yeonjaeae/READLY_SM_FinalProject`) `develop` 브랜치 `c19737f9`(2026-08-21 21:43)
- 이 문서는 위 두 스냅샷을 **파일을 직접 열어** 대조한 결과다. 이후 어느 쪽이든 커밋이 쌓이면 결론이 달라질 수 있으니
  기준 커밋을 먼저 확인하고 읽어 주세요.
- 앞선 `docs/fe-be-endpoint-mismatch.md`(2026-08-22)의 후속이며, 그 문서의 §3-5·§4를 프론트 작업 관점으로 다시 정리한 것이다.

---

## 0. 요약

경로를 전부 대조한 결과 **`api.js`에서 실제로 틀린 것은 `requestHostAiAssist`의 경로 한 줄뿐**이다.
나머지 22개 호출은 백엔드와 정확히 일치한다(§4 대조표). 그 외에는 "고장난 것"이 아니라
**백엔드에 새로 생긴 API를 아직 안 붙인 상태**다.

| # | 할 일 | 성격 | 난이도 |
| --- | --- | --- | --- |
| 1 | `requestHostAiAssist` 경로 `/ai-assist` → `/meeting/assist` | **필수 (지금 404)** | 한 줄 |
| 2 | 죽은 `requestMeetingAssist(clubId)` export 삭제 | 정리 (권장) | 한 함수 삭제 |
| 3 | 새 엔드포인트 4개 연결 (`api.js` + `Profile.js` + `OtherProfile.js`) | 기능 추가 | 보통 |
| 4 | 옛 명세 기준으로 적힌 주석 정리 | 정리 | 낮음 |

---

## 1. [필수] AI 진행자 요청 경로 수정

백엔드에서 AI를 호출하는 엔드포인트를 **하나로 합쳤다.** `POST /api/book-clubs/{clubId}/ai-assist`는
삭제됐고 `POST /api/book-clubs/{clubId}/meeting/assist`만 남았다. 지금 방장이 AI 버튼을 누르면 404가 난다.

```js
// src/api/api.js
export function requestHostAiAssist(clubId, mode) {
  return apiFetch(`/api/book-clubs/${clubId}/meeting/assist`, {  // ← /ai-assist 에서 변경
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}
```

- 함수 이름은 그대로 둬도 된다. `MeetingRoom.js`는 **손댈 필요 없다.**
  이미 `requestHostAiAssist(roomId, mode)`로 `{ mode: "question" }`을 보내고 있고, 그게 백엔드가 받는 형식이다.
- 요청 본문: `{ "mode": "question" | "summary" }` — `question`은 토론 질문 제안, `summary`는 대화 요약.
- 응답: `200`, **본문 없음**. AI 답변은 이 응답이 아니라 채팅방에 AI 이름(`memberId = 999`)으로 발행되어
  **STOMP 구독으로 도착**한다. `MeetingRoom.js`가 이미 그렇게 처리하고 있다.
- 권한: **방장 전용.** 참가자가 호출하면 `409` "방장만 AI 진행자를 호출할 수 있습니다."
  (`MeetingRoom.js:286`의 "방장이 아니면 409" 주석은 그대로 맞다.)
- 예전에 "이 API는 형식 불일치로 항상 503"이라고 전달했던 문제(known-issues #11)는 **해결됐다.**
  다만 AI 서버(`localhost:8001`)가 떠 있지 않으면 여전히 `503`이 나온다. 이건 정상 동작이므로
  에러 메시지를 그대로 보여주면 된다.

## 2. [권장] 죽은 `requestMeetingAssist` 삭제

```js
// src/api/api.js — 삭제 대상
export function requestMeetingAssist(clubId) {
  return apiFetch(`/api/book-clubs/${clubId}/meeting/assist`, { method: "POST" });
}
```

- 현재 이 함수를 부르는 화면은 없다(`git grep` 확인).
- 경로 자체는 맞지만 **본문을 안 보내서**, 지금 호출하면 `400`이다.
  백엔드가 `{ mode }`를 `@RequestBody`로 필수 요구한다.
- "참여자용 AI 개입"이라는 개념은 없어졌다. AI 호출은 방장만 할 수 있고 엔드포인트는 위 하나뿐이다.
  §1의 `requestHostAiAssist`만 남기면 된다.

---

## 3. 새로 생긴 엔드포인트 4개

`Profile.js` / `OtherProfile.js`가 "백엔드에 API가 없어서" 우회하던 부분이 전부 채워졌다.

| 화면 | 필요했던 것 | 새 엔드포인트 |
| --- | --- | --- |
| `Profile.js` | 내 닉네임·소개·팔로워 수 | `GET /api/members/me` |
| `OtherProfile.js` | 타인 닉네임·소개·팔로우 여부 | `GET /api/members/{memberId}` |
| `OtherProfile.js` | 언팔로우 | `DELETE /api/members/{followingId}/follow` |
| `OtherProfile.js` | 타인의 읽은 책 목록 | `GET /api/books/members/{memberId}/list` |

### 3-1. 응답 형식

**`GET /api/members/me`** — 인증 필요. 대상은 토큰의 memberId로 고정(경로에 id를 넣지 않는다).

```json
{
  "memberId": 1,
  "nickname": "readly",
  "email": "a@b.com",
  "introduction": "책 좋아합니다",
  "followerCount": 12,
  "followingCount": 7
}
```

**`GET /api/members/{memberId}`** — 인증 필요. 남의 프로필이라 **이메일은 내려주지 않는다.**
대신 `isFollowing`(내가 이 사람을 팔로우 중인지)이 붙는다.

```json
{
  "memberId": 5,
  "nickname": "someone",
  "introduction": "...",
  "followerCount": 3,
  "followingCount": 9,
  "isFollowing": true
}
```

**`DELETE /api/members/{followingId}/follow`** — 팔로우와 **같은 경로, 메서드만 다르다.** 응답 `200`, 본문 없음.

**`GET /api/books/members/{memberId}/list`** — `/api/books/my-list`와 **완전히 같은 형식**이다.

```json
[{ "bookId": 1, "name": "노르웨이의 숲", "coverImageUrl": "https://..." }]
```

### 3-2. `api.js`에 추가할 함수

```js
/* ===================== 회원 (추가) ===================== */

// 내 프로필 조회 → { memberId, nickname, email, introduction, followerCount, followingCount }
export function getMyProfile() {
  return apiFetch("/api/members/me", { method: "GET" });
}

// 타인 프로필 조회 → { memberId, nickname, introduction, followerCount, followingCount, isFollowing }
export function getOtherProfile(memberId) {
  return apiFetch(`/api/members/${memberId}`, { method: "GET" });
}

// 언팔로우 (팔로우와 같은 경로, 메서드만 DELETE)
export function unfollow(followingId) {
  return apiFetch(`/api/members/${followingId}/follow`, { method: "DELETE" });
}

/* ===================== 도서 (추가) ===================== */

// 타인의 읽은 책 목록 → my-list와 같은 형식 [{ bookId, name, coverImageUrl }]
export function getMemberBookList(memberId) {
  return apiFetch(`/api/books/members/${memberId}/list`, { method: "GET" });
}
```

### 3-3. `Profile.js`에서 걷어낼 임시 처리

현재 `fetchProfile`(`Profile.js:71~118`)이 `getFollowers` / `getFollowings`를 부른 뒤 **배열 `length`로
팔로워·팔로잉 수를 세고**, 닉네임·소개는 서버에서 못 받아서 **수정 모달에 입력한 값을 이 세션 동안만** 들고 있다
(`handleSave`의 `setProfile`, `Profile.js:198~206`). 그래서 새로고침하면 닉네임이 사라진다.

바꿀 점:

- `getMyProfile()`을 `Promise.all`에 추가하고, `followers`/`following`은 응답의
  `followerCount`/`followingCount`를 그대로 쓴다. **`length`로 세지 않는다.**
  (서버는 `Follow` 행을 실제로 세어 내려준다. `Member` 테이블의 카운터 컬럼이 아니라서, 과거 데이터가
  어긋나 있어도 이 값이 맞다.)
- `profile.name` / `profile.desc`를 `nickname` / `introduction`으로 채운다.
  `Profile.js:497`의 `"닉네임을 설정해주세요"` 폴백은 그대로 둬도 된다 —
  가입 직후 닉네임 초기값은 **로그인 아이디(`loginId`)** 이므로 실제로 비는 경우는 거의 없다.
- `handleSave`에서 `PATCH` 성공 후 화면에 입력값을 직접 반영하는 대신 `fetchProfile()`을 다시 부르는 편이 안전하다.
  (`PATCH`는 여전히 `200` + 본문 없음이다.)
- 팔로워/팔로잉 **명단 모달**은 지금처럼 `getFollowers`/`getFollowings`를 계속 쓰면 된다. 이 두 API는 그대로다.
  다만 숫자를 위해 미리 부를 필요는 없어졌으니, 모달을 열 때 부르도록 미뤄도 된다.
- `PATCH /api/members/me/profile`의 동작 주의: **`nickname`이 `null`이거나 공백이면 무시**되고 기존 값이 유지된다.
  `introduction`은 `null`이 아니면 빈 문자열도 반영된다(= 소개 지우기 가능).

### 3-4. `OtherProfile.js`에서 걷어낼 임시 처리

지금 이 화면은 (1) 닉네임을 `location.state?.nickname`으로만 받아 표시하고(`:393`),
(2) 소개(`:426`)와 책장(`:429~448`)을 **빈 div로 비워 뒀고**, (3) 팔로우 버튼이 **1회성**이다
(`isFollowing`이 항상 `false`로 시작하고, 누르면 `disabled`, `OtherProfile.js:113~133`).

바꿀 점:

- `useEffect`에서 `getOtherProfile(userId)`와 `getMemberBookList(userId)`를 부른다.
  닉네임·소개·팔로워 수·팔로우 여부가 전부 응답에 있으므로 `location.state?.nickname` 의존을 없앨 수 있다.
  (`userId`만 넘기면 되므로, 모임 참가자 목록 등 **다른 화면에서 프로필로 들어가는 진입점을 추가하기 쉬워진다.**
  현재 `/other-profile`로 가는 곳은 `Profile.js`의 팔로워 목록 모달 하나뿐이다.)
- 책장은 `Profile.js`와 같은 형식(`{ bookId, name, coverImageUrl }`)이므로 `book-spine` 렌더링을 그대로 재사용하면 된다.
  `Profile.js:15~16`에 있는 `heights`/`colors` 배열도 같이 쓸 수 있다.
- 팔로우 버튼을 **토글**로 바꾼다.

```js
const handleFollowToggle = async () => {
  if (followLoading || !userId) return;
  setFollowLoading(true);
  try {
    if (isFollowing) {
      await unfollow(userId);
      setIsFollowing(false);
      setFollowers((n) => n - 1);
    } else {
      await follow(userId);
      setIsFollowing(true);
      setFollowers((n) => n + 1);
    }
  } catch (err) {
    alert(err.message || "요청 중 오류가 발생했습니다.");
  } finally {
    setFollowLoading(false);
  }
};
```

  버튼의 `disabled={followLoading || isFollowing}`에서 **`|| isFollowing`을 빼야** 언팔로우를 누를 수 있다.

- 팔로우 관련 에러 코드
  - 자기 자신 팔로우 → `400` "자기 자신을 팔로우할 수 없습니다."
  - 이미 팔로우 중인데 `POST` → `409` "이미 팔로우 중인 사용자입니다."
  - 팔로우하지 않았는데 `DELETE` → `409` "팔로우하지 않은 사용자입니다."
  - `isFollowing`으로 상태를 정확히 알 수 있으니 실제로는 위 두 `409`가 날 일이 거의 없다.

### 3-5. 프로필 이미지는 아직 없다 (보류)

`Member`에 이미지 컬럼이 없고 업로드·저장소(로컬 디스크 / S3 등)를 정해야 해서 **이번엔 안 만들었다.**
`Profile.js`의 이미지 선택은 지금처럼 **화면 안 미리보기로만** 두면 된다(`Profile.js:171~182` 주석 유지).
`OtherProfile.js`의 `.profile-image`도 빈 원으로 둔다.

---

## 4. 이미 맞는 것 (건드리지 말 것)

아래는 전부 백엔드와 일치한다. §1 하나 말고는 경로를 바꿀 이유가 없다.

| 기능 | FE 호출 | 상태 |
| --- | --- | --- |
| 회원가입 | `POST /api/members/signup` `{loginId,email,password}` | 일치 |
| 로그인 | `POST /api/members/login` → `{memberId,accessToken}` | 일치 |
| 팔로워/팔로잉 목록 | `GET /api/members/{id}/followers` · `/followings` | 일치 |
| 팔로우 | `POST /api/members/{followingId}/follow` | 일치 |
| 프로필 수정 | `PATCH /api/members/me/profile` | 일치 |
| 인기 도서 | `GET /api/books/popular` | 일치 |
| 내 읽은 책 | `GET /api/books/my-list` | 일치 |
| 도서 검색 | `GET /api/books/search?keyword=` | 일치 |
| 도서 등록 | `POST /api/books` `{isbn13}` | 일치 |
| ISBN 조회(레거시) | `GET /api/books/isbn/{isbn13}` | 일치 |
| 내 목록 담기 | `POST /api/books/{bookId}/my-list` | 일치 |
| 모임 목록 / 내 모임 / 상세 | `GET /api/book-clubs` · `/my-list` · `/{clubId}` | 일치 |
| 모임 생성 / 가입 | `POST /api/book-clubs` · `/{clubId}/join` | 일치 |
| 독서록 작성 / 조회 | `POST` · `GET` `/api/notes/books/{bookId}` | 일치 |
| AI 독서록 조회 / 생성 / 수정 | `/ai-note` · `/ai-generate` · `PATCH /api/notes/ai-notes/{id}` | 일치 |
| 채팅 이력 | `GET /api/book-clubs/{clubId}/chats` | 일치 |
| 실시간 채팅 | `ws://.../ws/chat`, SUB `/sub/chat/clubs/{id}`, PUB `/pub/chat/clubs/{id}` | 일치 |

- enum 값(`PASSIONATE`/`MODERATE`/`CALM`, `PENDING`/`IN_PROGRESS`/`COMPLETED`), `role: "HOST" | "PARTICIPANT"`,
  `AI_MEMBER_ID = 999`도 FE 상수와 일치한다.
- STOMP 브로드캐스트 payload는 이력 조회와 **같은 형식**(`{messageId, memberId, senderName, content, createdAt}`)으로
  통일했다. `MeetingRoom.js`의 `mapServerMessage`를 실시간·이력 양쪽에 그대로 쓰면 된다.
- `GET /api/book-clubs`의 `role`은 **가입한 모임에만 값이 있고 미가입 모임은 `null`** 이다.
  `Community.js`의 `if (!meeting.role) await joinBookClub(...)` 판단이 이 규칙과 맞다.
- `GroupDetail.js`는 `clubId`를 안 받는 더미 화면이라 이 문서와 무관하다. 실제 채팅방은 `MeetingRoom.js`다.

---

## 5. 오늘 백엔드에서 바뀐 에러 동작 (아직 커밋 전)

`backend` 브랜치 작업트리에만 있는 변경이라, 아래 내용은 **다음 백엔드 커밋 이후**부터 적용된다.
에러 응답 형식(`{ "message": "..." }`)은 그대로이므로 `apiFetch`는 손댈 필요 없다.

| 상황 | 이전 | 이후 |
| --- | --- | --- |
| 회원가입/로그인에 빈 값·잘못된 이메일 | `500` | `400` + 어떤 필드가 문제인지 메시지에 포함 |
| `GET /api/books/search`에 `keyword` 파라미터 자체를 누락 | `500` | `400` "검색어를 입력해 주세요." |
| 알라딘 API 연결 실패·타임아웃 | `500` | `503` "외부 서비스에 연결할 수 없습니다..." |

프론트 입장에서는 **서버 잘못(500)처럼 보이던 것이 입력 오류(400)/일시 장애(503)로 정확해지는 것**이라,
지금처럼 `error.message`를 그대로 보여주면 사용자에게 더 나은 문구가 나간다.

---

## 6. 낡은 주석 (동작에는 영향 없지만 헷갈릴 수 있음)

아래 주석들은 전부 **API가 없던 시절 기준**이라 지금은 사실이 아니다. 코드 수정하면서 같이 정리해 주세요.

| 파일:라인 | 내용 | 현재 사실 |
| --- | --- | --- |
| `api.js:115` | "언팔로우(취소) API는 현재 백엔드에 없음" | `DELETE /api/members/{id}/follow` 있음 |
| `api.js:121` | "내/타인 프로필을 GET으로 조회하는 API는 없음" | `GET /api/members/me`, `GET /api/members/{id}` 있음 |
| `api.js:261~264` | "참여자용 AI 개입 / 항상 503으로 실패(known-issues #11)" | 함수 삭제 대상(§2), 503 문제는 해결됨 |
| `api.js:4` | "백엔드 API 명세 기준 (backend 브랜치, 2026-08-20)" | 기준일을 갱신해 주세요 |
| `Profile.js:22~37` | "내 프로필 조회 GET API가 없음" 블록 전체 | §3-3으로 대체 |
| `OtherProfile.js:12~14`, `20~39` | "타인 프로필/책장/언팔로우 API 없음" | §3-4로 대체 |
| `OtherProfile.js:386~391`, `425`, `429` | "조회 API가 없어 비워둠" | 채울 수 있음 |
| `MeetingRoom.js:285` | "`POST /api/book-clubs/{clubId}/ai-assist`" | 경로만 `/meeting/assist`로. "방장 아니면 409"는 맞음 |

---

## 7. 붙인 뒤 확인 순서

백엔드를 `localhost:8080`으로 띄운 상태에서(Postgres·Redis 필요. 2026-08-26에 Kafka를 걷어냈다), 이 순서면 위 변경이 한 번에 확인된다.

1. 로그인 → 마이페이지: **닉네임·소개가 새로고침 후에도 유지**되면 §3-3 완료.
2. 마이페이지에서 팔로워 목록 모달 → 아무나 클릭 → 타인 프로필: **이름·소개·책장이 보이고**,
   팔로우 버튼을 눌렀다가 다시 눌러 **언팔로우가 되면** §3-4 완료.
3. 모임 입장(방장 계정) → AI 진행자 버튼: **404가 아니면** §1 완료.
   AI 서버(`localhost:8001`)가 꺼져 있으면 `503` "AI 서버에 연결할 수 없습니다."가 정상이다.
   AI 서버까지 떠 있으면 잠시 뒤 AI 이름의 메시지가 채팅방에 나타난다.

막히는 부분이 있으면 응답 status와 `message`를 그대로 알려 주세요. 백엔드 쪽 문제인지 바로 구분됩니다.
