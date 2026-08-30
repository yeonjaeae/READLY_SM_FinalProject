// src/api/api.js
//
// ==================================================
// ★ 백엔드 API 명세 기준 (backend 브랜치, 2026-08-24)
//
// - 인증: Authorization: Bearer <accessToken>
// - 사용자 식별은 토큰의 memberId로 서버가 처리
//   (요청 바디로 memberId를 보내는 API는 없음)
// - ResponseEntity<Void> → 상태 200, 바디 없음
// - ResponseEntity<Long> → 상태 200, 바디는 순수 숫자
// ==================================================

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080";

const TOKEN_KEY = "accessToken";
const MEMBER_ID_KEY = "memberId";

/* ===================== 인증 토큰 저장 ===================== */

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setMemberId(memberId) {
  localStorage.setItem(MEMBER_ID_KEY, String(memberId));
}

export function getMemberId() {
  const value = localStorage.getItem(MEMBER_ID_KEY);
  return value ? Number(value) : null;
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(MEMBER_ID_KEY);
}

/* ===================== 공통 fetch 래퍼 ===================== */

export async function apiFetch(path, options = {}) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // ResponseEntity<Void>(빈 바디) / 숫자 응답 모두 대응
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
  }

  if (!response.ok) {
    // GlobalExceptionHandler 에러 포맷: { "message": "..." }
    const message =
      (data && data.message) || `요청에 실패했습니다. (${response.status})`;

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

/* ===================== 1. 회원 (/api/members) ===================== */

// 인증 불필요. 응답: 생성된 memberId (순수 숫자)
export function signup(loginId, email, password) {
  return apiFetch("/api/members/signup", {
    method: "POST",
    body: JSON.stringify({ loginId, email, password }),
  });
}

// 인증 불필요. 응답: { memberId, accessToken }
export function login(email, password) {
  return apiFetch("/api/members/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// 나를 팔로우하는 사람 목록 → [{ memberId, nickname, introduction }]
export function getFollowers(memberId) {
  return apiFetch(`/api/members/${memberId}/followers`, { method: "GET" });
}

// 내가 팔로우하는 사람 목록 → [{ memberId, nickname, introduction }]
export function getFollowings(memberId) {
  return apiFetch(`/api/members/${memberId}/followings`, { method: "GET" });
}

// 팔로우하기. 주체는 토큰의 memberId로 고정됨.
export function follow(followingId) {
  return apiFetch(`/api/members/${followingId}/follow`, { method: "POST" });
}

// 언팔로우 (팔로우와 같은 경로, 메서드만 DELETE)
export function unfollow(followingId) {
  return apiFetch(`/api/members/${followingId}/follow`, { method: "DELETE" });
}

// 내 프로필 조회 (인증 필요, 대상은 토큰의 memberId로 고정)
// → { memberId, nickname, email, introduction, followerCount, followingCount }
export function getMyProfile() {
  return apiFetch("/api/members/me", { method: "GET" });
}

// 타인 프로필 조회 (이메일은 내려주지 않음, 대신 isFollowing 포함)
// → { memberId, nickname, introduction, followerCount, followingCount, isFollowing }
export function getOtherProfile(memberId) {
  return apiFetch(`/api/members/${memberId}`, { method: "GET" });
}

// 내 프로필 수정 (닉네임 / 소개만 가능, 로그인 아이디 변경 불가)
export function updateMyProfile({ nickname, introduction }) {
  return apiFetch("/api/members/me/profile", {
    method: "PATCH",
    body: JSON.stringify({ nickname, introduction }),
  });
}

/* ===================== 2. 도서 (/api/books) ===================== */

// 홈 화면 인기 도서 "1건" → { name, coverImageUrl }
export function getPopularBook() {
  return apiFetch("/api/books/popular", { method: "GET" });
}

// 내가 읽은 책 목록 → [{ bookId, name, coverImageUrl }]
export function getMyBookList() {
  return apiFetch("/api/books/my-list", { method: "GET" });
}

// 제목으로 책 검색 (아무것도 저장 안 함)
// → [{ isbn13, name, writer, coverImageUrl }]
export function searchBooks(keyword) {
  return apiFetch(`/api/books/search?keyword=${encodeURIComponent(keyword)}`, {
    method: "GET",
  });
}

// 검색 결과에서 고른 책 등록(이미 있으면 재사용) → bookId (순수 숫자)
export function registerBook(isbn13) {
  return apiFetch("/api/books", {
    method: "POST",
    body: JSON.stringify({ isbn13 }),
  });
}

// ISBN으로 책 조회 (레거시, POST /api/books와 사실상 동일)
export function getBookByIsbn(isbn13) {
  return apiFetch(`/api/books/isbn/${isbn13}`, { method: "GET" });
}

// 내가 읽은 책 목록에 추가
export function addToMyBookList(bookId) {
  return apiFetch(`/api/books/${bookId}/my-list`, { method: "POST" });
}

// 타인의 읽은 책 목록 → my-list와 같은 형식 [{ bookId, name, coverImageUrl }]
export function getMemberBookList(memberId) {
  return apiFetch(`/api/books/members/${memberId}/list`, { method: "GET" });
}

/* ===================== 3. 독서모임 (/api/book-clubs) ===================== */

// enum 헬퍼 — FE 표시용 라벨/뱃지 매핑
export function typeToMood(type) {
  if (type === "PASSIONATE") return "badge1"; // 깊게 토론해요
  if (type === "MODERATE") return "badge2"; // 부담없이 참여해요
  if (type === "CALM") return "badge3"; // 함께 이야기해요
  return "badge1";
}

export function moodToType(mood) {
  if (mood === "badge1") return "PASSIONATE";
  if (mood === "badge2") return "MODERATE";
  if (mood === "badge3") return "CALM";
  return "MODERATE";
}

export function statusLabel(status) {
  if (status === "PENDING") return "모집중";
  if (status === "IN_PROGRESS") return "모임중";
  if (status === "COMPLETED") return "종료";
  return status;
}

// 전체 독서모임 목록 (가입 여부 무관). role은 가입한 모임만 값 존재.
export function getBookClubs() {
  return apiFetch("/api/book-clubs", { method: "GET" });
}

// 내가 가입한 독서모임 목록
export function getMyBookClubs() {
  return apiFetch("/api/book-clubs/my-list", { method: "GET" });
}

// 독서모임 상세 (가입한 회원만 조회 가능, 미가입 시 409)
export function getBookClubDetail(clubId) {
  return apiFetch(`/api/book-clubs/${clubId}`, { method: "GET" });
}

// 독서모임 생성 (생성자는 자동 가입 + 방장 지정) → clubId (순수 숫자)
export function createBookClub({ name, bookId, date, time, maxCapacity, type }) {
  return apiFetch("/api/book-clubs", {
    method: "POST",
    body: JSON.stringify({ name, bookId, date, time, maxCapacity, type }),
  });
}

// 독서모임 가입
export function joinBookClub(clubId) {
  return apiFetch(`/api/book-clubs/${clubId}/join`, { method: "POST" });
}

/* ===================== 4. 독서록 (/api/notes) ===================== */

// 독서록 작성 (직접 입력 / OCR 텍스트) → noteId (순수 숫자)
export function writeNote(bookId, { phrase, feeling }) {
  return apiFetch(`/api/notes/books/${bookId}`, {
    method: "POST",
    body: JSON.stringify({ phrase, feeling }),
  });
}

// 내가 그 책에 쓴 독서록 목록
export function getNotes(bookId) {
  return apiFetch(`/api/notes/books/${bookId}`, { method: "GET" });
}

// 한 책에 대한 내 AI 독서록 조회
// → { exists, aiNoteId, content, tags, edited } (생성 전이면 exists:false)
export function getAiNote(bookId) {
  return apiFetch(`/api/notes/books/${bookId}/ai-note`, { method: "GET" });
}

// AI 독후감 생성 요청 (내가 그 책에 쓴 독서록들을 취합) → aiNoteId (순수 숫자)
// 503: AI 서버 연결 실패/오류 가능
export function generateAiNote(bookId) {
  return apiFetch(`/api/notes/books/${bookId}/ai-generate`, { method: "POST" });
}

// AI 독서록 직접 수정 (본인 소유 아니면 403)
export function updateAiNote(aiNoteId, newAiContent) {
  return apiFetch(`/api/notes/ai-notes/${aiNoteId}`, {
    method: "PATCH",
    body: JSON.stringify({ newAiContent }),
  });
}

/* ===================== 5. 채팅 (REST 부분) ===================== */

// 채팅 이력 조회 (최근 7일치, createdAt 오름차순). 가입 회원만 가능(409)
export function getChatHistory(clubId) {
  return apiFetch(`/api/book-clubs/${clubId}/chats`, { method: "GET" });
}

// 방장 전용 AI 진행자 개입. 응답을 AI 이름으로 채팅방에 바로 발행하므로
// REST 응답 자체엔 내용이 없고, 결과는 STOMP 구독으로 전달됨.
// mode: "question" | "summary"
// ⚠️ 참여자용 AI 개입(POST /ai-assist)은 폐지되어 이 엔드포인트 하나로 합쳐짐.
// 방장이 아니면 409.
export function requestHostAiAssist(clubId, mode) {
  return apiFetch(`/api/book-clubs/${clubId}/meeting/assist`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export { API_BASE_URL };