import type { MouseEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';

/**
 * 安全检测当前是否运行在 Tauri 桌面端容器中（兼容纯 Web 与 Node 测试环境）。
 */
export function isTauriRuntime(): boolean {
  try {
    return typeof window !== 'undefined' && isTauri();
  } catch {
    return false;
  }
}

/**
 * 判断链接是否为需要由外部系统浏览器打开的 http/https 地址。
 */
export function isExternalHttpUrl(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

/**
 * 在桌面端调用 @tauri-apps/plugin-opener 使用系统默认浏览器打开外链；
 * 在纯 Web 浏览器中降级为新标签页打开。
 */
export async function openExternalUrl(url: string): Promise<void> {
  const target = url.trim();
  if (!isExternalHttpUrl(target)) return;

  if (isTauriRuntime()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(target);
      return;
    } catch (err) {
      console.error('[Lumina ExternalLink] 打开外部链接失败，回退至 window.open:', err);
    }
  }

  if (typeof window !== 'undefined') {
    window.open(target, '_blank', 'noopener,noreferrer');
  }
}

/**
 * 在富文本阅读区拦截 <a> 外部 http/https 链接点击，阻止桌面 WebView 主窗口跳转离开应用。
 * 返回 true 表示已处理该外链点击，调用方应直接 return。
 */
export function interceptExternalLinkClick(e: MouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement | null;
  const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return false;

  const rawHref = anchor.getAttribute('href') ?? '';
  if (!isExternalHttpUrl(rawHref)) {
    return false;
  }

  e.preventDefault();
  e.stopPropagation();
  void openExternalUrl(rawHref);
  return true;
}
