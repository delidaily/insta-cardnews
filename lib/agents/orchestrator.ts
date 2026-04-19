import { chat } from '@/lib/ollama/client';
import {
  writeJson,
  readJson,
  updateState,
} from '@/lib/session/manager';
import type {
  ContextJson,
  ThumbnailCopyJson,
  BodyCardsJson,
  StepNumber,
} from '@/lib/session/types';
import {
  contextAnalysisPrompt,
  thumbnailCopyPrompt,
  criticThumbnailPrompt,
  bodyCardsPrompt,
  criticBodyPrompt,
} from './prompts';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

export type AgentEvent =
  | { type: 'step'; step: StepNumber; message: string }
  | { type: 'log'; message: string }
  | { type: 'awaiting_approval'; step: StepNumber; data: unknown }
  | { type: 'error'; message: string; retryable: boolean }
  | { type: 'done'; step: StepNumber };

function extractFirstJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('JSON not found in response');
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new Error('JSON brace not closed in response');
}

async function parseJson<T>(raw: string): Promise<T> {
  const stripped = raw.replace(/```(?:json)?\n?([\s\S]*?)```/g, '$1').trim();
  try {
    return JSON.parse(extractFirstJson(stripped)) as T;
  } catch (e) {
    throw new Error(`JSON 파싱 실패: ${e} | 원문 앞부분: ${raw.slice(0, 200)}`);
  }
}

async function chatWithRetry(
  model: string,
  messages: Parameters<typeof chat>[0]['messages'],
  emit: (e: AgentEvent) => void,
  label: string
): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await chat({ model, messages });
    } catch (err) {
      if (attempt === 2) throw err;
      emit({ type: 'log', message: `${label} 재시도 중 (${attempt}/2)...` });
    }
  }
  throw new Error('unreachable');
}

export async function runStep1(
  sessionId: string,
  topic: string,
  tone: string,
  model: string,
  emit: (e: AgentEvent) => void
): Promise<ContextJson> {
  emit({ type: 'step', step: 1, message: '컨텍스트 분석 중...' });
  const prompt = contextAnalysisPrompt(topic, tone);
  const raw = await chatWithRetry(model, [{ role: 'user', content: prompt }], emit, '컨텍스트 분석');
  const parsed = await parseJson<{ key_points: string[]; tone: string; target_audience: string }>(raw);
  const ctx: ContextJson = { session_id: sessionId, topic, key_points: parsed.key_points, tone: parsed.tone, target_audience: parsed.target_audience };
  writeJson(sessionId, 'context.json', ctx);
  updateState(sessionId, { current_step: 2, completed_steps: [1] });
  emit({ type: 'done', step: 1 });
  return ctx;
}

export async function runStep2(
  sessionId: string,
  model: string,
  emit: (e: AgentEvent) => void
): Promise<ThumbnailCopyJson> {
  emit({ type: 'step', step: 2, message: '썸네일 카피 생성 중...' });
  const ctx = readJson<ContextJson>(sessionId, 'context.json');
  const MAX_ATTEMPTS = 3;
  let bestCandidate: ThumbnailCopyJson | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    emit({ type: 'log', message: `카피 생성 시도 ${attempt}/${MAX_ATTEMPTS}` });
    const feedback = bestCandidate
      ? `이전 점수: ${bestCandidate.critic_score}. ${bestCandidate.score_reason}`
      : undefined;

    const raw = await chatWithRetry(
      model,
      [{ role: 'user', content: thumbnailCopyPrompt(ctx.topic, ctx.tone, ctx.key_points, feedback) }],
      emit,
      `카피 생성 ${attempt}회차`
    );
    const parsed = await parseJson<{ lines: [string, string, string] }>(raw);

    // Python 규칙 검증
    emit({ type: 'log', message: '글자수 규칙 검증 중...' });
    const validationResult = await validateCopy(parsed.lines);
    if (!validationResult.passed) {
      emit({ type: 'log', message: `규칙 실패: ${validationResult.feedback}` });
      bestCandidate = {
        lines: parsed.lines,
        attempts: attempt,
        rule_passed: false,
        critic_score: 0,
        score_reason: validationResult.feedback,
        human_edited: false,
      };
      continue;
    }

    // 비평 에이전트 평가
    emit({ type: 'log', message: '비평 에이전트 평가 중...' });
    const criticRaw = await chatWithRetry(
      model,
      [{ role: 'user', content: criticThumbnailPrompt(parsed.lines, ctx.tone) }],
      emit,
      '비평 에이전트'
    );
    const critic = await parseJson<{ score: number; reason: string }>(criticRaw);
    emit({ type: 'log', message: `비평 점수: ${critic.score}점 — ${critic.reason}` });

    const candidate: ThumbnailCopyJson = {
      lines: parsed.lines,
      attempts: attempt,
      rule_passed: true,
      critic_score: critic.score,
      score_reason: critic.reason,
      human_edited: false,
    };

    if (!bestCandidate || critic.score > bestCandidate.critic_score) {
      bestCandidate = candidate;
    }

    if (critic.score >= 7) {
      writeJson(sessionId, 'thumbnail_copy.json', candidate);
      updateState(sessionId, { current_step: 3, completed_steps: [1, 2] });
      emit({ type: 'done', step: 2 });
      return candidate;
    }

    emit({ type: 'log', message: `점수 ${critic.score} < 7. 재작성합니다.` });
  }

  // 에스컬레이션
  emit({ type: 'log', message: '3회 초과 — 에스컬레이션. 최고점 후보를 제시합니다.' });
  const escalatedCandidate = { ...bestCandidate!, escalated: true };
  writeJson(sessionId, 'thumbnail_copy.json', escalatedCandidate);
  updateState(sessionId, { current_step: 3, completed_steps: [1, 2] });
  emit({ type: 'done', step: 2 });
  return escalatedCandidate;
}

export async function runStep4(
  sessionId: string,
  model: string,
  emit: (e: AgentEvent) => void
): Promise<BodyCardsJson> {
  emit({ type: 'step', step: 4, message: '본문 카드 생성 중...' });
  const ctx = readJson<ContextJson>(sessionId, 'context.json');
  const thumb = readJson<ThumbnailCopyJson>(sessionId, 'thumbnail_copy.json');

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await chatWithRetry(
      model,
      [{ role: 'user', content: bodyCardsPrompt(ctx.topic, ctx.tone, ctx.key_points, thumb.lines) }],
      emit,
      `본문 생성 ${attempt}회차`
    );
    const body = await parseJson<BodyCardsJson>(raw);
    body.card_05.account = process.env.CTA_ACCOUNT ?? body.card_05.account;

    // 비평 에이전트 — 톤 일관성
    const criticRaw = await chatWithRetry(
      model,
      [{ role: 'user', content: criticBodyPrompt(thumb.lines, ctx.tone, body) }],
      emit,
      '본문 비평'
    );
    const critic = await parseJson<{ score: number; reason: string }>(criticRaw);
    emit({ type: 'log', message: `톤 일관성 점수: ${critic.score}점 — ${critic.reason}` });

    if (critic.score >= 7 || attempt === 2) {
      writeJson(sessionId, 'body_cards.json', body);
      updateState(sessionId, { current_step: 5, completed_steps: [1, 2, 3, 4] });
      emit({ type: 'done', step: 4 });
      return body;
    }
    emit({ type: 'log', message: `점수 ${critic.score} < 7. 본문 재작성합니다.` });
  }
  throw new Error('unreachable');
}

async function validateCopy(lines: string[]): Promise<{ passed: boolean; feedback: string }> {
  const scriptPath = path.join(
    process.cwd(),
    '.claude/skills/copy-validator/scripts/validate_copy.py'
  );
  try {
    const { stdout } = await execFileAsync('python', [scriptPath, JSON.stringify(lines)]);
    return JSON.parse(stdout.trim());
  } catch {
    // Python이 없거나 스크립트 오류 시 JS 폴백
    const problems: string[] = [];
    if (lines.length !== 3) problems.push(`줄 수 ${lines.length} (필요: 3)`);
    lines.forEach((l, i) => {
      const len = Array.from(l).length;
      if (len < 7 || len > 12) problems.push(`줄${i + 1} "${l}" — ${len}자 (7~12자 필요)`);
    });
    return problems.length === 0
      ? { passed: true, feedback: '' }
      : { passed: false, feedback: problems.join('; ') };
  }
}
