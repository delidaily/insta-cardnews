import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import archiver from 'archiver';
import { sessionDir, sessionExists, readJson, writeJson } from '@/lib/session/manager';
import type { BodyCardsJson, CardEditorData, GradientConfig, ImagesJson, SessionResult } from '@/lib/session/types';
import { injectContent } from '../../../.claude/skills/card-renderer/scripts/inject_content';

const execFileAsync = promisify(execFile);
const RENDER_SCRIPT = path.join(process.cwd(), '.claude/skills/card-renderer/scripts/render_card.js');

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function gradientToCss(g: GradientConfig): string {
  const [r1, g1, b1] = hexToRgb(g.color_start);
  const [r2, g2, b2] = hexToRgb(g.color_end);
  return `linear-gradient(${g.direction}, rgba(${r1},${g1},${b1},${g.opacity_start}) 0%, rgba(${r2},${g2},${b2},${g.opacity_end}) 100%)`;
}

function defaultOverlayCss(preset: string, cardType: 'thumbnail' | 'body' | 'cta'): string {
  if (preset === 'preset-A') {
    if (cardType === 'thumbnail') return 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.72) 100%)';
    if (cardType === 'body') return 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.82) 100%)';
    return 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.75) 100%)';
  }
  if (preset === 'preset-B') {
    if (cardType === 'thumbnail') return 'linear-gradient(to right, rgba(255,255,255,0.92) 50%, rgba(255,255,255,0.3) 100%)';
    if (cardType === 'body') return 'linear-gradient(to right, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)';
    return 'linear-gradient(to right, rgba(255,255,255,0.88) 50%, rgba(255,255,255,0.2) 100%)';
  }
  if (preset === 'preset-C') {
    return 'linear-gradient(135deg, rgba(108,63,197,0.85) 0%, rgba(197,63,156,0.85) 100%)';
  }
  return 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.8) 100%)';
}

function resolveOverlayCss(gradient: GradientConfig | undefined, preset: string, cardType: 'thumbnail' | 'body' | 'cta'): string {
  return gradient ? gradientToCss(gradient) : defaultOverlayCss(preset, cardType);
}

function buildOverrideStyle(cardOverride: CardEditorData): string {
  const rules: string[] = [];

  for (const [id, o] of Object.entries(cardOverride.elements)) {
    const parts: string[] = [];
    if (o.offsetX !== 0 || o.offsetY !== 0) parts.push(`transform: translate(${o.offsetX}px, ${o.offsetY}px)`);
    if (o.fontSize) parts.push(`font-size: ${o.fontSize}px`);
    if (o.color) parts.push(`color: ${o.color}`);
    if (o.visible === false) parts.push('display: none');
    if (parts.length > 0) rules.push(`#${id} { ${parts.join('; ')} !important; }`);
  }

  const { x, y } = cardOverride.bgPosition;
  if (x !== 50 || y !== 50) rules.push(`#el-bg { background-position: ${x}% ${y}% !important; }`);

  return rules.length > 0 ? `<style id="editor-overrides">\n${rules.join('\n')}\n</style>` : '';
}

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
  const body_req = await req.json() as {
    sessionId: string;
    overrides?: Record<string, CardEditorData>;
    content?: { lines?: [string, string, string]; body?: BodyCardsJson };
  };
  const { sessionId, overrides, content } = body_req;

  if (!sessionExists(sessionId)) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }

  const dir = sessionDir(sessionId);
  const finalDir = path.join(dir, 'final');
  const tempDir = path.join(dir, 'temp');
  fs.mkdirSync(finalDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  // Use editor-supplied text content (if provided), else fall back to saved JSON
  const jsonBody = readJson<BodyCardsJson>(sessionId, 'body_cards.json');
  const body = content?.body ?? jsonBody;
  const images = readJson<ImagesJson>(sessionId, 'images.json');
  const preset = images.preset ?? 'preset-A';

  // Resolve thumbnail lines (editor content takes priority)
  const thumbLines: [string, string, string] = (() => {
    if (content?.lines) return content.lines;
    try {
      const t = readJson<{ lines: [string, string, string] }>(sessionId, 'thumbnail_copy.json');
      return t.lines;
    } catch { return ['', '', '']; }
  })();

  const imgUrl = (card: { selected?: string | null }) =>
    card?.selected ? pathToFileURL(card.selected).href : '';

  const cards: Array<{ key: string; type: 'thumbnail' | 'body' | 'cta'; data: Record<string, string> }> = [
    {
      key: 'card_01', type: 'thumbnail',
      data: {
        line1: thumbLines[0], line2: thumbLines[1], line3: thumbLines[2],
        bg_image: imgUrl(images.card_01 ?? {}),
        overlay_css: resolveOverlayCss(images.card_01?.gradient, preset, 'thumbnail'),
      },
    },
    { key: 'card_02', type: 'body', data: { subtitle: body.card_02.subtitle, body: body.card_02.body, bg_image: imgUrl(images.card_02 ?? {}), overlay_css: resolveOverlayCss(images.card_02?.gradient, preset, 'body') } },
    { key: 'card_03', type: 'body', data: { subtitle: body.card_03.subtitle, body: body.card_03.body, bg_image: imgUrl(images.card_03 ?? {}), overlay_css: resolveOverlayCss(images.card_03?.gradient, preset, 'body') } },
    { key: 'card_04', type: 'body', data: { subtitle: body.card_04.subtitle, body: body.card_04.body, bg_image: imgUrl(images.card_04 ?? {}), overlay_css: resolveOverlayCss(images.card_04?.gradient, preset, 'body') } },
    {
      key: 'card_05', type: 'cta',
      data: {
        cta_main: body.card_05.cta_main,
        cta_sub: body.card_05.cta_sub,
        account: body.card_05.account || process.env.CTA_ACCOUNT || '',
        bg_image: images.card_05?.source === 'user_upload' && images.card_05.selected ? pathToFileURL(images.card_05.selected).href : '',
        bg_color: images.card_05?.source === 'color' ? (images.card_05.color ?? '#1A1A2E') : '',
        overlay_css: resolveOverlayCss(images.card_05?.gradient, preset, 'cta'),
      },
    },
  ];

  const outputFiles: string[] = [];
  const errors: string[] = [];

  for (const card of cards) {
    const tmplPath = templatePath(preset, card.type);
    if (!fs.existsSync(tmplPath)) {
      errors.push(`템플릿 없음: ${tmplPath}`);
      continue;
    }
    const tmplHtml = fs.readFileSync(tmplPath, 'utf-8');
    const fontBaseUrl = pathToFileURL(path.join(process.cwd(), 'public/fonts')).href;
    let injected = injectContent(tmplHtml, { ...card.data, font_base_url: fontBaseUrl });

    // Apply editor position/style overrides as a CSS block
    const cardOverride = overrides?.[card.key];
    if (cardOverride) {
      const overrideStyle = buildOverrideStyle(cardOverride);
      if (overrideStyle) injected = injected.replace('</body>', `${overrideStyle}\n</body>`);
    }
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
