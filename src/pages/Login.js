// src/pages/Login.js

import { useState } from "react";

import { useNavigate } from "react-router-dom";

import {
  login,
  setToken,
} from "../api/api";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  // ==================================================
  // ★ 로딩 / 에러 상태
  // ==================================================

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  // ==================================================
  // ★ 로그인 요청 (백엔드 연동)
  //
  // 기존: localStorage에 저장된 값과 비교하는
  //      프론트 전용 가짜 로그인
  //
  // 변경: 실제 로그인 API 호출
  //
  // 요청: { email, password }
  // 응답: { token, user: { id, name, email } }
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

      // ------------------------------------------
      // 로그인 성공
      //
      // - 토큰 저장 (이후 모든 API 요청에 자동 첨부됨)
      // - 사용자 정보도 같이 저장해서
      //   Profile.js 등에서 바로 꺼내 쓸 수 있게 함
      // ------------------------------------------

      setToken(data.token);

      localStorage.setItem(
        "currentUser",
        JSON.stringify(data.user)
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