// src/pages/Signup.js

import { useState } from "react";

import { useNavigate } from "react-router-dom";

import { signup } from "../api/api";

function Signup() {
  const navigate = useNavigate();

  const [name, setName] =
    useState("");

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
  // ★ 회원가입 요청 (백엔드 연동)
  //
  // 기존: localStorage에 평문 비밀번호까지
  //      그대로 저장하는 프론트 전용 가짜 가입
  //
  // 변경: 실제 회원가입 API 호출
  //
  // 요청: { name, email, password }
  // 응답: { success: true }
  // ==================================================

  const handleSignup = async () => {
    if (loading) {
      return;
    }

    if (!name || !email || !password) {
      setError(
        "이름, 이메일, 비밀번호를 모두 입력해주세요."
      );

      return;
    }

    setLoading(true);
    setError("");

    try {
      await signup(
        name,
        email,
        password
      );

      // ------------------------------------------
      // 가입 성공 → 로그인 페이지로 이동
      //
      // (백엔드가 가입과 동시에 토큰을 바로 내려주는 방식이라면
      // login()처럼 setToken까지 여기서 처리하고
      // /home으로 바로 보내도록 바꾸면 됨)
      // ------------------------------------------

      alert(
        "회원가입이 완료되었습니다. 로그인해주세요."
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
          placeholder="이름"
          value={name}
          onChange={(e) =>
            setName(e.target.value)
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