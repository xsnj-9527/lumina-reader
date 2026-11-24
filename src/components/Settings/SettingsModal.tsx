import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AiModelProfile,
  AiSettings,
  PdfDarkMode,
  ReaderPreferences,
  RestoreBackupStats,
  ThemeMode,
  WidthPreset,
} from '../../types';
import {
  AI_VENDOR_PRESETS,
  FOLLOW_CHAT_PROFILE_ID,
  type AiVendorPreset,
} from '../../constants/aiPresets';
import { READING_FONT_OPTIONS } from '../../constants/fonts';
import { DEFAULT_PREFERENCES } from '../../services/storage';
import {
  isAiConfigured,
  isLocalEndpoint,
  isProfileConfigured,
  resolveProfileForScene,
  testAiConnection,
} from '../../services/aiService';
import { exportBackupData, importBackupData } from '../../services/db';

export type SettingsTab = 'appearance' | 'ai' | 'data';

interface SettingsModalProps {
  isOpen: boolean;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  preferences: ReaderPreferences;
  onUpdatePreferences: (patch: Partial<ReaderPreferences>) => void;
  settings: AiSettings;
  onSaveAiSettings: (next: AiSettings) => void;
  onDataRestored?: (restoredPrefs?: ReaderPreferences) => Promise<void> | void;
  onClose: () => void;
}

const THEME_CARDS: Array<{ id: ThemeMode; label: string; swatch: string; ring: string }> = [
  { id: 'light', label: '纯白', swatch: '#FFFFFF', ring: '#D1D1D6' },
  { id: 'sepia', label: '暖黄护眼', swatch: '#F7F1E3', ring: '#CBB894' },
  { id: 'dark', label: '暗黑深灰', swatch: '#161618', ring: '#48484E' },
];

const WIDTH_OPTIONS: Array<{ key: WidthPreset; label: string; value: number }> = [
  { key: 'narrow', label: '紧凑', value: 620 },
  { key: 'medium', label: '标准', value: 740 },
  { key: 'wide', label: '宽阔', value: 900 },
];

const PDF_DARK_MODES: Array<{ id: PdfDarkMode; label: string; desc: string }> = [
  { id: 'invert', label: '柔和反色', desc: '白底黑字反转，深夜阅读更省眼' },
  { id: 'dim', label: '低亮原色', desc: '降亮不反色，完整保护论文彩色图表' },
];

const NAV_ITEMS: Array<{
  id: SettingsTab;
  label: string;
  title: string;
  icon: typeof SlidersHorizontal;
}> = [
  { id: 'appearance', label: '阅读与外观', title: '阅读与外观', icon: SlidersHorizontal },
  { id: 'ai', label: 'AI 模型', title: 'AI 模型档案与路由', icon: Sparkles },
  { id: 'data', label: '数据管理', title: '本地数据备份与恢复', icon: Database },
];

function formatBackupDateTag(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function createProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `model-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function detectPresetId(profile: AiModelProfile): string {
  const url = profile.baseUrl.toLowerCase();
  if (url.includes('xiaomimimo') || url.includes('mimo')) return 'mimo';
  if (profile.provider === 'gemini' && url.includes('googleapis.com')) return 'gemini';
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('api.openai.com')) return 'openai';
  if (url.includes('openrouter.ai')) return 'openrouter';
  return 'custom';
}

function formatBaseUrlHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function createDraftFromPreset(preset: AiVendorPreset): AiModelProfile {
  return {
    id: createProfileId(),
    name: preset.defaultName,
    provider: preset.provider,
    baseUrl: preset.baseUrl,
    apiKey: '',
    model: preset.model,
    disableThinking: preset.defaultDisableThinking,
  };
}

const DEFAULT_PRESET_NAMES = new Set(AI_VENDOR_PRESETS.map((p) => p.defaultName));

export function SettingsModal({
  isOpen,
  activeTab,
  onTabChange,
  preferences,
  onUpdatePreferences,
  settings,
  onSaveAiSettings,
  onDataRestored,
  onClose,
}: SettingsModalProps) {
  const [editingDraft, setEditingDraft] = useState<AiModelProfile | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string>('mimo');
  const [showKey, setShowKey] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{
    ok: boolean;
    message: string;
    stats?: RestoreBackupStats;
  } | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEditingDraft(null);
      setIsNewProfile(false);
      setShowKey(false);
      setFormError(null);
      setTestResult(null);
      setTesting(false);
      setBackupNotice(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setEditingDraft(null);
    setFormError(null);
    setTestResult(null);
    setTesting(false);
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const activePreset = useMemo(
    () => AI_VENDOR_PRESETS.find((p) => p.id === activePresetId) ?? AI_VENDOR_PRESETS[AI_VENDOR_PRESETS.length - 1],
    [activePresetId],
  );

  const suggestedModels = useMemo(() => {
    if (!editingDraft) return [];
    if (activePreset.provider === editingDraft.provider && activePreset.suggestedModels.length > 0) {
      return activePreset.suggestedModels;
    }
    return editingDraft.provider === 'gemini'
      ? ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
      : ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat'];
  }, [activePreset, editingDraft]);

  if (!isOpen) return null;

  const aiConfigured = isAiConfigured(settings, 'chat');
  const chatProfile = resolveProfileForScene(settings, 'chat');
  const translateProfile = resolveProfileForScene(settings, 'translate');
  const isTranslateFollowing =
    !settings.translateProfileId || settings.translateProfileId === FOLLOW_CHAT_PROFILE_ID;
  const activeNavMeta = NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0];

  const startCreateProfile = () => {
    const defaultPreset = AI_VENDOR_PRESETS[0];
    setActivePresetId(defaultPreset.id);
    setEditingDraft(createDraftFromPreset(defaultPreset));
    setIsNewProfile(true);
    setShowKey(false);
    setFormError(null);
    setTestResult(null);
  };

  const startEditProfile = (profile: AiModelProfile) => {
    setActivePresetId(detectPresetId(profile));
    setEditingDraft({ ...profile });
    setIsNewProfile(false);
    setShowKey(false);
    setFormError(null);
    setTestResult(null);
  };

  const applyPresetToDraft = (preset: AiVendorPreset) => {
    setActivePresetId(preset.id);
    setFormError(null);
    setTestResult(null);
    setEditingDraft((prev) => {
      if (!prev) return prev;
      const shouldReplaceName = !prev.name.trim() || DEFAULT_PRESET_NAMES.has(prev.name.trim());
      return {
        ...prev,
        name: shouldReplaceName ? preset.defaultName : prev.name,
        provider: preset.provider,
        baseUrl: preset.baseUrl,
        model: preset.model,
        disableThinking: preset.defaultDisableThinking,
      };
    });
  };

  const handleTestDraft = async () => {
    if (!editingDraft) return;
    setTesting(true);
    setTestResult(null);
    setFormError(null);
    const cleaned: AiModelProfile = {
      ...editingDraft,
      name: editingDraft.name.trim(),
      baseUrl: editingDraft.baseUrl.trim().replace(/\/+$/, ''),
      apiKey: editingDraft.apiKey.trim(),
      model: editingDraft.model.trim(),
    };
    const res = await testAiConnection(cleaned);
    setTesting(false);
    setTestResult({ ok: res.ok, message: res.message });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDraft) return;

    const cleanBaseUrl = editingDraft.baseUrl.trim().replace(/\/+$/, '');
    const cleanModel = editingDraft.model.trim();
    const cleanApiKey = editingDraft.apiKey.trim();
    const cleanName =
      editingDraft.name.trim() ||
      cleanModel ||
      (editingDraft.provider === 'gemini' ? 'Google Gemini' : 'OpenAI 兼容');

    if (!cleanBaseUrl) {
      setFormError('请填写 API Base URL。');
      return;
    }
    if (!cleanModel) {
      setFormError('请填写模型名称。');
      return;
    }

    const nextProfile: AiModelProfile = {
      id: editingDraft.id,
      name: cleanName,
      provider: editingDraft.provider,
      baseUrl: cleanBaseUrl,
      apiKey: cleanApiKey,
      model: cleanModel,
      disableThinking:
        editingDraft.provider === 'openai' ? Boolean(editingDraft.disableThinking) : false,
    };

    const exists = settings.profiles.some((p) => p.id === nextProfile.id);
    const nextProfiles = exists
      ? settings.profiles.map((p) => (p.id === nextProfile.id ? nextProfile : p))
      : [...settings.profiles, nextProfile];

    const nextChatId =
      settings.chatProfileId && nextProfiles.some((p) => p.id === settings.chatProfileId)
        ? settings.chatProfileId
        : nextProfile.id;

    onSaveAiSettings({
      profiles: nextProfiles,
      chatProfileId: nextChatId,
      translateProfileId: settings.translateProfileId || FOLLOW_CHAT_PROFILE_ID,
    });

    setEditingDraft(null);
    setFormError(null);
    setTestResult(null);
  };

  const handleDeleteProfile = (profileId: string) => {
    const nextProfiles = settings.profiles.filter((p) => p.id !== profileId);
    const nextChatId =
      settings.chatProfileId === profileId ? nextProfiles[0]?.id ?? '' : settings.chatProfileId;
    const nextTranslateId =
      settings.translateProfileId === profileId
        ? FOLLOW_CHAT_PROFILE_ID
        : settings.translateProfileId || FOLLOW_CHAT_PROFILE_ID;

    onSaveAiSettings({
      profiles: nextProfiles,
      chatProfileId: nextChatId,
      translateProfileId: nextTranslateId,
    });
  };

  const handleExportBackup = async () => {
    setIsExporting(true);
    setBackupNotice(null);
    try {
      const payload = await exportBackupData(preferences);
      const jsonText = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lumina-backup-${formatBackupDateTag()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupNotice({
        ok: true,
        message: `备份已导出：包含 ${payload.documents.length} 份文档进度、${payload.notes.length} 条笔记、${payload.flashcards.length} 张闪卡与 ${payload.chatThreads.length} 个伴读话题。`,
      });
    } catch (err) {
      setBackupNotice({
        ok: false,
        message: err instanceof Error ? err.message : '导出备份失败，请稍后重试。',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreFile = async (file: File | undefined) => {
    if (!file) return;
    setIsRestoring(true);
    setBackupNotice(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const { stats, preferences: restoredPrefs } = await importBackupData(parsed);
      if (restoredPrefs) {
        onUpdatePreferences(restoredPrefs);
      }
      await onDataRestored?.(restoredPrefs);
      setBackupNotice({
        ok: true,
        message: '备份恢复成功，已按 ID 安全合并至本地数据库。',
        stats,
      });
    } catch (err) {
      setBackupNotice({
        ok: false,
        message: err instanceof Error ? err.message : '解析或导入备份文件失败，请核对文件格式。',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const isEditingLocal = editingDraft ? isLocalEndpoint(editingDraft.baseUrl) : false;

  return (
    <div
      data-floating-ui="true"
      className="lumina-animate-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/15 p-3 backdrop-blur-[2px] sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        className="lumina-animate-pop flex h-[84vh] max-h-[84vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border sm:h-[540px] sm:flex-row"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-popover)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 窄屏（< sm）优雅降级：顶部横向导航条 */}
        <div
          className="shrink-0 border-b px-4 pb-3 pt-3.5 sm:hidden"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--surface-subtle)',
          }}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--on-surface)' }}>
              设置
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭设置"
              className="cursor-pointer rounded-lg p-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: 'var(--on-surface-muted)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className="grid grid-cols-3 gap-1 rounded-xl p-1"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition"
                  style={{
                    backgroundColor: active ? 'var(--primary-soft)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--on-surface-muted)',
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.id === 'ai' && !aiConfigured && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--tertiary)' }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 桌面端左侧竖排导航栏 */}
        <aside
          aria-label="设置导航"
          className="hidden w-[176px] shrink-0 flex-col border-r p-3 sm:flex"
          style={{
            backgroundColor: 'var(--surface-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="px-2.5 pb-3 pt-1.5">
            <span
              className="text-xs font-semibold tracking-wider"
              style={{ color: 'var(--on-surface-muted)' }}
            >
              设置
            </span>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-[10px] px-3 py-2 text-left text-xs font-medium transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  style={{
                    backgroundColor: active ? 'var(--primary-soft)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--on-surface)',
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{
                        color: active ? 'var(--primary)' : 'var(--on-surface-muted)',
                      }}
                    />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'ai' && !aiConfigured && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--tertiary)' }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div
            className="mt-auto px-2.5 pb-1 text-[11px] leading-relaxed"
            style={{ color: 'var(--on-surface-muted)' }}
          >
            纯前端本地存储，偏好与密钥仅保留在浏览器中
          </div>
        </aside>

        {/* 右侧独立内容区 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* 桌面端右侧简洁顶部标题与关闭按钮 */}
          <div
            className="hidden shrink-0 items-center justify-between border-b px-6 py-3.5 sm:flex"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <h2 className="text-sm font-semibold" style={{ color: 'var(--on-surface)' }}>
              {activeNavMeta.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭设置"
              className="cursor-pointer rounded-lg p-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: 'var(--on-surface-muted)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {activeTab === 'appearance' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="lumina-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                {/* 阅读主题 */}
                <div>
                  <label
                    className="mb-2 block text-xs font-medium"
                    style={{ color: 'var(--on-surface-muted)' }}
                  >
                    阅读主题
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {THEME_CARDS.map((t) => {
                      const active = preferences.theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onUpdatePreferences({ theme: t.id })}
                          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-medium transition"
                          style={{
                            borderColor: active ? 'var(--primary)' : 'var(--border)',
                            backgroundColor: active
                              ? 'var(--primary-soft)'
                              : 'var(--surface-subtle)',
                            color: active ? 'var(--primary)' : 'var(--on-surface)',
                          }}
                        >
                          <span
                            className="h-3.5 w-3.5 rounded-full border"
                            style={{ backgroundColor: t.swatch, borderColor: t.ring }}
                          />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 阅读字体 */}
                <div>
                  <label
                    className="mb-2 block text-xs font-medium"
                    style={{ color: 'var(--on-surface-muted)' }}
                  >
                    阅读字体
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {READING_FONT_OPTIONS.map((opt) => {
                      const active = preferences.fontStyle === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onUpdatePreferences({ fontStyle: opt.id })}
                          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition"
                          style={{
                            borderColor: active ? 'var(--primary)' : 'var(--border)',
                            backgroundColor: active
                              ? 'var(--primary-soft)'
                              : 'var(--surface-subtle)',
                            color: active ? 'var(--primary)' : 'var(--on-surface)',
                          }}
                        >
                          <span
                            className="text-base leading-tight"
                            style={{
                              fontFamily: opt.fontFamily,
                              fontWeight: opt.fontWeight,
                              letterSpacing: opt.letterSpacing,
                            }}
                          >
                            Aa
                          </span>
                          <span className="mt-1 text-xs font-medium">{opt.label}</span>
                          <span
                            className="mt-0.5 text-[10px]"
                            style={{
                              color: active ? 'var(--primary)' : 'var(--on-surface-muted)',
                              opacity: active ? 0.85 : 0.75,
                            }}
                          >
                            {opt.subtitle}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 字号与行高 */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div
                    className="flex items-center justify-between rounded-xl border px-3.5 py-2.5"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--surface-subtle)',
                    }}
                  >
                    <span className="text-xs" style={{ color: 'var(--on-surface)' }}>
                      字号
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="减小字号"
                        onClick={() =>
                          onUpdatePreferences({ fontSize: Math.max(14, preferences.fontSize - 1) })
                        }
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--surface)',
                          color: 'var(--on-surface)',
                        }}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span
                        className="w-10 text-center text-xs font-medium tabular-nums"
                        style={{ color: 'var(--on-surface)' }}
                      >
                        {preferences.fontSize}px
                      </span>
                      <button
                        type="button"
                        aria-label="增大字号"
                        onClick={() =>
                          onUpdatePreferences({ fontSize: Math.min(24, preferences.fontSize + 1) })
                        }
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--surface)',
                          color: 'var(--on-surface)',
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between rounded-xl border px-3.5 py-2.5"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--surface-subtle)',
                    }}
                  >
                    <span className="text-xs" style={{ color: 'var(--on-surface)' }}>
                      行高
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="减小行高"
                        onClick={() =>
                          onUpdatePreferences({
                            lineHeight: Number(Math.max(1.4, preferences.lineHeight - 0.1).toFixed(1)),
                          })
                        }
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--surface)',
                          color: 'var(--on-surface)',
                        }}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span
                        className="w-10 text-center text-xs font-medium tabular-nums"
                        style={{ color: 'var(--on-surface)' }}
                      >
                        {preferences.lineHeight.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        aria-label="增大行高"
                        onClick={() =>
                          onUpdatePreferences({
                            lineHeight: Number(Math.min(2.2, preferences.lineHeight + 0.1).toFixed(1)),
                          })
                        }
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--surface)',
                          color: 'var(--on-surface)',
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 版心宽度 */}
                <div>
                  <label
                    className="mb-2 block text-xs font-medium"
                    style={{ color: 'var(--on-surface-muted)' }}
                  >
                    版心宽度
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {WIDTH_OPTIONS.map((opt) => {
                      const active = Math.abs(preferences.maxWidth - opt.value) <= 40;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => onUpdatePreferences({ maxWidth: opt.value })}
                          className="cursor-pointer rounded-xl border py-2 text-xs font-medium transition"
                          style={{
                            borderColor: active ? 'var(--primary)' : 'var(--border)',
                            backgroundColor: active
                              ? 'var(--primary-soft)'
                              : 'var(--surface-subtle)',
                            color: active ? 'var(--primary)' : 'var(--on-surface)',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* PDF 页面缩放比例 */}
                <div
                  className="flex items-center justify-between rounded-xl border px-3.5 py-2.5"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--surface-subtle)',
                  }}
                >
                  <div>
                    <span className="block text-xs font-medium" style={{ color: 'var(--on-surface)' }}>
                      PDF 页面缩放
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--on-surface-muted)' }}>
                      调整 PDF 文档渲染比例
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="缩小 PDF 页面"
                      onClick={() =>
                        onUpdatePreferences({
                          pdfZoom: Number(Math.max(0.7, preferences.pdfZoom - 0.1).toFixed(1)),
                        })
                      }
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition hover:bg-black/5 dark:hover:bg-white/10"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor: 'var(--surface)',
                        color: 'var(--on-surface)',
                      }}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span
                      className="w-11 text-center text-xs font-medium tabular-nums"
                      style={{ color: 'var(--on-surface)' }}
                    >
                      {Math.round(preferences.pdfZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      aria-label="放大 PDF 页面"
                      onClick={() =>
                        onUpdatePreferences({
                          pdfZoom: Number(Math.min(1.5, preferences.pdfZoom + 0.1).toFixed(1)),
                        })
                      }
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition hover:bg-black/5 dark:hover:bg-white/10"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor: 'var(--surface)',
                        color: 'var(--on-surface)',
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* PDF 暗黑模式图表保护开关 */}
                <div>
                  <label
                    className="mb-2 block text-xs font-medium"
                    style={{ color: 'var(--on-surface-muted)' }}
                  >
                    PDF 暗黑模式页面渲染
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PDF_DARK_MODES.map((mode) => {
                      const active = preferences.pdfDarkMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => onUpdatePreferences({ pdfDarkMode: mode.id })}
                          className="flex cursor-pointer flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition"
                          style={{
                            borderColor: active ? 'var(--primary)' : 'var(--border)',
                            backgroundColor: active
                              ? 'var(--primary-soft)'
                              : 'var(--surface-subtle)',
                          }}
                        >
                          <span
                            className="text-xs font-medium"
                            style={{ color: active ? 'var(--primary)' : 'var(--on-surface)' }}
                          >
                            {mode.label}
                          </span>
                          <span
                            className="mt-0.5 text-[10.5px] leading-snug"
                            style={{ color: 'var(--on-surface-muted)' }}
                          >
                            {mode.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                className="flex shrink-0 items-center justify-between border-t px-5 py-3 sm:px-6"
                style={{
                  borderColor: 'var(--border-subtle)',
                  backgroundColor: 'var(--surface-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={() => onUpdatePreferences(DEFAULT_PREFERENCES)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ color: 'var(--on-surface-muted)' }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>恢复默认</span>
                </button>

                <div className="flex items-center gap-3">
                  <span className="text-[11px]" style={{ color: 'var(--on-surface-muted)' }}>
                    调整已实时生效
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="cursor-pointer rounded-xl px-4 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
                    style={{ backgroundColor: 'var(--primary)' }}
                  >
                    完成
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'ai' ? (
            editingDraft ? (
              <form
                onSubmit={handleSaveProfile}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div className="lumina-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6 sm:py-4">
                  {/* 顶部返回列表条 */}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDraft(null);
                        setFormError(null);
                        setTestResult(null);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>返回模型列表</span>
                    </button>
                    <span className="text-xs font-semibold" style={{ color: 'var(--on-surface)' }}>
                      {isNewProfile ? '添加模型档案' : '编辑模型档案'}
                    </span>
                  </div>

                  {/* 快捷厂商预设 */}
                  <div>
                    <label
                      className="mb-1.5 block text-[11px] font-medium"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      快捷厂商预设（一键填充地址与建议模型）
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {AI_VENDOR_PRESETS.map((preset) => {
                        const selected = activePresetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyPresetToDraft(preset)}
                            className="cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
                            style={{
                              borderColor: selected ? 'var(--primary)' : 'var(--border)',
                              backgroundColor: selected
                                ? 'var(--primary-soft)'
                                : 'var(--surface-subtle)',
                              color: selected ? 'var(--primary)' : 'var(--on-surface)',
                            }}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 自定义备注名 + 接口协议 */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        className="mb-1 block text-xs font-medium"
                        style={{ color: 'var(--on-surface)' }}
                      >
                        备注名称
                      </label>
                      <input
                        type="text"
                        value={editingDraft.name}
                        onChange={(e) =>
                          setEditingDraft((p) => (p ? { ...p, name: e.target.value } : p))
                        }
                        placeholder="如：MiMo 日常、Gemini 备用"
                        className="w-full rounded-xl border px-3 py-2 text-xs outline-none transition focus:ring-2"
                        style={{
                          backgroundColor: 'var(--surface-subtle)',
                          borderColor: 'var(--border)',
                          color: 'var(--on-surface)',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="mb-1 block text-xs font-medium"
                        style={{ color: 'var(--on-surface)' }}
                      >
                        接口协议
                      </label>
                      <div
                        className="grid grid-cols-2 gap-1 rounded-xl p-1"
                        style={{
                          backgroundColor: 'var(--surface-subtle)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDraft((p) => (p ? { ...p, provider: 'openai' } : p));
                            setTestResult(null);
                          }}
                          className="cursor-pointer rounded-lg py-1.5 text-[11px] font-medium transition"
                          style={{
                            backgroundColor:
                              editingDraft.provider === 'openai' ? 'var(--surface)' : 'transparent',
                            color:
                              editingDraft.provider === 'openai'
                                ? 'var(--on-surface)'
                                : 'var(--on-surface-muted)',
                            boxShadow:
                              editingDraft.provider === 'openai'
                                ? '0 1px 2px rgba(0,0,0,0.08)'
                                : 'none',
                          }}
                        >
                          OpenAI 兼容
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDraft((p) => (p ? { ...p, provider: 'gemini' } : p));
                            setTestResult(null);
                          }}
                          className="cursor-pointer rounded-lg py-1.5 text-[11px] font-medium transition"
                          style={{
                            backgroundColor:
                              editingDraft.provider === 'gemini' ? 'var(--surface)' : 'transparent',
                            color:
                              editingDraft.provider === 'gemini'
                                ? 'var(--on-surface)'
                                : 'var(--on-surface-muted)',
                            boxShadow:
                              editingDraft.provider === 'gemini'
                                ? '0 1px 2px rgba(0,0,0,0.08)'
                                : 'none',
                          }}
                        >
                          Google Gemini
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Base URL */}
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="text-xs font-medium" style={{ color: 'var(--on-surface)' }}>
                        Base URL
                      </label>
                      {isEditingLocal && (
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: 'var(--primary-soft)',
                            color: 'var(--primary)',
                          }}
                        >
                          本地端点 · API Key 可留空
                        </span>
                      )}
                    </div>
                    <input
                      type="url"
                      value={editingDraft.baseUrl}
                      onChange={(e) => {
                        setEditingDraft((p) => (p ? { ...p, baseUrl: e.target.value } : p));
                        setFormError(null);
                      }}
                      placeholder={activePreset.baseUrlPlaceholder}
                      className="w-full rounded-xl border px-3 py-2 text-xs outline-none transition focus:ring-2"
                      style={{
                        backgroundColor: 'var(--surface-subtle)',
                        borderColor: 'var(--border)',
                        color: 'var(--on-surface)',
                      }}
                    />
                  </div>

                  {/* API Key */}
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: 'var(--on-surface)' }}
                    >
                      API Key{isEditingLocal ? '（本地模型选填）' : ''}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={editingDraft.apiKey}
                        onChange={(e) =>
                          setEditingDraft((p) => (p ? { ...p, apiKey: e.target.value } : p))
                        }
                        placeholder={
                          isEditingLocal
                            ? '本地端口（如 Ollama / LM Studio）可直接留空'
                            : activePreset.apiKeyPlaceholder
                        }
                        className="w-full rounded-xl border py-2 pl-3 pr-9 text-xs outline-none transition focus:ring-2"
                        style={{
                          backgroundColor: 'var(--surface-subtle)',
                          borderColor: 'var(--border)',
                          color: 'var(--on-surface)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer p-1"
                        style={{ color: 'var(--on-surface-muted)' }}
                      >
                        {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* 模型名称 + 建议模型胶囊 */}
                  <div>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
                      <label className="text-xs font-medium" style={{ color: 'var(--on-surface)' }}>
                        模型名称
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {suggestedModels.map((presetModel) => (
                          <button
                            key={presetModel}
                            type="button"
                            onClick={() => {
                              setEditingDraft((p) => (p ? { ...p, model: presetModel } : p));
                              setFormError(null);
                            }}
                            className="cursor-pointer rounded-md px-2 py-0.5 text-[10.5px] transition"
                            style={{
                              backgroundColor:
                                editingDraft.model === presetModel
                                  ? 'var(--primary-soft)'
                                  : 'var(--surface-subtle)',
                              color:
                                editingDraft.model === presetModel
                                  ? 'var(--primary)'
                                  : 'var(--on-surface-muted)',
                            }}
                          >
                            {presetModel}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={editingDraft.model}
                      onChange={(e) => {
                        setEditingDraft((p) => (p ? { ...p, model: e.target.value } : p));
                        setFormError(null);
                      }}
                      placeholder={
                        editingDraft.provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'
                      }
                      className="w-full rounded-xl border px-3 py-2 text-xs outline-none transition focus:ring-2"
                      style={{
                        backgroundColor: 'var(--surface-subtle)',
                        borderColor: 'var(--border)',
                        color: 'var(--on-surface)',
                      }}
                    />
                  </div>

                  {/* 关闭思考模式加速开关（OpenAI 兼容分支） */}
                  {editingDraft.provider === 'openai' && (
                    <label
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor: 'var(--surface-subtle)',
                      }}
                    >
                      <div className="min-w-0">
                        <span
                          className="block text-xs font-medium"
                          style={{ color: 'var(--on-surface)' }}
                        >
                          关闭混合思考模式（加速首字响应）
                        </span>
                        <span
                          className="mt-0.5 block text-[10.5px] leading-snug"
                          style={{ color: 'var(--on-surface-muted)' }}
                        >
                          开启后请求体附带 thinking: &#123; type: &quot;disabled&quot; &#125;，适合小米 MiMo 等混合思考模型
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(editingDraft.disableThinking)}
                        onChange={(e) =>
                          setEditingDraft((p) =>
                            p ? { ...p, disableThinking: e.target.checked } : p,
                          )
                        }
                        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                      />
                    </label>
                  )}

                  {formError && (
                    <div
                      className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs"
                      style={{
                        borderColor: 'var(--error)',
                        backgroundColor: 'rgba(194, 65, 59, 0.08)',
                        color: 'var(--error)',
                      }}
                    >
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {testResult && (
                    <div
                      className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed"
                      style={{
                        borderColor: testResult.ok ? 'var(--primary)' : 'var(--error)',
                        backgroundColor: testResult.ok
                          ? 'var(--primary-soft)'
                          : 'rgba(194, 65, 59, 0.08)',
                        color: testResult.ok ? 'var(--primary)' : 'var(--error)',
                      }}
                    >
                      {testResult.ok ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>

                {/* 表单固定底栏 */}
                <div
                  className="flex shrink-0 items-center justify-between border-t px-5 py-3 sm:px-6"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: 'var(--surface-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={handleTestDraft}
                    disabled={testing}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--on-surface)',
                    }}
                  >
                    {testing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    <span>{testing ? '测试连接中...' : '测试连接'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDraft(null);
                        setFormError(null);
                        setTestResult(null);
                      }}
                      className="cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="cursor-pointer rounded-xl px-4 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
                      style={{ backgroundColor: 'var(--primary)' }}
                    >
                      保存模型
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="lumina-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                  {/* 上方：极简场景分配 */}
                  <section
                    className="rounded-2xl border p-4"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--surface-subtle)',
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold" style={{ color: 'var(--on-surface)' }}>
                        场景分配
                      </h3>
                      <span className="text-[11px]" style={{ color: 'var(--on-surface-muted)' }}>
                        密钥仅存于本地浏览器
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="lumina-chat-profile-select"
                          className="mb-1.5 block text-[11px] font-medium"
                          style={{ color: 'var(--on-surface-muted)' }}
                        >
                          伴读答疑模型
                        </label>
                        <select
                          id="lumina-chat-profile-select"
                          disabled={settings.profiles.length === 0}
                          value={chatProfile?.id ?? ''}
                          onChange={(e) =>
                            onSaveAiSettings({
                              ...settings,
                              chatProfileId: e.target.value,
                            })
                          }
                          className="w-full cursor-pointer rounded-xl border px-3 py-2 text-xs outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            backgroundColor: 'var(--surface)',
                            borderColor: 'var(--border)',
                            color: 'var(--on-surface)',
                          }}
                        >
                          {settings.profiles.length === 0 ? (
                            <option value="">请先添加模型档案</option>
                          ) : (
                            settings.profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}（{p.model}）
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="lumina-translate-profile-select"
                          className="mb-1.5 block text-[11px] font-medium"
                          style={{ color: 'var(--on-surface-muted)' }}
                        >
                          划词翻译模型
                        </label>
                        <select
                          id="lumina-translate-profile-select"
                          disabled={settings.profiles.length === 0}
                          value={
                            isTranslateFollowing
                              ? FOLLOW_CHAT_PROFILE_ID
                              : translateProfile?.id ?? FOLLOW_CHAT_PROFILE_ID
                          }
                          onChange={(e) =>
                            onSaveAiSettings({
                              ...settings,
                              translateProfileId: e.target.value,
                            })
                          }
                          className="w-full cursor-pointer rounded-xl border px-3 py-2 text-xs outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            backgroundColor: 'var(--surface)',
                            borderColor: 'var(--border)',
                            color: 'var(--on-surface)',
                          }}
                        >
                          <option value={FOLLOW_CHAT_PROFILE_ID}>跟随伴读主模型</option>
                          {settings.profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}（{p.model}）
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <p
                      className="mt-2.5 text-[11px] leading-relaxed"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      右侧伴读、解释、总结、导读与闪卡均使用「伴读答疑模型」；划词原位译文默认跟随，也可单独指定更轻快的翻译模型。
                    </p>
                  </section>

                  {/* 下方：我的模型列表 */}
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold" style={{ color: 'var(--on-surface)' }}>
                          我的模型列表
                        </h3>
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                          style={{
                            backgroundColor: 'var(--surface-subtle)',
                            color: 'var(--on-surface-muted)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {settings.profiles.length}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={startCreateProfile}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
                        style={{ backgroundColor: 'var(--primary)' }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>添加模型</span>
                      </button>
                    </div>

                    {settings.profiles.length === 0 ? (
                      <div
                        className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--surface-subtle)',
                        }}
                      >
                        <Sparkles
                          className="mb-2 h-5 w-5"
                          style={{ color: 'var(--primary)' }}
                        />
                        <p className="text-xs font-medium" style={{ color: 'var(--on-surface)' }}>
                          尚未添加模型档案
                        </p>
                        <p
                          className="mt-1 max-w-xs text-[11px] leading-relaxed"
                          style={{ color: 'var(--on-surface-muted)' }}
                        >
                          支持小米 MiMo、Google Gemini、DeepSeek、OpenAI、OpenRouter 或 Ollama 本地模型。
                        </p>
                        <button
                          type="button"
                          onClick={startCreateProfile}
                          className="mt-3.5 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                          style={{
                            borderColor: 'var(--border)',
                            backgroundColor: 'var(--surface)',
                            color: 'var(--on-surface)',
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
                          <span>立即添加</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {settings.profiles.map((profile) => {
                          const isChat = chatProfile?.id === profile.id;
                          const isTranslate = translateProfile?.id === profile.id;
                          const configured = isProfileConfigured(profile);
                          const local = isLocalEndpoint(profile.baseUrl);

                          return (
                            <div
                              key={profile.id}
                              className="flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3 transition"
                              style={{
                                borderColor: isChat ? 'var(--primary)' : 'var(--border)',
                                backgroundColor: isChat
                                  ? 'var(--primary-soft)'
                                  : 'var(--surface)',
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className="truncate text-xs font-semibold"
                                    style={{ color: 'var(--on-surface)' }}
                                  >
                                    {profile.name}
                                  </span>

                                  {isChat && (
                                    <span
                                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                      style={{
                                        backgroundColor: 'var(--primary)',
                                        color: '#FFFFFF',
                                      }}
                                    >
                                      伴读
                                    </span>
                                  )}

                                  {isTranslate && (
                                    <span
                                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                      style={{
                                        backgroundColor: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--primary)',
                                      }}
                                    >
                                      {isTranslateFollowing ? '翻译(跟随)' : '翻译'}
                                    </span>
                                  )}

                                  {profile.disableThinking && profile.provider === 'openai' && (
                                    <span
                                      className="rounded-md px-1.5 py-0.5 text-[10px]"
                                      style={{
                                        backgroundColor: 'var(--surface-subtle)',
                                        color: 'var(--on-surface-muted)',
                                        border: '1px solid var(--border-subtle)',
                                      }}
                                    >
                                      关思考
                                    </span>
                                  )}

                                  {local && (
                                    <span
                                      className="rounded-md px-1.5 py-0.5 text-[10px]"
                                      style={{
                                        backgroundColor: 'var(--surface-subtle)',
                                        color: 'var(--on-surface-muted)',
                                        border: '1px solid var(--border-subtle)',
                                      }}
                                    >
                                      本地免密
                                    </span>
                                  )}

                                  {!configured && (
                                    <span
                                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                      style={{
                                        backgroundColor: 'rgba(194, 65, 59, 0.1)',
                                        color: 'var(--error)',
                                      }}
                                    >
                                      缺少密钥
                                    </span>
                                  )}
                                </div>

                                <div
                                  className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]"
                                  style={{ color: 'var(--on-surface-muted)' }}
                                >
                                  <span>
                                    {profile.provider === 'gemini' ? 'Gemini' : 'OpenAI 兼容'}
                                  </span>
                                  <span>·</span>
                                  <span className="font-mono text-[10.5px]">{profile.model}</span>
                                  <span>·</span>
                                  <span className="truncate">{formatBaseUrlHost(profile.baseUrl)}</span>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => startEditProfile(profile)}
                                  title="编辑档案"
                                  aria-label={`编辑 ${profile.name}`}
                                  className="cursor-pointer rounded-lg p-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
                                  style={{ color: 'var(--on-surface-muted)' }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProfile(profile.id)}
                                  title="删除档案"
                                  aria-label={`删除 ${profile.name}`}
                                  className="cursor-pointer rounded-lg p-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
                                  style={{ color: 'var(--on-surface-muted)' }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>

                <div
                  className="flex shrink-0 items-center justify-between border-t px-5 py-3 sm:px-6"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: 'var(--surface-subtle)',
                  }}
                >
                  <span className="text-[11px]" style={{ color: 'var(--on-surface-muted)' }}>
                    {aiConfigured
                      ? `当前主模型：${chatProfile?.name ?? ''}`
                      : '至少配置一条可用模型即可启用划词译文与伴读'}
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="cursor-pointer rounded-xl px-4 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
                    style={{ backgroundColor: 'var(--primary)' }}
                  >
                    完成
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="lumina-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                {/* 备份安全与范围说明 */}
                <div
                  className="flex items-start gap-2.5 rounded-xl border p-3.5 text-xs leading-relaxed"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--surface-subtle)',
                    color: 'var(--on-surface-muted)',
                  }}
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
                  <div>
                    <p className="font-medium" style={{ color: 'var(--on-surface)' }}>
                      纯本地轻量数据备份与安全合并
                    </p>
                    <p className="mt-1">
                      备份文件包含阅读进度摘要、高亮译文与批注、闪卡、伴读话题、全文导读缓存及外观偏好（不含大体积文档原文件，且绝不导出任何 API Key）。
                    </p>
                  </div>
                </div>

                {/* 导出与恢复操作卡片 */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    disabled={isExporting || isRestoring}
                    className="flex cursor-pointer flex-col items-start rounded-2xl border p-4 text-left transition hover:shadow-sm disabled:opacity-50"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--surface)',
                    }}
                  >
                    <div
                      className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl"
                      style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary)' }}
                    >
                      {isExporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--on-surface)' }}>
                      一键导出备份（.json）
                    </span>
                    <span className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--on-surface-muted)' }}>
                      打包全部笔记、闪卡、话题与阅读偏好
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => restoreInputRef.current?.click()}
                    disabled={isExporting || isRestoring}
                    className="flex cursor-pointer flex-col items-start rounded-2xl border p-4 text-left transition hover:shadow-sm disabled:opacity-50"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--surface)',
                    }}
                  >
                    <input
                      ref={restoreInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        void handleRestoreFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <div
                      className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl"
                      style={{ backgroundColor: 'var(--surface-subtle)', color: 'var(--on-surface)' }}
                    >
                      {isRestoring ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--on-surface)' }}>
                      从备份文件恢复（.json）
                    </span>
                    <span className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--on-surface-muted)' }}>
                      按 ID 安全合并写入，保留未冲突本地数据
                    </span>
                  </button>
                </div>

                {backupNotice && (
                  <div
                    className="space-y-2 rounded-xl border px-3.5 py-3 text-xs leading-relaxed"
                    style={{
                      borderColor: backupNotice.ok ? 'var(--primary)' : 'var(--error)',
                      backgroundColor: backupNotice.ok
                        ? 'var(--primary-soft)'
                        : 'rgba(194, 65, 59, 0.08)',
                      color: backupNotice.ok ? 'var(--primary)' : 'var(--error)',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {backupNotice.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <span>{backupNotice.message}</span>
                    </div>

                    {backupNotice.stats && (
                      <div
                        className="grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-2 text-[11px]"
                        style={{
                          borderColor: 'rgba(43, 91, 132, 0.2)',
                          color: 'var(--on-surface)',
                        }}
                      >
                        <span>更新文档进度：{backupNotice.stats.documentsUpdated} 份</span>
                        <span>合并笔记：{backupNotice.stats.notesMerged} 条</span>
                        <span>合并闪卡：{backupNotice.stats.flashcardsMerged} 张</span>
                        <span>合并伴读话题：{backupNotice.stats.threadsMerged} 个</span>
                        <span>合并全文导读：{backupNotice.stats.guidesMerged} 份</span>
                        <span>
                          外观偏好：{backupNotice.stats.preferencesRestored ? '已恢复' : '未包含'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className="flex shrink-0 items-center justify-end border-t px-5 py-3 sm:px-6"
                style={{
                  borderColor: 'var(--border-subtle)',
                  backgroundColor: 'var(--surface-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-xl px-4 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  完成
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
