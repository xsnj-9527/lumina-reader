import type { AiProvider } from '../types';

export const FOLLOW_CHAT_PROFILE_ID = 'follow-chat';

export interface AiVendorPreset {
  id: string;
  label: string;
  defaultName: string;
  provider: AiProvider;
  baseUrl: string;
  baseUrlPlaceholder: string;
  model: string;
  suggestedModels: string[];
  defaultDisableThinking: boolean;
  apiKeyPlaceholder: string;
  description: string;
}

export const AI_VENDOR_PRESETS: AiVendorPreset[] = [
  {
    id: 'mimo',
    label: '小米 MiMo',
    defaultName: 'MiMo 日常',
    provider: 'openai',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    baseUrlPlaceholder: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2-flash',
    suggestedModels: ['mimo-v2-flash', 'mimo-v2-pro'],
    defaultDisableThinking: true,
    apiKeyPlaceholder: 'sk-...',
    description: '默认关闭思考模式以加速首字响应',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultName: 'Gemini',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    defaultDisableThinking: false,
    apiKeyPlaceholder: 'AIza...',
    description: 'Google 官方原生接口，适合长文理解',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultName: 'DeepSeek',
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    baseUrlPlaceholder: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    defaultDisableThinking: false,
    apiKeyPlaceholder: 'sk-...',
    description: '中文理解与逻辑拆解性价比高',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultName: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    defaultDisableThinking: false,
    apiKeyPlaceholder: 'sk-...',
    description: 'OpenAI 官方接口与兼容标准参考',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultName: 'OpenRouter',
    provider: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    suggestedModels: [
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-flash',
    ],
    defaultDisableThinking: false,
    apiKeyPlaceholder: 'sk-or-...',
    description: '单密钥路由多家主流商业与开源模型',
  },
  {
    id: 'custom',
    label: '自定义',
    defaultName: '自定义模型',
    provider: 'openai',
    baseUrl: '',
    baseUrlPlaceholder: 'https://... 或 http://localhost:11434/v1',
    model: '',
    suggestedModels: ['qwen2.5:7b', 'llama3.2'],
    defaultDisableThinking: false,
    apiKeyPlaceholder: 'sk-...（本地端口可留空）',
    description: '适配任意中转服务或 Ollama / vLLM 等本地模型',
  },
];
