import { parseOpenRouterStream } from '../sse/stream-helper';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'developer';
  content: string;
}

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';

export class OpenRouterService {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODEL;
    this.baseUrl = OPENROUTER_BASE_URL;
  }

  /**
   * Make a standard completion request (non-streaming)
   */
  async complete(
    messages: ChatMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'text' | 'json';
    } = {}
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://alpha-oracle.ai',
        'X-Title': 'The Alpha Oracle',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4000,
        ...(options.responseFormat === 'json' && {
          response_format: { type: 'json_object' },
        }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Make a streaming completion request
   */
  async *streamComplete(
    messages: ChatMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      onToken?: (token: string) => void;
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://alpha-oracle.ai',
        'X-Title': 'The Alpha Oracle',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader available');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                options.onToken?.(content);
                yield content;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Stream completion with callback (for server-side usage)
   */
  async streamWithCallback(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://alpha-oracle.ai',
        'X-Title': 'The Alpha Oracle',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    await parseOpenRouterStream(response, onChunk);
  }
}

/**
 * Factory function to create OpenRouter service with API key from request
 */
export function createOpenRouterService(apiKey: string, model?: string): OpenRouterService {
  return new OpenRouterService({
    apiKey,
    model: model || DEFAULT_MODEL,
  });
}

/**
 * Helper to validate OpenRouter API key format
 */
export function validateOpenRouterKey(key: string): boolean {
  // OpenRouter keys typically start with 'sk-or-'
  return key.startsWith('sk-or-') && key.length > 20;
}