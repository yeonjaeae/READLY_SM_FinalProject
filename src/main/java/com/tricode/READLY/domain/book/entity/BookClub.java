package com.tricode.READLY.domain.book.entity;

import com.tricode.READLY.domain.member.entity.Member;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BookClub {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "club_id")
    private Long id;

    @Column(nullable = false)
    private String name;

    // 이 북클럽이 함께 읽는 책 (책 1권에 여러 북클럽이 생길 수 있다)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "book_id")
    private Book book;

    // 방장(모임을 만든 회원). 예전에는 member_book_club의 id가 가장 작은 행을 방장으로 봤지만,
    // 그 규칙은 방장이 탈퇴하면 다음 가입자가 조용히 방장이 되는 문제가 있어 컬럼으로 명시한다.
    // FK가 하나뿐이라 "한 모임에 방장은 한 명"이 구조적으로 보장된다.
    // nullable인 이유는 이 컬럼이 생기기 전에 만들어진 모임이 남아 있기 때문이다
    // (db/2026-08-17-add-bookclub-host.sql로 백필한다).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "host_id")
    private Member host;

    private LocalDate creationDate;
    private LocalTime creationTime;

    private int memberCapacity; // 인원

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PassionType type; // 북클럽 타입 (열정도)

    public enum PassionType {
        PASSIONATE,
        MODERATE,
        CALM
    }

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ClubStatus status; // 시작/진행/종료 여부

    public enum ClubStatus {
        PENDING,     // 모집중
        FULL,        // 모집완료 - 정원이 다 찼고 아직 모임 시작 전
        IN_PROGRESS, // 모임중
        COMPLETED    // 종료
    }

    // 모임 진행 시간과 채팅방이 열려 있는 구간. 채팅 전송 제한(ChatService)과 상태 표시가 같은 값을 쓰도록
    // 엔티티에 모아 둔다. 두 곳에 따로 두면 "채팅은 되는데 종료로 보이는" 식으로 어긋난다.
    public static final int MEETING_DURATION_MINUTES = 30;
    public static final int WINDOW_OPEN_BEFORE_MINUTES = 15;
    public static final int WINDOW_CLOSE_AFTER_MINUTES = 15;

    public LocalDateTime getStartAt() {
        return (creationDate == null || creationTime == null) ? null : LocalDateTime.of(creationDate, creationTime);
    }

    public LocalDateTime getChatOpensAt() {
        LocalDateTime start = getStartAt();
        return start == null ? null : start.minusMinutes(WINDOW_OPEN_BEFORE_MINUTES);
    }

    public LocalDateTime getChatClosesAt() {
        LocalDateTime start = getStartAt();
        return start == null ? null : start.plusMinutes(MEETING_DURATION_MINUTES + WINDOW_CLOSE_AFTER_MINUTES);
    }

    // 정원 마감 여부. 가입을 거절하는 조건(BookClubService.joinBookClub)과 같은 식이어야
    // "모집중으로 보이는데 누르면 409"가 생기지 않으므로 여기 한 곳에만 둔다.
    public boolean isFull(int currentMemberCount) {
        return currentMemberCount >= memberCapacity;
    }

    /**
     * 지금 이 모임이 어떤 상태인지 인원과 시각으로 계산한다.
     *
     * status 컬럼은 생성 시점에 PENDING으로 박히고 아무도 바꾸지 않는다. 그래서 정원이 다 차도,
     * 모임이 끝나도 목록에는 계속 "모집중"으로 보였다. 상태를 바꿔 주는 스케줄러를 두는 대신
     * 조회할 때마다 계산한다 (모임은 예정 시각에 30분만 진행되는 단발성 세션이라 이걸로 충분하고,
     * 배치가 밀리면 오히려 화면과 실제가 어긋난다).
     *
     * 정원이 찬 순간 바로 FULL(모집완료)이 되고, 모임 시각이 되면 진행/종료가 그보다 우선한다.
     * 날짜/시간이 비어 있는 과거 모임은 시각을 계산할 수 없으므로 인원만 보고 판단한다.
     */
    public ClubStatus resolveStatus(LocalDateTime now, int currentMemberCount) {
        LocalDateTime start = getStartAt();
        if (start != null) {
            if (now.isAfter(getChatClosesAt())) {
                return ClubStatus.COMPLETED;
            }
            if (!now.isBefore(getChatOpensAt())) {
                return ClubStatus.IN_PROGRESS;
            }
        }
        return isFull(currentMemberCount) ? ClubStatus.FULL : ClubStatus.PENDING;
    }

    @OneToMany(mappedBy = "bookClub")
    private List<MemberBookClub> memberBookClubs = new ArrayList<>();

}
