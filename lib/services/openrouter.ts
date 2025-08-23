import { parseOpenRouterStream } from '../sse/stream-helper';
import logger from '../utils/logger';

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
    
    logger.openRouter('Service initialized', {
      model: this.model,
      baseUrl: this.baseUrl,
      hasApiKey: !!this.apiKey,
    });
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
    const requestId = `or_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    const requestBody = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 16000,
      ...(options.responseFormat === 'json' && {
        response_format: { type: 'json_object' },
      }),
    };
    
    logger.openRouter('Complete request starting', {
      requestId,
      model: this.model,
      messagesCount: messages.length,
      temperature: requestBody.temperature,
      maxTokens: requestBody.max_tokens,
      responseFormat: options.responseFormat,
      totalInputLength: messages.reduce((acc, m) => acc + m.content.length, 0),
    });
    
    logger.apiRequest('OpenRouter', 'POST', '/chat/completions', {
      model: this.model,
      messagesCount: messages.length,
      temperature: requestBody.temperature,
      maxTokens: requestBody.max_tokens,
    });

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://alpha-oracle.ai',
          'X-Title': 'The Alpha Oracle',
        },
        body: JSON.stringify(requestBody),
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.text();
        logger.error('OpenRouter API error', new Error(error), {
          requestId,
          status: response.status,
          duration,
        });
        logger.apiResponse('OpenRouter', 'POST', '/chat/completions', response.status, error, duration);
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      logger.openRouter('Complete request successful', {
        requestId,
        duration,
        responseLength: content.length,
        usage: data.usage,
        finishReason: data.choices[0].finish_reason,
      });
      
      logger.apiResponse('OpenRouter', 'POST', '/chat/completions', response.status, {
        contentLength: content.length,
        usage: data.usage,
      }, duration);
      
      return content;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('OpenRouter complete request failed', error, {
        requestId,
        duration,
      });
      throw error;
    }
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
    const requestId = `or_stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    const requestBody = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 16000,
      stream: true,
    };
    
    logger.openRouter('Stream request starting', {
      requestId,
      model: this.model,
      messagesCount: messages.length,
      temperature: requestBody.temperature,
      maxTokens: requestBody.max_tokens,
      totalInputLength: messages.reduce((acc, m) => acc + m.content.length, 0),
    });
    
    logger.apiRequest('OpenRouter', 'POST', '/chat/completions (stream)', {
      model: this.model,
      messagesCount: messages.length,
      temperature: requestBody.temperature,
      maxTokens: requestBody.max_tokens,
      stream: true,
    });

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://alpha-oracle.ai',
          'X-Title': 'The Alpha Oracle',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        const duration = Date.now() - startTime;
        logger.error('OpenRouter stream API error', new Error(error), {
          requestId,
          status: response.status,
          duration,
        });
        logger.apiResponse('OpenRouter', 'POST', '/chat/completions (stream)', response.status, error, duration);
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
      }

      logger.debug('Stream response received, starting to process', { requestId });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';
      let tokenCount = 0;
      let totalContent = '';

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
              if (data === '[DONE]') {
                const duration = Date.now() - startTime;
                logger.openRouter('Stream completed', {
                  requestId,
                  duration,
                  tokenCount,
                  totalLength: totalContent.length,
                  averageTokenLength: tokenCount > 0 ? totalContent.length / tokenCount : 0,
                });
                logger.apiResponse('OpenRouter', 'POST', '/chat/completions (stream)', 200, {
                  tokenCount,
                  totalLength: totalContent.length,
                }, duration);
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  tokenCount++;
                  totalContent += content;
                  
                  if (tokenCount % 50 === 0) {
                    logger.debug('Stream progress', {
                      requestId,
                      tokenCount,
                      totalLength: totalContent.length,
                    });
                  }
                  
                  options.onToken?.(content);
                  yield content;
                }
              } catch (e) {
                logger.error('Error parsing SSE data', e, {
                  requestId,
                  data: data.substring(0, 100),
                });
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('OpenRouter stream request failed', error, {
        requestId,
        duration,
      });
      throw error;
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
    const requestId = `or_callback_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    const requestBody = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 16000,
      stream: true,
    };
    
    logger.openRouter('Callback stream request starting', {
      requestId,
      model: this.model,
      messagesCount: messages.length,
      temperature: requestBody.temperature,
      maxTokens: requestBody.max_tokens,
    });

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://alpha-oracle.ai',
          'X-Title': 'The Alpha Oracle',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        const duration = Date.now() - startTime;
        logger.error('OpenRouter callback stream API error', new Error(error), {
          requestId,
          status: response.status,
          duration,
        });
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
      }

      let chunkCount = 0;
      const chunkCallback = (text: string) => {
        chunkCount++;
        if (chunkCount % 20 === 0) {
          logger.debug('Callback stream progress', {
            requestId,
            chunkCount,
          });
        }
        onChunk(text);
      };

      await parseOpenRouterStream(response, chunkCallback);
      
      const duration = Date.now() - startTime;
      logger.openRouter('Callback stream completed', {
        requestId,
        duration,
        chunkCount,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('OpenRouter callback stream failed', error, {
        requestId,
        duration,
      });
      throw error;
    }
  }
}

/**
 * Factory function to create OpenRouter service with API key from request
 */
export function createOpenRouterService(apiKey: string, model?: string): OpenRouterService {
  logger.info('Creating OpenRouter service', {
    model: model || DEFAULT_MODEL,
    hasApiKey: !!apiKey,
  });
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
  const isValid = key.startsWith('sk-or-') && key.length > 20;
  logger.debug('Validating OpenRouter key', {
    isValid,
    keyPrefix: key.substring(0, 6),
    keyLength: key.length,
  });
  return isValid;
}