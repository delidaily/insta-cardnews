import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { SessionState, StepNumber } from './types';

export const OUTPUT_ROOT = path.join(process.cwd(), 'output');

export function createSession(): string {
  const sessionId = uuidv4();
  const dir = sessionDir(sessionId);
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'final'), { recursive: true });

  const state: SessionState = {
    session_id: sessionId,
    current_step: 1,
    completed_steps: [],
    updated_at: new Date().toISOString(),
  };
  writeJson(sessionId, 'session_state.json', state);
  return sessionId;
}

export function sessionDir(sessionId: string): string {
  return path.join(OUTPUT_ROOT, sessionId);
}

export function readState(sessionId: string): SessionState | null {
  try {
    return readJson<SessionState>(sessionId, 'session_state.json');
  } catch {
    return null;
  }
}

export function updateState(sessionId: string, patch: Partial<SessionState>): void {
  const current = readState(sessionId) ?? {
    session_id: sessionId,
    current_step: 1 as StepNumber,
    completed_steps: [] as StepNumber[],
    updated_at: '',
  };
  writeJson(sessionId, 'session_state.json', {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

export function writeJson<T>(sessionId: string, filename: string, data: T): void {
  const dir = sessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf-8');
}

export function readJson<T>(sessionId: string, filename: string): T {
  const filePath = path.join(sessionDir(sessionId), filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

export function sessionExists(sessionId: string): boolean {
  return fs.existsSync(path.join(sessionDir(sessionId), 'session_state.json'));
}
