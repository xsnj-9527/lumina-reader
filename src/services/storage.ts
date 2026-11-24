import type {
  AiModelProfile,
  AiProvider,
  AiSettings,
  FontStyle,
  ReaderPreferences,
} from '../types';
import { FOLLOW_CHAT_PROFILE_ID } from '../constants/aiPresets';

export const PREFERENCES_STORAGE_KEY = 'lumina_reader_preferences';
export const AI_SETTINGS_STORAGE_KEY = 'lumina_ai_settings';

export const DEFAULT_PREFERENCES: ReaderPreferences = {
  theme: 'light',
  fontSize: 18,
  lineHeight: 1.8,
  maxWidth: 740,
  fontStyle: 'claude-serif',
  pdfZoom: 1,
  pdfDarkMode: 'invert',
};

function normalizeFontStyle(raw: unknown): FontStyle {
  if (raw === 'claude-serif' || raw === 'editorial-serif' || raw === 'sans') {
    return raw;
  }
  // 兼容旧版 localStorage 中保存的 'serif' 值
  return 'claude-serif';
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  profiles: [],
  chatProfileId: '',
  translateProfileId: FOLLOW_CHAT_PROFILE_ID,
};

function isLocalUrlString(urlStr: string): boolean {
  try {
    const host = new URL(urlStr.trim()).hostname.toLowerCase();
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

function inferLegacyOpenAiName(baseUrl: string, model: string): string {
  const combined = `${baseUrl} ${model}`.toLowerCase();
  if (combined.includes('mimo')) return '小米 MiMo';
  if (combined.includes('deepseek')) return 'DeepSeek';
  if (combined.includes('openrouter')) return 'OpenRouter';
  if (isLocalUrlString(baseUrl)) return '本地模型';
  return 'OpenAI 兼容';
}

function normalizeProvider(raw: unknown): AiProvider {
  return raw === 'gemini' ? 'gemini' : 'openai';
}

function normalizeProfile(raw: unknown, fallbackIndex: number): AiModelProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const provider = normalizeProvider(item.provider);
  const baseUrl =
    typeof item.baseUrl === 'string' ? item.baseUrl.trim().replace(/\/+$/, '') : '';
  const apiKey = typeof item.apiKey === 'string' ? item.apiKey : '';
  const model = typeof item.model === 'string' ? item.model.trim() : '';
  const id =
    typeof item.id === 'string' && item.id.trim()
      ? item.id.trim()
      : `profile-${fallbackIndex + 1}`;
  const rawName = typeof item.name === 'string' ? item.name.trim() : '';
  const name =
    rawName || model || (provider === 'gemini' ? 'Google Gemini' : 'OpenAI 兼容');

  return {
    id,
    name,
    provider,
    baseUrl,
    apiKey,
    model,
    disableThinking: typeof item.disableThinking === 'boolean' ? item.disableThinking : false,
  };
}

/**
 * 归一化并无损迁移旧版单模型配置到多模型档案结构。
 */
export function normalizeAiSettings(raw: unknown): {
  settings: AiSettings;
  migrated: boolean;
} {
  if (!raw || typeof raw !== 'object') {
    return { settings: DEFAULT_AI_SETTINGS, migrated: false };
  }

  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.profiles)) {
    const seenIds = new Set<string>();
    const profiles: AiModelProfile[] = [];
    obj.profiles.forEach((entry, idx) => {
      const normalized = normalizeProfile(entry, idx);
      if (normalized && !seenIds.has(normalized.id)) {
        seenIds.add(normalized.id);
        profiles.push(normalized);
      }
    });

    const rawChatId = typeof obj.chatProfileId === 'string' ? obj.chatProfileId.trim() : '';
    const chatProfileId = seenIds.has(rawChatId) ? rawChatId : profiles[0]?.id ?? '';

    const rawTranslateId =
      typeof obj.translateProfileId === 'string' ? obj.translateProfileId.trim() : '';
    const translateProfileId =
      rawTranslateId === FOLLOW_CHAT_PROFILE_ID || seenIds.has(rawTranslateId)
        ? rawTranslateId
        : FOLLOW_CHAT_PROFILE_ID;

    return {
      settings: { profiles, chatProfileId, translateProfileId },
      migrated: false,
    };
  }

  // 旧版结构迁移：{ provider, geminiApiKey, geminiBaseUrl, geminiModel, openaiApiKey, openaiBaseUrl, openaiModel }
  const legacyProvider = obj.provider === 'openai' ? 'openai' : 'gemini';
  const openaiApiKey = typeof obj.openaiApiKey === 'string' ? obj.openaiApiKey : '';
  const openaiBaseUrl =
    typeof obj.openaiBaseUrl === 'string' && obj.openaiBaseUrl.trim()
      ? obj.openaiBaseUrl.trim().replace(/\/+$/, '')
      : 'https://api.openai.com/v1';
  const openaiModel =
    typeof obj.openaiModel === 'string' && obj.openaiModel.trim()
      ? obj.openaiModel.trim()
      : 'gpt-4o-mini';

  const geminiApiKey = typeof obj.geminiApiKey === 'string' ? obj.geminiApiKey : '';
  const geminiBaseUrl =
    typeof obj.geminiBaseUrl === 'string' && obj.geminiBaseUrl.trim()
      ? obj.geminiBaseUrl.trim().replace(/\/+$/, '')
      : 'https://generativelanguage.googleapis.com';
  const geminiModel =
    typeof obj.geminiModel === 'string' && obj.geminiModel.trim()
      ? obj.geminiModel.trim()
      : 'gemini-2.5-flash';

  const hasOpenAi =
    openaiApiKey.trim().length > 0 ||
    (legacyProvider === 'openai' && isLocalUrlString(openaiBaseUrl));
  const hasGemini =
    geminiApiKey.trim().length > 0 ||
    (legacyProvider === 'gemini' && isLocalUrlString(geminiBaseUrl));

  const openAiProfile: AiModelProfile | null = hasOpenAi
    ? {
        id: 'legacy-openai',
        name: inferLegacyOpenAiName(openaiBaseUrl, openaiModel),
        provider: 'openai',
        baseUrl: openaiBaseUrl,
        apiKey: openaiApiKey,
        model: openaiModel,
        disableThinking: false,
      }
    : null;

  const geminiProfile: AiModelProfile | null = hasGemini
    ? {
        id: 'legacy-gemini',
        name: 'Google Gemini',
        provider: 'gemini',
        baseUrl: geminiBaseUrl,
        apiKey: geminiApiKey,
        model: geminiModel,
        disableThinking: false,
      }
    : null;

  const profiles: AiModelProfile[] = [];
  if (legacyProvider === 'openai') {
    if (openAiProfile) profiles.push(openAiProfile);
    if (geminiProfile) profiles.push(geminiProfile);
  } else {
    if (geminiProfile) profiles.push(geminiProfile);
    if (openAiProfile) profiles.push(openAiProfile);
  }

  return {
    settings: {
      profiles,
      chatProfileId: profiles[0]?.id ?? '',
      translateProfileId: FOLLOW_CHAT_PROFILE_ID,
    },
    migrated: profiles.length > 0,
  };
}

export function loadPreferences(): ReaderPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<ReaderPreferences>;
    return {
      theme:
        parsed.theme === 'light' || parsed.theme === 'sepia' || parsed.theme === 'dark'
          ? parsed.theme
          : DEFAULT_PREFERENCES.theme,
      fontSize:
        typeof parsed.fontSize === 'number' && parsed.fontSize >= 14 && parsed.fontSize <= 24
          ? parsed.fontSize
          : DEFAULT_PREFERENCES.fontSize,
      lineHeight:
        typeof parsed.lineHeight === 'number' && parsed.lineHeight >= 1.4 && parsed.lineHeight <= 2.2
          ? parsed.lineHeight
          : DEFAULT_PREFERENCES.lineHeight,
      maxWidth:
        typeof parsed.maxWidth === 'number' && parsed.maxWidth >= 560 && parsed.maxWidth <= 960
          ? parsed.maxWidth
          : DEFAULT_PREFERENCES.maxWidth,
      fontStyle: normalizeFontStyle(parsed.fontStyle),
      pdfZoom:
        typeof parsed.pdfZoom === 'number' && parsed.pdfZoom >= 0.7 && parsed.pdfZoom <= 1.6
          ? parsed.pdfZoom
          : DEFAULT_PREFERENCES.pdfZoom,
      pdfDarkMode: parsed.pdfDarkMode === 'dim' ? 'dim' : 'invert',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: ReaderPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略隐私模式下 localStorage 写入失败
  }
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw) as unknown;
    const { settings, migrated } = normalizeAiSettings(parsed);
    if (migrated) {
      saveAiSettings(settings);
    }
    return settings;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 忽略写入异常
  }
}
