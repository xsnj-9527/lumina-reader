import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onGoHome?: () => void;
  title?: string;
  description?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * 极简全局/视图级错误边界，防止损坏文档解析或渲染异常导致桌面窗口白屏。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || '发生未知渲染异常',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Lumina ErrorBoundary]', error, info.componentStack);
  }

  private handleGoHome = () => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onGoHome) {
      this.props.onGoHome();
    } else {
      window.location.reload();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const title = this.props.title ?? '页面渲染遇到意外情况';
    const description =
      this.props.description ??
      '可能是文档结构损坏、格式不规范或临时内存异常导致。您的本地文档库、笔记与模型配置均安全保留。';

    return (
      <div
        className="flex min-h-screen w-full items-center justify-center px-6 py-12"
        style={{ backgroundColor: 'var(--surface)', color: 'var(--on-surface)' }}
      >
        <div
          className="w-full max-w-md rounded-2xl border p-7"
          style={{
            backgroundColor: 'var(--surface-elevated)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-floating)',
          }}
        >
          <div
            className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border"
            style={{
              backgroundColor: 'rgba(194, 65, 59, 0.08)',
              borderColor: 'rgba(194, 65, 59, 0.22)',
              color: 'var(--error)',
            }}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>

          <h1 className="text-base font-semibold tracking-tight" style={{ color: 'var(--on-surface)' }}>
            {title}
          </h1>

          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--on-surface-muted)' }}>
            {description}
          </p>

          {this.state.errorMessage && (
            <details
              className="mt-4 rounded-xl border px-3 py-2 text-[11px]"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--on-surface-muted)',
              }}
            >
              <summary className="cursor-pointer select-none font-medium">查看错误详情</summary>
              <p className="mt-1.5 break-all font-mono text-[10.5px] leading-relaxed">
                {this.state.errorMessage}
              </p>
            </details>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-white transition hover:brightness-110"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Home className="h-3.5 w-3.5" />
              <span>返回首页</span>
            </button>

            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface)',
                color: 'var(--on-surface)',
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>重新加载</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
