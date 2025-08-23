import { NextRequest } from 'next/server';
import { Summarizer } from '@/lib/agents/summarizer';
import { ExecutionResult } from '@/lib/agents/executor';
import { ChatMessage } from '@/lib/services/openrouter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AnswerRequest {
  query: string;
  executionResults: ExecutionResult[];
  openrouterKey: string;
  conversationHistory?: ChatMessage[];
}

export async function POST(req: NextRequest) {
  try {
    const body: AnswerRequest = await req.json();
    const { query, executionResults, openrouterKey, conversationHistory = [] } = body;

    if (!query || !executionResults || !openrouterKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: query, executionResults, and openrouterKey' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create SSE response stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Start async streaming
    (async () => {
      try {
        // Send initial status
        const statusMessage = `event: status\ndata: ${JSON.stringify({ 
          message: 'Generating comprehensive answer...' 
        })}\n\n`;
        await writer.write(encoder.encode(statusMessage));

        // Create summarizer and generate answer stream
        const summarizer = new Summarizer(openrouterKey);
        const answerStream = await summarizer.generateFinalAnswer(
          query,
          executionResults,
          conversationHistory
        );

        // Stream the answer chunks
        for await (const chunk of answerStream) {
          const deltaMessage = `event: delta\ndata: ${JSON.stringify({ 
            content: chunk 
          })}\n\n`;
          await writer.write(encoder.encode(deltaMessage));
        }

        // Send done event
        const doneMessage = `event: done\ndata: ${JSON.stringify({ 
          success: true 
        })}\n\n`;
        await writer.write(encoder.encode(doneMessage));
      } catch (error) {
        console.error('Error generating answer:', error);
        const errorMessage = `event: error\ndata: ${JSON.stringify({ 
          message: error instanceof Error ? error.message : 'Failed to generate answer' 
        })}\n\n`;
        await writer.write(encoder.encode(errorMessage));
      } finally {
        await writer.close();
      }
    })();

    // Return SSE response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in answer endpoint:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}