export const TONE_LABELS: Record<string, string> = {
  professional: '전문가적',
  friendly: '친근한',
  humorous: '유머러스',
  inspirational: '인스피레이셔널',
  emotional: '감성적',
  informative: '정보성',
};

export function contextAnalysisPrompt(topic: string, tone: string): string {
  return `당신은 인스타그램 카드뉴스 콘텐츠 전략가입니다.

주제: ${topic}
톤: ${TONE_LABELS[tone] ?? tone}

다음 JSON을 반드시 그대로 출력하세요. 다른 텍스트 없이 JSON만 출력합니다.

{
  "key_points": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "tone": "${tone}",
  "target_audience": "타겟 독자 설명 (한 문장)"
}`;
}

export function thumbnailCopyPrompt(
  topic: string,
  tone: string,
  keyPoints: string[],
  feedback?: string
): string {
  const feedbackSection = feedback ? `\n\n이전 시도 피드백:\n${feedback}` : '';
  return `당신은 인스타그램 썸네일 카피라이터입니다.

주제: ${topic}
톤: ${TONE_LABELS[tone] ?? tone}
핵심 포인트: ${keyPoints.join(', ')}${feedbackSection}

규칙:
- 정확히 3줄 출력
- 각 줄은 7자 이상 12자 이하 (공백 포함)
- 임팩트 있고 클릭을 유도하는 카피

JSON만 출력:
{"lines": ["줄1", "줄2", "줄3"]}`;
}

const CRITIC_RUBRIC = `채점 기준:
1~3점: 규칙 위반, 의미 불명확, 톤 불일치
4~6점: 규칙 준수하나 임팩트 부족, 평범함
7~8점: 명확하고 임팩트 있음, 톤 일치
9~10점: 탁월한 카피, 즉각적 관심 유발`;

export function criticThumbnailPrompt(lines: string[], tone: string): string {
  return `당신은 SNS 카피 비평가입니다. 생성된 카피를 객관적으로 평가합니다.

톤: ${TONE_LABELS[tone] ?? tone}
카피:
줄1: ${lines[0]}
줄2: ${lines[1]}
줄3: ${lines[2]}

${CRITIC_RUBRIC}

JSON만 출력:
{"score": 8.0, "reason": "평가 이유 (한국어 2~3문장)"}`;
}

export function bodyCardsPrompt(
  topic: string,
  tone: string,
  keyPoints: string[],
  thumbnailLines: string[]
): string {
  return `당신은 인스타그램 카드뉴스 본문 작성자입니다.

주제: ${topic}
톤: ${TONE_LABELS[tone] ?? tone}
핵심 포인트: ${keyPoints.join(', ')}
썸네일 카피: ${thumbnailLines.join(' / ')}

규칙:
- card_02, card_03, card_04: subtitle 최대 15자, body 최대 80자
- card_05: CTA 카드. cta_main은 행동 유도 문구, cta_sub는 보조 문구
- 썸네일 톤과 일관성 유지
- 각 카드는 핵심 포인트 하나씩 다룸

JSON만 출력:
{
  "card_02": {"subtitle": "소제목", "body": "본문 텍스트"},
  "card_03": {"subtitle": "소제목", "body": "본문 텍스트"},
  "card_04": {"subtitle": "소제목", "body": "본문 텍스트"},
  "card_05": {"cta_main": "지금 팔로우하세요", "cta_sub": "더 많은 콘텐츠를 만나보세요"}
}`;
}

export function criticBodyPrompt(
  thumbnailLines: string[],
  tone: string,
  bodyCards: object
): string {
  return `당신은 SNS 콘텐츠 비평가입니다. 본문 카드의 톤 일관성을 평가합니다.

기준 톤: ${TONE_LABELS[tone] ?? tone}
썸네일: ${thumbnailLines.join(' / ')}
본문 카드: ${JSON.stringify(bodyCards, null, 2)}

${CRITIC_RUBRIC}
(7~8: 톤 일관성 유지, 9~10: 완벽한 일관성과 유기적 흐름)

JSON만 출력:
{"score": 8.0, "reason": "평가 이유 (한국어 2~3문장)"}`;
}
