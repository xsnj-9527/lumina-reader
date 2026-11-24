import { createPortal } from 'react-dom';
import {
  FileText,
  Highlighter,
  Languages,
  Layers,
  Lightbulb,
} from 'lucide-react';
import type { FloatingPosition, HighlightColor } from '../../../types';

interface SelectionToolbarProps {
  position: FloatingPosition;
  onTranslate: () => void;
  onExplain: () => void;
  onSummarize: () => void;
  onHighlight: (color?: HighlightColor) => void;
  onGenerateFlashcard: () => void;
}

const HIGHLIGHT_SWATCHES: Array<{ id: HighlightColor; label: string; dotVar: string }> = [
  { id: 'amber', label: '暖琥珀高亮', dotVar: 'var(--highlight-amber-dot)' },
  { id: 'sage', label: '鼠尾草绿高亮', dotVar: 'var(--highlight-sage-dot)' },
  { id: 'sky', label: '雾霭蓝高亮', dotVar: 'var(--highlight-sky-dot)' },
];

export function SelectionToolbar({
  position,
  onTranslate,
  onExplain,
  onSummarize,
  onHighlight,
  onGenerateFlashcard,
}: SelectionToolbarProps) {
  const transform =
    position.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';

  const content = (
    <div
      data-floating-ui="true"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform,
        zIndex: 60,
      }}
    >
      <div
        className="lumina-animate-pop flex items-center gap-0.5 rounded-full border p-1 backdrop-blur-xl"
        style={{
          backgroundColor: 'var(--surface-glass)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-floating)',
        }}
      >
        {/* 默认第一项：译成中文（高辨识度主触发按钮） */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onTranslate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 active:scale-[0.97]"
          style={{ backgroundColor: 'var(--primary)' }}
        >
          <Languages className="h-3.5 w-3.5" />
          <span>译成中文</span>
        </button>

        <div className="mx-0.5 h-3.5 w-px" style={{ backgroundColor: 'var(--border)' }} />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onExplain}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.97]"
          style={{ color: 'var(--on-surface)' }}
        >
          <Lightbulb className="h-3.5 w-3.5" style={{ color: 'var(--on-surface-muted)' }} />
          <span>通俗解释</span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSummarize}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.97]"
          style={{ color: 'var(--on-surface)' }}
        >
          <FileText className="h-3.5 w-3.5" style={{ color: 'var(--on-surface-muted)' }} />
          <span>总结</span>
        </button>

        {/* 加入高亮：默认点击暖琥珀色，悬停平滑展开 3 枚迷你纸感色点 */}
        <div className="group flex items-center rounded-full transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onHighlight('amber')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.97]"
            style={{ color: 'var(--on-surface)' }}
          >
            <Highlighter className="h-3.5 w-3.5" style={{ color: 'var(--tertiary)' }} />
            <span>加入高亮</span>
          </button>

          <div className="flex max-w-0 items-center gap-1 overflow-hidden opacity-0 transition-all duration-200 group-hover:max-w-[74px] group-hover:pl-0.5 group-hover:pr-2 group-hover:opacity-100">
            {HIGHLIGHT_SWATCHES.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                title={swatch.label}
                aria-label={swatch.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  onHighlight(swatch.id);
                }}
                className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded-full border border-black/15 transition-transform hover:scale-115 dark:border-white/25"
                style={{ backgroundColor: swatch.dotVar }}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onGenerateFlashcard}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.97]"
          style={{ color: 'var(--on-surface)' }}
        >
          <Layers className="h-3.5 w-3.5" style={{ color: 'var(--on-surface-muted)' }} />
          <span>生成闪卡</span>
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
