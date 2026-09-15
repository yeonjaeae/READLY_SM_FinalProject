package com.tricode.READLY.domain.book.controller;

import com.tricode.READLY.domain.book.dto.BookNoteDto;
import com.tricode.READLY.domain.book.service.BookNoteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/notes")
public class BookNoteController {

    private final BookNoteService bookNoteService;

    /**
     * 기능: 책을 읽을 때마다 가볍게 독서록 여러 개 남기기
     * 프론트엔드에서 OCR로 추출된 텍스트나 직접 입력한 텍스트를 DTO로 받기
     */
    @PostMapping("/books/{bookId}")
    public ResponseEntity<Long> createBookNote(
            @PathVariable Long bookId,
            @AuthenticationPrincipal Long memberId,
            @RequestBody BookNoteDto.CreateRequest request) {

        Long noteId = bookNoteService.createBookNote(bookId, memberId, request.phrase(), request.feeling());
        return ResponseEntity.ok(noteId);
    }

    /**
     * 기능: 내가 그 책에 쓴 독서록 목록 보기
     */
    @GetMapping("/books/{bookId}")
    public ResponseEntity<List<BookNoteDto.NoteResponse>> getMyBookNotes(
            @PathVariable Long bookId,
            @AuthenticationPrincipal Long memberId) {

        return ResponseEntity.ok(bookNoteService.getMyBookNotes(bookId, memberId));
    }

    /**
     * 기능: 그 책에 대한 내 AI 독서록 보기 (아직 없으면 exists=false)
     */
    @GetMapping("/books/{bookId}/ai-note")
    public ResponseEntity<BookNoteDto.AiNoteResponse> getMyAiBookNote(
            @PathVariable Long bookId,
            @AuthenticationPrincipal Long memberId) {

        return ResponseEntity.ok(bookNoteService.getMyAiBookNote(bookId, memberId));
    }

    /**
     * 기능: 다른 회원의 프로필에서 그 회원이 그 책에 쓴 AI 독서록 보기 (없으면 exists=false)
     */
    @GetMapping("/books/{bookId}/members/{memberId}/ai-note")
    public ResponseEntity<BookNoteDto.AiNoteResponse> getMemberAiBookNote(
            @PathVariable Long bookId,
            @PathVariable Long memberId) {

        return ResponseEntity.ok(bookNoteService.getMemberAiBookNote(bookId, memberId));
    }

    /**
     * 기능: 하나의 책에 대한 여러 독서록들을 기반으로 AI에게 독서록 써달라고 요청
     */
    @PostMapping("/books/{bookId}/ai-generate")
    public ResponseEntity<Long> generateAiBookNote(
            @PathVariable Long bookId,
            @AuthenticationPrincipal Long memberId) {

        Long aiNoteId = bookNoteService.generateAiBookNote(bookId, memberId);
        return ResponseEntity.ok(aiNoteId);
    }

    /**
     * 기능: AI가 쓴 독서록 수정하기
     */
    @PatchMapping("/ai-notes/{aiNoteId}")
    public ResponseEntity<Void> updateAiBookNote(
            @PathVariable Long aiNoteId,
            @AuthenticationPrincipal Long memberId,
            @RequestBody BookNoteDto.UpdateAiRequest request) {

        bookNoteService.updateAiBookNote(aiNoteId, memberId, request.newAiContent());
        return ResponseEntity.ok().build();
    }
}
