import { useState } from 'react';
import {
  ArrowLeft,
  PanelLeft,
  PanelRight,
  Settings,
  Sparkles,
} from 'lucide-react';
import type { DocFormat } from '../../types';

interface TopBarProps {
  title: string;
  format: DocFormat;
  progress: number;
  currentPage?: number;
  totalPages?: number;
  leftOpen: boolean;
  rightOpen: boolean;
  isScrolled: boolean;
  hasAiKey: boolean;
  onBackHome: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onOpenSettings: () => void;
}

export function TopBar({
  title,
  format,
  progress,
  currentPage,
  totalPages,
  leftOpen,
  rightOpen,
  isScrolled,
  hasAiKey,
  onBackHome,
  onToggleLeft,
  onToggleRight,
  onOpenSettings,
}: TopBarProps) {
  const [isHovered, setIsHovered] = useState(false);

  const shouldFade = isScrolled && !isHovered;
  const progressText =
    format === 'pdf' && totalPages && totalPages > 0
      ? `${currentPage ?? 1} / ${totalPages} 页`
      : `${Math.round(progress)}%`;

  return (
    <header
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex justify-center px-3 pt-2.5 transition-opacity duration-300"
      style={{ opacity: shouldFade ? 0.14 : 1 }}
    >
      <div
        className="pointer-events-auto flex h-11 w-full max-w-[1440px] items-center justify-between gap-3 rounded-2xl border px-3 backdrop-blur-xl transition-all duration-200"
        style={{
          backgroundColor: 'var(--surface-glass)',
          borderColor: 'var(--border)',
          boxShadow: isScrolled ? 'var(--shadow-floating)' : 'none',
        }}
      >
        {/* 左侧操作区：返回、左栏开关、标题与进度 */}
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onBackHome}
            title="返回首页"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--on-surface-muted)' }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleLeft}
            title={leftOpen ? '收起目录与笔记栏' : '展开目录与笔记栏'}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{
              backgroundColor: leftOpen ? 'var(--primary-soft)' : 'transparent',
              color: leftOpen ? 'var(--primary)' : 'var(--on-surface-muted)',
            }}
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-px shrink-0" style={{ backgroundColor: 'var(--border)' }} />

          <h1
            className="truncate text-sm font-medium tracking-tight"
            style={{ color: 'var(--on-surface)' }}
            title={title}
          >
            {title}
          </h1>

          <span
            className="ml-1.5 hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-block"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              color: 'var(--on-surface-muted)',
            }}
          >
            {progressText}
          </span>
        </div>

        {/* 右侧控制区：统一设置入口与 AI 伴读开关 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSettings}
            title="设置"
            aria-label="设置"
            className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--on-surface-muted)' }}
          >
            <Settings className="h-4 w-4" />
            {!hasAiKey && (
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: 'var(--tertiary)' }}
              />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleRight}
            title={rightOpen ? '收起 AI 伴读栏' : '展开 AI 伴读栏'}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{
              backgroundColor: rightOpen ? 'var(--primary-soft)' : 'transparent',
              color: rightOpen ? 'var(--primary)' : 'var(--on-surface-muted)',
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden md:inline">伴读</span>
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
