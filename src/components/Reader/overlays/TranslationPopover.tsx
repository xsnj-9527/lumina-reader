import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  Copy,
  Languages,
  MessageSquareShare,
  RotateCcw,
  Settings,
  X,
} from 'lucide-react';
import type { AiSettings, FloatingPosition, NoteAnchor } from '../../../types';
import {
  isAiConfigured,
  resolveProfileForScene,
  streamCompletion,
} from '../../../services/aiService';
import { buildTranslatePrompt } from '../../../services/prompts';

export interface TranslationSession {
  id: string;
  quote: string;
  rawQuote: string;
  context: string;
  position: FloatingPosition;
  anchor: NoteAnchor;
}

interface TranslationPopoverProps {
  session: TranslationSession;
  aiSettings: AiSettings;
  onClose: () => void;
  onOpenSettings: () => void;
  onSaveToNotes: (payload: {
    quote: string;
    rawQuote: string;
    translation: string;
    context: string;
    anchor: NoteAnchor;
  }) => Promise<void> | void;
  onSendToFollowUp: (payload: {
    quote: string;
    translation: string;
    context: string;
  }) => void;
}

export function TranslationPopover({
  session,
  aiSettings,
  onClose,
  onOpenSettings,
  onSaveToNotes,
  onSendToFollowUp,
}: TranslationPopoverProps) {
  const [translation, setTranslation] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const promptPayload = useMemo(
    () => buildTranslatePrompt(session.quote, session.context),
    [session.quote, session.context],
  );
  const isWordMode = promptPayload.mode === 'word';
  const translateProfile = useMemo(
    () => resolveProfileForScene(aiSettings, 'translate'),
    [aiSettings],
  );
  const translateConfigured = isAiConfigured(aiSettings, 'translate');

  const runTranslation = useCallback(() => {
    abortRef.current?.abort();
    setTranslation('');
    setErrorMsg(null);
    setSaved(false);

    if (!translateConfigured) {
      setIsStreaming(false);
      setErrorMsg('尚未配置可用的翻译模型或 API Key，配置后即可使用流式上下文翻译。');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    streamCompletion({
      settings: aiSettings,
      scene: 'translate',
      systemPrompt: promptPayload.systemPrompt,
      messages: promptPayload.messages,
      temperature: 0.25,
      signal: controller.signal,
      onChunk: (_delta, fullText) => {
        setTranslation(fullText);
      },
      onDone: () => {
        setIsStreaming(false);
      },
      onError: (err) => {
        setIsStreaming(false);
        setErrorMsg(err.message);
      },
    }).catch(() => {
      // AbortError 与业务错误已在回调中妥善处理
    });
  }, [aiSettings, promptPayload, translateConfigured]);

  useEffect(() => {
    runTranslation();
    return () => {
      abortRef.current?.abort();
    };
  }, [session.id, retryToken, runTranslation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        const targetEl = e.target as HTMLElement | null;
        if (targetEl?.closest('[data-floating-ui="true"]')) return;
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleCopy = () => {
    if (!translation.trim()) return;
    navigator.clipboard.writeText(translation.trim()).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  const handleSave = async () => {
    if (!translation.trim() || saved) return;
    await onSaveToNotes({
      quote: session.quote,
      rawQuote: session.rawQuote,
      translation: translation.trim(),
      context: session.context,
      anchor: session.anchor,
    });
    setSaved(true);
  };

  const handleFollowUp = () => {
    onSendToFollowUp({
      quote: session.quote,
      translation: translation.trim(),
      context: session.context,
    });
    onClose();
  };

  const transform =
    session.position.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';

  const card = (
    <div
      ref={cardRef}
      data-floating-ui="true"
      style={{
        position: 'fixed',
        left: `${session.position.x}px`,
        top: `${session.position.y}px`,
        transform,
        width: 'min(410px, calc(100vw - 24px))',
        zIndex: 65,
      }}
    >
      <div
        className="lumina-animate-pop overflow-hidden rounded-2xl border backdrop-blur-xl"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        {/* 卡片极简顶部：智能分流显示 语境词典 vs 原位译文 */}
        <div
          className="flex items-center justify-between border-b px-4 py-2.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {isWordMode ? (
              <BookOpen className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--primary)' }} />
            ) : (
              <Languages className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--primary)' }} />
            )}
            <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--on-surface)' }}>
              {isWordMode ? '语境词典' : '原位译文'}
            </span>
            {isWordMode && (
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: 'var(--primary-soft)',
                  color: 'var(--primary)',
                }}
              >
                单词/术语
              </span>
            )}
            {translateProfile && (
              <span
                className="max-w-[110px] truncate rounded-md px-1.5 py-0.5 text-[10px]"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--on-surface-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
                title={`当前翻译模型：${translateProfile.name} (${translateProfile.model})`}
              >
                {translateProfile.name}
              </span>
            )}
            {isStreaming && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px]" style={{ color: 'var(--primary)' }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
                {isWordMode ? '释义中' : '翻译中'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭译文卡片"
            className="cursor-pointer rounded-md p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--on-surface-muted)' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 原文轻预览 */}
        <div
          className="border-b px-4 py-2 text-xs leading-relaxed"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--surface-subtle)',
            color: 'var(--on-surface-muted)',
          }}
        >
          <p className={isWordMode ? 'font-medium' : 'line-clamp-2'} style={isWordMode ? { color: 'var(--on-surface)' } : undefined}>
            {session.quote}
          </p>
        </div>

        {/* 流式译文/词典释义主体 */}
        <div className="lumina-scroll max-h-60 overflow-y-auto px-4 py-3.5">
          {errorMsg ? (
            <div className="space-y-3 text-xs leading-relaxed">
              <p style={{ color: 'var(--error)' }}>{errorMsg}</p>
              <div className="flex items-center gap-2">
                {!translateConfigured ? (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
                    style={{ backgroundColor: 'var(--primary)' }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>前往配置 API Key</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRetryToken((n) => n + 1)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ borderColor: 'var(--border)', color: 'var(--on-surface)' }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>重试</span>
                  </button>
                )}
              </div>
            </div>
          ) : translation ? (
            isWordMode ? (
              <div className="lumina-ai-prose text-[13.5px] leading-[1.68]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{translation}</ReactMarkdown>
                {isStreaming && (
                  <span
                    className="ml-1 inline-block h-3.5 w-[2px] animate-pulse align-middle"
                    style={{ backgroundColor: 'var(--primary)' }}
                  />
                )}
              </div>
            ) : (
              <div
                className="whitespace-pre-wrap text-[14.5px] leading-[1.72]"
                style={{ color: 'var(--on-surface)' }}
              >
                {translation}
                {isStreaming && (
                  <span
                    className="ml-1 inline-block h-3.5 w-[2px] animate-pulse align-middle"
                    style={{ backgroundColor: 'var(--primary)' }}
                  />
                )}
              </div>
            )
          ) : (
            <div className="space-y-2 py-1">
              <div className="h-3.5 w-11/12 animate-pulse rounded" style={{ backgroundColor: 'var(--surface-subtle)' }} />
              <div className="h-3.5 w-4/5 animate-pulse rounded" style={{ backgroundColor: 'var(--surface-subtle)' }} />
            </div>
          )}
        </div>

        {/* 底部三个快捷图标操作 */}
        <div
          className="flex items-center justify-between border-t px-3 py-2"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-subtle)' }}
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!translation.trim()}
              title={isWordMode ? '复制释义' : '复制译文'}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
              style={{ color: copied ? 'var(--primary)' : 'var(--on-surface-muted)' }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!translation.trim() || saved}
              title="保存至笔记（原文+译文）"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-55 dark:hover:bg-white/10"
              style={{ color: saved ? 'var(--tertiary)' : 'var(--on-surface-muted)' }}
            >
              {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
              <span>{saved ? '已存笔记' : '存笔记'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleFollowUp}
            title="发送到右侧追问（长难句语法或深层含义拆解）"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--primary)' }}
          >
            <MessageSquareShare className="h-3.5 w-3.5" />
            <span>发送到右侧追问</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(card, document.body);
}
