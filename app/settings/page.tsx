'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  const [host, setHost] = useState('http://localhost:11434');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setHost(localStorage.getItem('ollama_host') ?? 'http://localhost:11434');
    setModel(localStorage.getItem('ollama_model') ?? '');
  }, []);

  async function testConnection() {
    setStatus('testing');
    setModels([]);
    try {
      const res = await fetch(`/api/ollama?host=${encodeURIComponent(host)}`);
      const data = await res.json();
      if (data.ok) {
        setModels(data.models ?? []);
        setStatus('ok');
      } else {
        setStatus('fail');
      }
    } catch {
      setStatus('fail');
    }
  }

  function save() {
    localStorage.setItem('ollama_host', host);
    localStorage.setItem('ollama_model', model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <Link href="/studio"><h1 className="text-lg font-bold cursor-pointer">📱 카드뉴스 생성기</h1></Link>
        <span className="text-sm text-gray-400">⚙️ 설정</span>
      </header>
      <div className="max-w-2xl mx-auto p-8">
        <section className="bg-gray-900 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Ollama 연결</h2>

          <label className="block text-sm text-gray-400 mb-1">Ollama 호스트 URL</label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm mb-4 focus:outline-none focus:border-blue-500"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="http://localhost:11434"
          />

          <button
            onClick={testConnection}
            disabled={status === 'testing'}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {status === 'testing' ? '연결 중...' : '연결 테스트'}
          </button>

          {status === 'ok' && (
            <span className="ml-3 text-green-400 text-sm">✓ 연결 성공 — {models.length}개 모델 감지</span>
          )}
          {status === 'fail' && (
            <div className="mt-3 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">
              ⚠️ Ollama에 연결할 수 없습니다.{' '}
              <a href="https://ollama.com/download" target="_blank" rel="noopener" className="underline">
                Ollama 설치 안내 →
              </a>
            </div>
          )}
        </section>

        <section className="bg-gray-900 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">모델 선택</h2>

          {models.length === 0 ? (
            <p className="text-gray-500 text-sm">연결 테스트 후 설치된 모델 목록이 표시됩니다.</p>
          ) : (
            <>
              <label className="block text-sm text-gray-400 mb-2">사용할 모델</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  localStorage.setItem('ollama_model', e.target.value);
                  setSaved(true);
                  setTimeout(() => setSaved(false), 1500);
                }}
              >
                <option value="">-- 모델 선택 --</option>
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </>
          )}
        </section>

        <button
          onClick={save}
          className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
          {saved ? '저장됨 ✓' : '저장'}
        </button>

        <div className="mt-8 text-xs text-gray-600">
          <p>설정은 브라우저 localStorage에 저장됩니다.</p>
          <p>한국어 콘텐츠 생성에는 qwen2.5, gemma3 계열을 권장합니다.</p>
        </div>
      </div>
    </div>
  );
}
