import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { sessionDir, sessionExists } from '@/lib/session/manager';

const MAX_BYTES = (parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '10', 10)) * 1024 * 1024;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const sessionId = formData.get('sessionId') as string;
  const cardKey = formData.get('cardKey') as string; // e.g. "card_01"
  const file = formData.get('file') as File | null;

  if (!sessionId || !cardKey) {
    return NextResponse.json({ error: 'sessionId and cardKey required' }, { status: 400 });
  }
  if (!sessionExists(sessionId)) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }
  if (!file) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `파일이 ${process.env.MAX_UPLOAD_SIZE_MB ?? 10}MB를 초과합니다.` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Sharp로 이미지 메타데이터 검증
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return NextResponse.json({ error: '유효하지 않은 이미지 파일입니다.' }, { status: 422 });
  }

  const { width = 0, height = 0 } = meta;
  const ratio = width / height;
  const isSquare = Math.abs(ratio - 1) < 0.05; // 5% 허용 오차

  if (!isSquare) {
    return NextResponse.json({
      error: `비율 오류: ${width}×${height} (${ratio.toFixed(2)}:1). 1:1 정방형 이미지가 필요합니다.`,
      width,
      height,
    }, { status: 422 });
  }

  // 1080×1080으로 리사이즈 후 저장
  const resized = await sharp(buffer)
    .resize(1080, 1080, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 90 })
    .toBuffer();

  const ext = 'jpg';
  const filename = `${cardKey}_bg.${ext}`;
  const uploadsDir = path.join(sessionDir(sessionId), 'uploads');
  const filePath = path.join(uploadsDir, filename);
  writeFileSync(filePath, resized);

  return NextResponse.json({
    ok: true,
    path: filePath,
    relativePath: `uploads/${filename}`,
    width: 1080,
    height: 1080,
  });
}
