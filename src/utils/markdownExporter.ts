import type { FlashcardItem, NoteItem } from '../types';

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 生成结构干净、适合导入 Notion / Obsidian 的阅读笔记与闪卡 Markdown。
 */
export function generateNotesMarkdown(
  docTitle: string,
  notes: NoteItem[],
  flashcards: FlashcardItem[],
): string {
  const translations = notes.filter((n) => n.type === 'translation');
  const highlights = notes.filter((n) => n.type === 'highlight');

  const lines: string[] = [
    `# ${docTitle} — 阅读笔记`,
    '',
    `> 导出自 **Lumina Reader** · ${formatTimestamp(Date.now())}`,
    '',
  ];

  if (translations.length > 0) {
    lines.push('## 双语翻译笔记', '');
    translations.forEach((item, index) => {
      const pageLabel = item.anchor.pageNumber ? `第 ${item.anchor.pageNumber} 页` : '正文片段';
      lines.push(`### ${index + 1}. ${pageLabel}`);
      lines.push('');
      lines.push(`> ${item.quote.replace(/\n/g, '\n> ')}`);
      if (item.translation) {
        lines.push('');
        lines.push(`**译文：** ${item.translation}`);
      }
      if (item.annotation?.trim()) {
        lines.push('');
        lines.push(`**批注：** ${item.annotation.trim().replace(/\n+/g, '\n\n')}`);
      }
      lines.push('');
    });
  }

  if (highlights.length > 0) {
    lines.push('## 精选高亮', '');
    highlights.forEach((item) => {
      const pagePrefix = item.anchor.pageNumber ? `*[P.${item.anchor.pageNumber}]* ` : '';
      lines.push(`- ${pagePrefix}${item.quote.replace(/\n+/g, ' ')}`);
      if (item.annotation?.trim()) {
        lines.push(`  - **批注：** ${item.annotation.trim().replace(/\n+/g, ' / ')}`);
      }
    });
    lines.push('');
  }

  if (flashcards.length > 0) {
    lines.push('## 主动回忆闪卡', '');
    flashcards.forEach((card, index) => {
      lines.push(`### 卡片 ${index + 1}`);
      lines.push('');
      lines.push(`- **问（Q）：** ${card.question}`);
      lines.push(`- **答（A）：** ${card.answer}`);
      if (card.sourceQuote) {
        lines.push(`- **原文依据：** > ${card.sourceQuote.replace(/\n+/g, ' ')}`);
      }
      lines.push('');
    });
  }

  if (notes.length === 0 && flashcards.length === 0) {
    lines.push('*当前文档尚未收集高亮、翻译笔记或闪卡。*', '');
  }

  return lines.join('\n');
}

export function downloadMarkdownFile(filename: string, content: string): void {
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_').replace(/\.(pdf|docx|md)$/i, '');
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName || 'lumina-notes'}-笔记.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
