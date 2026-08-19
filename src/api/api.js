// src/api/api.js

// ==================================================
// ★ 백엔드 주소
//
// 백엔드 팀원이 실제 배포/로컬 주소 알려주면
// 여기 한 곳만 바꾸면 전체 앱에 적용됨
// ==================================================

export const API_BASE_URL =
  "http://localhost:8080";

// ==================================================
// ★ 로그인 토큰 저장/조회
//
// 로그인 성공 시 setToken()으로 저장해두면
// 이후 모든 apiFetch 호출에 자동으로 붙음
// ==================================================

const TOKEN_KEY = "readlyToken";

export function getToken() {
  return localStorage.getItem(
    TOKEN_KEY
  );
}

export function setToken(token) {
  localStorage.setItem(
    TOKEN_KEY,
    token
  );
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ==================================================
// ★ 공통 fetch 래퍼
//
// - API_BASE_URL 자동으로 붙여줌
// - Content-Type 자동 설정
// - 로그인 토큰이 있으면 Authorization 헤더 자동 첨부
// - 실패 시 백엔드가 보내주는 에러 메시지를 최대한 살려서 throw
//
// 사용 예시:
// const data = await apiFetch("/api/rooms", { method: "GET" });
// ==================================================

export async function apiFetch(
  path,
  options = {}
) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers["Authorization"] =
      `Bearer ${token}`;
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers,
    }
  );

  // ------------------------------------------
  // 응답 body가 없거나 JSON이 아닐 수도 있으니
  // 안전하게 파싱 시도
  // ------------------------------------------

  let data = null;

  try {
    data = await response.json();
  } catch (parseError) {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      "요청 처리 중 오류가 발생했습니다.";

    throw new Error(message);
  }

  return data;
}

// ==================================================
// ★ 인증 관련 API
// ==================================================

// 요청: { email, password }
// 응답: { token: "...", user: { id, name, email } }
export function login(
  email,
  password
) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });
}

// 요청: { name, email, password }
// 응답: { success: true }
export function signup(
  name,
  email,
  password
) {
  return apiFetch(
    "/api/auth/signup",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    }
  );
}

export function logout() {
  clearToken();
  localStorage.removeItem(
    "currentUser"
  );
}