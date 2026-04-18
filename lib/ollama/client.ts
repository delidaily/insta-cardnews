export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatOptions {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  host?: string;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

function getHost(override?: string): string {
  return override ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434';
}

export async function listModels(host?: string): Promise<OllamaModel[]> {
  const res = await fetch(`${getHost(host)}/api/tags`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`);
  const data = await res.json();
  return data.models ?? [];
}

export async function checkHealth(host?: string): Promise<boolean> {
  try {
    const res = await fetch(`${getHost(host)}/api/tags`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function chat(options: OllamaChatOptions): Promise<string> {
  const host = getHost(options.host);
  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: options.model, messages: options.messages, stream: false }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama chat failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.message?.content ?? '';
}

export async function* chatStream(options: OllamaChatOptions): AsyncGenerator<string> {
  const host = getHost(options.host);
  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: options.model, messages: options.messages, stream: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama stream failed: ${res.status} ${text}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.message?.content) yield obj.message.content;
      } catch {}
    }
  }
}
