import type { AiModelProfile, AiScene, AiSettings } from '../types';
import { FOLLOW_CHAT_PROFILE_ID } from '../constants/aiPresets';
import { isTauriRuntime } from '../utils/externalLink';
import type { PromptMessage } from './prompts';

let cachedTauriFetch: typeof fetch | null = null;

/**
 * 在 Tauri 桌面端自动选用 @tauri-apps/plugin-http 的 fetch 彻底绕过 WebView CORS 限制，
 * 在普通浏览器环境中回退原生 window.fetch。
 */
async function getRuntimeFetch(): Promise<typeof fetch> {
  if (isTauriRuntime()) {
    if (!cachedTauriFetch) {
      const mod = await import('@tauri-apps/plugin-http');
      cachedTauriFetch = mod.fetch as unknown as typeof fetch;
    }
    return cachedTauriFetch;
  }
  return typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;
}

/**
 * 兼容标准 DOMException('AbortError')、插件拒绝错误以及 signal.aborted 状态判定。
 */
export function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    const msg = err.message.toLowerCase();
    if (msg.includes('aborted') || msg.includes('abort')) return true;
  }
  return false;
}

export interface StreamCompletionOptions {
  profile?: AiModelProfile;
  settings?: AiSettings;
  scene?: AiScene;
  systemPrompt?: string;
  messages: PromptMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onChunk: (delta: string, accumulated: string) => void;
  onDone?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export function isLocalEndpoint(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl.trim());
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

export function isProfileConfigured(profile: AiModelProfile | null | undefined): boolean {
  if (!profile) return false;
  const baseUrl = profile.baseUrl.trim();
  const model = profile.model.trim();
  if (!baseUrl || !model) return false;
  return profile.apiKey.trim().length > 0 || isLocalEndpoint(baseUrl);
}

export function resolveProfileForScene(
  settings: AiSettings,
  scene: AiScene = 'chat',
): AiModelProfile | null {
  const profiles = settings.profiles ?? [];
  if (profiles.length === 0) return null;

  const chatProfile =
    profiles.find((p) => p.id === settings.chatProfileId) ??
    profiles.find((p) => isProfileConfigured(p)) ??
    profiles[0];

  if (scene === 'chat') {
    return chatProfile;
  }

  if (!settings.translateProfileId || settings.translateProfileId === FOLLOW_CHAT_PROFILE_ID) {
    return chatProfile;
  }

  return profiles.find((p) => p.id === settings.translateProfileId) ?? chatProfile;
}

export function isAiConfigured(settings: AiSettings, scene: AiScene = 'chat'): boolean {
  return isProfileConfigured(resolveProfileForScene(settings, scene));
}

export function buildOpenAiHeaders(profile: AiModelProfile): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = profile.apiKey.trim();
  if (key.length > 0) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

export function buildOpenAiRequestBody(
  profile: AiModelProfile,
  openAiMessages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens?: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: profile.model.trim() || 'gpt-4o-mini',
    messages: openAiMessages,
    temperature,
    stream: true,
    ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
  };

  if (profile.disableThinking === true) {
    body.thinking = { type: 'disabled' };
  }

  return body;
}

function normalizeGeminiEndpoint(baseUrl: string, model: string): string {
  const trimmed = (baseUrl || 'https://generativelanguage.googleapis.com').trim().replace(/\/+$/, '');
  const root = trimmed.replace(/\/v1beta$/i, '').replace(/\/v1$/i, '');
  return `${root}/v1beta/models/${encodeURIComponent(model.trim() || 'gemini-2.5-flash')}:streamGenerateContent`;
}

function normalizeOpenAiEndpoint(baseUrl: string): string {
  const trimmed = (baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function formatHttpError(status: number, bodyText: string): Error {
  let detail = '';
  try {
    const json = JSON.parse(bodyText) as { error?: { message?: string } };
    if (json?.error?.message) {
      detail = json.error.message;
    }
  } catch {
    detail = bodyText.slice(0, 180);
  }

  if (status === 401 || status === 403) {
    return new Error(`鉴权失败（HTTP ${status}）：请检查 API Key 是否有效${detail ? ` — ${detail}` : ''}`);
  }
  if (status === 404) {
    return new Error(`接口或模型未找到（HTTP 404）：请检查模型名称与 Base URL${detail ? ` — ${detail}` : ''}`);
  }
  if (status === 429) {
    return new Error(`请求过于频繁或额度已达上限（HTTP 429）${detail ? ` — ${detail}` : ''}`);
  }
  return new Error(`AI 请求失败（HTTP ${status}）${detail ? `：${detail}` : ''}`);
}

/**
 * 缓冲式 SSE 行解析，避免中文 UTF-8 多字节字符或 JSON 数据行被网络分片截断。
 */
async function readSseStream(
  response: Response,
  signal: AbortSignal | undefined,
  extractTextFromEvent: (payload: string) => string,
  onDelta: (delta: string) => void,
): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error('响应体为空，当前环境不支持流式读取。');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const processLine = (rawLine: string) => {
    const line = rawLine.replace(/\r$/, '');
    if (!line || line.startsWith(':')) return;
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    const delta = extractTextFromEvent(payload);
    if (delta) {
      onDelta(delta);
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        processLine(line);
        newlineIdx = buffer.indexOf('\n');
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      buffer.split('\n').forEach(processLine);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 忽略释放锁时的并发异常
    }
  }
}

function extractGeminiDelta(payload: string): string {
  try {
    const data = JSON.parse(payload) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string; thought?: boolean }>;
        };
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts
      .filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text ?? '')
      .join('');
  } catch {
    return '';
  }
}

function extractOpenAiDelta(payload: string): string {
  try {
    const data = JSON.parse(payload) as {
      choices?: Array<{
        delta?: { content?: string | null };
        message?: { content?: string | null };
      }>;
    };
    const choice = data.choices?.[0];
    if (!choice) return '';
    if (typeof choice.delta?.content === 'string') {
      return choice.delta.content;
    }
    if (typeof choice.message?.content === 'string') {
      return choice.message.content;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * 统一的流式补全引擎，支持原生 Gemini SSE 与 OpenAI 兼容接口及多模型档案路由。
 */
export async function streamCompletion(options: StreamCompletionOptions): Promise<string> {
  const {
    profile,
    settings,
    scene = 'chat',
    systemPrompt,
    messages,
    temperature = 0.35,
    maxTokens,
    signal,
    onChunk,
    onDone,
    onError,
  } = options;

  const targetProfile = profile ?? (settings ? resolveProfileForScene(settings, scene) : null);

  if (!targetProfile || !isProfileConfigured(targetProfile)) {
    const err = new Error('尚未配置有效的 AI 模型或 API Key，请先在设置 → AI 模型中完成配置。');
    onError?.(err);
    throw err;
  }

  let accumulated = '';
  const handleDelta = (delta: string) => {
    accumulated += delta;
    onChunk(delta, accumulated);
  };

  try {
    const runtimeFetch = await getRuntimeFetch();

    if (targetProfile.provider === 'gemini') {
      const endpoint = normalizeGeminiEndpoint(targetProfile.baseUrl, targetProfile.model);
      const trimmedKey = targetProfile.apiKey.trim();
      const url = trimmedKey
        ? `${endpoint}?alt=sse&key=${encodeURIComponent(trimmedKey)}`
        : `${endpoint}?alt=sse`;

      const body: Record<string, unknown> = {
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature,
          ...(typeof maxTokens === 'number' ? { maxOutputTokens: maxTokens } : {}),
        },
      };

      if (systemPrompt?.trim()) {
        body.systemInstruction = {
          parts: [{ text: systemPrompt.trim() }],
        };
      }

      const response = await runtimeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw formatHttpError(response.status, errorBody);
      }

      await readSseStream(response, signal, extractGeminiDelta, handleDelta);
    } else {
      const endpoint = normalizeOpenAiEndpoint(targetProfile.baseUrl);
      const openAiMessages = [
        ...(systemPrompt?.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const response = await runtimeFetch(endpoint, {
        method: 'POST',
        headers: buildOpenAiHeaders(targetProfile),
        body: JSON.stringify(
          buildOpenAiRequestBody(targetProfile, openAiMessages, temperature, maxTokens),
        ),
        signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw formatHttpError(response.status, errorBody);
      }

      await readSseStream(response, signal, extractOpenAiDelta, handleDelta);
    }

    onDone?.(accumulated);
    return accumulated;
  } catch (err) {
    if (isAbortError(err, signal)) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new DOMException('Aborted', 'AbortError');
    }
    const normalizedError =
      err instanceof Error ? err : new Error('请求 AI 服务时发生未知网络错误，请检查网络或跨域限制。');
    onError?.(normalizedError);
    throw normalizedError;
  }
}

export async function testAiConnection(
  profile: AiModelProfile,
): Promise<{ ok: boolean; latencyMs?: number; message: string }> {
  if (!profile.baseUrl.trim() || !profile.model.trim()) {
    return { ok: false, message: '请先填写完整的 Base URL 与模型名称。' };
  }
  if (!isProfileConfigured(profile)) {
    return { ok: false, message: '请填写 API Key（本地端口如 localhost / 127.0.0.1 可留空）。' };
  }

  const start = performance.now();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const reply = await streamCompletion({
      profile,
      systemPrompt: '请仅回复 OK',
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
      maxTokens: 16,
      signal: controller.signal,
      onChunk: () => {},
    });

    const latencyMs = Math.round(performance.now() - start);
    if (!reply.trim()) {
      return { ok: true, latencyMs, message: `连接成功（${latencyMs} ms），模型响应正常。` };
    }
    return { ok: true, latencyMs, message: `连接成功（${latencyMs} ms）：${reply.trim().slice(0, 40)}` };
  } catch (err) {
    if (isAbortError(err, controller.signal)) {
      return { ok: false, message: '连接超时（15 秒），请检查 Base URL 或网络代理设置。' };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : '连接测试失败，请核对配置。',
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
