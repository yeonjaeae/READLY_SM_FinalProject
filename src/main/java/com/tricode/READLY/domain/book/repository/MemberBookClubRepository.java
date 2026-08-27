package com.tricode.READLY.domain.book.repository;

import com.tricode.READLY.domain.book.entity.MemberBookClub;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MemberBookClubRepository extends JpaRepository<MemberBookClub, Long> {

    @Query("select mbc from MemberBookClub mbc join fetch mbc.bookClub where mbc.member.id = :memberId")
    List<MemberBookClub> findAllByMemberIdWithBookClub(@Param("memberId") Long memberId);

    @Query("select mbc from MemberBookClub mbc join fetch mbc.member where mbc.bookClub.id = :clubId")
    List<MemberBookClub> findAllByBookClubIdWithMember(@Param("clubId") Long clubId);

    int countByBookClubId(Long bookClubId);

    /**
     * 여러 모임의 인원수를 한 번에 센다 (known-issues #17).
     * 목록 화면에서 모임마다 countByBookClubId를 부르면 모임 수만큼 COUNT 쿼리가 나가므로,
     * 필요한 모임 id를 모아 GROUP BY 한 번으로 받는다.
     * 가입자가 한 명도 없는 모임은 결과에 들어오지 않으므로 호출하는 쪽에서 0으로 채운다.
     */
    @Query("select mbc.bookClub.id as clubId, count(mbc) as memberCount " +
            "from MemberBookClub mbc where mbc.bookClub.id in :clubIds group by mbc.bookClub.id")
    List<ClubMemberCount> countByBookClubIds(@Param("clubIds") List<Long> clubIds);

    // 위 GROUP BY 결과를 담는 프로젝션 (Object[] 대신 이름으로 꺼내 쓰기 위한 인터페이스)
    interface ClubMemberCount {
        Long getClubId();

        long getMemberCount();
    }

    // 이미 가입한 북클럽인지 확인
    boolean existsByMemberIdAndBookClubId(Long memberId, Long bookClubId);
}
