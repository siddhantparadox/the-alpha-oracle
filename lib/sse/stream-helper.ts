import { createParser } from 'eventsource-parser';

export interface PlanStep {
  title: string;
  description: string;
}

export interface SSEMessage {
  type: 'plan' | 'status' | 'summary' | 'done' | 'error' | 'delta';
  data?: unknown;
  step?: PlanStep;
  steps?: PlanStep[];
  status?: 'running' | 'done' | 'failed';
  text?: string;
  content?: string;
  error?: string;
}

/**
 * Creates a ReadableStream that can be sent as Server-Sent Events
 */
export function createSSEStream() {
  const encoder = new TextEncoder();
  
  return new TransformStream<SSEMessage, Uint8Array>({
    transform(message, controller) {
      const data = `data: ${JSON.stringify(message)}\n\n`;
      controller.enqueue(encoder.encode(data));
    },
  });
}

/**
 * Helper to send SSE messages in API routes
 */
export function createSSEResponse() {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (message: SSEMessage) => {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    await writer.write(encoder.encode(data));
  };

  const close = async () => {
    await writer.close();
  };

  return {
    stream: readable,
    send,
    close,
    response: new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }),
  };
}

/**
 * Parses SSE stream from OpenRouter/OpenAI format
 */
export async function parseOpenRouterStream(
  response: Response,
  onChunk: (text: string) => void
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No reader available');

  const decoder = new TextDecoder();
  const parser = createParser({
    onEvent: (event) => {
      try {
        const data = JSON.parse(event.data);
        const content = data.choices?.[0]?.delta?.content || '';
        if (content) {
          onChunk(content);
        }
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    }
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      parser.feed(chunk);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Client-side SSE consumer
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<(data: SSEMessage) => void>> = new Map();

  connect(url: string) {
    if (this.eventSource) {
      this.disconnect();
    }

    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        this.emit(message.type, message);
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      this.emit('error', { type: 'error', error: 'Connection failed' });
    };

    this.eventSource.onopen = () => {
      console.log('SSE connection opened');
    };
  }

  on(event: string, callback: (data: SSEMessage) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: SSEMessage) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: SSEMessage) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
  }
}

/**
 * Fetch with SSE support for client-side streaming
 */
export async function fetchSSE(
  url: string,
  options: RequestInit & {
    onMessage?: (message: SSEMessage) => void;
    onError?: (error: string) => void;
  } = {}
) {
  const { onMessage, onError, ...fetchOptions } = options;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...fetchOptions.headers,
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader available');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            onMessage?.(data);
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
  } catch (error) {
    onError?.(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * SSE Consumer for reading server-sent events from a Response
 */
export class SSEConsumer {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = '';

  constructor(response: Response) {
    if (!response.body) {
      throw new Error('Response body is null');
    }
    this.reader = response.body.getReader();
  }

  async *[Symbol.asyncIterator]() {
    try {
      while (true) {
        const { done, value } = await this.reader.read();
        if (done) break;

        this.buffer += this.decoder.decode(value, { stream: true });
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine.startsWith(':')) continue;

          if (trimmedLine.startsWith('event:')) {
            const eventType = trimmedLine.slice(6).trim();
            // Find the next data line
            const nextIndex = lines.indexOf(line) + 1;
            if (nextIndex < lines.length) {
              const dataLine = lines[nextIndex].trim();
              if (dataLine.startsWith('data:')) {
                const data = dataLine.slice(5).trim();
                yield { event: eventType, data };
                lines.splice(nextIndex, 1); // Remove processed data line
              }
            }
          } else if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            yield { event: 'message', data };
          }
        }
      }
    } finally {
      this.reader.releaseLock();
    }
  }
}