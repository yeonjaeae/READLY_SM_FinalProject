// src/api/api.js

// ==================================================
// 백엔드 기본 주소
// ==================================================
//
// 나중에 백엔드 조원이 알려주는 주소로 변경
//
// 예:
// http://localhost:8080
// http://localhost:8080/api
//
// 현재는 React와 같은 서버를 사용하는 형태로 작성
// ==================================================

const API_BASE_URL = "";


/**
 * AI 독후감 생성 요청
 *
 * 프론트에서 보내는 데이터
 *
 * {
 *   book: {
 *     title,
 *     author
 *   },
 *
 *   ocrText: "사진에서 추출된 책 구절",
 *
 *   quote: "사용자가 직접 작성한 인상 깊은 구절",
 *
 *   reflection: "사용자가 작성한 느낀점"
 * }
 *
 * 백엔드에서는 이 데이터를 받아
 * AI를 이용해 독후감을 생성하고
 * DB에 저장할 예정
 */
export async function createReview(reviewData) {

  const response = await fetch(
    `${API_BASE_URL}/api/reviews/generate`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(reviewData),
    }
  );


  // 백엔드에서 에러가 발생한 경우

  if (!response.ok) {

    throw new Error(
      `독후감 생성 요청 실패: ${response.status}`
    );

  }


  // 백엔드 응답

  const data =
    await response.json();


  return data;
}