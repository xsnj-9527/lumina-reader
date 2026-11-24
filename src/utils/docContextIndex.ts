import type { PDFDocumentProxy } from 'pdfjs-dist';
import { cleanSelectedText } from './textCleaner';

export interface DocChunk {
  id: number;
  text: string;
  meta: string;
  pageNumber?: number;
  startOffset: number;
  endOffset: number;
  tokens: string[];
  tokenFreq: Map<string, number>;
}

export interface DocContextIndex {
  docId: string;
  chunks: DocChunk[];
  totalChars: number;
  docFreq: Map<string, number>;
  avgChunkLen: number;
}

export interface RetrieveContextOptions {
  query: string;
  progressRatio?: number;
  currentPage?: number;
  maxChars?: number;
}

export interface RetrievedContextResult {
  contextText: string;
  windowCount: number;
  matchedCount: number;
}

interface RawParagraph {
  text: string;
  meta: string;
  pageNumber?: number;
}

const EN_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
  'have', 'has', 'had', 'been', 'will', 'would', 'can', 'could', 'should',
  'into', 'about', 'than', 'then', 'also', 'not', 'but', 'you', 'your',
  'our', 'their', 'they', 'them', 'she', 'his', 'her', 'its', 'all', 'any',
  'more', 'most', 'some', 'such', 'what', 'when', 'where', 'which', 'who',
  'why', 'how', 'only', 'just', 'very', 'much', 'even', 'well', 'does',
]);

const ZH_SINGLE_STOP = new Set(
  '的了在是我有和就都不人一上也到说要会去你着看这那他她它把被让给于对与及或而等将把从向'.split(''),
);

function stemEnglishToken(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.length > 5 && word.endsWith('ing')) {
    return word.slice(0, -3);
  }
  if (word.length > 4 && word.endsWith('ed')) {
    return word.slice(0, -2);
  }
  if (word.length > 4 && word.endsWith('es')) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * 轻量双语分词：英文转小写+词干归并，中文生成双字 n-gram。
 */
export function tokenizeForSearch(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];

  const enMatches = text.toLowerCase().match(/[a-z0-9]+/g);
  if (enMatches) {
    for (const raw of enMatches) {
      if (raw.length < 2) continue;
      if (EN_STOP_WORDS.has(raw)) continue;
      tokens.push(stemEnglishToken(raw));
    }
  }

  const zhSequences = text.match(/[\u4E00-\u9FFF]+/g);
  if (zhSequences) {
    for (const seq of zhSequences) {
      if (seq.length === 1) {
        if (!ZH_SINGLE_STOP.has(seq)) tokens.push(seq);
        continue;
      }
      for (let i = 0; i < seq.length - 1; i += 1) {
        tokens.push(seq.slice(i, i + 2));
      }
      if (seq.length >= 2 && seq.length <= 4) {
        tokens.push(seq);
      }
    }
  }

  return tokens;
}

function splitOversizedText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const parts: string[] = [];
  const sentences = text.split(/(?<=[。！？.!?])\s+|\n+/);
  let buf = '';

  for (const seg of sentences) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxLen) {
      if (buf) {
        parts.push(buf);
        buf = '';
      }
      for (let i = 0; i < trimmed.length; i += maxLen) {
        parts.push(trimmed.slice(i, i + maxLen));
      }
      continue;
    }

    if (!buf) {
      buf = trimmed;
    } else if (buf.length + trimmed.length + 1 <= maxLen) {
      buf = `${buf} ${trimmed}`;
    } else {
      parts.push(buf);
      buf = trimmed;
    }
  }

  if (buf) parts.push(buf);
  return parts;
}

function buildIndexFromParagraphs(docId: string, paragraphs: RawParagraph[]): DocContextIndex {
  const TARGET_CHUNK = 500;
  const MAX_CHUNK = 660;

  const grouped: Array<{ text: string; meta: string; pageNumber?: number }> = [];
  let accText = '';
  let accMeta = '';
  let accPage: number | undefined;

  const flushAcc = () => {
    if (!accText.trim()) return;
    grouped.push({
      text: accText.trim(),
      meta: accMeta,
      pageNumber: accPage,
    });
    accText = '';
  };

  for (const para of paragraphs) {
    const clean = para.text.trim();
    if (!clean) continue;

    const pieces = splitOversizedText(clean, MAX_CHUNK);
    for (const piece of pieces) {
      const sameScope = accMeta === para.meta && accPage === para.pageNumber;
      if (accText && sameScope && accText.length + piece.length + 2 <= TARGET_CHUNK + 80) {
        accText = `${accText}\n\n${piece}`;
      } else {
        flushAcc();
        accText = piece;
        accMeta = para.meta;
        accPage = para.pageNumber;
        if (accText.length >= TARGET_CHUNK) {
          flushAcc();
        }
      }
    }
  }
  flushAcc();

  const chunks: DocChunk[] = [];
  const docFreq = new Map<string, number>();
  let offset = 0;
  let totalTokenLen = 0;

  grouped.forEach((g, idx) => {
    const tokens = tokenizeForSearch(g.text);
    const tokenFreq = new Map<string, number>();
    for (const tk of tokens) {
      tokenFreq.set(tk, (tokenFreq.get(tk) ?? 0) + 1);
    }
    tokenFreq.forEach((_cnt, tk) => {
      docFreq.set(tk, (docFreq.get(tk) ?? 0) + 1);
    });

    const startOffset = offset;
    const endOffset = offset + g.text.length;
    offset = endOffset + 2;
    totalTokenLen += tokens.length;

    chunks.push({
      id: idx,
      text: g.text,
      meta: g.meta,
      pageNumber: g.pageNumber,
      startOffset,
      endOffset,
      tokens,
      tokenFreq,
    });
  });

  const totalChars = chunks.length > 0 ? chunks[chunks.length - 1].endOffset : 0;
  const avgChunkLen = chunks.length > 0 ? totalTokenLen / chunks.length : 1;

  return {
    docId,
    chunks,
    totalChars,
    docFreq,
    avgChunkLen,
  };
}

export function buildMarkdownContextIndex(docId: string, markdown: string): DocContextIndex {
  const lines = markdown.split(/\r?\n/);
  const paragraphs: RawParagraph[] = [];

  let currentHeading = '正文开篇';
  let currentBlock: string[] = [];
  let inFence = false;
  let fenceChar = '';

  const flushBlock = () => {
    if (currentBlock.length === 0) return;
    const raw = currentBlock.join('\n').trim();
    currentBlock = [];
    if (!raw) return;
    const cleaned = raw
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    if (cleaned.trim()) {
      paragraphs.push({ text: cleaned.trim(), meta: currentHeading });
    }
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const ch = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = '';
      }
      currentBlock.push(line);
      continue;
    }

    if (!inFence) {
      const headingMatch = line.match(/^(#{1,4})\s+(.+?)\s*#*$/);
      if (headingMatch) {
        flushBlock();
        currentHeading = headingMatch[2]
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/[*_`~]/g, '')
          .trim() || currentHeading;
        paragraphs.push({ text: currentHeading, meta: currentHeading });
        continue;
      }
    }

    if (!inFence && line.trim() === '') {
      flushBlock();
    } else {
      currentBlock.push(line);
    }
  }
  flushBlock();

  return buildIndexFromParagraphs(docId, paragraphs);
}

export function buildDocxContextIndex(docId: string, html: string): DocContextIndex {
  const paragraphs: RawParagraph[] = [];

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let currentHeading = '正文开篇';
    const blocks = doc.body.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, pre, td');

    blocks.forEach((el) => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (/^H[1-4]$/.test(el.tagName)) {
        currentHeading = text;
        paragraphs.push({ text, meta: currentHeading });
      } else {
        // 跳过嵌套 li/blockquote 中的重复 p
        if (el.tagName === 'P' && el.closest('li, blockquote')) return;
        paragraphs.push({ text, meta: currentHeading });
      }
    });
  } else {
    const plain = html.replace(/<[^>]+>/g, '\n');
    plain
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text) => paragraphs.push({ text, meta: '正文' }));
  }

  return buildIndexFromParagraphs(docId, paragraphs);
}

export function buildStructuredTextContextIndex(
  docId: string,
  sections: Array<{ title: string; text: string }>,
): DocContextIndex {
  const paragraphs: RawParagraph[] = [];

  for (const section of sections) {
    const meta = section.title.trim() || '正文章节';
    const blocks = section.text
      .split(/\n{2,}/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    for (const block of blocks) {
      paragraphs.push({ text: block, meta });
    }
  }

  return buildIndexFromParagraphs(docId, paragraphs);
}

const pdfIndexCache = new Map<string, DocContextIndex>();
const pdfIndexPending = new Map<string, Promise<DocContextIndex>>();

export function clearPdfIndexCache(docId?: string): void {
  if (docId) {
    pdfIndexCache.delete(docId);
    pdfIndexPending.delete(docId);
  } else {
    pdfIndexCache.clear();
    pdfIndexPending.clear();
  }
}

export async function getOrBuildPdfContextIndex(
  docId: string,
  pdfDoc: PDFDocumentProxy,
): Promise<DocContextIndex> {
  const cached = pdfIndexCache.get(docId);
  if (cached) return cached;

  const pending = pdfIndexPending.get(docId);
  if (pending) return pending;

  const buildPromise = (async () => {
    const paragraphs: RawParagraph[] = [];
    const numPages = pdfDoc.numPages;

    for (let p = 1; p <= numPages; p += 1) {
      try {
        const page = await pdfDoc.getPage(p);
        const content = await page.getTextContent();
        let rawPageText = '';

        for (const item of content.items) {
          if ('str' in item && typeof item.str === 'string') {
            rawPageText += item.str;
            rawPageText += item.hasEOL ? '\n' : ' ';
          }
        }

        const cleaned = cleanSelectedText(rawPageText, true);
        if (cleaned) {
          const splitParas = cleaned.split(/\n{2,}/);
          for (const sp of splitParas) {
            if (sp.trim()) {
              paragraphs.push({
                text: sp.trim(),
                meta: `第 ${p} 页`,
                pageNumber: p,
              });
            }
          }
        }
      } catch {
        // 单页提取异常不影响其余页面索引
      }
    }

    const index = buildIndexFromParagraphs(docId, paragraphs);
    pdfIndexCache.set(docId, index);
    pdfIndexPending.delete(docId);
    return index;
  })().catch((err) => {
    pdfIndexPending.delete(docId);
    throw err;
  });

  pdfIndexPending.set(docId, buildPromise);
  return buildPromise;
}

function findAnchorChunkIndex(
  index: DocContextIndex,
  progressRatio?: number,
  currentPage?: number,
): number {
  const { chunks, totalChars } = index;
  if (chunks.length === 0) return -1;

  if (typeof currentPage === 'number' && currentPage > 0) {
    const exact = chunks.findIndex((c) => c.pageNumber === currentPage);
    if (exact !== -1) return exact;
  }

  const ratio = Math.min(1, Math.max(0, progressRatio ?? 0));
  const targetOffset = Math.floor(totalChars * ratio);

  for (let i = 0; i < chunks.length; i += 1) {
    if (chunks[i].endOffset >= targetOffset) {
      return i;
    }
  }
  return chunks.length - 1;
}

function scoreChunksBm25(
  index: DocContextIndex,
  query: string,
  excludeIds: Set<number>,
): Array<{ chunk: DocChunk; score: number }> {
  const queryTokens = tokenizeForSearch(query);
  const N = index.chunks.length;
  if (N === 0) return [];

  const k1 = 1.5;
  const b = 0.75;
  const avgdl = Math.max(1, index.avgChunkLen);
  const normalizedRawQuery = query.trim().toLowerCase();

  const scored: Array<{ chunk: DocChunk; score: number }> = [];

  for (const chunk of index.chunks) {
    if (excludeIds.has(chunk.id)) continue;

    let score = 0;
    const dl = Math.max(1, chunk.tokens.length);

    if (queryTokens.length > 0) {
      const seenQuery = new Set(queryTokens);
      for (const q of seenQuery) {
        const tf = chunk.tokenFreq.get(q) ?? 0;
        if (tf === 0) continue;
        const df = index.docFreq.get(q) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * (dl / avgdl));
        score += idf * (numerator / denominator);
      }
    }

    if (normalizedRawQuery.length >= 3 && chunk.text.toLowerCase().includes(normalizedRawQuery)) {
      score += 3.5;
    }

    if (score > 0) {
      scored.push({ chunk, score });
    }
  }

  scored.sort((aScore, bScore) => bScore.score - aScore.score);
  return scored;
}

/**
 * 拼装「当前阅读位置附近约 1,500 字视窗」+「全书 BM25 相关度 Top 3–4 段落」，
 * 去重并严格封顶在 maxChars（默认 5,000 字符）以内。
 */
export function retrieveContextForQuery(
  index: DocContextIndex,
  options: RetrieveContextOptions,
): RetrievedContextResult {
  const maxChars = options.maxChars ?? 5000;
  if (index.chunks.length === 0 || maxChars <= 0) {
    return { contextText: '', windowCount: 0, matchedCount: 0 };
  }

  const anchorIdx = findAnchorChunkIndex(index, options.progressRatio, options.currentPage);
  const windowChunks: DocChunk[] = [];
  const windowIds = new Set<number>();

  if (anchorIdx !== -1) {
    const windowTarget = Math.min(1650, Math.floor(maxChars * 0.42));
    let accChars = 0;
    let left = anchorIdx;
    let right = anchorIdx + 1;

    const addWindowChunk = (idx: number) => {
      const ch = index.chunks[idx];
      if (!ch || windowIds.has(ch.id)) return false;
      if (windowChunks.length > 0 && accChars + ch.text.length > windowTarget) return false;
      windowIds.add(ch.id);
      windowChunks.push(ch);
      accChars += ch.text.length;
      return true;
    };

    addWindowChunk(anchorIdx);
    left -= 1;

    while (accChars < windowTarget && (left >= 0 || right < index.chunks.length)) {
      let progressed = false;
      if (right < index.chunks.length) {
        if (addWindowChunk(right)) progressed = true;
        right += 1;
      }
      if (accChars < windowTarget && left >= 0) {
        if (addWindowChunk(left)) progressed = true;
        left -= 1;
      }
      if (!progressed) break;
    }

    windowChunks.sort((a, b) => a.id - b.id);
  }

  const topMatches = scoreChunksBm25(index, options.query, windowIds).slice(0, 4);

  const windowSectionHeader = '【当前阅读位置附近内容】\n';
  const matchSectionHeader = '【全书检索相关段落】\n';
  const formatEntry = (ch: DocChunk) => `[${ch.meta}] ${ch.text}`;

  let output = '';
  let usedWindowCount = 0;
  let usedMatchCount = 0;

  const appendLimited = (text: string): boolean => {
    if (output.length + text.length <= maxChars) {
      output += text;
      return true;
    }
    return false;
  };

  if (windowChunks.length > 0 && maxChars > windowSectionHeader.length + 20) {
    output += windowSectionHeader;
    for (const ch of windowChunks) {
      const entry = `${formatEntry(ch)}\n\n`;
      if (appendLimited(entry)) {
        usedWindowCount += 1;
      } else if (usedWindowCount === 0) {
        const remaining = maxChars - output.length;
        if (remaining > 20) {
          output += entry.slice(0, remaining);
          usedWindowCount += 1;
        }
        break;
      } else {
        break;
      }
    }
  }

  if (topMatches.length > 0 && output.length + matchSectionHeader.length + 30 < maxChars) {
    const prefix = output ? `\n${matchSectionHeader}` : matchSectionHeader;
    if (output.length + prefix.length < maxChars) {
      let addedHeader = false;
      for (const { chunk } of topMatches) {
        const entry = `${formatEntry(chunk)}\n\n`;
        if (!addedHeader) {
          if (output.length + prefix.length + 40 <= maxChars) {
            output += prefix;
            addedHeader = true;
          } else {
            break;
          }
        }
        if (appendLimited(entry)) {
          usedMatchCount += 1;
        } else {
          const remaining = maxChars - output.length;
          if (usedMatchCount === 0 && remaining > 40) {
            output += entry.slice(0, remaining);
            usedMatchCount += 1;
          }
          break;
        }
      }
    }
  }

  const trimmed = output.trim();
  return {
    contextText: trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed,
    windowCount: usedWindowCount,
    matchedCount: usedMatchCount,
  };
}

/**
 * 导读抽样器：
 * - 文档 <= 18,000 字时取全文
 * - 超长文档自动按「完整 TOC + 开头导言 + 均匀采样各段核心 + 结语」压缩至 <= 15,000 字
 */
export function sampleDocumentForGuide(index: DocContextIndex, tocText: string): string {
  const MAX_FULL_CHARS = 18000;
  const MAX_SAMPLED_CHARS = 15000;

  const cleanToc = tocText.trim();
  const fullBody = index.chunks.map((c) => `[${c.meta}]\n${c.text}`).join('\n\n');

  if (index.totalChars <= MAX_FULL_CHARS) {
    const combined = cleanToc ? `【文档目录】\n${cleanToc}\n\n【文档全文】\n${fullBody}` : fullBody;
    if (combined.length <= MAX_FULL_CHARS) {
      return combined;
    }
    return fullBody.slice(0, MAX_FULL_CHARS);
  }

  const parts: string[] = [];
  let usedChars = 0;

  const pushPart = (section: string) => {
    if (!section) return;
    if (usedChars + section.length + 2 <= MAX_SAMPLED_CHARS) {
      parts.push(section);
      usedChars += section.length + 2;
    } else {
      const remain = MAX_SAMPLED_CHARS - usedChars - 2;
      if (remain > 80) {
        parts.push(section.slice(0, remain));
        usedChars = MAX_SAMPLED_CHARS;
      }
    }
  };

  if (cleanToc) {
    const tocBlock = `【文档完整目录】\n${cleanToc.slice(0, 2200)}`;
    pushPart(tocBlock);
  }

  const chunks = index.chunks;
  const usedIds = new Set<number>();

  // 开头导言（约 3,000 字）
  const introPieces: string[] = [];
  let introChars = 0;
  for (let i = 0; i < chunks.length && introChars < 3000; i += 1) {
    const entry = `[${chunks[i].meta}] ${chunks[i].text}`;
    introPieces.push(entry);
    introChars += entry.length;
    usedIds.add(chunks[i].id);
  }
  if (introPieces.length > 0) {
    pushPart(`【开篇与导言】\n${introPieces.join('\n\n')}`);
  }

  // 结语收尾（预留约 2,000 字计算区间，稍后按严格顺序拼在末尾）
  const outroPieces: string[] = [];
  let outroChars = 0;
  for (let i = chunks.length - 1; i >= 0 && outroChars < 2000; i -= 1) {
    if (usedIds.has(chunks[i].id)) break;
    const entry = `[${chunks[i].meta}] ${chunks[i].text}`;
    outroPieces.unshift(entry);
    outroChars += entry.length;
    usedIds.add(chunks[i].id);
  }
  const outroBlock = outroPieces.length > 0 ? `【结语与收束】\n${outroPieces.join('\n\n')}` : '';

  // 中间部分均匀采样
  const middleChunks = chunks.filter((c) => !usedIds.has(c.id));
  const middleBudget = Math.max(0, MAX_SAMPLED_CHARS - usedChars - outroBlock.length - 80);

  if (middleChunks.length > 0 && middleBudget > 200) {
    const sampleCount = Math.min(middleChunks.length, Math.max(6, Math.floor(middleBudget / 420)));
    const step = middleChunks.length / sampleCount;
    const sampledPieces: string[] = [];
    let midChars = 0;

    for (let i = 0; i < sampleCount; i += 1) {
      const idx = Math.min(middleChunks.length - 1, Math.floor(i * step));
      const ch = middleChunks[idx];
      const snippet = ch.text.length > 420 ? `${ch.text.slice(0, 420)}…` : ch.text;
      const entry = `[${ch.meta}] ${snippet}`;
      if (midChars + entry.length + 2 > middleBudget) break;
      sampledPieces.push(entry);
      midChars += entry.length + 2;
    }

    if (sampledPieces.length > 0) {
      pushPart(`【核心章节均匀抽样】\n${sampledPieces.join('\n\n')}`);
    }
  }

  if (outroBlock) {
    pushPart(outroBlock);
  }

  const finalStr = parts.join('\n\n');
  return finalStr.length > MAX_SAMPLED_CHARS ? finalStr.slice(0, MAX_SAMPLED_CHARS) : finalStr;
}
