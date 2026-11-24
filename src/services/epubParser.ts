import JSZip from 'jszip';
import DOMPurify from 'dompurify';
import type { TocItem } from '../types';

export interface EpubChapterSection {
  id: string;
  title: string;
  text: string;
}

export interface ParsedEpubResult {
  title: string;
  html: string;
  toc: TocItem[];
  plainText: string;
  chapterSections: EpubChapterSection[];
  blobUrls: string[];
}

function normalizePath(path: string): string {
  const clean = path.split('#')[0].split('?')[0].replace(/\\/g, '/').replace(/^\/+/, '');
  const parts: string[] = [];
  for (const seg of clean.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join('/');
}

export function resolveEpubPath(baseFilePath: string, href: string): {
  filePath: string;
  fragment?: string;
} {
  const hashIdx = href.indexOf('#');
  const rawRel = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const fragment = hashIdx >= 0 ? href.slice(hashIdx + 1) : undefined;

  let decodedRel = rawRel;
  try {
    decodedRel = decodeURIComponent(rawRel);
  } catch {
    decodedRel = rawRel;
  }

  if (!decodedRel) {
    return { filePath: normalizePath(baseFilePath), fragment };
  }

  if (decodedRel.startsWith('/')) {
    return { filePath: normalizePath(decodedRel), fragment };
  }

  const baseDir = baseFilePath.includes('/')
    ? baseFilePath.slice(0, baseFilePath.lastIndexOf('/'))
    : '';
  const combined = baseDir ? `${baseDir}/${decodedRel}` : decodedRel;
  return { filePath: normalizePath(combined), fragment };
}

function findZipEntry(zip: JSZip, targetPath: string): JSZip.JSZipObject | null {
  const normalized = normalizePath(targetPath);
  const direct = zip.file(normalized);
  if (direct) return direct;

  const lower = normalized.toLowerCase();
  for (const key of Object.keys(zip.files)) {
    const obj = zip.files[key];
    if (obj.dir) continue;
    if (normalizePath(key).toLowerCase() === lower) {
      return obj;
    }
  }
  return null;
}

function parseXmlDoc(xmlString: string): Document {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
  if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
    return parser.parseFromString(xmlString, 'text/html');
  }
  return xmlDoc;
}

function parseXhtmlDoc(xhtmlString: string): Document {
  const parser = new DOMParser();
  const xhtmlDoc = parser.parseFromString(xhtmlString, 'application/xhtml+xml');
  if (xhtmlDoc.getElementsByTagName('parsererror').length > 0) {
    return parser.parseFromString(xhtmlString, 'text/html');
  }
  return xhtmlDoc;
}

function inferMimeType(path: string, fallback = 'application/octet-stream'): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.avif')) return 'image/avif';
  return fallback;
}

function mapTocHref(
  baseFile: string,
  rawHref: string,
  anchorMap: Map<string, string>,
  chapterIdMap: Map<string, string>,
): string | undefined {
  if (!rawHref || /^(https?:|mailto:|tel:)/i.test(rawHref)) return undefined;
  const { filePath, fragment } = resolveEpubPath(baseFile, rawHref);
  if (fragment) {
    const exactAnchor = anchorMap.get(`${filePath}#${fragment}`);
    if (exactAnchor) return exactAnchor;
  }
  return chapterIdMap.get(filePath);
}

function parseEpub3Nav(
  navHtml: string,
  navPath: string,
  anchorMap: Map<string, string>,
  chapterIdMap: Map<string, string>,
): TocItem[] {
  const doc = parseXhtmlDoc(navHtml);
  const navs = Array.from(doc.getElementsByTagName('nav'));
  const tocNav =
    navs.find((n) => {
      const epubType = n.getAttribute('epub:type') ?? n.getAttribute('type') ?? '';
      return /\btoc\b/i.test(epubType);
    }) ?? navs[0];

  if (!tocNav) return [];

  const rootList = Array.from(tocNav.children).find(
    (el) => el.tagName.toLowerCase() === 'ol' || el.tagName.toLowerCase() === 'ul',
  );
  if (!rootList) return [];

  let counter = 0;

  const walkList = (listEl: Element, level: number): TocItem[] => {
    const items: TocItem[] = [];
    for (const child of Array.from(listEl.children)) {
      if (child.tagName.toLowerCase() !== 'li') continue;

      const anchor = Array.from(child.children).find((c) => c.tagName.toLowerCase() === 'a');
      const span = Array.from(child.children).find((c) => c.tagName.toLowerCase() === 'span');
      const label = (anchor?.textContent ?? span?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const href = anchor?.getAttribute('href') ?? '';
      const mappedId = href ? mapTocHref(navPath, href, anchorMap, chapterIdMap) : undefined;

      const nestedList = Array.from(child.children).find(
        (c) => c.tagName.toLowerCase() === 'ol' || c.tagName.toLowerCase() === 'ul',
      );
      const children = nestedList ? walkList(nestedList, Math.min(level + 1, 4)) : [];

      if (label && (mappedId || children.length > 0)) {
        counter += 1;
        items.push({
          id: mappedId ?? `epub-nav-group-${counter}`,
          title: label,
          level,
          children: children.length > 0 ? children : undefined,
        });
      } else if (children.length > 0) {
        items.push(...children);
      }
    }
    return items;
  };

  return walkList(rootList, 1);
}

function parseEpub2Ncx(
  ncxXml: string,
  ncxPath: string,
  anchorMap: Map<string, string>,
  chapterIdMap: Map<string, string>,
): TocItem[] {
  const doc = parseXmlDoc(ncxXml);
  const navMap = doc.getElementsByTagName('navMap')[0];
  if (!navMap) return [];

  let counter = 0;

  const walkNavPoints = (parent: Element, level: number): TocItem[] => {
    const items: TocItem[] = [];
    for (const child of Array.from(parent.children)) {
      if (child.localName !== 'navPoint' && child.tagName.toLowerCase() !== 'navpoint') continue;

      const labelEl = Array.from(child.children).find(
        (c) => c.localName === 'navLabel' || c.tagName.toLowerCase() === 'navlabel',
      );
      const textEl = labelEl?.getElementsByTagName('text')[0];
      const title = (textEl?.textContent ?? '').replace(/\s+/g, ' ').trim();

      const contentEl = Array.from(child.children).find(
        (c) => c.localName === 'content' || c.tagName.toLowerCase() === 'content',
      );
      const src = contentEl?.getAttribute('src') ?? '';
      const mappedId = src ? mapTocHref(ncxPath, src, anchorMap, chapterIdMap) : undefined;

      const subItems = walkNavPoints(child, Math.min(level + 1, 4));
      if (title && (mappedId || subItems.length > 0)) {
        counter += 1;
        items.push({
          id: mappedId ?? `epub-ncx-group-${counter}`,
          title,
          level,
          children: subItems.length > 0 ? subItems : undefined,
        });
      }
    }
    return items;
  };

  return walkNavPoints(navMap, 1);
}

/**
 * 纯前端流式解析 .epub 电子书（非 iframe），提取章节 HTML、Blob 图片 URL、TOC 与纯文本。
 */
export async function parseEpubArrayBuffer(buffer: ArrayBuffer): Promise<ParsedEpubResult> {
  const zip = await JSZip.loadAsync(buffer.slice(0));

  // 1. 解析 META-INF/container.xml 定位 OPF 文件
  let opfPath = '';
  const containerEntry = findZipEntry(zip, 'META-INF/container.xml');
  if (containerEntry) {
    const containerXml = await containerEntry.async('text');
    const containerDoc = parseXmlDoc(containerXml);
    const rootfiles = containerDoc.getElementsByTagName('rootfile');
    if (rootfiles.length > 0) {
      opfPath = normalizePath(rootfiles[0].getAttribute('full-path') ?? '');
    }
  }

  if (!opfPath) {
    const fallbackOpf = Object.keys(zip.files).find(
      (name) => !zip.files[name].dir && name.toLowerCase().endsWith('.opf'),
    );
    if (!fallbackOpf) {
      throw new Error('无效的 EPUB 文件：未找到 OPF 清单文件。');
    }
    opfPath = normalizePath(fallbackOpf);
  }

  const opfEntry = findZipEntry(zip, opfPath);
  if (!opfEntry) {
    throw new Error(`无法读取 EPUB 清单文件：${opfPath}`);
  }

  const opfXml = await opfEntry.async('text');
  const opfDoc = parseXmlDoc(opfXml);

  // 2. 读取书名元信息
  const titleEl =
    opfDoc.getElementsByTagNameNS('*', 'title')[0] ??
    opfDoc.getElementsByTagName('dc:title')[0] ??
    opfDoc.getElementsByTagName('title')[0];
  const bookTitle = (titleEl?.textContent ?? '').replace(/\s+/g, ' ').trim();

  // 3. 解析 manifest 与 spine
  interface ManifestItem {
    id: string;
    path: string;
    mediaType: string;
    properties: string;
  }

  const manifestById = new Map<string, ManifestItem>();
  const manifestByPath = new Map<string, ManifestItem>();
  let navItem: ManifestItem | undefined;
  let ncxItem: ManifestItem | undefined;

  const itemEls = opfDoc.getElementsByTagName('item');
  for (const el of Array.from(itemEls)) {
    const id = el.getAttribute('id') ?? '';
    const href = el.getAttribute('href') ?? '';
    const mediaType = el.getAttribute('media-type') ?? '';
    const properties = el.getAttribute('properties') ?? '';
    if (!id || !href) continue;

    const { filePath } = resolveEpubPath(opfPath, href);
    const entry: ManifestItem = { id, path: filePath, mediaType, properties };
    manifestById.set(id, entry);
    manifestByPath.set(filePath, entry);

    if (/\bnav\b/i.test(properties)) {
      navItem = entry;
    }
    if (mediaType === 'application/x-dtbncx+xml' || filePath.toLowerCase().endsWith('.ncx')) {
      ncxItem = entry;
    }
  }

  const spineEl = opfDoc.getElementsByTagName('spine')[0];
  const spineTocId = spineEl?.getAttribute('toc') ?? '';
  if (spineTocId && manifestById.has(spineTocId)) {
    ncxItem = manifestById.get(spineTocId);
  }

  const spinePaths: string[] = [];
  const itemrefEls = opfDoc.getElementsByTagName('itemref');
  for (const ref of Array.from(itemrefEls)) {
    const idref = ref.getAttribute('idref') ?? '';
    const m = manifestById.get(idref);
    if (m && !spinePaths.includes(m.path)) {
      spinePaths.push(m.path);
    }
  }

  if (spinePaths.length === 0) {
    throw new Error('EPUB 书脊（spine）为空，未发现可阅读章节。');
  }

  // 4. 逐章解析 XHTML、图片转 Blob URL、重写 ID
  const imageBlobCache = new Map<string, string>();
  const blobUrls: string[] = [];
  const anchorMap = new Map<string, string>();
  const chapterIdMap = new Map<string, string>();
  const chapterHtmlParts: string[] = [];
  const chapterSections: EpubChapterSection[] = [];

  const getOrCreateBlobUrl = async (assetPath: string): Promise<string | null> => {
    const normalized = normalizePath(assetPath);
    const cached = imageBlobCache.get(normalized);
    if (cached) return cached;

    const entry = findZipEntry(zip, normalized);
    if (!entry) return null;

    const manifestMeta = manifestByPath.get(normalized);
    const mime = manifestMeta?.mediaType || inferMimeType(normalized);
    const ab = await entry.async('arraybuffer');
    const blob = new Blob([ab], { type: mime });
    const url = URL.createObjectURL(blob);
    imageBlobCache.set(normalized, url);
    blobUrls.push(url);
    return url;
  };

  for (let idx = 0; idx < spinePaths.length; idx += 1) {
    const chapterPath = spinePaths[idx];
    const chapterEntry = findZipEntry(zip, chapterPath);
    if (!chapterEntry) continue;

    const chapterId = `epub-ch-${idx}`;
    chapterIdMap.set(chapterPath, chapterId);

    const rawXhtml = await chapterEntry.async('text');
    const doc = parseXhtmlDoc(rawXhtml);
    const body = doc.body ?? doc.documentElement;
    if (!body) continue;

    // 剥离自带脚本与外联样式，统一交由 .lumina-prose 排版
    body.querySelectorAll('script, style, link').forEach((el) => el.remove());

    // 重写章节内部锚点 ID，防止跨章合并 DOM 产生 ID 冲突
    body.querySelectorAll('[id]').forEach((el) => {
      const origId = el.getAttribute('id');
      if (!origId) return;
      const scopedId = `${chapterId}--${origId}`;
      anchorMap.set(`${chapterPath}#${origId}`, scopedId);
      el.setAttribute('id', scopedId);
    });

    // 转换相对图片资源为 Blob URL
    const imgEls = Array.from(body.querySelectorAll('img'));
    for (const img of imgEls) {
      const src = img.getAttribute('src');
      if (!src || /^(https?:|data:|blob:)/i.test(src)) continue;
      const { filePath } = resolveEpubPath(chapterPath, src);
      const blobUrl = await getOrCreateBlobUrl(filePath);
      if (blobUrl) {
        img.setAttribute('src', blobUrl);
      }
    }

    const svgImageEls = Array.from(body.querySelectorAll('image'));
    for (const svgImg of svgImageEls) {
      const href = svgImg.getAttribute('href') ?? svgImg.getAttribute('xlink:href');
      if (!href || /^(https?:|data:|blob:)/i.test(href)) continue;
      const { filePath } = resolveEpubPath(chapterPath, href);
      const blobUrl = await getOrCreateBlobUrl(filePath);
      if (blobUrl) {
        svgImg.setAttribute('href', blobUrl);
        svgImg.removeAttribute('xlink:href');
      }
    }

    const firstHeading = body.querySelector('h1, h2, h3, h4');
    const docTitleTag = doc.getElementsByTagName('title')[0];
    const chapterTitle =
      (firstHeading?.textContent ?? docTitleTag?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim() || `第 ${idx + 1} 章`;

    const chapterText = (body.textContent ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (chapterText) {
      chapterSections.push({
        id: chapterId,
        title: chapterTitle,
        text: chapterText,
      });
    }

    const serializer = new XMLSerializer();
    let innerHtml = '';
    if (body.tagName.toLowerCase() === 'body') {
      innerHtml = Array.from(body.childNodes)
        .map((node) => {
          if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
          if (node.nodeType === Node.ELEMENT_NODE) return serializer.serializeToString(node);
          return '';
        })
        .join('');
    } else {
      innerHtml = serializer.serializeToString(body);
    }

    if (innerHtml.trim()) {
      chapterHtmlParts.push(
        `<section id="${chapterId}" class="lumina-epub-chapter">${innerHtml}</section>`,
      );
    }
  }

  // 5. 优先解析 EPUB3 nav.xhtml，兼容回退 EPUB2 toc.ncx，再回退章节标题
  let toc: TocItem[] = [];
  if (navItem) {
    const navEntry = findZipEntry(zip, navItem.path);
    if (navEntry) {
      const navHtml = await navEntry.async('text');
      toc = parseEpub3Nav(navHtml, navItem.path, anchorMap, chapterIdMap);
    }
  }
  if (toc.length === 0 && ncxItem) {
    const ncxEntry = findZipEntry(zip, ncxItem.path);
    if (ncxEntry) {
      const ncxXml = await ncxEntry.async('text');
      toc = parseEpub2Ncx(ncxXml, ncxItem.path, anchorMap, chapterIdMap);
    }
  }
  if (toc.length === 0) {
    toc = chapterSections.map((ch) => ({
      id: ch.id,
      title: ch.title,
      level: 1,
    }));
  }

  // 6. DOMPurify 安全净化，放行 blob: 图片并剥离内联 style 以完全遵循阅读主题
  const cleanHtml = DOMPurify.sanitize(chapterHtmlParts.join('\n'), {
    ADD_ATTR: ['id', 'target', 'rel'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|blob|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });

  const plainText = chapterSections.map((s) => `${s.title}\n\n${s.text}`).join('\n\n');

  return {
    title: bookTitle,
    html: cleanHtml,
    toc,
    plainText,
    chapterSections,
    blobUrls,
  };
}
