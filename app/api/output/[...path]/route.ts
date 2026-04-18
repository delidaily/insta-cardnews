import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { OUTPUT_ROOT } from '@/lib/session/manager';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.zip': 'application/zip',
  '.html': 'text/html',
  '.json': 'application/json',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = path.join(OUTPUT_ROOT, ...params.path);
  const normalized = path.normalize(filePath);

  // Path traversal guard
  if (!normalized.startsWith(path.normalize(OUTPUT_ROOT))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!fs.existsSync(normalized)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const ext = path.extname(normalized).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const buffer = fs.readFileSync(normalized);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': ext === '.zip'
        ? `attachment; filename="${path.basename(normalized)}"`
        : 'inline',
      'Cache-Control': 'no-store',
    },
  });
}
