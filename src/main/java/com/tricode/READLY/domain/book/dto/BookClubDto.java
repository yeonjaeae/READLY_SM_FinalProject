package com.tricode.READLY.domain.book.dto;

import com.tricode.READLY.domain.book.entity.BookClub;

import java.time.LocalDate;
import java.time.LocalTime;

public class BookClubDto {

    // 요청한 회원이 그 모임에서 갖는 역할. 프론트가 이 값으로 방장 전용 UI(AI 호출 버튼 등) 노출을 판단한다.
    public enum ClubRole {
        HOST,
        PARTICIPANT
    }

    // 홈화면 독서모임 목록 응답용.
    // role은 가입한 모임에서만 값이 있다. 전체 목록에는 가입하지 않은 모임도 섞여 있어
    // 모임마다 가입 여부를 확인하면 쿼리가 모임 수만큼 늘어나므로, 그 경우에는 null로 둔다.
    public record HomeListResponse(
            Long clubId,
            String name,
            Long bookId,
            String bookName,
            String bookCoverImageUrl,
            LocalDate date,
            LocalTime time,
            int currentMemberCount,
            int maxCapacity,
            // PENDING(모집중) / FULL(모집완료) / IN_PROGRESS(모임중) / COMPLETED(종료).
            // 저장된 컬럼이 아니라 인원과 모임 시각으로 계산해 내려준다 (BookClub.resolveStatus).
            BookClub.ClubStatus status,
            BookClub.PassionType type,
            ClubRole role
    ) {}

    // 방 입장 시 보여줄 독서모임 상세 정보 응답용 (가입한 회원만 조회할 수 있다)
    public record DetailResponse(
            Long clubId,
            String name,
            Long bookId,
            String bookName,
            String bookCoverImageUrl,
            LocalDate date,
            LocalTime time,
            int currentMemberCount,
            int maxCapacity,
            BookClub.ClubStatus status,
            BookClub.PassionType type,
            Long hostId,
            ClubRole role
    ) {}

    // 독서모임 생성 요청용
    public record CreateRequest(
            String name,
            Long bookId, // 책 제목 선택 시 전달받을 책의 PK
            LocalDate date,
            LocalTime time,
            int maxCapacity,
            BookClub.PassionType type
    ) {}
}
