import styled from "styled-components";
import { FiSend } from "react-icons/fi";

// ==================================================
// ★ 참고
//
// 이 화면은 clubId를 받지 않는 정적 더미 화면이라
// 실제 백엔드 엔드포인트(채팅 이력 GET, STOMP 실시간 채팅,
// AI 진행자 개입 등)를 연결할 수 없음.
//
// 실제 채팅방 기능은 MeetingRoom.js에 백엔드 명세대로
// 구현되어 있으니, 이 화면은 그대로 두거나 라우트에서
// 제거하는 걸 권장함 (중복 화면으로 보임).
// ==================================================

function GroupDetail() {
  return (
    <Wrap>
      <Header>← 노르웨이의 숲</Header>

      <AIBox>
        AI 질문: 오늘 느낀 감정을 말해보세요
      </AIBox>

      <ChatArea />

      <InputBox>
        <input placeholder="메세지를 입력하세요" />
        <FiSend />
      </InputBox>
    </Wrap>
  );
}

export default GroupDetail;

/* ===== styled ===== */

const Wrap = styled.div`
  padding: 15px;
  background: #F6FBF2;
`;

const Header = styled.div`
  font-weight: bold;
`;

const AIBox = styled.div`
  margin-top: 20px;
  padding: 15px;
  background: #8BC34A;
  color: white;
  border-radius: 12px;
`;

const ChatArea = styled.div`
  height: 300px;
`;

const InputBox = styled.div`
  position: fixed;
  bottom: 10px;
  width: 90%;
  display: flex;
  background: white;
  padding: 10px;
  border-radius: 12px;

  input {
    flex: 1;
    border: none;
    outline: none;
  }
`;