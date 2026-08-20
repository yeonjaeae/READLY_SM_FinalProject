// src/pages/Signup.js

import { useState } from "react";

import { useNavigate } from "react-router-dom";

import { signup } from "../api/api";

function Signup() {
  const navigate = useNavigate();

  // ==================================================
  // ★ 회원가입 (POST /api/members/signup, 인증 불필요)
  //
  // 요청: { loginId, email, password }
  // 응답: 생성된 memberId (순수 숫자, 객체로 감싸지 않음)
  //
  // 닉네임(표시 이름)은 이 API에 없고, 가입 후
  // PATCH /api/members/me/profile에서 따로 설정해야 함
  // ==================================================

  const [loginId, setLoginId] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const handleSignup = async () => {
    if (loading) {
      return;
    }

    if (!loginId || !email || !password) {
      setError(
        "아이디, 이메일, 비밀번호를 모두 입력해주세요."
      );

      return;
    }

    setLoading(true);
    setError("");

    try {
      await signup(
        loginId,
        email,
        password
      );

      alert(
        "회원가입이 완료되었습니다. 로그인 후 프로필에서 닉네임을 설정해주세요."
      );

      navigate("/login");
    } catch (err) {
      console.error(
        "회원가입 오류:",
        err
      );

      setError(
        err.message ||
          "회원가입 중 오류가 발생했습니다."
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
          회원가입
        </div>

        <input
          className="auth-input"
          placeholder="아이디 (로그인용)"
          value={loginId}
          onChange={(e) =>
            setLoginId(e.target.value)
          }
        />

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
              handleSignup();
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
          onClick={handleSignup}
          disabled={loading}
        >
          {loading
            ? "가입 중..."
            : "가입하기"}
        </button>
      </div>
    </div>
  );
}

export default Signup;