import { NextRequest, NextResponse } from 'next/server';
import { readState, updateState, writeJson, readJson, sessionExists } from '@/lib/session/manager';
import type { ThumbnailCopyJson, BodyCardsJson, StepNumber } from '@/lib/session/types';

export async function POST(req: NextRequest) {
  const { sessionId, step, action, data } = await req.json() as {
    sessionId: string;
    step: StepNumber;
    action: 'approve' | 'edit' | 'regenerate';
    data?: unknown;
  };

  if (!sessionExists(sessionId)) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }

  const state = readState(sessionId)!;

  if (step === 3) {
    if (action === 'edit' && data) {
      const edited = data as { lines: [string, string, string] };
      const current = readJson<ThumbnailCopyJson>(sessionId, 'thumbnail_copy.json');
      writeJson(sessionId, 'thumbnail_copy.json', {
        ...current,
        lines: edited.lines,
        human_edited: true,
      });
    }
    if (action !== 'regenerate') {
      const completedSteps = Array.from(new Set([...state.completed_steps, 3])) as StepNumber[];
      updateState(sessionId, { current_step: 4, completed_steps: completedSteps });
      return NextResponse.json({ ok: true, nextStep: 4 });
    }
    updateState(sessionId, { current_step: 2 });
    return NextResponse.json({ ok: true, nextStep: 2 });
  }

  if (step === 5) {
    if (action === 'edit' && data) {
      const editedCards = data as Partial<BodyCardsJson>;
      const current = readJson<BodyCardsJson>(sessionId, 'body_cards.json');
      writeJson(sessionId, 'body_cards.json', { ...current, ...editedCards });
    }
    if (action !== 'regenerate') {
      const completedSteps = Array.from(new Set([...state.completed_steps, 5])) as StepNumber[];
      updateState(sessionId, { current_step: 6, completed_steps: completedSteps });
      return NextResponse.json({ ok: true, nextStep: 6 });
    }
    updateState(sessionId, { current_step: 4 });
    return NextResponse.json({ ok: true, nextStep: 4 });
  }

  if (step === 6) {
    // images.json 저장 (render 직전)
    if (data) writeJson(sessionId, 'images.json', data);
    const completedSteps = Array.from(new Set([...state.completed_steps, 6])) as StepNumber[];
    updateState(sessionId, { current_step: 7, completed_steps: completedSteps });
    return NextResponse.json({ ok: true, nextStep: 7 });
  }

  return NextResponse.json({ error: 'invalid step' }, { status: 400 });
}
