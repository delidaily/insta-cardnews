import { NextRequest, NextResponse } from 'next/server';
import { checkHealth, listModels } from '@/lib/ollama/client';

export async function GET(req: NextRequest) {
  const host = req.nextUrl.searchParams.get('host') ?? undefined;
  const healthy = await checkHealth(host);
  if (!healthy) {
    return NextResponse.json({ ok: false, models: [] }, { status: 503 });
  }
  try {
    const models = await listModels(host);
    return NextResponse.json({ ok: true, models: models.map((m) => m.name) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
