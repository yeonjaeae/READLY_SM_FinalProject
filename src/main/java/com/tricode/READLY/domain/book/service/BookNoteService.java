package com.tricode.READLY.domain.book.service;

import com.tricode.READLY.domain.book.dto.BookNoteDto;
import com.tricode.READLY.domain.book.entity.AINote;
import com.tricode.READLY.domain.book.entity.Book;
import com.tricode.READLY.domain.book.entity.BookNote;
import com.tricode.READLY.domain.book.repository.AINoteRepository;
import com.tricode.READLY.domain.book.repository.BookRepository;
import com.tricode.READLY.domain.book.repository.BookNoteRepository;
import com.tricode.READLY.domain.member.entity.Member;
import com.tricode.READLY.domain.member.repository.MemberRepository;
import com.tricode.READLY.global.exception.AiServerException;
import com.tricode.READLY.global.exception.ForbiddenException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BookNoteService {

    private final BookNoteRepository booknoteRepository;
    private final AINoteRepository aiNoteRepository;
    private final BookRepository bookRepository;
    private final MemberRepository memberRepository;
    // AI 전용 RestTemplate (타임아웃이 긴 빈). 필드 이름으로 주입 대상이 정해진다 - RestTemplateConfig 참고
    private final RestTemplate aiRestTemplate;

    @Value("${ai.base-url}")
    private String aiBaseUrl;

    /**
     * 각 책에다 가볍게 독서록 남기기 (카메라 텍스트 인식 혹은 직접 입력)
     *      프론트엔드에서 OCR 처리된 텍스트를 phrase 인자로 넘겨준다고 가정
     */
    @Transactional
    public Long createBookNote(Long bookId, Long memberId, String phrase, String feeling) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 책입니다."));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다."));

        BookNote bookNote = BookNote.builder()
                .book(book)
                .member(member)
                .phrase(phrase)
                .feeling(feeling)
                .build();

        booknoteRepository.save(bookNote);
        return bookNote.getId();
    }

    /**
     * 내가 그 책에 쓴 독서록 목록 보기
     */
    public List<BookNoteDto.NoteResponse> getMyBookNotes(Long bookId, Long memberId) {
        return booknoteRepository.findAllByBookIdAndMemberId(bookId, memberId).stream()
                .map(BookNoteDto.NoteResponse::from)
                .toList();
    }

    /**
     * 그 책에 대한 내 AI 독서록 보기
     *      아직 만들지 않았을 수도 있으므로, 없으면 오류가 아니라 빈 응답을 준다.
     */
    public BookNoteDto.AiNoteResponse getMyAiBookNote(Long bookId, Long memberId) {
        return aiNoteRepository.findByBookIdAndMemberId(bookId, memberId)
                .map(BookNoteDto.AiNoteResponse::from)
                .orElseGet(BookNoteDto.AiNoteResponse::empty);
    }

    /**
     * 기존 독서록들을 기반으로 AI에게 하나의 통합 독서록(AINote) 써달라고 하기
     *      책+회원당 AINote는 하나이므로, 이미 있으면 내용을 갱신한다.
     */
    @Transactional
    public Long generateAiBookNote(Long bookId, Long memberId) {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 책입니다."));
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다."));

        // 사용자가 해당 책에 대해 쓴 기존 독서록 목록을 가져오기
        List<BookNote> existingNotes = booknoteRepository.findAllByBookIdAndMemberId(bookId, memberId);
        if (existingNotes.isEmpty()) {
            throw new IllegalStateException("AI 독서록을 만들려면 독서록이 최소 1개 필요합니다.");
        }

        // 독서록 전체를 AI 서버로 보내 독후감 본문과 성향 태그를 한 번에 받아온다
        BookNoteDto.ReviewGenerateResponse aiResult = generateReview(book.getName(), existingNotes);

        // AI 호출이 성공한 뒤에 AINote를 만든다 (실패했는데 빈 행만 남는 것을 막는다)
        AINote aiNote = aiNoteRepository.findByBookIdAndMemberId(bookId, memberId)
                .orElseGet(() -> aiNoteRepository.save(AINote.builder()
                        .book(book)
                        .member(member)
                        .build()));

        aiNote.applyAiContent(aiResult.review()); // 기존 AINote면 더티 체킹으로 갱신
        aiNote.applyTags(joinTags(aiResult.tags()));
        return aiNote.getId();
    }

    /**
     * 독서록 목록을 AI 서버에 보내 독후감 본문과 성향 태그를 받아온다.
     * 본문 생성이 이 기능의 핵심이므로, 실패하면 삼키지 않고 503으로 올린다.
     */
    private BookNoteDto.ReviewGenerateResponse generateReview(String bookTitle, List<BookNote> notes) {
        List<BookNoteDto.NoteItem> noteItems = notes.stream()
                .map(note -> new BookNoteDto.NoteItem(note.getPhrase(), note.getFeeling()))
                .toList();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<BookNoteDto.ReviewGenerateRequest> requestEntity =
                new HttpEntity<>(new BookNoteDto.ReviewGenerateRequest(bookTitle, noteItems), headers);

        BookNoteDto.ReviewGenerateResponse response;
        try {
            response = aiRestTemplate.postForObject(
                    aiBaseUrl + "/api/review/generate", requestEntity, BookNoteDto.ReviewGenerateResponse.class);
        } catch (RestClientException e) {
            throw new AiServerException("AI 독후감 생성 요청 실패 (bookTitle: " + bookTitle + ")", e);
        }

        if (response == null || response.review() == null || response.review().isBlank()) {
            throw new AiServerException("AI 독후감 응답이 비어 있습니다 (bookTitle: " + bookTitle + ")");
        }

        return response;
    }

    // 태그는 부가 정보라서 없으면 null로 두고 독후감만 저장한다
    private String joinTags(List<String> tags) {
        return (tags == null || tags.isEmpty()) ? null : String.join(",", tags);
    }

    /**
     * AI가 쓴 독서록 수정하기
     */
    @Transactional
    public void updateAiBookNote(Long aiNoteId, Long memberId, String newAiContent) {
        AINote aiNote = aiNoteRepository.findById(aiNoteId)
                .orElseThrow(() -> new IllegalArgumentException("AI 독서록을 찾을 수 없습니다."));

        // 남의 AI 독서록은 수정할 수 없다 (LAZY 프록시라도 getId()는 추가 쿼리 없이 읽힌다)
        if (!aiNote.getMember().getId().equals(memberId)) {
            throw new ForbiddenException("내 AI 독서록만 수정할 수 있습니다.");
        }

        aiNote.editContent(newAiContent); // 더티 체킹으로 반영
    }
}
