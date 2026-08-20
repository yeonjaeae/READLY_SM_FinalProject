// src/pages/Login.js

import { useState } from "react";

import { useNavigate } from "react-router-dom";

import {
  login,
  setToken,
  setMemberId,
} from "../api/api";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  // ==================================================
  // ★ 로그인 요청 (POST /api/members/login, 인증 불필요)
  //
  // 요청: { email, password }
  // 응답: { memberId, accessToken }
  //
  // ⚠️ 현재 백엔드 명세에는 "내 프로필 조회" GET API가 없음
  // (PATCH /api/members/me/profile로 수정만 가능).
  // 그래서 로그인 직후에는 닉네임/소개 등을 알 수 없고
  // memberId만 저장할 수 있음.
  // → 백엔드에 GET 프로필 조회 API가 추가되면
  //   로그인 성공 후 이어서 호출해 이름까지 채워야 함
  // ==================================================

  const handleLogin = async () => {
    if (loading) {
      return;
    }

    if (!email || !password) {
      setError(
        "이메일과 비밀번호를 입력해주세요."
      );

      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await login(
        email,
        password
      );

      setToken(data.accessToken);
      setMemberId(data.memberId);

      // ------------------------------------------
      // 이름 정보가 없으니 일단 memberId만 저장.
      // 프로필 조회 API가 생기면 여기서 이어서
      // 이름/이미지 등을 채워넣으면 됨
      // ------------------------------------------

      localStorage.setItem(
        "currentUser",
        JSON.stringify({
          id: data.memberId,
        })
      );

      navigate("/home");
    } catch (err) {
      console.error(
        "로그인 오류:",
        err
      );

      setError(
        err.message ||
          "이메일 또는 비밀번호가 올바르지 않습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="auth-page">
        <div className="logo">
          READLY
        </div>

        <div className="auth-title">
          로그인
        </div>

        <input
          className="auth-input"
          placeholder="이메일"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
        />

        <input
          className="auth-input"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) =>
            setPassword(
              e.target.value
            )
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleLogin();
            }
          }}
        />

        {error && (
          <div
            style={{
              color: "#e57373",
              fontSize: "13px",
              marginTop: "8px",
            }}
          >
            {error}
          </div>
        )}

        <button
          className="auth-btn"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading
            ? "로그인 중..."
            : "로그인"}
        </button>

        <div className="auth-bottom">
          계정이 없나요?

          <span
            onClick={() =>
              navigate("/signup")
            }
          >
            회원가입
          </span>
        </div>
      </div>
    </div>
  );
}

export default Login;