# 카드뉴스 자동화 에이전트 시스템 설계서

> Claude Code 구현 참조용 계획서 v4.0  
> 인스타그램 카드뉴스 (1080×1080px) 자동 생성 | Next.js + Ollama + Puppeteer

---

## 1. 작업 컨텍스트

### 배경 및 목적

사용자가 주제를 텍스트로 입력하면, 멀티 에이전트가 썸네일 카피 생성 → 본문 작성 → 이미지 수급 → 카드 렌더링까지 자동화하는 웹 기반 시스템. 인스타그램 업로드용 PNG 5장을 최종 산출물로 생성한다.

### 범위

| 포함 | 제외 |
|------|------|
| 텍스트 입력 → PNG 5장 생성 | 인스타그램 자동 업로드 |
| 썸네일 카피 자기검증 루프 (최대 3회) | AI 이미지 생성 (DALL-E 3 — 추후 고도화) |
| 사용자 이미지 직접 업로드 (카드별 선택) | 영상/릴스 포맷 |
| 3단계 사람 승인 (썸네일 / 본문 / 이미지) | 다국어 지원 |
| HTML/CSS 렌더링 → Puppeteer PNG 변환 | 예약 발행 |
| sessionId 기반 세션 복원 (`/studio?session={id}`) | Figma 연동 |
| Ollama 모델 선택 설정 페이지 | — |

> **MVP 이미지 정책**: DALL-E 3 기능은 추후 고도화로 분리. 현재는 사용자 업로드 이미지만 허용. 카드별 업로드 여부는 자유 (업로드 안 한 카드는 텍스트만으로 렌더링).

### 입출력 정의

**입력**
- 카드뉴스 주제 및 핵심 내용 (자유 텍스트, 사용자 직접 입력)
- 톤/스타일 선호도 (고정 라벨 4~6개 드롭다운 선택)
- 이미지: Step 6에서 카드별로 "직접 업로드" 또는 "건너뜀(텍스트 전용)" 선택
- 배경 이미지 그라디언트 방향: 템플릿 프리셋 선택 시 전체 적용

**최종 출력**
- `card_01_thumbnail.png` — 썸네일 (3줄 카피 + 배경 이미지)
- `card_02.png` ~ `card_04.png` — 본문 카드 3장
- `card_05_cta.png` — CTA 카드
- `cardnews_bundle.zip` — PNG 5장 묶음
- `session_result.json` — 생성 메타데이터

### 카드 구성

| 카드 | 역할 | 핵심 요소 |
|------|------|-----------|
| Card 01 | 썸네일 | 3줄 카피 (각 7~12자), 배경 이미지 (선택) |
| Card 02~04 | 본문 | 소제목 (최대 15자) + 본문 텍스트 (최대 80자) + 배경 이미지 (선택) |
| Card 05 | CTA | 행동 유도 문구, 계정 정보, 배경 이미지 or 색상 선택 |

### 제약조건

- 비율: 1:1 정방형, 1080×1080px
- 썸네일 카피: 3줄, 각 줄 7~12자 (Python 규칙 검증)
- 본문 텍스트: 소제목 최대 15자 + 본문 최대 80자 (LLM 프롬프트 하드 제약)
- 검증 루프: 최대 3회 재시도 후 에스컬레이션
- 렌더링: HTML/CSS 마스터 템플릿 → Puppeteer → PNG
- 한글 폰트: Pretendard (/public 로컬 번들, @font-face 로드)
- LLM: Ollama (로컬 실행, 모델은 설정 페이지에서 사용자가 선택)
- 배경 이미지 오버레이: 반투명 그라디언트 (방향은 프리셋 템플릿에 포함)
- 세션 URL: `/studio?session={sessionId}` (복원 가능)

### 용어 정의

| 용어 | 정의 |
|------|------|
| 썸네일 | Card 01. 인스타그램 피드 첫 노출 카드 |
| 카피 | 카드에 들어가는 텍스트 (3줄 구조) |
| CTA | Call to Action. Card 05의 행동 유도 문구 |
| 검증 루프 | 규칙 검증 + LLM 자기평가를 최대 3회 반복하는 품질 게이트 |
| 비평 에이전트 | 생성 에이전트와 분리된 LLM 인스턴스. Step 3~5 품질 평가 담당 |
| 마스터 템플릿 | 카드 디자인 기준이 되는 HTML/CSS 레이아웃 파일 |
| 프리셋 | 2~3가지 시각 테마 중 하나. 색상, 레이아웃, 그라디언트 방향 포함 |
| 이미지 소스 | 사용자 파일 업로드 또는 이미지 없음(텍스트 전용) 중 선택 |
| 에스컬레이션 | 자동 재시도 초과 시 사람에게 판단을 넘기는 처리 방식 |
| Ollama | 로컬 실행 LLM 런타임. 모델은 설정 페이지에서 선택 |

---

## 2. 워크플로우 정의

### 전체 흐름도

```
[사용자 입력]
  - 주제/내용 텍스트 (자유 입력)
  - 톤 선택 드롭다운 (4~6개 고정 라벨)
        │
        ▼
[Step 1] 컨텍스트 분석                          ← LLM(Ollama) 판단
  주제 파악, 핵심 포인트 3개 추출, 톤 설정
  → output/{sessionId}/context.json
        │
        ▼
[Step 2] 썸네일 카피 생성 (썸네일 에이전트)     ← LLM(Ollama) 판단
  ┌──────────────────────────────────────────┐
  │ 검증 루프 (최대 3회)                      │
  │  ① Python 규칙 검증                      │  ← 코드 처리
  │     - 줄 수 == 3 확인                    │
  │     - 각 줄 글자수 7~12자 확인           │
  │     - 실패 시: 실패 줄 + 글자수 피드백   │
  │  ② 비평 에이전트 평가 (10점 만점)        │  ← LLM(Ollama) 별도 인스턴스
  │     - 7점 미만 → 개선 방향 명시 후 재작성│
  │     - 7점 이상 → 루프 종료               │
  │  3회 초과 → 에스컬레이션                 │
  └──────────────────────────────────────────┘
  실패 시: Ollama 자동 재시도 1회 → 재실패 시 수동 재시도 UI
  → output/{sessionId}/thumbnail_copy.json
        │
        ▼
[Step 3] 👤 사람 승인 — 썸네일
  웹 UI: 카피 3줄 + 비평 에이전트 점수 + 시도 횟수
  승인 버튼 클릭 → 새 에이전트 재진입
  → 승인 / 직접 수정 후 재확인 / 재생성 요청
  URL: /studio?session={id} (브라우저 닫아도 복원 가능)
        │ 승인
        ▼
[Step 4] 본문 생성 (본문 에이전트)              ← LLM(Ollama) 판단
  Card 02~04: 소제목(≤15자) + 본문(≤80자)
  Card 05: CTA 메인/서브 문구
  비평 에이전트 톤 일관성 평가 (7점 이상)
  → output/{sessionId}/body_cards.json
        │
        ▼
[Step 5] 👤 사람 승인 — 본문
  웹 UI: Card 02~05 탭 뷰 + 인라인 편집
  → 전체 승인 / 카드별 수정 요청
        │ 승인
        ▼
[Step 6] 이미지 수급 + 템플릿 선택
  ① 프리셋 템플릿 선택 (2~3종, 그라디언트 방향 포함)
  ② 카드별 이미지 처리 (독립 탭)
  ┌───────────────────────────────────────┐
  │ 직접 업로드 선택 시                   │
  │  - 웹 UI 파일 드롭존                 │
  │  - 해상도/비율 자동 검증 (Python)    │  ← 코드 처리
  │  - 부적합 시 리사이즈 안내           │
  ├───────────────────────────────────────┤
  │ 건너뜀(텍스트 전용) 선택 시          │
  │  - 해당 카드는 배경 이미지 없이 렌더링│
  ├───────────────────────────────────────┤
  │ Card 05 CTA: 이미지 업로드 or 색상 선택│
  └───────────────────────────────────────┘
  → output/{sessionId}/images.json (선택 완료)
        │
        ▼
[Step 7] 카드 렌더링 (렌더링 에이전트)          ← 코드 처리
  마스터 HTML 템플릿(프리셋) + 텍스트 + 이미지 주입
  Puppeteer로 1080×1080 PNG 변환 (5장 순차)
  ZIP 패키징
  → output/{sessionId}/final/card_01~05.png
  → output/{sessionId}/final/cardnews_bundle.zip
        │
        ▼
[최종 미리보기 & 다운로드]
  웹 UI: 5장 슬라이드 뷰 + ZIP 다운로드 버튼
```

### 단계별 상세 정의

#### Step 1 — 컨텍스트 분석

| 항목 | 내용 |
|------|------|
| 처리 주체 | 메인 에이전트 (Ollama LLM) |
| 입력 | 사용자 자유 텍스트, 톤 선호도 (드롭다운 선택값) |
| 출력 | `context.json` |
| 성공 기준 | 핵심 포인트 3개 이상 추출, 톤 필드 명시됨 |
| 검증 방법 | 스키마 검증 (필수 필드 존재 + 타입 확인) |
| 실패 처리 | Ollama 자동 재시도 1회 → 재실패 시 수동 재시도 UI |

#### Step 2 — 썸네일 카피 생성 + 검증 루프

| 항목 | 내용 |
|------|------|
| 처리 주체 | 썸네일 에이전트 (생성) + 비평 에이전트 (평가) |
| 입력 | `context.json` |
| 출력 | `thumbnail_copy.json` |
| 성공 기준 | Python 규칙 통과 AND 비평 에이전트 점수 ≥ 7점 |
| 검증 방법 | ① 규칙 기반 Python (글자수) ② 비평 에이전트 (별도 Ollama 인스턴스, 10점 척도 + 점수대별 예시 포함 루브릭) |
| 실패 처리 | 자동 재시도 최대 3회 → 초과 시 에스컬레이션 (웹 UI 경고 모달, 최고점 후보 제시) |

> **비평 에이전트 점수 인플레이션 방지**: 각 점수대(1~3 / 4~6 / 7~8 / 9~10)에 해당하는 구체적 예시와 기준을 시스템 프롬프트에 포함. 생성 에이전트와 다른 system prompt로 분리.

**루프 분기 상세:**

```
규칙 검증 실패
  → 실패한 줄 번호 + 현재 글자수 피드백 포함하여 즉시 재작성

규칙 통과 + 비평 에이전트 점수 < 7점
  → 부족한 이유(임팩트, 명확성, 톤 등) 명시 후 재작성

규칙 통과 + 비평 에이전트 점수 ≥ 7점
  → 루프 종료, Step 3으로 진행

시도 횟수 > 3회
  → 에스컬레이션: 웹 UI 경고 모달 표시
     최고점 후보를 카드로 제시
     사람이 채택 / 직접 수정 / 재생성 중 선택
```

#### Step 3 — 썸네일 사람 승인

| 항목 | 내용 |
|------|------|
| 처리 주체 | 사람 (웹 UI) |
| 웹 UI 표시 | 카피 3줄 미리보기, 비평 에이전트 점수 배지, 시도 횟수 표시 |
| 승인 메커니즘 | '승인 완료' 버튼 클릭 → 현재 Step 상태 저장 → 새 에이전트 재진입 |
| 세션 복원 | `/studio?session={id}` URL로 복원 (브라우저 닫아도 복구 가능) |
| 분기 | 승인 → Step 4 진행 |
| | 직접 수정 → 수정된 텍스트 저장 후 Step 4 진행 |
| | 재생성 요청 → Step 2 초기화하여 재진입 |

#### Step 4 — 본문 생성

| 항목 | 내용 |
|------|------|
| 처리 주체 | 본문 에이전트 (Ollama LLM) |
| 입력 | `context.json` + `thumbnail_copy.json` |
| 출력 | `body_cards.json` |
| 텍스트 제약 | 소제목 최대 15자, 본문 최대 80자 (프롬프트 하드 제약으로 생성 시 제어) |
| 성공 기준 | Card 02~05 모두 존재, 비평 에이전트 톤 일관성 ≥ 7점 |
| 검증 방법 | 규칙 기반 (카드 수 == 4, 글자수 범위) + 비평 에이전트 (톤 일관성) |
| 실패 처리 | Ollama 자동 재시도 1회 → 재실패 시 수동 재시도 UI |

#### Step 5 — 본문 사람 승인

| 항목 | 내용 |
|------|------|
| 처리 주체 | 사람 (웹 UI) |
| 웹 UI 표시 | Card 02~05 탭 뷰, 각 카드 텍스트 인라인 편집 가능 |
| 분기 | 전체 승인 → Step 6 진행 |
| | 카드별 수정 요청 → 해당 카드만 재생성 후 해당 탭 갱신 → 재확인 |

#### Step 6 — 이미지 수급 + 템플릿 선택

| 항목 | 내용 |
|------|------|
| 처리 주체 | 사람 (웹 UI) + 스크립트 (검증) |
| 템플릿 선택 | Step 6 진입 시 2~3종 프리셋 중 선택. 그라디언트 방향(상하/좌우)은 프리셋에 포함 |
| 카드별 이미지 | 독립 탭으로 구성. 각 탭에서 "직접 업로드" 또는 "건너뜀(텍스트 전용)" 선택 |
| 업로드 플로우 | 파일 드롭 → 해상도/비율 검증 (Python) → 부적합 시 리사이즈 안내 |
| 건너뜀 플로우 | 해당 카드는 배경 이미지 없이 프리셋 색상으로 렌더링 |
| Card 05 CTA | "이미지 업로드" 또는 "색상 선택(컬러 피커)" 중 선택 |
| 출력 | `images.json` (소스 유형 + 선택 완료 경로 포함) |
| 실패 처리 (비율 부적합) | 스킵 불가, 사용자에게 적합한 이미지 재업로드 요청 |

#### Step 7 — 카드 렌더링

| 항목 | 내용 |
|------|------|
| 처리 주체 | 렌더링 에이전트 (스크립트 중심) |
| 처리 방식 | 선택된 프리셋 HTML 템플릿 3종(썸네일/본문/CTA)에 콘텐츠 주입 → Puppeteer 캡처 |
| 폰트 | Pretendard (/public 로컬 번들, @font-face 로드, networkidle0 대기) |
| 출력 | `final/card_01~05.png` + `final/cardnews_bundle.zip` + `session_result.json` |
| 성공 기준 | PNG 5장 정상 생성, 해상도 1080×1080 확인 |
| 검증 방법 | 규칙 기반 (파일 존재 + 이미지 사이즈 체크, Python) |
| 실패 처리 | Ollama 자동 재시도 1회 → 실패 카드만 재렌더링 → 전체 실패 시 에스컬레이션 |

### LLM 판단 vs 코드 처리 구분

| LLM이 직접 수행 (Ollama) | 스크립트로 처리 |
|--------------------------|----------------|
| 컨텍스트 분석 (주제 파악, 톤 설정) | 카피 글자수 규칙 검증 (Python) |
| 썸네일 카피 생성 | 업로드 이미지 해상도/비율 검증 |
| 비평 에이전트 점수 평가 (Step 2~5) | HTML 마스터 템플릿 콘텐츠 주입 |
| 본문 카드 텍스트 작성 (Card 02~05) | Puppeteer 1080×1080 PNG 캡처 |
| 톤 일관성 평가 (비평 에이전트) | ZIP 패키징, 파일 I/O, 메타데이터 집계 |
| CTA 문구 생성 | Ollama API 상태 체크 |

---

## 3. 구현 스펙

### 3-1. 폴더 구조

```
/cardnews-agent
  ├── CLAUDE.md                            # 메인 오케스트레이터 지침
  ├── package.json
  ├── next.config.js
  │
  ├── /app                                 # Next.js App Router
  │   ├── /api
  │   │   ├── /agent/route.ts              # 에이전트 실행 (SSE 스트리밍)
  │   │   ├── /approve/route.ts            # 사람 승인 이벤트 처리 + 에이전트 재진입
  │   │   ├── /image-upload/route.ts       # 이미지 업로드 + 검증
  │   │   ├── /render/route.ts             # Puppeteer 렌더링 트리거
  │   │   └── /ollama/route.ts             # Ollama API 프록시 + 연결 상태 체크
  │   ├── /studio                          # 웹 UI 메인
  │   │   └── page.tsx                     # /studio?session={id} 라우트
  │   ├── /settings                        # 설정 페이지
  │   │   └── page.tsx                     # Ollama 연결 설정, 모델 선택
  │   └── layout.tsx
  │
  ├── /.claude
  │   ├── /agents
  │   │   ├── /thumbnail-agent
  │   │   │   └── AGENT.md
  │   │   ├── /critic-agent               # 비평 에이전트 (Step 2~5 품질 평가)
  │   │   │   └── AGENT.md
  │   │   ├── /body-agent
  │   │   │   └── AGENT.md
  │   │   └── /render-agent
  │   │       └── AGENT.md
  │   │
  │   └── /skills
  │       ├── /copy-validator
  │       │   ├── SKILL.md
  │       │   └── /scripts
  │       │       └── validate_copy.py     # 3줄 + 각 줄 7~12자 규칙 검증
  │       ├── /image-validator
  │       │   ├── SKILL.md
  │       │   └── /scripts
  │       │       └── validate_image.py    # 업로드 이미지 해상도/비율 검증
  │       ├── /card-renderer
  │       │   ├── SKILL.md
  │       │   └── /scripts
  │       │       ├── render_card.js       # Puppeteer 1080×1080 캡처
  │       │       └── inject_content.js    # 마스터 HTML에 콘텐츠 주입
  │       └── /template-engine
  │           ├── SKILL.md
  │           └── /templates
  │               ├── /preset-A            # 프리셋 A (예: 다크 + 상하 그라디언트)
  │               │   ├── card_thumbnail.html
  │               │   ├── card_body.html
  │               │   └── card_cta.html
  │               ├── /preset-B            # 프리셋 B
  │               └── /preset-C            # 프리셋 C
  │
  ├── /public
  │   └── /fonts
  │       └── Pretendard-*.woff2           # 로컬 폰트 번들 (@font-face)
  │
  ├── /output
  │   └── /{sessionId}
  │       ├── context.json
  │       ├── thumbnail_copy.json
  │       ├── body_cards.json
  │       ├── images.json
  │       ├── /uploads
  │       ├── /final
  │       │   ├── card_01.png ~ card_05.png
  │       │   ├── cardnews_bundle.zip
  │       │   └── session_result.json
  │       └── session_state.json           # 현재 Step + 승인 상태 (복원용)
  │
  └── /docs
      └── design_tokens.md
```

### 3-2. CLAUDE.md 핵심 섹션 목록

1. **역할 정의** — 오케스트레이터로서 Step 1~7 흐름 관리, 서브에이전트 호출 책임
2. **워크플로우 순서** — 각 Step의 진입 조건, 완료 조건, 다음 Step 전환 규칙
3. **서브에이전트 호출 규칙** — 호출 시점, 입출력 파일 경로 전달 방식
4. **사람 승인 대기 패턴** — 승인 버튼 클릭 → session_state.json 저장 → 에이전트 재진입
5. **에러 처리 원칙** — Ollama 자동 재시도 1회, 수동 재시도 UI, 에스컬레이션 발동 조건
6. **세션 관리** — sessionId 기반 `/output/{sessionId}/` 격리, session_state.json 복원
7. **출력 경로 컨벤션** — 중간 산출물 및 최종 파일 네이밍 규칙
8. **Ollama 연결 실패 처리** — 에러 메시지 + 설치 안내 링크 표시

### 3-3. 에이전트 구조

**멀티 에이전트: 오케스트레이터(CLAUDE.md) + 서브에이전트 4개**

```
CLAUDE.md (오케스트레이터)
  ├── thumbnail-agent   카피 생성 + 검증 루프 관리
  ├── critic-agent      Step 2~5 품질/톤 평가 (별도 Ollama 인스턴스, 독립 system prompt)
  ├── body-agent        본문 5장 생성
  └── render-agent      마스터 템플릿 주입 + Puppeteer PNG 렌더링
```

> 서브에이전트 간 직접 호출 금지. 반드시 메인 오케스트레이터를 통해 조율.

### 3-4. 서브에이전트 상세

| 에이전트 | 역할 | 입력 파일 | 출력 파일 | 참조 스킬 |
|----------|------|-----------|-----------|-----------|
| `thumbnail-agent` | 3줄 카피 생성, 검증 루프(최대 3회) 관리 | `context.json` | `thumbnail_copy.json` | `copy-validator` |
| `critic-agent` | Step 2~5 품질 평가 (10점 척도 + 루브릭). 썸네일 카피 점수, 본문 톤 일관성 점수 | 해당 Step 출력 JSON | 점수 + 개선 피드백 (인라인 반환) | — |
| `body-agent` | Card 02~05 텍스트 생성 (소제목 ≤15자, 본문 ≤80자), CTA 문구 생성 | `context.json`<br>`thumbnail_copy.json` | `body_cards.json` | — |
| `render-agent` | 프리셋 HTML 3종에 콘텐츠+이미지 주입, Puppeteer PNG 변환, ZIP 생성 | `body_cards.json`<br>`images.json` | `final/card_0*.png`<br>`session_result.json` | `card-renderer`<br>`template-engine` |

**데이터 전달 방식:** 모든 중간 산출물은 `/output/{sessionId}/`에 JSON 저장, 에이전트 간 파일 경로만 전달.

### 3-5. 스킬 목록

| 스킬 | 역할 | 트리거 조건 |
|------|------|------------|
| `copy-validator` | 카피 3줄 + 각 줄 7~12자 Python 규칙 검증, 실패 시 상세 피드백 반환 | thumbnail-agent가 카피를 생성할 때마다 (루프 내 매 시도) |
| `image-validator` | 업로드 이미지 해상도/비율 검증, 부적합 시 리사이즈 안내 메시지 반환 | Step 6에서 사용자 업로드 이미지를 수신할 때 |
| `card-renderer` | Puppeteer로 HTML 파일을 1080×1080 PNG로 캡처, 해상도 검증, Pretendard 폰트 로드 완료 대기 | render-agent가 카드별 HTML 주입 완료 직후 |
| `template-engine` | 프리셋 HTML 3종(썸네일/본문/CTA)에 텍스트, 이미지 URL, 그라디언트 방향 주입 | render-agent가 각 카드 렌더링 직전 |

### 3-6. 웹 UI 화면 구성

| 화면 | 역할 | 핵심 컴포넌트 |
|------|------|--------------|
| ① 입력 | 주제 텍스트 입력, 톤 선택(드롭다운 4~6개), 생성 시작 | 텍스트에어리어, 톤 셀렉터, CTA 버튼 |
| ② 진행 상태 | Step별 실시간 진행 표시, Ollama 스트리밍 로그 | 스텝 인디케이터, SSE 로그 패널 |
| ③ 썸네일 승인 | 카피 3줄 카드형 미리보기, 비평 에이전트 점수 배지, 시도 횟수 | 카피 프리뷰 카드, 점수 배지, 승인/수정/재생성 버튼 |
| ④ 본문 승인 | Card 02~05 탭 뷰, 각 카드 인라인 텍스트 편집 | 탭 네비게이션, 편집 가능 텍스트 블록, 카드별 재생성 버튼 |
| ⑤ 이미지 + 템플릿 | 프리셋 선택, 카드별 업로드/건너뜀, Card 05 색상 선택 | 프리셋 썸네일 그리드, 카드 탭, 드롭존, 컬러 피커 |
| ⑥ 최종 미리보기 | 5장 슬라이드 뷰, ZIP 다운로드 | 카드 캐러셀, 개별 PNG 다운로드, ZIP 다운로드 버튼 |
| ⑦ 에스컬레이션 모달 | 검증 3회 초과 시 경고, 최고점 후보 카드 표시 | 모달 오버레이, 후보 카피 카드, 채택/수정/재생성 버튼 |
| ⑧ 설정 | Ollama URL 입력, 모델 선택 드롭다운, 연결 테스트 버튼 | 설정 폼, 연결 상태 표시 |
| ⑨ Ollama 오류 | Ollama 미실행/모델 미설치 시 안내 | 에러 배너, Ollama 설치 안내 링크 |

### 3-7. 설정 페이지 (`/settings`)

| 설정 항목 | 설명 | 저장 방식 |
|-----------|------|-----------|
| Ollama 호스트 URL | 기본값 `http://localhost:11434` | localStorage 또는 .env.local |
| 모델 선택 | Ollama에 설치된 모델 목록 자동 조회 후 드롭다운 | localStorage |
| 연결 테스트 | Ollama API 헬스체크 + 모델 목록 로드 | 실시간 상태 표시 |

### 3-8. 주요 산출물 파일 형식

**`context.json`**
```json
{
  "session_id": "string",
  "topic": "string",
  "key_points": ["string", "string", "string"],
  "tone": "string",
  "target_audience": "string"
}
```

**`thumbnail_copy.json`**
```json
{
  "lines": ["string (7~12자)", "string (7~12자)", "string (7~12자)"],
  "attempts": 2,
  "rule_passed": true,
  "critic_score": 8.0,
  "score_reason": "string",
  "human_edited": false
}
```

**`body_cards.json`**
```json
{
  "card_02": { "subtitle": "string (≤15자)", "body": "string (≤80자)" },
  "card_03": { "subtitle": "string (≤15자)", "body": "string (≤80자)" },
  "card_04": { "subtitle": "string (≤15자)", "body": "string (≤80자)" },
  "card_05": {
    "cta_main": "string",
    "cta_sub": "string",
    "account": "string (환경변수 CTA_ACCOUNT)"
  }
}
```

**`images.json`**
```json
{
  "preset": "preset-A",
  "card_01": {
    "source": "user_upload",
    "selected": "path/upload_01.png"
  },
  "card_02": {
    "source": "none",
    "selected": null
  },
  "card_05": {
    "source": "color",
    "color": "#1A1A2E"
  }
}
```

**`session_state.json`** (복원용)
```json
{
  "session_id": "string",
  "current_step": 4,
  "completed_steps": [1, 2, 3],
  "updated_at": "ISO8601"
}
```

**`session_result.json`**
```json
{
  "session_id": "string",
  "created_at": "ISO8601",
  "thumbnail_attempts": 2,
  "thumbnail_final_score": 8.0,
  "preset": "preset-A",
  "image_sources": {
    "card_01": "user_upload",
    "card_02": "none",
    "card_03": "user_upload",
    "card_04": "user_upload",
    "card_05": "color"
  },
  "output_files": [
    "card_01.png", "card_02.png", "card_03.png", "card_04.png", "card_05.png"
  ]
}
```

---

## 4. 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| 웹 프레임워크 | Next.js 14 (App Router) | API Routes로 에이전트 호출 통합 |
| LLM | Ollama (로컬 실행) | 모델은 설정 페이지에서 사용자가 선택. 한국어에 강한 qwen2.5, gemma3 등 권장 |
| AI 이미지 생성 | 추후 고도화 (DALL-E 3 예정) | MVP에서는 사용자 업로드 전용 |
| 카드 렌더링 | Puppeteer + HTML/CSS | 1080×1080px PNG 변환, Pretendard 폰트 로드 후 캡처 |
| 실시간 상태 전달 | SSE (Server-Sent Events) | Ollama 스트리밍 출력 → 웹 UI 실시간 표시 |
| 파일 저장 | 로컬 파일시스템 | `/output/{sessionId}/` 세션 격리 |
| 이미지 검증/처리 | Python (Pillow) | 업로드 이미지 해상도/비율 검증 |
| 한글 폰트 | Pretendard | /public/fonts 로컬 번들, @font-face 사용 |
| 세션 복원 | URL 쿼리 파라미터 + JSON 파일 | `/studio?session={id}` + `session_state.json` |

---

## 5. 미결 사항 (구현 전 확인 필요)

| 항목 | 내용 | 권장 기본값 |
|------|------|------------|
| CTA 계정 정보 | Card 05에 들어갈 계정명/문구 | 환경변수 `CTA_ACCOUNT`, `CTA_HASHTAGS` |
| 카드 디자인 토큰 | 색상, 여백, 그라디언트 방향 기준 | `/docs/design_tokens.md` 프리셋별 작성 |
| 세션 만료 정책 | `/output/{sessionId}/` 보관 기간 | 24시간 후 자동 삭제 |
| 업로드 파일 크기 제한 | 허용 최대 용량 | 10MB |
| 프리셋 구체적 디자인 | A/B/C 각 테마 색상, 그라디언트 방향, 레이아웃 | 구현 전 별도 시안 확정 |
| 톤 라벨 목록 | 드롭다운 4~6개 고정 라벨 내용 | 예: 전문가적 / 친근한 / 유머러스 / 인스피레이셔널 / 감성적 / 정보성 |
| Ollama 배포 환경 | 클라우드 배포 시 Ollama 서버 분리 필요 | 로컬: localhost:11434, 클라우드: 별도 Ollama 서버 URL |
| 동시 세션 처리 | 다중 사용자 동시 사용 | 초기엔 단일 사용자 가정, sessionId 격리로 확장 가능 |
| DALL-E 3 고도화 시점 | AI 이미지 생성 기능 추가 시 | MVP 안정화 후 별도 브랜치로 작업 |

---

*설계서 버전: v4.0 | 작성일: 2026-04-18*  
*변경 이력: v3.0 → v4.0 — LLM Claude API → Ollama 전용 교체; AI 이미지(DALL-E 3) MVP에서 제외(추후 고도화); 비평 에이전트 독립 모듈로 추가(Step 2~5 적용); 텍스트 글자수 제약 명시(소제목 15자/본문 80자); 세션 복원 URL 패턴 확정(/studio?session={id}); Pretendard 로컬 폰트 번들 방식 확정; 설정 페이지(/settings) 추가; Card 05 색상 선택 옵션 추가; 프리셋 템플릿 2~3종(Step 6 선택) 구조 반영*
