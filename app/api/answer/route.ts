import { NextRequest } from 'next/server';
import { Summarizer } from '@/lib/agents/summarizer';
import { ExecutionResult } from '@/lib/agents/executor';
import { ChatMessage } from '@/lib/services/openrouter';
import logger from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AnswerRequest {
  query: string;
  executionResults: ExecutionResult[];
  openrouterKey: string;
  conversationHistory?: ChatMessage[];
}

export async function POST(req: NextRequest) {
  const requestId = `ans_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const startTime = Date.now();
  
  logger.group(`API Request: /api/answer [${requestId}]`);
  logger.info('New answer request received', { requestId });

  try {
    const body: AnswerRequest = await req.json();
    const { query, executionResults, openrouterKey, conversationHistory = [] } = body;

    logger.data('Request payload', {
      query,
      hasOpenRouterKey: !!openrouterKey,
      executionResultsCount: executionResults?.length || 0,
      conversationHistoryLength: conversationHistory.length,
      requestId,
    });

    if (!query || !executionResults || !openrouterKey) {
      logger.warn('Missing required fields', {
        hasQuery: !!query,
        hasExecutionResults: !!executionResults,
        hasOpenRouterKey: !!openrouterKey,
        requestId,
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: query, executionResults, and openrouterKey' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Execution results summary', {
      resultsCount: executionResults.length,
      results: executionResults.map(r => ({
        step: r.step.title,
        hasData: !!r.data,
        dataSize: r.data ? JSON.stringify(r.data).length : 0,
        summary: r.summary,
      })),
      requestId,
    });

    // Create SSE response stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Start async streaming
    (async () => {
      try {
        logger.info('Starting answer generation stream', { requestId });
        
        // Send initial status with logging
        const statusMessage = `event: status\ndata: ${JSON.stringify({ 
          message: 'Generating comprehensive answer...' 
        })}\n\n`;
        logger.sse('status', { message: 'Generating comprehensive answer...' }, { requestId });
        await writer.write(encoder.encode(statusMessage));

        // Create summarizer and generate answer stream
        logger.agent('Summarizer', 'Creating final answer generator', {
          query,
          resultsCount: executionResults.length,
          requestId,
        });
        
        const answerTimer = logger.startTimer('Answer Generation');
        const summarizer = new Summarizer(openrouterKey);
        const answerStream = await summarizer.generateFinalAnswer(
          query,
          executionResults,
          conversationHistory
        );

        logger.info('Answer stream initialized, starting to send chunks', { requestId });
        
        let totalChunks = 0;
        let totalLength = 0;

        // Stream the answer chunks with logging
        for await (const chunk of answerStream) {
          totalChunks++;
          totalLength += chunk.length;
          
          if (totalChunks % 10 === 0) {
            logger.debug(`Answer streaming progress`, {
              chunksStreamed: totalChunks,
              totalLength,
              requestId,
            });
          }
          
          const deltaMessage = `event: delta\ndata: ${JSON.stringify({ 
            content: chunk 
          })}\n\n`;
          await writer.write(encoder.encode(deltaMessage));
        }

        const answerDuration = answerTimer();
        
        logger.agent('Summarizer', 'Answer generation completed', {
          totalChunks,
          totalLength,
          duration: answerDuration,
          averageChunkSize: Math.round(totalLength / totalChunks),
          requestId,
        });

        // Send done event with logging
        const doneMessage = `event: done\ndata: ${JSON.stringify({ 
          success: true 
        })}\n\n`;
        logger.sse('done', { success: true }, { requestId });
        await writer.write(encoder.encode(doneMessage));
        
        const totalDuration = Date.now() - startTime;
        logger.info('Answer request completed successfully', {
          totalDuration,
          totalChunks,
          totalLength,
          requestId,
        });
      } catch (error) {
        logger.error('Error generating answer in stream', error, { requestId });
        
        const errorMessage = `event: error\ndata: ${JSON.stringify({ 
          message: error instanceof Error ? error.message : 'Failed to generate answer' 
        })}\n\n`;
        logger.sse('error', { 
          message: error instanceof Error ? error.message : 'Failed to generate answer' 
        }, { requestId });
        await writer.write(encoder.encode(errorMessage));
      } finally {
        await writer.close();
        logger.groupEnd();
      }
    })();

    logger.info('SSE stream initialized, returning response', { requestId });

    // Return SSE response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    logger.error('Error in answer endpoint (sync)', error, { requestId });
    logger.groupEnd();
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}