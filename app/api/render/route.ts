import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { sessionDir, sessionExists, readJson, writeJson } from '@/lib/session/manager';
import type { BodyCardsJson, ImagesJson, SessionResult } from '@/lib/session/types';
import { injectContent } from '../../../.claude/skills/card-renderer/scripts/inject_content';

const execFileAsync = promisify(execFile);
const RENDER_SCRIPT = path.join(process.cwd(), '.claude/skills/card-renderer/scripts/render_card.js');

function templatePath(preset: string, type: 'thumbnail' | 'body' | 'cta'): string {
  return path.join(
    process.cwd(),
    `.claude/skills/template-engine/templates/${preset}/card_${type}.html`
  );
}

async function renderOne(
  htmlContent: string,
  outputPng: string,
  tempHtmlPath: string
): Promise<void> {
  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');
  await execFileAsync('node', [RENDER_SCRIPT, tempHtmlPath, outputPng]);
}

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json() as { sessionId: string };

  if (!sessionExists(sessionId)) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }

  const dir = sessionDir(sessionId);
  const finalDir = path.join(dir, 'final');
  const tempDir = path.join(dir, 'temp');
  fs.mkdirSync(finalDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const body = readJson<BodyCardsJson>(sessionId, 'body_cards.json');
  const images = readJson<ImagesJson>(sessionId, 'images.json');
  const preset = images.preset ?? 'preset-A';

  const cards: Array<{ key: string; type: 'thumbnail' | 'body' | 'cta'; data: Record<string, string> }> = [
    {
      key: 'card_01',
      type: 'thumbnail',
      data: {
        line1: '', line2: '', line3: '',
        bg_image: images.card_01?.selected ? `file://${images.card_01.selected}` : '',
      },
    },
    { key: 'card_02', type: 'body', data: { subtitle: body.card_02.subtitle, body: body.card_02.body, bg_image: images.card_02?.selected ? `file://${images.card_02.selected}` : '' } },
    { key: 'card_03', type: 'body', data: { subtitle: body.card_03.subtitle, body: body.card_03.body, bg_image: images.card_03?.selected ? `file://${images.card_03.selected}` : '' } },
    { key: 'card_04', type: 'body', data: { subtitle: body.card_04.subtitle, body: body.card_04.body, bg_image: images.card_04?.selected ? `file://${images.card_04.selected}` : '' } },
    {
      key: 'card_05',
      type: 'cta',
      data: {
        cta_main: body.card_05.cta_main,
        cta_sub: body.card_05.cta_sub,
        account: body.card_05.account,
        bg_image: images.card_05?.source === 'user_upload' && images.card_05.selected ? `file://${images.card_05.selected}` : '',
        bg_color: images.card_05?.source === 'color' ? (images.card_05.color ?? '#1A1A2E') : '',
      },
    },
  ];

  // 썸네일 카피 적용
  try {
    const thumb = readJson<{ lines: [string, string, string] }>(sessionId, 'thumbnail_copy.json');
    cards[0].data.line1 = thumb.lines[0];
    cards[0].data.line2 = thumb.lines[1];
    cards[0].data.line3 = thumb.lines[2];
  } catch {}

  const outputFiles: string[] = [];
  const errors: string[] = [];

  for (const card of cards) {
    const tmplPath = templatePath(preset, card.type);
    if (!fs.existsSync(tmplPath)) {
      errors.push(`템플릿 없음: ${tmplPath}`);
      continue;
    }
    const tmplHtml = fs.readFileSync(tmplPath, 'utf-8');
    const fontBaseUrl = `file://${path.join(process.cwd(), 'public/fonts')}`;
    const injected = injectContent(tmplHtml, { ...card.data, font_base_url: fontBaseUrl });
    const tempHtml = path.join(tempDir, `${card.key}.html`);
    const outPng = path.join(finalDir, `${card.key}.png`);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await renderOne(injected, outPng, tempHtml);
        outputFiles.push(`${card.key}.png`);
        break;
      } catch (e) {
        if (attempt === 2) errors.push(`${card.key} 렌더링 실패: ${e}`);
      }
    }
  }

  // ZIP 패키징
  const zipPath = path.join(finalDir, 'cardnews_bundle.zip');
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const f of outputFiles) archive.file(path.join(finalDir, f), { name: f });
    archive.finalize();
  });

  const result: SessionResult = {
    session_id: sessionId,
    created_at: new Date().toISOString(),
    thumbnail_attempts: 0,
    thumbnail_final_score: 0,
    preset,
    image_sources: Object.fromEntries(
      Object.entries(images).filter(([k]) => k.startsWith('card_')).map(([k, v]) => [k, (v as { source: string }).source as 'user_upload' | 'none' | 'color'])
    ),
    output_files: outputFiles,
  };

  try {
    const thumb = readJson<{ attempts: number; critic_score: number }>(sessionId, 'thumbnail_copy.json');
    result.thumbnail_attempts = thumb.attempts;
    result.thumbnail_final_score = thumb.critic_score;
  } catch {}

  writeJson(sessionId, 'final/session_result.json', result);

  return NextResponse.json({
    ok: errors.length === 0,
    outputFiles,
    zipPath: `final/cardnews_bundle.zip`,
    errors,
  });
}
