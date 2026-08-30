package com.tricode.READLY.domain.book.service;

import com.tricode.READLY.domain.book.dto.BookClubDto;
import com.tricode.READLY.domain.book.entity.Book;
import com.tricode.READLY.domain.book.entity.BookClub;
import com.tricode.READLY.domain.book.entity.MemberBookClub;
import com.tricode.READLY.domain.book.repository.BookClubRepository;
import com.tricode.READLY.domain.book.repository.BookRepository;
import com.tricode.READLY.domain.book.repository.MemberBookClubRepository;
import com.tricode.READLY.domain.member.entity.Member;
import com.tricode.READLY.domain.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BookClubService {

    private final BookClubRepository bookClubRepository;
    private final MemberBookClubRepository memberBookclubRepository;
    private final BookRepository bookRepository;
    private final MemberRepository memberRepository;

    /**
     * 기능 2: 홈화면에서 독서모임의 상세 정보 보기
     */
    public List<BookClubDto.HomeListResponse> getHomeBookClubs(Long memberId) {
        List<BookClub> clubs = bookClubRepository.findAllWithBook();

        // 내가 가입한 모임의 id를 쿼리 한 번으로 모아 둔다.
        // 모임마다 가입 여부를 확인하면 쿼리가 모임 수만큼 늘어나므로 이렇게 미리 만든다.
        Set<Long> joinedClubIds = memberBookclubRepository.findAllByMemberIdWithBookClub(memberId).stream()
                .map(memberBookClub -> memberBookClub.getBookClub().getId())
                .collect(Collectors.toSet());

        // 인원수도 같은 이유로 쿼리 한 번에 모아 둔다 (모임마다 COUNT를 부르면 N+1이 된다)
        Map<Long, Integer> memberCounts = countMembersByClub(clubs);

        LocalDateTime now = LocalDateTime.now();

        return clubs.stream().map(club -> {
            int currentMemberCount = memberCounts.getOrDefault(club.getId(), 0);
            Book book = club.getBook(); // 아직 책이 연결되지 않은 기존 모임은 null일 수 있다

            return new BookClubDto.HomeListResponse(
                    club.getId(),
                    club.getName(),
                    book != null ? book.getId() : null,
                    book != null ? book.getName() : null,
                    book != null ? book.getCoverImageUrl() : null,
                    club.getCreationDate(),
                    club.getCreationTime(),
                    currentMemberCount,
                    club.getMemberCapacity(),
                    club.resolveStatus(now, currentMemberCount),
                    club.getType(),
                    // 가입한 모임만 실제 역할을 채우고, 가입하지 않은 모임은 null로 둔다.
                    // 프론트가 이 값으로 입장 전 join 호출 여부를 판단한다.
                    joinedClubIds.contains(club.getId()) ? resolveRole(getHostId(club), memberId) : null
            );
        }).collect(Collectors.toList());
    }

    /**
     * 방 입장 시 보여줄 독서모임 상세 정보. 가입한 회원만 조회할 수 있다.
     * 응답의 role로 프론트가 방장 전용 UI 노출을 판단한다.
     */
    public BookClubDto.DetailResponse getBookClubDetail(Long clubId, Long memberId) {
        if (!memberBookclubRepository.existsByMemberIdAndBookClubId(memberId, clubId)) {
            throw new IllegalStateException("가입하지 않은 독서모임입니다.");
        }

        BookClub club = bookClubRepository.findByIdWithBook(clubId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 독서모임입니다."));
        Book book = club.getBook();
        Long hostId = getHostId(club);
        int currentMemberCount = memberBookclubRepository.countByBookClubId(clubId);

        return new BookClubDto.DetailResponse(
                club.getId(),
                club.getName(),
                book != null ? book.getId() : null,
                book != null ? book.getName() : null,
                book != null ? book.getCoverImageUrl() : null,
                club.getCreationDate(),
                club.getCreationTime(),
                currentMemberCount,
                club.getMemberCapacity(),
                club.resolveStatus(LocalDateTime.now(), currentMemberCount),
                club.getType(),
                hostId,
                resolveRole(hostId, memberId)
        );
    }

    /**
     * 목록에 실을 모임들의 인원수를 GROUP BY 쿼리 한 번으로 모은다 (known-issues #17).
     * 가입자가 없는 모임은 결과에 없으므로 읽는 쪽에서 0으로 채운다.
     */
    private Map<Long, Integer> countMembersByClub(List<BookClub> clubs) {
        if (clubs.isEmpty()) {
            return Map.of(); // 빈 목록을 in 절에 넘기면 DB에 따라 문법 오류가 난다
        }

        List<Long> clubIds = clubs.stream().map(BookClub::getId).toList();

        return memberBookclubRepository.countByBookClubIds(clubIds).stream()
                .collect(Collectors.toMap(
                        MemberBookClubRepository.ClubMemberCount::getClubId,
                        count -> (int) count.getMemberCount()));
    }

    // host는 LAZY 프록시지만 getId()는 추가 쿼리 없이 읽힌다.
    // 백필 전에 만들어진 모임은 방장이 비어 있을 수 있다.
    private Long getHostId(BookClub club) {
        return club.getHost() != null ? club.getHost().getId() : null;
    }

    private BookClubDto.ClubRole resolveRole(Long hostId, Long memberId) {
        return memberId.equals(hostId) ? BookClubDto.ClubRole.HOST : BookClubDto.ClubRole.PARTICIPANT;
    }

    /**
     * 기능 5: 독서모임 만들기 (만든 사람은 자동으로 가입된다)
     */
    @Transactional
    public Long createBookClub(Long memberId, BookClubDto.CreateRequest request) {
        // 독서모임은 어떤 책을 읽을지 반드시 정해야 만들 수 있다.
        // null을 그대로 findById에 넘기면 스프링이 InvalidDataAccessApiUsageException으로 감싸
        // 400이 아니라 500으로 나가므로, 여기서 먼저 걸러낸다.
        if (request.bookId() == null) {
            throw new IllegalArgumentException("독서모임을 만들려면 책을 선택해야 합니다.");
        }

        Book book = bookRepository.findById(request.bookId())
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 책입니다."));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다."));

        // 모임을 만든 사람이 곧 방장이다. 가입 순서에 기대지 않고 컬럼에 명시해 둔다.
        BookClub bookClub = BookClub.builder()
                .name(request.name())
                .book(book)
                .host(member)
                .creationDate(request.date())
                .creationTime(request.time())
                .memberCapacity(request.maxCapacity())
                .type(request.type())
                .status(BookClub.ClubStatus.PENDING)
                .build();

        bookClubRepository.save(bookClub);

        memberBookclubRepository.save(MemberBookClub.builder()
                .member(member)
                .bookClub(bookClub)
                .build());

        return bookClub.getId();
    }

    /**
     * 독서모임 가입하기
     */
    @Transactional
    public void joinBookClub(Long clubId, Long memberId) {
        BookClub bookClub = bookClubRepository.findById(clubId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 독서모임입니다."));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다."));

        if (memberBookclubRepository.existsByMemberIdAndBookClubId(memberId, clubId)) {
            throw new IllegalStateException("이미 가입한 독서모임입니다.");
        }
        int currentMemberCount = memberBookclubRepository.countByBookClubId(clubId);

        // 저장된 status는 PENDING에서 바뀌지 않으므로 조회 응답과 같은 방식으로 계산해 판정한다
        if (bookClub.resolveStatus(LocalDateTime.now(), currentMemberCount) == BookClub.ClubStatus.COMPLETED) {
            throw new IllegalStateException("이미 종료된 독서모임입니다.");
        }
        if (bookClub.isFull(currentMemberCount)) {
            throw new IllegalStateException("정원이 가득 찬 독서모임입니다.");
        }

        memberBookclubRepository.save(MemberBookClub.builder()
                .member(member)
                .bookClub(bookClub)
                .build());
    }

    /**
     * 내가 가입한 독서모임 목록
     */
    public List<BookClubDto.HomeListResponse> getMyBookClubs(Long memberId) {
        List<BookClub> clubs = memberBookclubRepository.findAllByMemberIdWithBookClub(memberId).stream()
                .map(MemberBookClub::getBookClub)
                .toList();

        Map<Long, Integer> memberCounts = countMembersByClub(clubs);
        LocalDateTime now = LocalDateTime.now();

        return clubs.stream()
                .map(club -> {
                    Book book = club.getBook();
                    int currentMemberCount = memberCounts.getOrDefault(club.getId(), 0);
                    return new BookClubDto.HomeListResponse(
                            club.getId(),
                            club.getName(),
                            book != null ? book.getId() : null,
                            book != null ? book.getName() : null,
                            book != null ? book.getCoverImageUrl() : null,
                            club.getCreationDate(),
                            club.getCreationTime(),
                            currentMemberCount,
                            club.getMemberCapacity(),
                            club.resolveStatus(now, currentMemberCount),
                            club.getType(),
                            resolveRole(getHostId(club), memberId) // 전부 내가 가입한 모임이라 역할을 정할 수 있다
                    );
                })
                .collect(Collectors.toList());
    }
}
