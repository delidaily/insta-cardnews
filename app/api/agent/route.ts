import { NextRequest } from 'next/server';
import { createSession, readState, readJson, sessionExists } from '@/lib/session/manager';
import { runStep1, runStep2, runStep4, type AgentEvent } from '@/lib/agents/orchestrator';
import type { ThumbnailCopyJson, BodyCardsJson } from '@/lib/session/types';

function sseChunk(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { topic, tone, model, sessionId: existingSessionId } = body as {
    topic?: string;
    tone?: string;
    model: string;
    sessionId?: string;
  };

  let sessionId = existingSessionId;
  let resumeStep: number | null = null;

  if (sessionId && sessionExists(sessionId)) {
    const state = readState(sessionId);
    resumeStep = state?.current_step ?? 1;
  } else {
    if (!topic || !tone) {
      return new Response(JSON.stringify({ error: 'topic and tone required' }), { status: 400 });
    }
    sessionId = createSession();
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AgentEvent) => {
        controller.enqueue(new TextEncoder().encode(sseChunk(event)));
      };

      try {
        emit({ type: 'log', message: `세션 시작: ${sessionId}` });

        // Step 1 — 컨텍스트 분석
        if (!resumeStep || resumeStep <= 1) {
          await runStep1(sessionId!, topic!, tone!, model, emit);
        }

        // Step 2 — 썸네일 카피
        if (!resumeStep || resumeStep <= 2) {
          await runStep2(sessionId!, model, emit);
          const thumb = readJson<ThumbnailCopyJson>(sessionId!, 'thumbnail_copy.json');
          emit({ type: 'awaiting_approval', step: 3, data: thumb });
          controller.close();
          return;
        }

        // Step 4 — 본문 생성 (Step 3 승인 완료 후 재진입)
        if (resumeStep === 4) {
          await runStep4(sessionId!, model, emit);
          const body = readJson<BodyCardsJson>(sessionId!, 'body_cards.json');
          emit({ type: 'awaiting_approval', step: 5, data: body });
          controller.close();
          return;
        }

        controller.close();
      } catch (err) {
        emit({ type: 'error', message: String(err), retryable: true });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Session-Id': sessionId!,
    },
  });
}
