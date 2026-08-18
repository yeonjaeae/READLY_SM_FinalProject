// src/pages/AIWrite.js

import { useState } from "react";

import {
  FiSearch,
  FiCamera,
} from "react-icons/fi";

// ==================================================
// ★ Tesseract.js
//
// 브라우저에서 바로 OCR을 돌리는 라이브러리
// API 키 / 결제계정 / 백엔드 없이 동작함
//
// 설치: npm install tesseract.js
// ==================================================

import Tesseract from "tesseract.js";

// ==================================================
// ★ 백엔드 주소
// ==================================================

const API_BASE_URL =
  "http://localhost:8080";

function AIWrite() {
  const [searched, setSearched] =
    useState(false);

  const [selected, setSelected] =
    useState(false);

  // ==================================================
  // 느낀점
  // ==================================================

  const [feeling, setFeeling] =
    useState("");

  // ==================================================
  // AI 독후감 생성 결과 / 상태
  // ==================================================

  const [generated, setGenerated] =
    useState(false);

  const [
    generatedText,
    setGeneratedText,
  ] = useState("");

  const [
    generateLoading,
    setGenerateLoading,
  ] = useState(false);

  const [
    generateError,
    setGenerateError,
  ] = useState("");

  // ==================================================
  // OCR 관련
  // ==================================================

  const [image, setImage] =
    useState(null);

  const [ocrText, setOcrText] =
    useState("");

  const [ocrLoading, setOcrLoading] =
    useState(false);

  const [ocrProgress, setOcrProgress] =
    useState(0);

  const [ocrError, setOcrError] =
    useState("");

  // ==================================================
  // ★ 오타 교정 관련
  //
  // Tesseract가 뽑아낸 원본 텍스트를
  // 백엔드(LLM)로 보내서 자연스러운 문장으로 교정
  // ==================================================

  const [
    correctLoading,
    setCorrectLoading,
  ] = useState(false);

  const [
    correctError,
    setCorrectError,
  ] = useState("");

  // =========================
  // ★ 이미지 전처리 (흑백 + 적응형 대비 + 업스케일)
  // =========================

  const preprocessImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const img = new Image();

        img.onload = () => {
          // ------------------------------------------
          // 해상도 업스케일링
          // ------------------------------------------

          const scaleFactor = 1.8;

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            img.width * scaleFactor;

          canvas.height =
            img.height * scaleFactor;

          const ctx =
            canvas.getContext("2d");

          ctx.drawImage(
            img,
            0,
            0,
            canvas.width,
            canvas.height
          );

          const imageData =
            ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );

          const data =
            imageData.data;

          // ------------------------------------------
          // 흑백 변환 + 적응형 대비 정규화
          // (사진마다 실제 밝기 범위에 맞춰
          // 필요한 만큼만 보정됨)
          // ------------------------------------------

          let min = 255;
          let max = 0;

          const grayValues = [];

          for (
            let i = 0;
            i < data.length;
            i += 4
          ) {
            const avg =
              0.299 * data[i] +
              0.587 * data[i + 1] +
              0.114 * data[i + 2];

            grayValues.push(avg);

            if (avg < min) min = avg;
            if (avg > max) max = avg;
          }

          const range = max - min || 1;

          for (
            let i = 0, p = 0;
            i < data.length;
            i += 4, p++
          ) {
            const stretched =
              ((grayValues[p] - min) /
                range) *
              255;

            data[i] = stretched;
            data[i + 1] = stretched;
            data[i + 2] = stretched;
          }

          ctx.putImageData(
            imageData,
            0,
            0
          );

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(
                new Error(
                  "이미지 전처리에 실패했습니다."
                )
              );
            }
          }, "image/png");
        };

        img.onerror = () =>
          reject(
            new Error(
              "이미지를 불러올 수 없습니다."
            )
          );

        img.src = reader.result;
      };

      reader.onerror = () =>
        reject(
          new Error(
            "파일을 읽을 수 없습니다."
          )
        );

      reader.readAsDataURL(file);
    });
  };

  // =========================
  // ★ 오타 교정 요청
  //
  // Tesseract가 뽑은 원본 텍스트를
  // 백엔드로 보내서, LLM이 문맥에 맞게
  // 자연스러운 문장으로 교정해서 돌려줌
  //
  // 백엔드 응답 예시
  // { "correctedText": "교정된 문장" }
  // =========================

  const correctOcrText = async (
    rawText
  ) => {
    if (!rawText) {
      return rawText;
    }

    setCorrectLoading(true);
    setCorrectError("");

    try {
      // ==================================================
      // ★ 실제 백엔드 연결 시 사용할 코드
      //
      // 백엔드가 LLM에 아래처럼 프롬프트를 구성해서 호출
      //
      // "다음은 책 사진을 OCR로 추출한 텍스트인데,
      //  글자 인식 오류가 섞여 있을 수 있습니다.
      //  문맥에 맞게 자연스러운 문장으로 교정해서
      //  교정된 문장만 출력해주세요:
      //
      //  {rawText}"
      // ==================================================

      /*
      const response = await fetch(
        `${API_BASE_URL}/api/ocr/correct`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ rawText }),
        }
      );

      if (!response.ok) {
        throw new Error(
          "오타 교정 요청에 실패했습니다."
        );
      }

      const data = await response.json();

      return data.correctedText || rawText;
      */

      // ==================================================
      // 현재는 백엔드 연결 전 - 프론트 테스트용
      //
      // ★ 나중에 위 fetch 블록의 주석만 풀고
      // 이 아래 한 줄만 지우면 됨
      // ==================================================

      return rawText;
    } catch (error) {
      console.error(
        "오타 교정 오류:",
        error
      );

      setCorrectError(
        "오타 교정에 실패해서 원본 텍스트를 사용합니다."
      );

      // 실패해도 원본 텍스트는 그대로 쓸 수 있게 반환
      return rawText;
    } finally {
      setCorrectLoading(false);
    }
  };

  // =========================
  // OCR 실행 (Tesseract.js)
  //
  // 추출 → 자동으로 교정까지 이어서 진행
  // =========================

  const runOCR = async (file) => {
    if (!file) return;

    setOcrLoading(true);
    setOcrProgress(0);
    setOcrError("");
    setCorrectError("");
    setOcrText("");

    try {
      let ocrInput = file;

      try {
        ocrInput =
          await preprocessImage(
            file
          );
      } catch (preprocessErr) {
        console.warn(
          "이미지 전처리 실패, 원본으로 진행:",
          preprocessErr
        );
      }

      const result =
        await Tesseract.recognize(
          ocrInput,
          "kor",
          {
            logger: (message) => {
              if (
                message.status ===
                "recognizing text"
              ) {
                setOcrProgress(
                  Math.round(
                    message.progress *
                      100
                  )
                );
              }
            },
          }
        );

      const rawText =
        result?.data?.text?.trim() ||
        "";

      if (!rawText) {
        setOcrError(
          "사진에서 텍스트를 찾지 못했어요."
        );

        return;
      }

      // ------------------------------------------
      // ★ 추출 완료 → 바로 이어서 자동 교정
      // ------------------------------------------

      setOcrLoading(false);

      const corrected =
        await correctOcrText(rawText);

      setOcrText(corrected);
    } catch (error) {
      console.error(
        "OCR 오류:",
        error
      );

      setOcrError(
        "OCR 처리 중 오류가 발생했습니다."
      );
    } finally {
      setOcrLoading(false);
    }
  };

  // =========================
  // 사진 선택
  // =========================

  const handleImageChange = (
    event
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    setImage(
      URL.createObjectURL(file)
    );

    runOCR(file);
  };

  // =========================
  // AI 독후감 생성 요청
  // =========================

  const handleGenerate = async () => {
    if (generateLoading) {
      return;
    }

    setGenerateLoading(true);
    setGenerateError("");
    setGenerated(false);

    const requestData = {
      bookTitle: "노르웨이의 숲",
      bookAuthor: "무라카미 하루키",

      quote: ocrText,

      feeling: feeling,
    };

    console.log(
      "AI 독후감 생성 요청 데이터:",
      requestData
    );

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/reviews/ai-generate`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            requestData
          ),
        }
      );

      if (!response.ok) {
        throw new Error(
          "독후감 생성 요청에 실패했습니다."
        );
      }

      const data =
        await response.json();

      setGeneratedText(
        data.review || ""
      );

      setGenerated(true);
    } catch (error) {
      console.error(
        "AI 독후감 생성 오류:",
        error
      );

      setGenerateError(
        error.message ||
          "독후감 생성 중 오류가 발생했습니다."
      );
    } finally {
      setGenerateLoading(false);
    }
  };

  // ==================================================
  // 사진 버튼 라벨 (단계별로 다르게 표시)
  // ==================================================

  const photoBtnLabel = ocrLoading
    ? `텍스트를 읽는 중... ${ocrProgress}%`
    : correctLoading
    ? "AI가 오타를 교정하고 있어요..."
    : "책 구절 사진 찍기";

  return (
    <div className="page">
      {/* 상단 */}

      <div className="top-bar">
        <div className="logo">
          READLY
        </div>
      </div>

      <div className="line"></div>

      {/* 제목 */}

      <div className="write-top">
        <div className="write-title">
          AI 독후감 작성
        </div>

        <div className="write-sub">
          책과 감상을 기록해보세요
        </div>
      </div>

      {/* 책 검색 */}

      <div className="write-card">
        <div className="input-label">
          어떤 책을 읽었나요?
        </div>

        <div className="book-search">
          <FiSearch />

          <input
            placeholder="책 제목 검색하기"
            onChange={() =>
              setSearched(true)
            }
          />
        </div>

        {searched && !selected && (
          <div
            className="search-item"
            onClick={() =>
              setSelected(true)
            }
          >
            <div className="search-cover">
              📘
            </div>

            <div>
              <div className="book-name">
                노르웨이의 숲
              </div>

              <div className="book-author">
                무라카미 하루키
              </div>
            </div>
          </div>
        )}

        {selected && (
          <div className="book-result">
            <div className="book-cover">
              📘
            </div>

            <div>
              <div className="book-name">
                노르웨이의 숲
              </div>

              <div className="book-author">
                무라카미 하루키
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 인상 깊은 구절 */}

      <div className="write-card">
        <div className="input-label">
          인상 깊은 구절
        </div>

        <textarea
          className="write-textarea"
          placeholder="기억에 남는 문장을 적어보세요"
          value={ocrText}
          onChange={(e) =>
            setOcrText(
              e.target.value
            )
          }
        ></textarea>

        <input
          id="book-photo"
          type="file"
          accept="image/*"
          capture="environment"
          style={{
            display: "none",
          }}
          onChange={
            handleImageChange
          }
        />

        <label
          htmlFor="book-photo"
          className="photo-btn"
        >
          <FiCamera />

          {photoBtnLabel}
        </label>

        {image && (
          <div
            style={{
              marginTop: "14px",
            }}
          >
            <img
              src={image}
              alt="책 구절"
              style={{
                width: "100%",
                maxHeight: "300px",
                objectFit: "contain",
                borderRadius: "12px",
              }}
            />
          </div>
        )}

        {ocrError && (
          <div
            style={{
              marginTop: "10px",
              color: "#e57373",
              fontSize: "13px",
            }}
          >
            {ocrError}
          </div>
        )}

        {correctError && (
          <div
            style={{
              marginTop: "10px",
              color: "#e0a44d",
              fontSize: "13px",
            }}
          >
            {correctError}
          </div>
        )}

        {ocrText &&
          !ocrLoading &&
          !correctLoading && (
            <div
              style={{
                marginTop: "10px",
                fontSize: "12px",
                color: "#888",
              }}
            >
              ✨ 사진에서 텍스트를 추출하고
              AI가 자연스럽게 교정했어요.
              <br />
              필요한 부분은 직접
              수정할 수 있어요.
            </div>
          )}
      </div>

      {/* 느낀점 */}

      <div className="write-card">
        <div className="input-label">
          느낀점
        </div>

        <textarea
          className="write-textarea big"
          placeholder="책을 읽고 어떤 생각이 들었나요?"
          value={feeling}
          onChange={(e) =>
            setFeeling(
              e.target.value
            )
          }
        ></textarea>
      </div>

      {/* 생성 버튼 */}

      <button
        className="generate-btn"
        onClick={handleGenerate}
        disabled={generateLoading}
      >
        {generateLoading
          ? "AI가 독후감을 쓰고 있어요..."
          : "AI 독후감 생성하기"}
      </button>

      {generateError && (
        <div
          style={{
            marginTop: "10px",
            color: "#e57373",
            fontSize: "13px",
          }}
        >
          {generateError}
        </div>
      )}

      {generated && (
        <div className="result-card">
          <div className="result-title">
            ✨ AI 독후감
          </div>

          <div className="result-content">
            {generatedText}
          </div>
        </div>
      )}
    </div>
  );
}

export default AIWrite;