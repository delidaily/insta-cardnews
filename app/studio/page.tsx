'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

const TONE_OPTIONS = [
  { value: 'professional', label: '전문가적' },
  { value: 'friendly', label: '친근한' },
  { value: 'humorous', label: '유머러스' },
  { value: 'inspirational', label: '인스피레이셔널' },
  { value: 'emotional', label: '감성적' },
  { value: 'informative', label: '정보성' },
];

const PRESET_OPTIONS = [
  { value: 'preset-A', label: 'Dark', desc: '다크 배경 + 상하 그라디언트 + 골드 포인트' },
  { value: 'preset-B', label: 'Clean', desc: '화이트 배경 + 좌우 그라디언트 + 블루 포인트' },
  { value: 'preset-C', label: 'Vivid', desc: '퍼플→핑크 그라디언트 + 옐로우 포인트' },
];

const CARD_KEYS = ['card_01', 'card_02', 'card_03', 'card_04', 'card_05'] as const;
type CardKey = typeof CARD_KEYS[number];

interface ThumbnailCopy { lines: [string, string, string]; critic_score: number; attempts: number; escalated?: boolean; }
interface BodyCard { subtitle: string; body: string; }
interface BodyCards { card_02: BodyCard; card_03: BodyCard; card_04: BodyCard; card_05: { cta_main: string; cta_sub: string; account: string }; }
type Phase = 'input' | 'processing' | 'approve-thumbnail' | 'approve-body' | 'image-select' | 'rendering' | 'done' | 'error';

function StudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionIdFromUrl = searchParams.get('session');

  const [phase, setPhase] = useState<Phase>('input');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional');
  const [sessionId, setSessionId] = useState<string | null>(sessionIdFromUrl);
  const sessionIdRef = useRef<string | null>(sessionIdFromUrl);
  const [logs, setLogs] = useState<string[]>([]);
  const [thumbnail, setThumbnail] = useState<ThumbnailCopy | null>(null);
  const [editedLines, setEditedLines] = useState<[string, string, string]>(['', '', '']);
  const [bodyCards, setBodyCards] = useState<BodyCards | null>(null);
  const [editedBody, setEditedBody] = useState<BodyCards | null>(null);
  const [preset, setPreset] = useState('preset-A');
  const [imageMap, setImageMap] = useState<Record<CardKey, { source: 'user_upload' | 'none' | 'color'; file?: File; preview?: string; color?: string }>>({
    card_01: { source: 'none' }, card_02: { source: 'none' }, card_03: { source: 'none' }, card_04: { source: 'none' }, card_05: { source: 'color', color: '#1A1A2E' },
  });
  const [outputFiles, setOutputFiles] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [model, setModel] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setModel(localStorage.getItem('ollama_model') ?? ''); }, []);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const addLog = useCallback((msg: string) => setLogs((p) => [...p, msg]), []);

  async function startGeneration() {
    if (!model) { setError('설정 페이지에서 Ollama 모델을 먼저 선택하세요.'); return; }
    if (!topic.trim()) { setError('주제를 입력하세요.'); return; }
    setError(''); setLogs([]); setPhase('processing');

    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, tone, model }),
    });

    const newSessionId = res.headers.get('X-Session-Id') ?? '';
    sessionIdRef.current = newSessionId;
    setSessionId(newSessionId);
    router.replace(`/studio?session=${newSessionId}`, { scroll: false });
    await consumeSSE(res);
  }

  async function resumeGeneration(sid: string, nextStep: number) {
    setPhase('processing');
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, sessionId: sid, resumeStep: nextStep }),
    });
    await consumeSSE(res);
  }

  async function consumeSSE(res: Response) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const chunk of lines) {
        if (!chunk.startsWith('data:')) continue;
        try {
          const event = JSON.parse(chunk.slice(5).trim());
          handleSSEEvent(event);
        } catch {}
      }
    }
  }

  function handleSSEEvent(event: Record<string, unknown>) {
    if (event.type === 'log' || event.type === 'step') addLog(event.message as string);
    if (event.type === 'error') { setError(event.message as string); setPhase('error'); }
    if (event.type === 'awaiting_approval') {
      const step = event.step as number;
      const d = event.data as Record<string, unknown>;
      if (step === 3) {
        const lines = d.lines as [string, string, string];
        setThumbnail({ lines, critic_score: d.critic_score as number, attempts: d.attempts as number, escalated: d.escalated as boolean | undefined });
        setEditedLines([...lines]);
        setPhase('approve-thumbnail');
      }
      if (step === 5) {
        const body = d as unknown as BodyCards;
        setBodyCards(body);
        setEditedBody(JSON.parse(JSON.stringify(body)));
        setPhase('approve-body');
      }
    }
  }

  async function approveThumbnail(action: 'approve' | 'edit' | 'regenerate') {
    const res = await fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, step: 3, action, data: action === 'edit' ? { lines: editedLines } : undefined }),
    });
    const data = await res.json();
    if (data.nextStep === 4) resumeGeneration(sessionId!, 4);
    else if (data.nextStep === 2) { setLogs([]); await startGeneration(); }
  }

  async function approveBody(action: 'approve' | 'edit' | 'regenerate') {
    const res = await fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, step: 5, action, data: action === 'edit' ? editedBody : undefined }),
    });
    const data = await res.json();
    if (data.nextStep === 6) setPhase('image-select');
    else if (data.nextStep === 4) resumeGeneration(sessionId!, 4);
  }

  async function handleImageUpload(cardKey: CardKey, file: File) {
    const fd = new FormData();
    fd.append('sessionId', sessionId!);
    fd.append('cardKey', cardKey);
    fd.append('file', file);
    const res = await fetch('/api/image-upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) {
      setImageMap((prev) => ({ ...prev, [cardKey]: { source: 'user_upload', file, preview: URL.createObjectURL(file), selected: data.path } }));
    } else {
      alert(data.error);
    }
  }

  async function startRendering() {
    setPhase('rendering');
    // Save images.json
    const imagesPayload = {
      preset,
      ...Object.fromEntries(
        CARD_KEYS.map((k) => {
          const v = imageMap[k];
          return [k, { source: v.source, selected: (v as { selected?: string }).selected ?? null, color: v.color }];
        })
      ),
    };
    await fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, step: 6, action: 'approve', data: imagesPayload }),
    });

    // Write images.json directly via a convenience endpoint
    const renderRes = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, images: imagesPayload }),
    });
    const result = await renderRes.json();
    if (result.ok) { setOutputFiles(result.outputFiles); setPhase('done'); }
    else { setError(result.errors?.join('\n') ?? '렌더링 실패'); setPhase('error'); }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-bold">📱 카드뉴스 생성기</h1>
        <a href="/settings" className="text-sm text-gray-400 hover:text-gray-200">⚙️ 설정</a>
      </header>

      {/* Step indicator */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex gap-2 text-xs">
          {['입력', '처리중', '썸네일 승인', '본문 승인', '이미지 선택', '렌더링', '완료'].map((label, i) => {
            const stepPhases: Phase[] = ['input', 'processing', 'approve-thumbnail', 'approve-body', 'image-select', 'rendering', 'done'];
            const active = phase === stepPhases[i];
            const done = stepPhases.indexOf(phase) > i;
            return (
              <div key={i} className={`px-3 py-1 rounded-full ${active ? 'bg-blue-600 text-white' : done ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
                {done ? '✓' : `${i + 1}.`} {label}
              </div>
            );
          })}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/40 border border-red-700 rounded-xl text-red-300 text-sm">
            {model ? '' : '⚠️ '}
            {error}
            {!model && <a href="/settings" className="ml-2 underline">설정 페이지로 이동 →</a>}
          </div>
        )}

        {/* Phase: Input */}
        {phase === 'input' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">카드뉴스 주제 및 내용</label>
              <textarea
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm h-40 resize-none focus:outline-none focus:border-blue-500"
                placeholder="예) 직장인 생산성을 높이는 5가지 습관. 아침 루틴, 집중력 향상법, 할 일 목록 작성법..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">톤/스타일</label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tone === t.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={startGeneration}
              disabled={!topic.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white py-3 rounded-xl font-semibold text-base transition-colors"
            >
              카드뉴스 생성 시작
            </button>
          </div>
        )}

        {/* Phase: Processing */}
        {phase === 'processing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>에이전트가 작업 중입니다...</span>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs text-gray-400 space-y-1">
              {logs.map((l, i) => <div key={i}>{l}</div>)}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Phase: Approve Thumbnail */}
        {phase === 'approve-thumbnail' && thumbnail && (
          <div className="space-y-6">
            {thumbnail.escalated && (
              <div className="p-4 bg-yellow-900/40 border border-yellow-700 rounded-xl text-yellow-300 text-sm">
                ⚠️ 3회 시도 후 최고점 후보입니다. 직접 수정하거나 재생성하세요.
              </div>
            )}
            <div className="bg-gray-900 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">썸네일 카피 검토</h2>
                <div className="flex gap-2 text-sm">
                  <span className="bg-gray-800 px-2 py-1 rounded">{thumbnail.attempts}회 시도</span>
                  <span className={`px-2 py-1 rounded font-bold ${thumbnail.critic_score >= 7 ? 'bg-green-900 text-green-300' : 'bg-orange-900 text-orange-300'}`}>
                    {thumbnail.critic_score.toFixed(1)}점
                  </span>
                </div>
              </div>
              <div className="space-y-3 mb-6">
                {editedLines.map((line, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm w-8">줄{i + 1}</span>
                    <input
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-lg font-bold focus:outline-none focus:border-blue-500"
                      value={line}
                      onChange={(e) => {
                        const newLines = [...editedLines] as [string, string, string];
                        newLines[i] = e.target.value;
                        setEditedLines(newLines);
                      }}
                    />
                    <span className={`text-xs w-10 text-right ${Array.from(line).length >= 7 && Array.from(line).length <= 12 ? 'text-green-400' : 'text-red-400'}`}>
                      {Array.from(line).length}자
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => approveThumbnail('approve')} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-medium">✓ 승인</button>
                <button onClick={() => approveThumbnail('edit')} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium">수정 후 진행</button>
                <button onClick={() => approveThumbnail('regenerate')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium">재생성</button>
              </div>
            </div>
          </div>
        )}

        {/* Phase: Approve Body */}
        {phase === 'approve-body' && bodyCards && editedBody && (
          <div className="space-y-4">
            <h2 className="font-semibold">본문 카드 검토</h2>
            {(['card_02', 'card_03', 'card_04'] as const).map((k) => (
              <div key={k} className="bg-gray-900 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-2">{k.replace('_', ' ').toUpperCase()}</div>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base font-bold mb-2 focus:outline-none"
                  value={editedBody[k].subtitle}
                  onChange={(e) => setEditedBody((p) => ({ ...p!, [k]: { ...p![k], subtitle: e.target.value } }))}
                />
                <textarea
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm h-24 resize-none focus:outline-none"
                  value={editedBody[k].body}
                  onChange={(e) => setEditedBody((p) => ({ ...p!, [k]: { ...p![k], body: e.target.value } }))}
                />
              </div>
            ))}
            <div className="bg-gray-900 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-2">CARD 05 — CTA</div>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base font-bold mb-2 focus:outline-none" value={editedBody.card_05.cta_main} onChange={(e) => setEditedBody((p) => ({ ...p!, card_05: { ...p!.card_05, cta_main: e.target.value } }))} />
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editedBody.card_05.cta_sub} onChange={(e) => setEditedBody((p) => ({ ...p!, card_05: { ...p!.card_05, cta_sub: e.target.value } }))} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => approveBody('approve')} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-medium">✓ 승인</button>
              <button onClick={() => approveBody('edit')} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium">수정 후 진행</button>
              <button onClick={() => approveBody('regenerate')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium">재생성</button>
            </div>
          </div>
        )}

        {/* Phase: Image Select */}
        {phase === 'image-select' && (
          <div className="space-y-6">
            <div>
              <h2 className="font-semibold mb-3">템플릿 선택</h2>
              <div className="grid grid-cols-3 gap-3">
                {PRESET_OPTIONS.map((p) => (
                  <button key={p.value} onClick={() => setPreset(p.value)} className={`p-4 rounded-xl border-2 text-left transition-colors ${preset === p.value ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-900 hover:border-gray-500'}`}>
                    <div className="font-bold text-base mb-1">{p.label}</div>
                    <div className="text-xs text-gray-400">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-semibold mb-3">카드별 배경 이미지</h2>
              <div className="space-y-3">
                {CARD_KEYS.map((cardKey) => {
                  const v = imageMap[cardKey];
                  return (
                    <div key={cardKey} className="bg-gray-900 rounded-xl p-4 flex items-center gap-4">
                      <div className="text-sm font-medium w-20 text-gray-400">{cardKey.replace('_', ' ').toUpperCase()}</div>
                      {v.preview && <img src={v.preview} alt="" className="w-16 h-16 rounded-lg object-cover" />}
                      <div className="flex gap-2 flex-1">
                        <label className="flex-1 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-700 text-blue-300 text-xs py-2 px-3 rounded-lg cursor-pointer text-center">
                          이미지 업로드
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(cardKey, e.target.files[0]); }} />
                        </label>
                        {cardKey === 'card_05' && (
                          <div className="flex items-center gap-2">
                            <input type="color" value={v.color ?? '#1A1A2E'} onChange={(e) => setImageMap((p) => ({ ...p, [cardKey]: { source: 'color', color: e.target.value } }))} className="w-10 h-9 rounded cursor-pointer bg-transparent border-0" />
                            <span className="text-xs text-gray-400">색상 선택</span>
                          </div>
                        )}
                        {v.source !== 'none' && v.source !== 'color' && (
                          <button onClick={() => setImageMap((p) => ({ ...p, [cardKey]: { source: 'none' } }))} className="text-xs text-gray-500 hover:text-red-400">제거</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <button onClick={startRendering} className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-semibold text-base">
              카드뉴스 렌더링 시작
            </button>
          </div>
        )}

        {/* Phase: Rendering */}
        {phase === 'rendering' && (
          <div className="text-center py-16 space-y-4">
            <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-300">PNG 렌더링 중... Puppeteer가 카드를 캡처하고 있습니다.</p>
          </div>
        )}

        {/* Phase: Done */}
        {phase === 'done' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-bold mb-2">카드뉴스 완성!</h2>
              <p className="text-gray-400 text-sm">PNG 5장이 생성되었습니다.</p>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {outputFiles.map((f) => (
                <a key={f} href={`/api/output/${sessionId}/final/${f}`} download className="bg-gray-900 rounded-xl p-2 text-center hover:bg-gray-800 transition-colors">
                  <div className="aspect-square bg-gray-800 rounded-lg mb-2 overflow-hidden">
                    <img src={`/api/output/${sessionId}/final/${f}`} alt={f} className="w-full h-full object-cover rounded-lg" />
                  </div>
                  <div className="text-xs text-gray-400 truncate">{f}</div>
                </a>
              ))}
            </div>
            <a href={`/api/output/${sessionId}/final/cardnews_bundle.zip`} download className="block w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-semibold text-center">
              ZIP 다운로드
            </a>
            <button onClick={() => { setPhase('input'); setTopic(''); setLogs([]); setThumbnail(null); setBodyCards(null); setOutputFiles([]); router.replace('/studio'); }} className="w-full bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-xl text-sm">
              새 카드뉴스 만들기
            </button>
          </div>
        )}

        {/* Phase: Error */}
        {phase === 'error' && (
          <div className="space-y-4">
            <div className="p-4 bg-red-900/40 border border-red-700 rounded-xl text-red-300">
              <p className="font-semibold mb-2">오류가 발생했습니다</p>
              <p className="text-sm font-mono">{error}</p>
            </div>
            <button onClick={() => { setPhase('input'); setError(''); }} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm">
              처음으로
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense>
      <StudioContent />
    </Suspense>
  );
}
