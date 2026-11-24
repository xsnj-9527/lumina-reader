import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import type { DocFormat, TocItem } from '../types';

export function detectDocFormat(fileName: string): DocFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  if (lower.endsWith('.epub')) return 'epub';
  return null;
}

export function extractDocumentTitle(fileName: string): string {
  return fileName.replace(/\.(pdf|docx|markdown|md|epub)$/i, '').trim() || fileName;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 统计中英文混合字词数（中文/中日韩字符按字计数，连续英文/数字按词计数），
 * 并按约 300 字词/分钟估算阅读时长。
 */
export function computeReadingStats(text: string): {
  wordCount: number;
  estimatedMinutes: number;
} {
  if (!text || !text.trim()) {
    return { wordCount: 0, estimatedMinutes: 0 };
  }

  const cjkMatches = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g);
  const nonCjkText = text.replace(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, ' ');
  const enWordMatches = nonCjkText.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);

  const wordCount = (cjkMatches?.length ?? 0) + (enWordMatches?.length ?? 0);
  if (wordCount === 0) {
    return { wordCount: 0, estimatedMinutes: 0 };
  }

  const estimatedMinutes = Math.max(1, Math.round(wordCount / 300));
  return { wordCount, estimatedMinutes };
}

/**
 * 将扁平的标题列表折叠成层次清晰的树形 TOC。
 */
export function buildTocTree(flatItems: TocItem[]): TocItem[] {
  const roots: TocItem[] = [];
  const stack: TocItem[] = [];

  for (const item of flatItems) {
    const node: TocItem = { ...item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1];
      parent.children = parent.children ?? [];
      parent.children.push(node);
    }
    stack.push(node);
  }

  return roots;
}

export async function parseDocxArrayBuffer(
  buffer: ArrayBuffer,
): Promise<{ html: string; toc: TocItem[]; plainText: string }> {
  const result = await mammoth.convertToHtml({
    arrayBuffer: buffer.slice(0),
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(result.value, 'text/html');
  const flatToc: TocItem[] = [];

  const headings = doc.querySelectorAll('h1, h2, h3, h4');
  headings.forEach((el, index) => {
    const title = (el.textContent ?? '').trim();
    if (!title) return;
    const id = `docx-h-${index}`;
    el.setAttribute('id', id);
    const level = Number.parseInt(el.tagName.slice(1), 10) || 1;
    flatToc.push({ id, title, level });
  });

  const plainText = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  const cleanHtml = DOMPurify.sanitize(doc.body.innerHTML, {
    ADD_ATTR: ['id', 'target', 'rel'],
  });

  return {
    html: cleanHtml,
    toc: buildTocTree(flatToc),
    plainText,
  };
}

export function parseMarkdownArrayBuffer(
  buffer: ArrayBuffer,
): { content: string; toc: TocItem[] } {
  const content = new TextDecoder('utf-8').decode(buffer);
  const flatToc: TocItem[] = [];
  const lines = content.split(/\r?\n/);

  let inFence = false;
  let fenceChar = '';
  let headingIdx = 0;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        inFence = false;
        fenceChar = '';
      }
      continue;
    }

    if (inFence) continue;

    const headingMatch = line.match(/^(#{1,4})\s+(.+?)\s*#*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawTitle = headingMatch[2]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .trim();
      if (rawTitle) {
        flatToc.push({
          id: `md-h-${headingIdx}`,
          title: rawTitle,
          level,
        });
        headingIdx += 1;
      }
    }
  }

  return {
    content,
    toc: buildTocTree(flatToc),
  };
}
