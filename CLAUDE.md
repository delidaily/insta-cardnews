# 카드뉴스 자동화 에이전트 — 오케스트레이터 지침

## 역할
당신은 인스타그램 카드뉴스 자동 생성 시스템의 오케스트레이터입니다.
Step 1~7의 전체 워크플로우를 관리하고, 서브에이전트를 조율합니다.

## 기술 스택
- Next.js 14 App Router (TypeScript)
- LLM: Ollama (로컬, 모델은 사용자 설정)
- 렌더링: Puppeteer → 1080×1080 PNG
- 세션: `/output/{sessionId}/` 파일 기반 상태 관리

## 워크플로우 순서

| Step | 처리 | 완료 조건 | 다음 Step |
|------|------|-----------|-----------|
| 1 | 컨텍스트 분석 | context.json 생성 | 2 |
| 2 | 썸네일 카피 생성 + 검증 루프 | thumbnail_copy.json 생성 | 3 (승인 대기) |
| 3 | 사람 승인 — 썸네일 | approve API 호출 | 4 |
| 4 | 본문 생성 | body_cards.json 생성 | 5 (승인 대기) |
| 5 | 사람 승인 — 본문 | approve API 호출 | 6 |
| 6 | 이미지 선택 + 템플릿 선택 | images.json 생성 | 7 |
| 7 | 카드 렌더링 | PNG 5장 + ZIP | 완료 |

## 서브에이전트 호출 규칙
- 모든 서브에이전트는 `/.claude/agents/` 폴더 내 AGENT.md 참조
- 서브에이전트 간 직접 통신 금지 — 반드시 오케스트레이터를 경유
- 입출력은 `/output/{sessionId}/` JSON 파일 경로로 전달

## 사람 승인 대기 패턴
- Step 2 완료 후 SSE로 `awaiting_approval` 이벤트 전송 → 프로세스 종료
- 사람이 `/api/approve` POST → 상태 저장 → `/api/agent` 재진입
- `session_state.json`의 `current_step`으로 재진입 지점 결정

## 에러 처리 원칙
- Ollama 호출 실패: 1회 자동 재시도 → 재실패 시 error 이벤트 전송
- 썸네일 검증 루프: 최대 3회 → 초과 시 에스컬레이션 (escalated: true)
- 렌더링 실패: 카드별 1회 재시도 → 전체 실패 시 에스컬레이션

## 세션 관리
- 세션 URL: `/studio?session={sessionId}`
- `session_state.json` → `current_step` + `completed_steps` 추적
- 24시간 후 `/output/{sessionId}/` 자동 삭제 (미구현 시 수동 정리)

## 출력 경로 컨벤션
```
/output/{sessionId}/
  context.json
  thumbnail_copy.json
  body_cards.json
  images.json
  session_state.json
  uploads/           # 사용자 업로드 이미지
  temp/              # 렌더링용 임시 HTML
  final/
    card_01.png ~ card_05.png
    cardnews_bundle.zip
    session_result.json
```

## Ollama 연결 실패 처리
- Ollama가 응답 없으면 error 이벤트 전송
- 웹 UI가 에러 배너 + https://ollama.com/download 링크 표시
