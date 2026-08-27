package com.tricode.READLY.domain.book.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class BookNoteDto {

    // 독서록 작성 요청용 (직접 입력 or 텍스트 인식)
    public record CreateRequest(
            String phrase,
            String feeling
    ) {}

    // 내가 그 책에 쓴 독서록 한 건 (조회 응답)
    public record NoteResponse(
            Long noteId,
            String phrase,
            String feeling
    ) {
        public static NoteResponse from(com.tricode.READLY.domain.book.entity.BookNote note) {
            return new NoteResponse(note.getId(), note.getPhrase(), note.getFeeling());
        }
    }

    // 그 책에 대한 내 AI 독서록 (조회 응답)
    // 아직 생성하지 않았으면 exists=false로 내려보내 프론트가 생성 버튼을 띄우게 한다
    public record AiNoteResponse(
            boolean exists,
            Long aiNoteId,
            String content,
            List<String> tags,
            boolean edited
    ) {
        public static AiNoteResponse empty() {
            return new AiNoteResponse(false, null, null, List.of(), false);
        }

        public static AiNoteResponse from(com.tricode.READLY.domain.book.entity.AINote aiNote) {
            // tags는 DB에 콤마로 이어붙여 저장되므로 목록으로 풀어서 내려준다
            List<String> tagList = (aiNote.getTags() == null || aiNote.getTags().isBlank())
                    ? List.of()
                    : List.of(aiNote.getTags().split(","));
            return new AiNoteResponse(true, aiNote.getId(), aiNote.getContent(), tagList, aiNote.isEdited());
        }
    }

    // AI가 작성한 독서록 수정 요청용
    public record UpdateAiRequest(
            String newAiContent
    ) {}

    // AI 서버에 독후감 생성 요청 (POST /api/review/generate)
    // 한 회원이 그 책에 남긴 독서록을 전부 보내고, 성향 태그 분석도 같은 요청에서 함께 받는다.
    //
    // AI 서버는 필드명을 snake_case로 받는다. 2026-08-26 실제 호출에서 bookTitle로 보내면
    // 422("book_title: Field required")가 나는 것을 확인하고 @JsonProperty를 붙였다.
    // notes / phrase / feeling은 그대로 통과한다. (채팅 쪽 MeetingAssistApiRequest와 같은 규칙)
    public record ReviewGenerateRequest(
            @JsonProperty("book_title") String bookTitle,
            List<NoteItem> notes
    ) {}

    // 요청에 담기는 독서록 한 건
    public record NoteItem(
            String phrase,
            String feeling
    ) {}

    // AI 서버가 생성해 준 독후감 본문과 성향 태그
    public record ReviewGenerateResponse(
            String review,
            List<String> tags
    ) {}
}
