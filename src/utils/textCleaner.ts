const CJK_OR_PUNCT_CLASS =
  '\\u4E00-\\u9FFF\\u3400-\\u4DBF\\uF900-\\uFAFF\\u3000-\\u303F\\uFF00-\\uFFEF';

const PARA_PLACEHOLDER = '\uE000LUMINA_PARA\uE000';

/**
 * 清洗从 PDF 文本层或流式排版中划词选中的文本：
 * - 去除软连字符与零宽字符
 * - 自动还原英文跨行连字符断词（如 "compre-\nhension" -> "comprehension"）
 * - 去除中文视觉硬换行及汉字间意外空格
 * - 保留真实的双换行段落结构
 */
export function cleanSelectedText(raw: string, isPdf = false): string {
  if (!raw) return '';

  let text = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 移除软连字符与零宽不可见字符
    .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, '');

  // 合并英文小写接续的跨行连字符断词
  text = text.replace(/([A-Za-z])-[ \t]*\n[ \t]*([a-z])/g, '$1$2');

  // 大写开头的跨行连字符（多为复合专有名词），保留连字符但去除换行空白
  text = text.replace(/([A-Za-z])-[ \t]*\n[ \t]*([A-Z0-9])/g, '$1-$2');

  // 保护真实的空行段落分隔
  text = text.replace(/\n[ \t]*\n+/g, PARA_PLACEHOLDER);

  // 中文字符或中文标点之间的视觉换行直接无缝拼接
  const cjkLineBreakRegex = new RegExp(
    `(?<=[${CJK_OR_PUNCT_CLASS}])[ \\t]*\\n[ \\t]*(?=[${CJK_OR_PUNCT_CLASS}])`,
    'g',
  );
  text = text.replace(cjkLineBreakRegex, '');

  // 一侧为中文标点的换行同样无缝拼接
  const cjkPunctBefore = /(?<=[\u3001-\u303F\uFF01-\uFF5E])[ \t]*\n[ \t]*/g;
  const cjkPunctAfter = /[ \t]*\n[ \t]*(?=[\u3001-\u303F\uFF01-\uFF5E])/g;
  text = text.replace(cjkPunctBefore, '').replace(cjkPunctAfter, '');

  // 剩余单换行统一转为空格
  text = text.replace(/[ \t]*\n[ \t]*/g, ' ');

  // 还原真实段落换行
  text = text.replaceAll(PARA_PLACEHOLDER, '\n\n');

  // PDF 文本层常在连续汉字之间插入孤立单空格，还原紧凑中文
  if (isPdf) {
    const cjkInnerSpace =
      /(?<=[\u4E00-\u9FFF\u3400-\u4DBF\u3001-\u303F\uFF01-\uFF5E]) +(?=[\u4E00-\u9FFF\u3400-\u4DBF\u3001-\u303F\uFF01-\uFF5E])/g;
    text = text.replace(cjkInnerSpace, '');
  }

  // 规范化水平空格并清理每段首尾空白
  text = text
    .replace(/[ \t\u00A0]{2,}/g, ' ')
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');

  return text.trim();
}

const BLOCK_SELECTOR = 'p, li, blockquote, td, th, pre, h1, h2, h3, h4, h5, h6, article';

/**
 * 提取选中文本所在的完整上下文段落，以及用于 DOM 高亮消歧的前后锚点文本。
 */
export function extractContextParagraph(
  selection: Selection,
  readerRoot: HTMLElement | null,
  isPdf: boolean,
): { context: string; prefix: string; suffix: string } {
  if (selection.rangeCount === 0) {
    return { context: '', prefix: '', suffix: '' };
  }

  const range = selection.getRangeAt(0);
  const rawSelected = selection.toString();

  if (isPdf) {
    const startEl =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as HTMLElement)
        : range.startContainer.parentElement;
    const pageEl = startEl?.closest('[data-page-number]') as HTMLElement | null;
    const textLayer = (pageEl?.querySelector('.textLayer') as HTMLElement | null) ?? pageEl;

    if (textLayer) {
      try {
        const beforeRange = document.createRange();
        beforeRange.selectNodeContents(textLayer);
        beforeRange.setEnd(range.startContainer, range.startOffset);

        const afterRange = document.createRange();
        afterRange.selectNodeContents(textLayer);
        afterRange.setStart(range.endContainer, range.endOffset);

        const beforeText = beforeRange.toString();
        const afterText = afterRange.toString();

        const beforeSnippet = beforeText.slice(-360);
        const afterSnippet = afterText.slice(0, 360);
        const combined = cleanSelectedText(`${beforeSnippet}${rawSelected}${afterSnippet}`, true);

        return {
          context: combined.slice(0, 900),
          prefix: cleanSelectedText(beforeText.slice(-48), true).slice(-32),
          suffix: cleanSelectedText(afterText.slice(0, 48), true).slice(0, 32),
        };
      } catch {
        // 选区跨多页等异常情况回退到仅清洗文本
      }
    }

    return {
      context: cleanSelectedText(rawSelected, true),
      prefix: '',
      suffix: '',
    };
  }

  // DOCX / Markdown 流式视图上下文提取
  const commonEl =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as HTMLElement)
      : range.commonAncestorContainer.parentElement;

  const blockEl = commonEl?.closest(BLOCK_SELECTOR) as HTMLElement | null;
  const targetRoot =
    blockEl && readerRoot && readerRoot.contains(blockEl) ? blockEl : readerRoot ?? commonEl;

  if (!targetRoot) {
    return {
      context: cleanSelectedText(rawSelected, false),
      prefix: '',
      suffix: '',
    };
  }

  let beforeText = '';
  let afterText = '';
  try {
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(targetRoot);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    beforeText = beforeRange.toString();

    const afterRange = document.createRange();
    afterRange.selectNodeContents(targetRoot);
    afterRange.setStart(range.endContainer, range.endOffset);
    afterText = afterRange.toString();
  } catch {
    beforeText = '';
    afterText = '';
  }

  let context = cleanSelectedText(targetRoot.textContent ?? rawSelected, false);

  // 若单块内容偏短（例如短标题或短句子），适当拼接相邻块补充上下文
  if (context.length < 140 && blockEl) {
    const prevText = blockEl.previousElementSibling?.textContent
      ? cleanSelectedText(blockEl.previousElementSibling.textContent, false)
      : '';
    const nextText = blockEl.nextElementSibling?.textContent
      ? cleanSelectedText(blockEl.nextElementSibling.textContent, false)
      : '';
    context = [prevText.slice(-260), context, nextText.slice(0, 260)].filter(Boolean).join('\n\n');
  }

  return {
    context: context.slice(0, 950),
    prefix: beforeText.trim().slice(-32),
    suffix: afterText.trim().slice(0, 32),
  };
}
