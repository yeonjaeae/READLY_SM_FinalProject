// src/pages/AIWrite.js

import { useState, useEffect } from "react";

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

import {
  searchBooks,
  registerBook,
  writeNote,
  generateAiNote,
  getAiNote,
} from "../api/api";

function AIWrite() {
  // ==================================================
  // ★ 책 검색 / 선택 (백엔드 실제 엔드포인트로 교체)
  //
  // GET /api/books/search?keyword= → [{ isbn13, name, writer, coverImageUrl }]
  // POST /api/books { isbn13 } → bookId (선택 즉시 등록해서 미리 받아둠)
  //
  // ⚠️ 백엔드는 "검색 → 선택 → 등록" 흐름만 지원하고
  // 수기 입력(제목/저자 직접 입력)은 지원하지 않음
  // ==================================================

  const [keyword, setKeyword] =
    useState("");

  const [searchResults, setSearchResults] =
    useState([]);

  const [searchLoading, setSearchLoading] =
    useState(false);

  const [selectedBook, setSelectedBook] =
    useState(null); // { isbn13, name, writer, coverImageUrl, bookId }

  const [
    bookRegisterLoading,
    setBookRegisterLoading,
  ] = useState(false);

  useEffect(() => {
    if (keyword.trim() === "") {
      setSearchResults([]);
      return;
    }

    let ignore = false;

    const timer = setTimeout(async () => {
      setSearchLoading(true);

      try {
        const data = await searchBooks(
          keyword.trim()
        );

        if (!ignore) {
          setSearchResults(data || []);
        }
      } catch (error) {
        console.error(
          "책 검색 오류:",
          error
        );

        if (!ignore) {
          setSearchResults([]);
        }
      } finally {
        if (!ignore) {
          setSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [keyword]);

  const handleSelectBook = async (book) => {
    setBookRegisterLoading(true);

    try {
      const bookId = await registerBook(
        book.isbn13
      );

      setSelectedBook({ ...book, bookId });
      setKeyword("");
      setSearchResults([]);
    } catch (error) {
      console.error(
        "책 등록 오류:",
        error
      );

      alert(
        "책 정보를 등록하지 못했습니다. 다시 시도해주세요."
      );
    } finally {
      setBookRegisterLoading(false);
    }
  };

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
  // ★ 오타 교정
  //
  // Tesseract가 뽑은 원본 텍스트를 자연스럽게 교정해주는
  // 백엔드 API(예: POST /api/ocr/correct)는 실제 백엔드
  // 명세서에 존재하지 않아서 제거함.
  //
  // 지금은 OCR로 추출한 원본 텍스트를 그대로 사용하고,
  // 필요하면 사용자가 textarea에서 직접 수정하도록 함.
  // (교정 기능이 정말 필요하면 백엔드 팀에 엔드포인트
  // 추가를 요청해야 함)
  // ==================================================

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
  // OCR 실행 (Tesseract.js)
  // =========================

  const runOCR = async (file) => {
    if (!file) return;

    setOcrLoading(true);
    setOcrProgress(0);
    setOcrError("");
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

      setOcrText(rawText);
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
  // ★ AI 독후감 생성 (백엔드 실제 엔드포인트로 교체)
  //
  // 1) POST /api/notes/books/{bookId} { phrase, feeling }
  //    → 내 독서록(구절+느낌)을 먼저 저장
  // 2) POST /api/notes/books/{bookId}/ai-generate
  //    → 저장된 독서록들을 취합해 AI 독후감 생성, aiNoteId 반환
  // 3) GET /api/notes/books/{bookId}/ai-note
  //    → 생성된 AI 독후감 본문(content)을 조회
  //
  // 503: AI 서버 연결 실패/타임아웃/오류일 수 있음
  // =========================

  const handleGenerate = async () => {
    if (generateLoading) {
      return;
    }

    if (!selectedBook?.bookId) {
      setGenerateError(
        "먼저 책을 검색해서 선택해주세요."
      );

      return;
    }

    setGenerateLoading(true);
    setGenerateError("");
    setGenerated(false);

    try {
      await writeNote(selectedBook.bookId, {
        phrase: ocrText,
        feeling,
      });

      await generateAiNote(selectedBook.bookId);

      const aiNote = await getAiNote(
        selectedBook.bookId
      );

      setGeneratedText(aiNote?.content || "");
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
            value={keyword}
            onChange={(e) =>
              setKeyword(e.target.value)
            }
          />
        </div>

        {searchLoading && (
          <div
            style={{
              fontSize: "12px",
              color: "#888",
              padding: "6px 2px",
            }}
          >
            검색 중...
          </div>
        )}

        {searchResults.map((book) => (
          <div
            key={book.isbn13}
            className="search-item"
            onClick={() =>
              handleSelectBook(book)
            }
          >
            <div className="search-cover">
              {book.coverImageUrl ? (
                <img
                  src={book.coverImageUrl}
                  alt={book.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                "📘"
              )}
            </div>

            <div>
              <div className="book-name">
                {book.name}
              </div>

              <div className="book-author">
                {book.writer}
              </div>
            </div>
          </div>
        ))}

        {selectedBook && (
          <div className="book-result">
            <div className="book-cover">
              {selectedBook.coverImageUrl ? (
                <img
                  src={selectedBook.coverImageUrl}
                  alt={selectedBook.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                "📘"
              )}
            </div>

            <div>
              <div className="book-name">
                {selectedBook.name}
              </div>

              <div className="book-author">
                {selectedBook.writer}
              </div>
            </div>
          </div>
        )}

        {bookRegisterLoading && (
          <div
            style={{
              fontSize: "12px",
              color: "#888",
              padding: "6px 2px",
            }}
          >
            책 정보를 등록하는 중...
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

        {ocrText && !ocrLoading && (
          <div
            style={{
              marginTop: "10px",
              fontSize: "12px",
              color: "#888",
            }}
          >
            ✨ 사진에서 텍스트를 추출했어요.
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