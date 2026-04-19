'use client';
import { useState, useEffect, useRef } from 'react';
import type { CardEditorData, EditorState, ElementOverride, GradientConfig } from '@/lib/session/types';

// ─── Local types ─────────────────────────────────────────────────────────────
type CardKey = 'card_01' | 'card_02' | 'card_03' | 'card_04' | 'card_05';

interface BodyCards {
  card_02: { subtitle: string; body: string };
  card_03: { subtitle: string; body: string };
  card_04: { subtitle: string; body: string };
  card_05: { cta_main: string; cta_sub: string; account: string };
}

interface ImageMapItem {
  source: 'user_upload' | 'none' | 'color';
  preview?: string;
  color?: string;
}

interface LayerDef {
  id: string;
  label: string;
  type: 'text' | 'image' | 'overlay' | 'divider' | 'container';
  draggable: boolean;
  textEditable: boolean;
  fontSizeEditable: boolean;
  colorEditable: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SCALE = 0.45;
const CANVAS_PX = Math.round(1080 * SCALE);

const CARD_LABELS: Record<CardKey, string> = {
  card_01: '01 썸네일', card_02: '02 본문', card_03: '03 본문',
  card_04: '04 본문', card_05: '05 CTA',
};

const CARD_KEYS: CardKey[] = ['card_01', 'card_02', 'card_03', 'card_04', 'card_05'];

const THUMBNAIL_LAYERS: LayerDef[] = [
  { id: 'el-bg', label: '배경 이미지', type: 'image', draggable: false, textEditable: false, fontSizeEditable: false, colorEditable: false },
  { id: 'el-overlay', label: '그라디언트 오버레이', type: 'overlay', draggable: false, textEditable: false, fontSizeEditable: false, colorEditable: false },
  { id: 'el-content', label: '텍스트 블록 전체', type: 'container', draggable: true, textEditable: false, fontSizeEditable: false, colorEditable: false },
  { id: 'el-line1', label: '줄 1', type: 'text', draggable: true, textEditable: true, fontSizeEditable: true, colorEditable: true },
  { id: 'el-line2', label: '줄 2 (강조색)', type: 'text', draggable: true, textEditable: true, fontSizeEditable: true, colorEditable: true },
  { id: 'el-line3', label: '줄 3', type: 'text', draggable: true, textEditable: true, fontSizeEditable: true, colorEditable: true },
];

const BODY_LAYERS: LayerDef[] = [
  { id: 'el-bg', label: '배경 이미지', type: 'image', draggable: false, textEditable: false, fontSizeEditable: false, colorEditable: false },
  { id: 'el-overlay', label: '그라디언트 오버레이', type: 'overlay', draggable: false, textEditable: false, fontSizeEditable: false, colorEditable: false },
  { id: 'el-content', label: '컨텐츠 블록 전체', type: 'container', draggable: true, textEditable: false, fontSizeEditable: false, colorEditable: false },
  { id: 'el-subtitle', label: '소제목', type: 'text', draggable: true, textEditable: true, fontSizeEditable: true, colorEditable: true },
  { id: 'el-divider', label: '구분선', type: 'divider', draggable: true, textEditable: false, fontSizeEditable: false, colorEditable: true },
  { id: 'el-body', label: '본문', type: 'text', draggable: true, textEditable: true, fontSizeEditable: true, colorEditable: true },
];

const CTA_LAYERS: LayerDef[] = [
  { id: 'el-bg', label: '배경 이미지/색상', type: 'image', draggable: false, textEditable: false, fontSizeEditable: false, colorEditable: false },
  { id: 'el-overlay', label: '그라디언트 오버레이', type: 'overlay', draggable: false, textEditable: false, fontSizeEditable: false, colorEditable: false },
  { id: 'el-content', label: '컨텐츠 블록 전체', type: 'container', draggable: true, textEditable: false, fontSizeEditable: false, colorEditable: false },
  { id: 'el-cta-main', label: 'CTA 제목', type: 'text', draggable: true, textEditable: true, fontSizeEditable: true, colorEditable: true },
  { id: 'el-divider', label: '구분선', type: 'divider', draggable: true, textEditable: false, fontSizeEditable: false, colorEditable: true },
  { id: 'el-cta-sub', label: 'CTA 설명', type: 'text', draggable: true, textEditable: true, fontSizeEditable: true, colorEditable: true },
  { id: 'el-account', label: '계정명', type: 'text', draggable: true, textEditable: true, fontSizeEditable: true, colorEditable: true },
];

const LAYERS_MAP: Record<CardKey, LayerDef[]> = {
  card_01: THUMBNAIL_LAYERS, card_02: BODY_LAYERS, card_03: BODY_LAYERS,
  card_04: BODY_LAYERS, card_05: CTA_LAYERS,
};

const PRESET_CONFIG: Record<string, {
  bgColor: string; bodyBg: string; accentColor: string;
  textColor: string; bodyTextColor: string; textDark: boolean;
}> = {
  'preset-A': { bgColor: '#0d0d0d', bodyBg: '#111111', accentColor: '#F5C842', textColor: '#ffffff', bodyTextColor: 'rgba(255,255,255,0.88)', textDark: false },
  'preset-B': { bgColor: '#f9f9f9', bodyBg: '#ffffff', accentColor: '#2563EB', textColor: '#111111', bodyTextColor: '#444444', textDark: true },
  'preset-C': { bgColor: '#6C3FC5', bodyBg: '#6C3FC5', accentColor: '#FFE566', textColor: '#ffffff', bodyTextColor: 'rgba(255,255,255,0.88)', textDark: false },
};

const DIRECTIONS = [
  { label: '↓', value: 'to bottom' }, { label: '↑', value: 'to top' },
  { label: '→', value: 'to right' }, { label: '←', value: 'to left' },
  { label: '↘', value: '135deg' }, { label: '↗', value: '45deg' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hexWithOpacity(hex: string, opacity: number): string {
  const h = hex.replace('#', '').padEnd(6, '0');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${opacity})`;
}

function gradientToCss(g: GradientConfig): string {
  return `linear-gradient(${g.direction}, ${hexWithOpacity(g.color_start, g.opacity_start)} 0%, ${hexWithOpacity(g.color_end, g.opacity_end)} 100%)`;
}

function defaultCardData(): CardEditorData {
  return { elements: {}, bgPosition: { x: 50, y: 50 } };
}

export function defaultEditorState(): EditorState {
  return {
    card_01: defaultCardData(), card_02: defaultCardData(), card_03: defaultCardData(),
    card_04: defaultCardData(), card_05: defaultCardData(),
  };
}

function getEl(data: CardEditorData, id: string): ElementOverride {
  return data.elements[id] ?? { offsetX: 0, offsetY: 0, visible: true };
}

// ─── GradientEditor ───────────────────────────────────────────────────────────
function GradientEditorInline({ config, onChange }: { config: GradientConfig; onChange: (c: GradientConfig) => void }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-1 flex-wrap">
        {DIRECTIONS.map((d) => (
          <button key={d.value} onClick={() => onChange({ ...config, direction: d.value })}
            className={`px-2 py-1 rounded font-bold transition-colors ${config.direction === d.value ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
            {d.label}
          </button>
        ))}
      </div>
      {(['start', 'end'] as const).map((side) => {
        const colorKey = side === 'start' ? 'color_start' : 'color_end';
        const opacityKey = side === 'start' ? 'opacity_start' : 'opacity_end';
        return (
          <div key={side} className="flex items-center gap-2">
            <span className="text-gray-400 w-6 shrink-0">{side === 'start' ? '시작' : '끝'}</span>
            <input type="color" value={config[colorKey]}
              onChange={(e) => onChange({ ...config, [colorKey]: e.target.value })}
              className="w-6 h-5 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0" />
            <input type="range" min="0" max="1" step="0.05" value={config[opacityKey]}
              onChange={(e) => onChange({ ...config, [opacityKey]: parseFloat(e.target.value) })}
              className="flex-1 accent-blue-500" />
            <span className="text-gray-400 w-7 text-right shrink-0">{Math.round(config[opacityKey] * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface CardEditorPanelProps {
  preset: string;
  initialLines: [string, string, string];
  initialBody: BodyCards;
  imageMap: Record<CardKey, ImageMapItem>;
  gradientMap: Record<CardKey, GradientConfig>;
  onGradientChange: (key: CardKey, g: GradientConfig) => void;
  onSaveRender: (state: EditorState, lines: [string, string, string], body: BodyCards) => void;
  onBack: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CardEditorPanel({
  preset, initialLines, initialBody, imageMap, gradientMap,
  onGradientChange, onSaveRender, onBack,
}: CardEditorPanelProps) {
  const [activeCard, setActiveCard] = useState<CardKey>('card_01');
  const [selectedEl, setSelectedEl] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState>(defaultEditorState);
  const [lines, setLines] = useState<[string, string, string]>(initialLines);
  const [body, setBody] = useState<BodyCards>(JSON.parse(JSON.stringify(initialBody)));

  // Drag refs (avoid re-render on drag state changes)
  const isDragging = useRef(false);
  const dragMoved = useRef(false);          // true if mouse moved ≥ threshold after mousedown
  const draggingElId = useRef<string | null>(null);
  const draggingCardKey = useRef<CardKey | null>(null);
  const dragStartMouse = useRef({ x: 0, y: 0 });
  const dragStartOffset = useRef({ x: 0, y: 0 });
  // Ref that mirrors selectedEl for use inside event callbacks
  const selectedElRef = useRef<string | null>(null);
  useEffect(() => { selectedElRef.current = selectedEl; }, [selectedEl]);

  // Global mouse move/up for drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !draggingElId.current || !draggingCardKey.current) return;
      const rawDx = e.clientX - dragStartMouse.current.x;
      const rawDy = e.clientY - dragStartMouse.current.y;
      if (Math.abs(rawDx) > 3 || Math.abs(rawDy) > 3) dragMoved.current = true;
      const dx = rawDx / SCALE;
      const dy = rawDy / SCALE;
      const newX = Math.round(dragStartOffset.current.x + dx);
      const newY = Math.round(dragStartOffset.current.y + dy);
      setEditorState(prev => {
        const card = prev[draggingCardKey.current!];
        const existing = card.elements[draggingElId.current!] ?? { offsetX: 0, offsetY: 0, visible: true };
        return {
          ...prev,
          [draggingCardKey.current!]: {
            ...card,
            elements: { ...card.elements, [draggingElId.current!]: { ...existing, offsetX: newX, offsetY: newY } },
          },
        };
      });
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // Keyboard nudge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedEl(null); return; }
      if (!selectedEl) return;
      const nudge = e.shiftKey ? 10 : 1;
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-nudge, 0], ArrowRight: [nudge, 0], ArrowUp: [0, -nudge], ArrowDown: [0, nudge],
      };
      const [dx, dy] = deltas[e.key] ?? [0, 0];
      if (dx === 0 && dy === 0) return;
      e.preventDefault();
      setEditorState(prev => {
        const card = prev[activeCard];
        const existing = card.elements[selectedEl] ?? { offsetX: 0, offsetY: 0, visible: true };
        return {
          ...prev,
          [activeCard]: {
            ...card,
            elements: { ...card.elements, [selectedEl]: { ...existing, offsetX: existing.offsetX + dx, offsetY: existing.offsetY + dy } },
          },
        };
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEl, activeCard]);

  const startDrag = (clickedElId: string, e: React.MouseEvent) => {
    // Right-panel selection is the top priority — always drag the selected layer,
    // not whatever element happens to be under the pointer.
    const targetId = selectedElRef.current ?? clickedElId;
    const targetLayer = LAYERS_MAP[activeCard].find(l => l.id === targetId);
    if (!targetLayer?.draggable) return;

    e.preventDefault();
    e.stopPropagation();
    dragMoved.current = false;
    isDragging.current = true;
    draggingElId.current = targetId;
    draggingCardKey.current = activeCard;
    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    const existing = editorState[activeCard].elements[targetId] ?? { offsetX: 0, offsetY: 0, visible: true };
    dragStartOffset.current = { x: existing.offsetX, y: existing.offsetY };
    // Do NOT call setSelectedEl here — right-panel selection is preserved.
  };

  const setElProp = (elId: string, prop: Partial<ElementOverride>) => {
    setEditorState(prev => {
      const card = prev[activeCard];
      const existing = card.elements[elId] ?? { offsetX: 0, offsetY: 0, visible: true };
      return { ...prev, [activeCard]: { ...card, elements: { ...card.elements, [elId]: { ...existing, ...prop } } } };
    });
  };

  const resetEl = (elId: string) => {
    setEditorState(prev => {
      const card = prev[activeCard];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [elId]: _removed, ...rest } = card.elements;
      return { ...prev, [activeCard]: { ...card, elements: rest } };
    });
  };

  const setBgPosition = (x: number, y: number) => {
    setEditorState(prev => ({
      ...prev,
      [activeCard]: { ...prev[activeCard], bgPosition: { x, y } },
    }));
  };

  // ── Canvas helpers ──────────────────────────────────────────────────────────
  const cardData = editorState[activeCard];
  const imageItem = imageMap[activeCard];
  const gradient = gradientMap[activeCard];
  const config = PRESET_CONFIG[preset] ?? PRESET_CONFIG['preset-A'];
  const overlayCss = gradientToCss(gradient);

  const bgStyle = (() => {
    if (imageItem?.preview) {
      return {
        backgroundImage: `url(${imageItem.preview})`,
        backgroundSize: 'cover' as const,
        backgroundPosition: `${cardData.bgPosition.x}% ${cardData.bgPosition.y}%`,
      };
    }
    if (imageItem?.source === 'color') return { backgroundColor: imageItem.color ?? '#1A1A2E' };
    if (activeCard === 'card_05') return { backgroundColor: '#1A1A2E' };
    if (activeCard === 'card_01') return { backgroundColor: config.bgColor };
    return { backgroundColor: config.bodyBg };
  })();

  const eT = (id: string): React.CSSProperties => {
    const o = getEl(cardData, id);
    return {
      transform: `translate(${o.offsetX}px, ${o.offsetY}px)`,
      ...(o.fontSize ? { fontSize: `${o.fontSize}px` } : {}),
      ...(o.color ? { color: o.color } : {}),
      ...(o.visible === false ? { display: 'none' } : {}),
    };
  };

  const eS = (id: string): React.CSSProperties => ({
    outline: selectedEl === id ? '3px solid #60a5fa' : '3px solid transparent',
    outlineOffset: '4px',
    cursor: 'grab',
    userSelect: 'none',
  });

  const eH = (id: string) => ({
    onMouseDown: (e: React.MouseEvent) => startDrag(id, e),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      // If the user just released without meaningful movement AND nothing was
      // already pinned via the right panel, let them select by canvas click.
      if (!dragMoved.current && !selectedElRef.current) {
        setSelectedEl(id);
      }
    },
  });

  const getText = (id: string): string => {
    switch (id) {
      case 'el-line1': return lines[0];
      case 'el-line2': return lines[1];
      case 'el-line3': return lines[2];
    }
    if (activeCard !== 'card_01' && activeCard !== 'card_05') {
      const k = activeCard as 'card_02' | 'card_03' | 'card_04';
      if (id === 'el-subtitle') return body[k].subtitle;
      if (id === 'el-body') return body[k].body;
    }
    if (activeCard === 'card_05') {
      if (id === 'el-cta-main') return body.card_05.cta_main;
      if (id === 'el-cta-sub') return body.card_05.cta_sub;
      if (id === 'el-account') return body.card_05.account || process.env.NEXT_PUBLIC_CTA_ACCOUNT || '';
    }
    return '';
  };

  // ── Text setters ────────────────────────────────────────────────────────────
  const setLineText = (i: 0 | 1 | 2, val: string) => {
    setLines(prev => { const n = [...prev] as [string, string, string]; n[i] = val; return n; });
  };

  const setBodyText = (field: string, val: string) => {
    if (activeCard === 'card_05') {
      setBody(prev => ({ ...prev, card_05: { ...prev.card_05, [field]: val } }));
    } else if (activeCard !== 'card_01') {
      const k = activeCard as 'card_02' | 'card_03' | 'card_04';
      setBody(prev => ({ ...prev, [k]: { ...prev[k], [field]: val } }));
    }
  };

  const handleTextChange = (id: string, val: string) => {
    if (id === 'el-line1') setLineText(0, val);
    else if (id === 'el-line2') setLineText(1, val);
    else if (id === 'el-line3') setLineText(2, val);
    else if (id === 'el-subtitle') setBodyText('subtitle', val);
    else if (id === 'el-body') setBodyText('body', val);
    else if (id === 'el-cta-main') setBodyText('cta_main', val);
    else if (id === 'el-cta-sub') setBodyText('cta_sub', val);
    else if (id === 'el-account') setBodyText('account', val);
  };

  // ── Right panel data ────────────────────────────────────────────────────────
  const layers = LAYERS_MAP[activeCard] ?? [];
  const selectedLayer = layers.find(l => l.id === selectedEl) ?? null;
  const selO = selectedEl ? getEl(cardData, selectedEl) : null;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-200 text-sm transition-colors">← 이미지 선택</button>
          <span className="text-gray-700">|</span>
          <span className="font-semibold text-sm">카드 편집기</span>
          <span className="text-xs text-gray-500 hidden lg:inline">드래그 이동 · 화살표키 1px · Shift+화살표 10px</span>
        </div>
        <button
          onClick={() => onSaveRender(editorState, lines, body)}
          className="bg-green-600 hover:bg-green-500 text-white px-5 py-1.5 rounded-lg font-semibold text-sm transition-colors"
        >
          저장 &amp; 렌더링
        </button>
      </div>

      {/* ── Card tabs ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-4 py-2 border-b border-gray-800 bg-gray-900 shrink-0">
        {CARD_KEYS.map((k) => (
          <button key={k}
            onClick={() => { setActiveCard(k); setSelectedEl(null); }}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeCard === k ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
          >
            {CARD_LABELS[k]}
          </button>
        ))}
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Canvas area */}
        <div
          className="flex-1 flex items-center justify-center bg-[#141414] overflow-auto p-6"
          style={{ backgroundImage: 'radial-gradient(circle, #2a2a2a 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          onClick={() => setSelectedEl(null)}
        >
          {/* Outer clip at scaled size */}
          <div style={{ width: CANVAS_PX, height: CANVAS_PX, overflow: 'hidden', borderRadius: 6, boxShadow: '0 12px 48px rgba(0,0,0,0.8)', flexShrink: 0 }}>
            {/* Inner 1080×1080 scaled down */}
            <div
              style={{
                width: 1080, height: 1080,
                transform: `scale(${SCALE})`, transformOrigin: 'top left',
                position: 'relative', overflow: 'hidden',
                fontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
                ...bgStyle,
              }}
            >
              {/* Overlay */}
              <div
                style={{ position: 'absolute', inset: 0, background: overlayCss, ...eS('el-overlay') }}
                {...eH('el-overlay')}
              />

              {/* ── Thumbnail (card_01) ─────────────────────────────────── */}
              {activeCard === 'card_01' && (
                <div
                  style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    justifyContent: preset === 'preset-B' ? 'center' : 'flex-end',
                    padding: '80px 72px',
                    ...eT('el-content'), ...eS('el-content'),
                  }}
                  {...eH('el-content')}
                >
                  {(['el-line1', 'el-line2', 'el-line3'] as const).map((id, i) => (
                    <div key={id}
                      style={{
                        fontSize: 72, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em',
                        color: i === 1 ? config.accentColor : config.textColor,
                        textShadow: config.textDark ? 'none' : '0 2px 16px rgba(0,0,0,0.5)',
                        marginBottom: i < 2 ? 4 : 0,
                        ...eT(id), ...eS(id),
                      }}
                      {...eH(id)}
                    >
                      {getText(id)}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Body (card_02–04) ───────────────────────────────────── */}
              {(activeCard === 'card_02' || activeCard === 'card_03' || activeCard === 'card_04') && (
                preset === 'preset-B' ? (
                  <div
                    style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: 640,
                      background: '#ffffff', borderRadius: '40px 40px 0 0',
                      padding: '56px 80px', display: 'flex', flexDirection: 'column', gap: 24,
                      ...eT('el-content'), ...eS('el-content'),
                    }}
                    {...eH('el-content')}
                  >
                    <div style={{ width: 48, height: 5, background: config.accentColor, borderRadius: 3, ...eT('el-divider'), ...eS('el-divider') }} {...eH('el-divider')} />
                    <div style={{ fontSize: 52, fontWeight: 700, color: '#111', lineHeight: 1.2, ...eT('el-subtitle'), ...eS('el-subtitle') }} {...eH('el-subtitle')}>{getText('el-subtitle')}</div>
                    <div style={{ fontSize: 34, fontWeight: 400, color: '#444', lineHeight: 1.65, ...eT('el-body'), ...eS('el-body') }} {...eH('el-body')}>{getText('el-body')}</div>
                  </div>
                ) : (
                  <div
                    style={{
                      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                      justifyContent: 'center', padding: '80px 80px', gap: 32,
                      ...eT('el-content'), ...eS('el-content'),
                    }}
                    {...eH('el-content')}
                  >
                    <div style={{ fontSize: 56, fontWeight: 700, color: config.textColor, lineHeight: 1.2, letterSpacing: '-0.02em', ...eT('el-subtitle'), ...eS('el-subtitle') }} {...eH('el-subtitle')}>{getText('el-subtitle')}</div>
                    <div style={{ width: 56, height: 4, background: config.accentColor, borderRadius: 2, flexShrink: 0, ...eT('el-divider'), ...eS('el-divider') }} {...eH('el-divider')} />
                    <div style={{ fontSize: 36, fontWeight: 400, color: config.bodyTextColor, lineHeight: 1.6, whiteSpace: 'pre-wrap', ...eT('el-body'), ...eS('el-body') }} {...eH('el-body')}>{getText('el-body')}</div>
                  </div>
                )
              )}

              {/* ── CTA (card_05) ───────────────────────────────────────── */}
              {activeCard === 'card_05' && (
                <div
                  style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                    padding: '80px', gap: 28,
                    ...eT('el-content'), ...eS('el-content'),
                  }}
                  {...eH('el-content')}
                >
                  <div style={{ fontSize: 64, fontWeight: 700, color: config.textColor, lineHeight: 1.2, letterSpacing: '-0.02em', ...eT('el-cta-main'), ...eS('el-cta-main') }} {...eH('el-cta-main')}>{getText('el-cta-main')}</div>
                  <div style={{ width: 80, height: 3, background: config.accentColor, borderRadius: 2, flexShrink: 0, ...eT('el-divider'), ...eS('el-divider') }} {...eH('el-divider')} />
                  <div style={{ fontSize: 36, fontWeight: 400, color: config.textDark ? '#555' : 'rgba(255,255,255,0.75)', lineHeight: 1.5, ...eT('el-cta-sub'), ...eS('el-cta-sub') }} {...eH('el-cta-sub')}>{getText('el-cta-sub')}</div>
                  <div style={{ fontSize: 40, fontWeight: 700, color: config.accentColor, ...eT('el-account'), ...eS('el-account') }} {...eH('el-account')}>{getText('el-account')}</div>
                </div>
              )}
            </div>
          </div>

          {/* Coordinates hint */}
          {selectedEl && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 pointer-events-none">
              {selectedEl} &nbsp;·&nbsp; X: {getEl(cardData, selectedEl).offsetX}px &nbsp;·&nbsp; Y: {getEl(cardData, selectedEl).offsetY}px
            </div>
          )}
        </div>

        {/* ── Right panel ────────────────────────────────────────────────── */}
        <div className="w-72 border-l border-gray-800 flex flex-col bg-gray-950 overflow-hidden shrink-0">

          {/* Layer list */}
          <div className="p-3 border-b border-gray-800 shrink-0">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">레이어</div>
            <div className="space-y-0.5">
              {layers.map((layer) => {
                const o = getEl(cardData, layer.id);
                const moved = o.offsetX !== 0 || o.offsetY !== 0;
                return (
                  <div key={layer.id}
                    onClick={() => setSelectedEl(layer.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors group ${selectedEl === layer.id ? 'bg-blue-700 text-white' : 'hover:bg-gray-800 text-gray-300'}`}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setElProp(layer.id, { visible: o.visible === false }); }}
                      className={`shrink-0 text-base leading-none transition-opacity ${o.visible !== false ? 'opacity-70 group-hover:opacity-100' : 'opacity-30'}`}
                      title={o.visible !== false ? '숨기기' : '표시'}
                    >
                      {o.visible !== false ? '●' : '○'}
                    </button>
                    <span className="flex-1 truncate">{layer.label}</span>
                    {moved && <span className="text-blue-400 text-xs shrink-0">✦</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Properties */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {selectedEl && selectedLayer ? (
              <>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  속성 — {selectedLayer.label}
                </div>

                {/* Position */}
                {selectedLayer.draggable && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">위치 (px)</span>
                      <button onClick={() => resetEl(selectedEl)} className="text-xs text-gray-600 hover:text-red-400 transition-colors">↺ 초기화</button>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-gray-600 mb-0.5 block">X</label>
                        <input type="number" value={selO?.offsetX ?? 0}
                          onChange={(e) => setElProp(selectedEl, { offsetX: parseInt(e.target.value) || 0 })}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500" />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-600 mb-0.5 block">Y</label>
                        <input type="number" value={selO?.offsetY ?? 0}
                          onChange={(e) => setElProp(selectedEl, { offsetY: parseInt(e.target.value) || 0 })}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Text content */}
                {selectedLayer.textEditable && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">텍스트 내용</label>
                    {(selectedEl === 'el-body' || selectedEl === 'el-cta-sub') ? (
                      <textarea
                        value={getText(selectedEl)}
                        onChange={(e) => handleTextChange(selectedEl, e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 h-24 resize-none"
                      />
                    ) : (
                      <input type="text" value={getText(selectedEl)}
                        onChange={(e) => handleTextChange(selectedEl, e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500" />
                    )}
                  </div>
                )}

                {/* Font size */}
                {selectedLayer.fontSizeEditable && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">글자 크기 (px)</label>
                    <input type="number" min="8" max="300"
                      value={selO?.fontSize ?? ''}
                      placeholder="기본값 유지"
                      onChange={(e) => setElProp(selectedEl, { fontSize: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500" />
                  </div>
                )}

                {/* Color */}
                {selectedLayer.colorEditable && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">색상</label>
                    <div className="flex gap-2 items-center">
                      <input type="color"
                        value={selO?.color ?? (selectedEl === 'el-line2' ? config.accentColor : '#ffffff')}
                        onChange={(e) => setElProp(selectedEl, { color: e.target.value })}
                        className="w-8 h-7 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0" />
                      <span className="text-xs text-gray-400">{selO?.color ?? '기본값'}</span>
                      {selO?.color && (
                        <button onClick={() => setElProp(selectedEl, { color: undefined })}
                          className="text-xs text-gray-600 hover:text-red-400 transition-colors ml-auto">초기화</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Overlay → gradient editor */}
                {selectedLayer.type === 'overlay' && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">그라디언트</div>
                    <GradientEditorInline config={gradient} onChange={(g) => onGradientChange(activeCard, g)} />
                  </div>
                )}

                {/* BG image → position sliders */}
                {selectedLayer.type === 'image' && imageItem?.source === 'user_upload' && (
                  <div className="space-y-3">
                    <div className="text-xs text-gray-500">이미지 위치</div>
                    {(['x', 'y'] as const).map((axis) => (
                      <div key={axis}>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>{axis === 'x' ? '가로 (좌←→우)' : '세로 (위↑↓아래)'}</span>
                          <span>{cardData.bgPosition[axis]}%</span>
                        </div>
                        <input type="range" min="0" max="100"
                          value={cardData.bgPosition[axis]}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            setBgPosition(axis === 'x' ? v : cardData.bgPosition.x, axis === 'y' ? v : cardData.bgPosition.y);
                          }}
                          className="w-full accent-blue-500" />
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Nothing selected — show gradient editor + hint */
              <div className="space-y-4">
                <div className="text-xs text-gray-600 space-y-1.5 bg-gray-900 rounded-lg p-3">
                  <div className="font-medium text-gray-500 mb-2">편집 방법</div>
                  <div>· 캔버스 요소 클릭 → 선택</div>
                  <div>· 드래그 → 위치 이동</div>
                  <div>· 화살표키 → 1px 미세 이동</div>
                  <div>· Shift+화살표 → 10px 이동</div>
                  <div>· ● / ○ → 레이어 표시/숨김</div>
                  <div>· Esc → 선택 해제</div>
                </div>
                <div className="border-t border-gray-800 pt-3 space-y-2">
                  <div className="text-xs text-gray-500">그라디언트 오버레이</div>
                  <GradientEditorInline config={gradient} onChange={(g) => onGradientChange(activeCard, g)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
