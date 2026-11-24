import type { ChatMessage, SelectionTranslateMode, TocItem } from '../types';

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeneratedFlashcardDraft {
  question: string;
  answer: string;
}

const EN_WORD_TOKEN_REGEX = /^[A-Za-z][A-Za-z0-9'\-/]*[A-Za-z0-9]$|^[A-Za-z]$/;

/**
 * 识别划选文本属于「单词/短术语」还是「完整句子/段落」。
 * 规则：1–3 个纯英文词/术语、无换行与句末标点、总长 <= 36 字符 -> 'word'；其余 -> 'sentence'。
 */
export function detectSelectionMode(selectedText: string): SelectionTranslateMode {
  if (!selectedText || selectedText.includes('\n')) return 'sentence';

  const normalized = selectedText.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 36) return 'sentence';

  if (/[.?!。？！；;:,，]/.test(normalized)) {
    return 'sentence';
  }

  const words = normalized.split(' ').filter(Boolean);
  if (words.length < 1 || words.length > 3) {
    return 'sentence';
  }

  const allValidEnglishTerms = words.every((w) => EN_WORD_TOKEN_REGEX.test(w));
  return allValidEnglishTerms ? 'word' : 'sentence';
}

export function buildTranslatePrompt(selectedText: string, context: string): {
  mode: SelectionTranslateMode;
  systemPrompt: string;
  messages: PromptMessage[];
} {
  const mode = detectSelectionMode(selectedText);
  const hasSeparateContext =
    Boolean(context) && context.trim().length > selectedText.trim().length + 12;

  if (mode === 'word') {
    const userContent = hasSeparateContext
      ? `【所在上下文语境】\n${context.trim()}\n\n【需要解析的单词/短术语】\n${selectedText.trim()}`
      : `【需要解析的单词/短术语】\n${selectedText.trim()}`;

    return {
      mode,
      systemPrompt: [
        '你是一位精通英汉双语与学术语境的精简词典助手，正在为专注阅读应用提供原位单词/术语释义。',
        '请严格按以下 3 行紧凑 Markdown 格式流式输出（绝不添加开场白、结束语或多余说明）：',
        '/音标/ · 词性（若为多词短术语无法标单个音标，可标注 `[术语短语]` 或给出核心词音标）',
        '**语境释义：** 结合上方上下文最精准贴切的简体中文含义',
        '**语境点拨：** 一句简明的用法搭配、语义 nuance 或在此句中的深层指向',
      ].join('\n'),
      messages: [{ role: 'user', content: userContent }],
    };
  }

  const userContent = hasSeparateContext
    ? `【上下文语境参考】\n${context.trim()}\n\n【需要翻译的选中文本】\n${selectedText.trim()}`
    : `【需要翻译的文本】\n${selectedText.trim()}`;

  return {
    mode,
    systemPrompt: [
      '你是一位精通英汉双语与学术文学翻译的顶级译者，正在为专注阅读应用提供原位划词翻译。',
      '请结合提供的上下文语境，准确理解专业术语、指代关系与语气风格，将【需要翻译的选中文本】翻译为自然、优雅、地道的简体中文。',
      '如果选中文本本身已经是中文，请结合语境用更凝练通顺的现代简体中文进行转述或精准释义。',
      '严格要求：只输出中文译文本身！禁止添加任何开场白、结束语、引号、“译文：”前缀、原文重复或多余解释。',
    ].join('\n'),
    messages: [{ role: 'user', content: userContent }],
  };
}

export function buildExplainPrompt(selectedText: string, context: string): {
  userDisplayLabel: string;
  userPrompt: string;
} {
  return {
    userDisplayLabel: '通俗解释',
    userPrompt: [
      '请结合下方语境，用通俗易懂的简体中文解释这段选中内容的核心意思。',
      '要求：拆解隐含逻辑或关键概念，如有必要可举一个简洁恰当的类比，排版保持清爽简洁。',
      '',
      context ? `上下文参考：\n${context.trim()}\n` : '',
      `选中片段：\n${selectedText.trim()}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function buildSummarizePrompt(selectedText: string, context: string): {
  userDisplayLabel: string;
  userPrompt: string;
} {
  return {
    userDisplayLabel: '要点总结',
    userPrompt: [
      '请结合语境对下面选中的内容进行精炼总结。',
      '要求：先用一句话概括核心主旨，再列出 2~4 条关键要点，避免冗余重复。',
      '',
      context ? `上下文参考：\n${context.trim()}\n` : '',
      `选中片段：\n${selectedText.trim()}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function buildFlashcardPrompt(selectedText: string, context: string): {
  systemPrompt: string;
  messages: PromptMessage[];
} {
  return {
    systemPrompt: [
      '你是一位擅长认知科学与主动回忆（Active Recall）学习法的笔记专家。',
      '请根据用户划选的文本及上下文，提炼 1 到 2 张高质量的问答闪卡（优先 1 张最核心的问题，若信息密度极高可生成 2 张）。',
      '问题应当聚焦概念理解、因果逻辑或核心洞见，答案简明准确（使用简体中文，关键专业英文术语可括注保留）。',
      '只输出纯 JSON 数组，格式为：[{"question":"...","answer":"..."}]，不要输出 Markdown 代码块标记或任何多余说明文字。',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          context ? `上下文：\n${context.trim()}\n` : '',
          `选中内容：\n${selectedText.trim()}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  };
}

/**
 * 将树状 TOC 序列化为紧凑的文本骨架，供 System Prompt 与导读采样使用。
 */
export function formatTocOutline(toc: TocItem[], maxChars = 1200): string {
  if (!toc || toc.length === 0) return '';
  const lines: string[] = [];

  const walk = (items: TocItem[], depth: number) => {
    for (const item of items) {
      const indent = '  '.repeat(depth);
      const pageTag = item.pageNumber ? ` (P.${item.pageNumber})` : '';
      lines.push(`${indent}- ${item.title}${pageTag}`);
      if (item.children && item.children.length > 0) {
        walk(item.children, Math.min(depth + 1, 3));
      }
    }
  };

  walk(toc, 0);
  const full = lines.join('\n');
  return full.length > maxChars ? `${full.slice(0, maxChars)}\n...` : full;
}

export function buildChatSystemPrompt(options: {
  docTitle: string;
  tocText?: string;
  guideSummary?: string;
}): string {
  const sections: string[] = [
    `你是 Lumina Reader 的 AI 伴读助手，正在陪伴用户深度阅读《${options.docTitle}》。`,
    '你的风格克制、清晰、富有洞察力，始终使用简体中文回答（专业术语或原文引用可保留英文）。',
    '善用 Markdown 排版（如简短小标题、要点列表、加粗关键概念），在长难句拆解时优先给出句法主干与逻辑层次。',
    '回答请结合提供的文档骨架与参考片段，若检索片段未提及相关细节，请如实说明不要编造原文内容。',
  ];

  if (options.tocText?.trim()) {
    sections.push(`\n【文档结构目录】\n${options.tocText.trim().slice(0, 1200)}`);
  }

  if (options.guideSummary?.trim()) {
    sections.push(`\n【已生成全文导读摘要】\n${options.guideSummary.trim().slice(0, 1500)}`);
  }

  return sections.join('\n');
}

export function buildDocGuidePrompt(docTitle: string, sampledText: string): {
  systemPrompt: string;
  messages: PromptMessage[];
} {
  return {
    systemPrompt: [
      `你是 Lumina Reader 的深度伴读编辑，正在为《${docTitle}》撰写一份精炼的「全文结构导读」。`,
      '请根据提供的文档目录与采样内容，输出结构清晰、信息密度高的简体中文导读（约 450–700 字），严格使用以下 Markdown 结构：',
      '1. **核心主旨**（2–3 句话点明全文核心论点与价值）',
      '2. **结构脉络**（用 3–5 条精炼要点串联起各部分逻辑演进）',
      '3. **关键概念与深读建议**（列出 2–4 个核心术语/看点及建议聚焦的阅读方法）',
      '严禁多余寒暄，直接输出导读正文。',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: `请基于以下文档素材生成全文结构导读：\n\n${sampledText}`,
      },
    ],
  };
}

/**
 * 显示层与发送层解耦：无论界面展示了多少条历史，
 * 发送 API 时严格裁剪为最近 maxRounds 轮（最多 maxRounds * 2 条消息），防止长对话上下文腐化与 Token 爆炸。
 */
export function buildSlidingWindowHistory(
  messages: ChatMessage[],
  maxRounds = 5,
): PromptMessage[] {
  const maxMessages = Math.max(2, maxRounds * 2);
  const valid = messages.filter(
    (m) => !m.isError && !m.isStreaming && m.content.trim().length > 0,
  );
  const sliced = valid.slice(-maxMessages);

  return sliced.map((m) => {
    if (m.role === 'user' && m.quoteContext?.quote) {
      const compactQuote = m.quoteContext.quote.slice(0, 420);
      const transPart = m.quoteContext.translation
        ? `\n参考译文：${m.quoteContext.translation.slice(0, 260)}`
        : '';
      return {
        role: 'user',
        content: `引用原文：${compactQuote}${transPart}\n问题：${m.content}`,
      };
    }
    return {
      role: m.role,
      content: m.content,
    };
  });
}

/**
 * 容错解析 AI 返回的闪卡 JSON，兼容包裹了 ```json 代码块或前后杂音的情况。
 */
export function parseFlashcardsJson(raw: string): GeneratedFlashcardDraft[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  const jsonSlice =
    firstBracket !== -1 && lastBracket > firstBracket
      ? cleaned.slice(firstBracket, lastBracket + 1)
      : cleaned;

  const parsed = JSON.parse(jsonSlice) as unknown;
  const list = Array.isArray(parsed) ? parsed : [parsed];

  const valid = list
    .filter((item): item is { question: string; answer: string } => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      return (
        typeof record.question === 'string' &&
        record.question.trim().length > 0 &&
        typeof record.answer === 'string' &&
        record.answer.trim().length > 0
      );
    })
    .map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    }));

  if (valid.length === 0) {
    throw new Error('模型未能生成有效格式的闪卡内容，请重试。');
  }

  return valid.slice(0, 3);
}
