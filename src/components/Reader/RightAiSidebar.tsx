import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownLeft,
  History,
  PanelRightClose,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AiSettings,
  ChatMessage,
  ChatThread,
  DocGuideRecord,
  QuoteContext,
} from '../../types';
import {
  isAiConfigured,
  isProfileConfigured,
  resolveProfileForScene,
} from '../../services/aiService';
import { interceptExternalLinkClick } from '../../utils/externalLink';

interface RightAiSidebarProps {
  isOpen: boolean;
  threads: ChatThread[];
  activeThreadId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingQuote: QuoteContext | null;
  linkDocContext: boolean;
  docGuide: DocGuideRecord | null;
  isGuideStreaming: boolean;
  guideStreamText: string;
  guideError: string | null;
  aiSettings: AiSettings;
  onClose: () => void;
  onCreateNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onToggleLinkDocContext: (linked: boolean) => void;
  onGenerateGuide: () => void;
  onStopGuide: () => void;
  onSendMessage: (userText: string, quoteCtx?: QuoteContext | null) => void;
  onStopStreaming: () => void;
  onClearPendingQuote: () => void;
  onOpenSettings: () => void;
  onSelectChatProfile: (profileId: string) => void;
}

const FOLLOW_UP_CHIPS = [
  { label: '拆解长难句语法', prompt: '请拆解这段话的句法结构与修饰关系，标注主干成分与从句逻辑。' },
  { label: '分析深层含义', prompt: '请结合语境深入剖析这段话的隐含观点、修辞语气或作者真实意图。' },
  { label: '提炼核心词汇', prompt: '请挑出这段文字中值得积累的核心术语、地道表达或精准用词并简要释义。' },
];

function formatThreadTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}m 前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h 前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/10"
      style={{ color: copied ? 'var(--primary)' : 'var(--on-surface-muted)' }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span>{copied ? '已复制' : '复制'}</span>
    </button>
  );
}

export function RightAiSidebar({
  isOpen,
  threads,
  activeThreadId,
  messages,
  isStreaming,
  pendingQuote,
  linkDocContext,
  docGuide,
  isGuideStreaming,
  guideStreamText,
  guideError,
  aiSettings,
  onClose,
  onCreateNewThread,
  onSelectThread,
  onDeleteThread,
  onToggleLinkDocContext,
  onGenerateGuide,
  onStopGuide,
  onSendMessage,
  onStopStreaming,
  onClearPendingQuote,
  onOpenSettings,
  onSelectChatProfile,
}: RightAiSidebarProps) {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [guideCollapsed, setGuideCollapsed] = useState(false);

  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyDropdownRef = useRef<HTMLDivElement | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, messages[messages.length - 1]?.content]);

  useEffect(() => {
    if (isGuideStreaming) {
      setGuideCollapsed(false);
    }
  }, [isGuideStreaming]);

  useEffect(() => {
    if (isOpen && pendingQuote) {
      const timer = window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 160);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, pendingQuote]);

  useEffect(() => {
    if (!historyOpen && !modelMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        historyOpen &&
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(e.target as Node)
      ) {
        setHistoryOpen(false);
      }
      if (
        modelMenuOpen &&
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setModelMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHistoryOpen(false);
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [historyOpen, modelMenuOpen]);

  const activeProfile = resolveProfileForScene(aiSettings, 'chat');
  const configured = isAiConfigured(aiSettings, 'chat');

  const validHistoryCount = messages.filter(
    (m) => !m.isError && !m.isStreaming && m.content.trim().length > 0,
  ).length;
  const hasSlidingWindowTrim = validHistoryCount > 10;

  const displayedGuideContent = isGuideStreaming
    ? guideStreamText
    : docGuide?.summary ?? '';
  const hasGuideCard = Boolean(displayedGuideContent || isGuideStreaming || guideError);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if ((!trimmed && !pendingQuote) || isStreaming) return;
    if (!trimmed) return;
    setInput('');
    onSendMessage(trimmed, pendingQuote);
  };

  const handleChipClick = (promptText: string) => {
    if (isStreaming) return;
    onSendMessage(promptText, pendingQuote);
  };

  return (
    <aside
      className="h-full shrink-0 overflow-hidden border-l transition-[width,opacity] duration-250 ease-out"
      style={{
        width: isOpen ? '368px' : '0px',
        opacity: isOpen ? 1 : 0,
        borderColor: isOpen ? 'var(--border)' : 'transparent',
        backgroundColor: 'var(--surface-subtle)',
      }}
    >
      <div className="flex h-full w-[368px] flex-col pt-14">
        {/* 顶部栏：伴读标题 + 新话题 + 历史话题切换 + 收起 */}
        <div
          className="relative flex items-center justify-between border-b px-3.5 py-2.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="relative flex min-w-0 items-center gap-1.5" ref={modelDropdownRef}>
            <Sparkles className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
            <span className="shrink-0 text-xs font-semibold" style={{ color: 'var(--on-surface)' }}>
              AI 伴读
            </span>
            <button
              type="button"
              onClick={() => {
                setHistoryOpen(false);
                setModelMenuOpen((v) => !v);
              }}
              aria-label="快捷切换 AI 模型"
              title={
                activeProfile
                  ? `当前伴读模型：${activeProfile.name} (${activeProfile.model})`
                  : '未配置模型，点击配置'
              }
              className="inline-flex max-w-[128px] cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition hover:brightness-95"
              style={{
                backgroundColor: modelMenuOpen ? 'var(--primary-soft)' : 'var(--surface)',
                color: modelMenuOpen ? 'var(--primary)' : 'var(--on-surface-muted)',
                border: `1px solid ${modelMenuOpen ? 'var(--primary)' : 'var(--border-subtle)'}`,
              }}
            >
              <span className="truncate">{activeProfile?.name || '未配置模型'}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-75" />
            </button>

            {/* 模型档案快捷切换下拉菜单 */}
            {modelMenuOpen && (
              <div
                data-floating-ui="true"
                className="lumina-animate-pop absolute left-0 top-9 z-50 w-64 overflow-hidden rounded-2xl border backdrop-blur-xl"
                style={{
                  backgroundColor: 'var(--surface-elevated)',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow-popover)',
                }}
              >
                <div
                  className="border-b px-3 py-2 text-[11px] font-medium"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--on-surface-muted)',
                  }}
                >
                  切换伴读模型
                </div>

                <div className="lumina-scroll max-h-56 overflow-y-auto p-1.5">
                  {aiSettings.profiles.length === 0 ? (
                    <p
                      className="px-2.5 py-4 text-center text-xs"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      暂无已保存模型档案
                    </p>
                  ) : (
                    aiSettings.profiles.map((profile) => {
                      const active = activeProfile?.id === profile.id;
                      const ready = isProfileConfigured(profile);
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => {
                            setModelMenuOpen(false);
                            if (ready) {
                              onSelectChatProfile(profile.id);
                            } else {
                              onOpenSettings();
                            }
                          }}
                          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition hover:bg-black/5 dark:hover:bg-white/5"
                          style={{
                            backgroundColor: active ? 'var(--primary-soft)' : 'transparent',
                            opacity: ready ? 1 : 0.65,
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="truncate text-xs font-medium"
                                style={{
                                  color: active ? 'var(--primary)' : 'var(--on-surface)',
                                }}
                              >
                                {profile.name}
                              </span>
                              {!ready && (
                                <span
                                  className="shrink-0 text-[10px]"
                                  style={{ color: 'var(--error)' }}
                                >
                                  未填密钥
                                </span>
                              )}
                            </div>
                            <p
                              className="truncate font-mono text-[10px]"
                              style={{ color: 'var(--on-surface-muted)' }}
                            >
                              {profile.model}
                            </p>
                          </div>
                          {active && (
                            <Check
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: 'var(--primary)' }}
                            />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                <div
                  className="border-t p-1.5"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setModelMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="flex w-full cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: 'var(--primary)' }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>管理模型配置…</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1" ref={historyDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setModelMenuOpen(false);
                setHistoryOpen(false);
                onCreateNewThread();
              }}
              title="开启新话题"
              aria-label="开启新话题"
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--on-surface)',
              }}
            >
              <Plus className="h-3 w-3" style={{ color: 'var(--primary)' }} />
              <span>新话题</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setModelMenuOpen(false);
                setHistoryOpen((v) => !v);
              }}
              title="历史话题切换"
              aria-label="历史话题切换"
              className="inline-flex cursor-pointer items-center gap-0.5 rounded-lg p-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
              style={{
                backgroundColor: historyOpen ? 'var(--primary-soft)' : 'transparent',
                color: historyOpen ? 'var(--primary)' : 'var(--on-surface-muted)',
              }}
            >
              <History className="h-3.5 w-3.5" />
              <ChevronDown className="h-3 w-3" />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="收起伴读栏"
              aria-label="收起伴读栏"
              className="cursor-pointer rounded-lg p-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: 'var(--on-surface-muted)' }}
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>

            {/* 历史话题下拉列表 */}
            {historyOpen && (
              <div
                data-floating-ui="true"
                className="lumina-animate-pop absolute right-3 top-11 z-50 w-72 overflow-hidden rounded-2xl border backdrop-blur-xl"
                style={{
                  backgroundColor: 'var(--surface-elevated)',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow-popover)',
                }}
              >
                <div
                  className="flex items-center justify-between border-b px-3.5 py-2"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <span className="text-[11px] font-medium" style={{ color: 'var(--on-surface-muted)' }}>
                    历史话题（{threads.length}）
                  </span>
                </div>

                <div className="lumina-scroll max-h-64 overflow-y-auto p-1.5">
                  {threads.length === 0 ? (
                    <p
                      className="px-3 py-6 text-center text-xs"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      暂无历史话题，发送第一条提问即可自动保存。
                    </p>
                  ) : (
                    threads.map((thread) => {
                      const active = thread.id === activeThreadId;
                      return (
                        <div
                          key={thread.id}
                          onClick={() => {
                            onSelectThread(thread.id);
                            setHistoryOpen(false);
                          }}
                          className="group flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 transition hover:bg-black/5 dark:hover:bg-white/5"
                          style={{
                            backgroundColor: active ? 'var(--primary-soft)' : undefined,
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-xs font-medium"
                              style={{ color: active ? 'var(--primary)' : 'var(--on-surface)' }}
                            >
                              {thread.title}
                            </p>
                            <p className="mt-0.5 text-[10.5px]" style={{ color: 'var(--on-surface-muted)' }}>
                              {Math.ceil(thread.messages.length / 2)} 轮对话 · {formatThreadTime(thread.updatedAt)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteThread(thread.id);
                            }}
                            title="删除话题"
                            aria-label="删除话题"
                            className="cursor-pointer rounded p-1 opacity-0 transition hover:bg-black/5 group-hover:opacity-100 dark:hover:bg-white/10"
                            style={{ color: 'var(--on-surface-muted)' }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 未配置 Key 轻提醒 */}
        {!configured && (
          <div
            className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--on-surface-muted)',
            }}
          >
            <span>配置 API Key 后即可开启伴读对话</span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-white"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Settings className="h-3 w-3" />
              <span>去配置</span>
            </button>
          </div>
        )}

        {/* 对话与按需全文导读区 */}
        <div
          className="lumina-scroll flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3.5"
          onClick={(e) => {
            interceptExternalLinkClick(e);
          }}
        >
          {/* 按需全文结构导读（已缓存或正在流式生成时展示可折叠卡片） */}
          {hasGuideCard ? (
            <div
              className="rounded-2xl border overflow-hidden"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
              }}
            >
              <div
                onClick={() => setGuideCollapsed((v) => !v)}
                className="flex cursor-pointer items-center justify-between px-3.5 py-2.5 transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-1.5">
                  {guideCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--on-surface-muted)' }} />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--on-surface-muted)' }} />
                  )}
                  <BookOpen className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--on-surface)' }}>
                    全文结构导读
                  </span>
                  {isGuideStreaming ? (
                    <span className="text-[10.5px]" style={{ color: 'var(--primary)' }}>
                      生成中…
                    </span>
                  ) : docGuide ? (
                    <span className="text-[10px]" style={{ color: 'var(--on-surface-muted)' }}>
                      已缓存
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {isGuideStreaming ? (
                    <button
                      type="button"
                      onClick={onStopGuide}
                      title="停止生成导读"
                      className="cursor-pointer rounded-md p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
                      style={{ color: 'var(--error)' }}
                    >
                      <Square className="h-3 w-3 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onGenerateGuide}
                      title="重新生成全文导读"
                      aria-label="重新生成全文导读"
                      className="cursor-pointer rounded-md p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {!guideCollapsed && (
                <div
                  className="border-t px-3.5 py-3"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {guideError ? (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--error)' }}>
                      {guideError}
                    </p>
                  ) : displayedGuideContent ? (
                    <div className="lumina-ai-prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {displayedGuideContent}
                      </ReactMarkdown>
                      {isGuideStreaming && (
                        <span
                          className="ml-1 inline-block h-3.5 w-[2px] animate-pulse align-middle"
                          style={{ backgroundColor: 'var(--primary)' }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--on-surface-muted)' }}>
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--primary)' }} />
                      <span>正在抽样全文结构并生成导读...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : messages.length > 0 ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onGenerateGuide}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/5"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--on-surface-muted)',
                }}
              >
                <BookOpen className="h-3 w-3" style={{ color: 'var(--primary)' }} />
                <span>生成全文结构导读</span>
              </button>
            </div>
          ) : null}

          {/* 对话消息列表 */}
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-3 py-10 text-center">
              <div
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--primary)',
                }}
              >
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium" style={{ color: 'var(--on-surface)' }}>
                随时为你解释难点、检索全文脉络
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--on-surface-muted)' }}>
                提问时自动结合当前阅读位置与本地 BM25 检索段落；划词亦可一键发送至此处追问。
              </p>

              {!hasGuideCard && (
                <button
                  type="button"
                  onClick={onGenerateGuide}
                  className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--on-surface)',
                  }}
                >
                  <BookOpen className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
                  <span>生成全文结构导读</span>
                </button>
              )}
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="space-y-1.5">
                {msg.role === 'user' ? (
                  <div className="ml-6 space-y-1.5">
                    {msg.quoteContext && (
                      <div
                        className="rounded-xl border p-2.5 text-[11.5px] leading-relaxed"
                        style={{
                          backgroundColor: 'var(--surface)',
                          borderColor: 'var(--border)',
                          color: 'var(--on-surface-muted)',
                        }}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-medium" style={{ color: 'var(--primary)' }}>
                            {msg.quoteContext.actionLabel ?? '引用片段'}
                          </span>
                        </div>
                        <p className="line-clamp-3 border-l-2 pl-2" style={{ borderColor: 'var(--primary)' }}>
                          {msg.quoteContext.quote}
                        </p>
                        {msg.quoteContext.translation && (
                          <p className="mt-1.5 line-clamp-2 opacity-85">
                            参考译文：{msg.quoteContext.translation}
                          </p>
                        )}
                      </div>
                    )}
                    <div
                      className="rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] leading-relaxed text-white"
                      style={{ backgroundColor: 'var(--primary)' }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-2xl rounded-tl-sm border px-3.5 py-3"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderColor: msg.isError ? 'var(--error)' : 'var(--border)',
                    }}
                  >
                    {msg.isError ? (
                      <div className="space-y-2 text-xs" style={{ color: 'var(--error)' }}>
                        <p>{msg.content}</p>
                        {!configured && (
                          <button
                            type="button"
                            onClick={onOpenSettings}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white"
                            style={{ backgroundColor: 'var(--primary)' }}
                          >
                            <Settings className="h-3 w-3" />
                            <span>配置 API Key</span>
                          </button>
                        )}
                      </div>
                    ) : msg.content ? (
                      <>
                        <div className="lumina-ai-prose">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          {msg.isStreaming && (
                            <span
                              className="ml-1 inline-block h-3.5 w-[2px] animate-pulse align-middle"
                              style={{ backgroundColor: 'var(--primary)' }}
                            />
                          )}
                        </div>
                        {!msg.isStreaming && (
                          <div
                            className="mt-2 flex items-center justify-end border-t pt-1.5"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <CopyMessageButton text={msg.content} />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 py-1 text-xs" style={{ color: 'var(--on-surface-muted)' }}>
                        <RotateCcw className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--primary)' }} />
                        <span>正在思考...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* 底部输入、上下文范围胶囊开关与待追问引用区 */}
        <div
          className="border-t p-3"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-subtle)' }}
        >
          {pendingQuote && (
            <div
              className="mb-2.5 rounded-xl border p-2.5"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--primary)',
              }}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: 'var(--primary)' }}>
                  已附带原文{pendingQuote.translation ? '与译文' : ''}作为追问上下文
                </span>
                <button
                  type="button"
                  onClick={onClearPendingQuote}
                  className="cursor-pointer rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ color: 'var(--on-surface-muted)' }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="line-clamp-2 text-[11.5px] leading-relaxed" style={{ color: 'var(--on-surface-muted)' }}>
                {pendingQuote.quote}
              </p>

              {/* 一键快捷追问芯片 */}
              <div className="mt-2 flex flex-wrap gap-1">
                {FOLLOW_UP_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    disabled={isStreaming}
                    onClick={() => handleChipClick(chip.prompt)}
                    className="cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition hover:brightness-95 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--primary-soft)',
                      borderColor: 'transparent',
                      color: 'var(--primary)',
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 轻量上下文范围切换胶囊 + 滑动窗口提示 */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <div
              className="inline-flex items-center rounded-full border p-0.5"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
              }}
            >
              <button
                type="button"
                onClick={() => onToggleLinkDocContext(true)}
                title="自动附带当前视窗与全书检索相关段落（严格封顶 5,000 字）"
                className="cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-medium transition"
                style={{
                  backgroundColor: linkDocContext ? 'var(--primary-soft)' : 'transparent',
                  color: linkDocContext ? 'var(--primary)' : 'var(--on-surface-muted)',
                }}
              >
                关联正文
              </button>
              <button
                type="button"
                onClick={() => onToggleLinkDocContext(false)}
                title="不附带正文检索片段，最省 Token"
                className="cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-medium transition"
                style={{
                  backgroundColor: !linkDocContext ? 'var(--primary-soft)' : 'transparent',
                  color: !linkDocContext ? 'var(--primary)' : 'var(--on-surface-muted)',
                }}
              >
                仅当前对话
              </button>
            </div>

            {hasSlidingWindowTrim && (
              <span className="text-[10.5px]" style={{ color: 'var(--on-surface-muted)' }}>
                发送近 5 轮
              </span>
            )}
          </div>

          <div
            className="flex items-end gap-2 rounded-2xl border p-2 transition focus-within:ring-2"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
          >
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={pendingQuote ? '针对上方片段继续追问...' : '就本文向 AI 伴读提问...'}
              className="lumina-scroll max-h-32 min-h-[42px] flex-1 resize-none bg-transparent px-1.5 py-1 text-xs leading-relaxed outline-none"
              style={{ color: 'var(--on-surface)' }}
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStreaming}
                title="停止生成"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl text-white transition hover:brightness-110"
                style={{ backgroundColor: 'var(--error)' }}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                title="发送 (Enter)"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                <CornerDownLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
