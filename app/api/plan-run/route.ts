import { NextRequest } from 'next/server';
import { PlanningAgent } from '@/lib/agents/planner';
import { Executor, ExecutionResult } from '@/lib/agents/executor';
import { Summarizer } from '@/lib/agents/summarizer';
import { createSSEResponse } from '@/lib/sse/stream-helper';
import logger from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PlanRunRequest {
  query: string;
  openrouterKey: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  maxSteps?: number;
}

export async function POST(req: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const startTime = Date.now();
  
  logger.group(`API Request: /api/plan-run [${requestId}]`);
  logger.info('New plan-run request received', { requestId });

  try {
    const body: PlanRunRequest = await req.json();
    const { query, openrouterKey, conversationHistory = [], maxSteps = 15 } = body;

    logger.data('Request payload', {
      query,
      hasOpenRouterKey: !!openrouterKey,
      conversationHistoryLength: conversationHistory.length,
      requestId,
    });

    if (!query || !openrouterKey) {
      logger.warn('Missing required fields', { 
        hasQuery: !!query, 
        hasOpenRouterKey: !!openrouterKey,
        requestId 
      });
      
      return new Response(
        JSON.stringify({ error: 'Missing required fields: query and openrouterKey' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create SSE response stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Helper function to send SSE event with logging
    const sendEvent = async (event: string, data: unknown) => {
      logger.sse(event, data, { requestId });
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Start async processing
    (async () => {
      try {
        logger.info('Starting async plan execution', { requestId });
        
        // 1. Generate plan
        await sendEvent('status', { message: 'Generating research plan...' });
        logger.agent('Planner', 'Starting plan generation', { query, requestId });
        
        const planTimer = logger.startTimer('Plan Generation');
        const planner = new PlanningAgent(openrouterKey);
        const planSteps = await planner.generatePlan(query, conversationHistory, maxSteps);
        const planDuration = planTimer();
        
        logger.agent('Planner', 'Plan generated successfully', {
          stepsCount: planSteps.length,
          duration: planDuration,
          steps: planSteps.map(s => ({ title: s.title, description: s.description })),
          requestId,
        });
        
        await sendEvent('plan', { steps: planSteps });

        // 2. Execute plan steps
        // Use environment variables for Brave, FMP, and Polygon API keys
        const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
        const fmpApiKey = process.env.FMP_API_KEY;
        const polygonApiKey = process.env.POLYGON_API_KEY;
        
        logger.info('API Keys configuration', {
          hasBrave: !!braveApiKey,
          hasFMP: !!fmpApiKey,
          hasPolygon: !!polygonApiKey,
          hasOpenRouter: !!openrouterKey,
          braveKeyLength: braveApiKey?.length,
          fmpKeyLength: fmpApiKey?.length,
          polygonKeyLength: polygonApiKey?.length,
          requestId,
        });
        
        const executor = new Executor(braveApiKey, fmpApiKey, polygonApiKey);
        const executionResults: ExecutionResult[] = [];
        
        logger.info('Starting plan execution', { 
          totalSteps: planSteps.length,
          requestId 
        });
        
        for (let i = 0; i < planSteps.length; i++) {
          const step = planSteps[i];
          const stepStartTime = Date.now();
          
          logger.agent('Executor', `Starting step ${i + 1}/${planSteps.length}`, {
            stepIndex: i,
            stepTitle: step.title,
            stepDescription: step.description,
            requestId,
          });
          
          // Send step start event with description
          await sendEvent('stepStart', {
            stepIndex: i,
            title: step.title,
            description: step.description,
            currentStep: i + 1,
            totalSteps: planSteps.length
          });
          
          // Send periodic status updates during execution
          let statusInterval: NodeJS.Timeout | undefined;
          
          try {
            statusInterval = setInterval(async () => {
              const elapsed = Math.floor((Date.now() - stepStartTime) / 1000);
              const statusMessage =
                elapsed < 5  ? 'Analyzing data...' :
                elapsed < 10 ? 'Processing insights...' :
                elapsed < 15 ? 'Synthesizing findings...' :
                'Finalizing results...';
              
              logger.debug(`Step ${i + 1} progress update`, {
                stepIndex: i,
                elapsed,
                message: statusMessage,
                requestId,
              });
                
              await sendEvent('stepProgress', {
                stepIndex: i,
                message: statusMessage,
                elapsedTime: elapsed
              });
            }, 1000);
            
            const stepTimer = logger.startTimer(`Step ${i + 1} Execution`);
            const result = await executor.executeStep(step, query);
            const stepDuration = stepTimer();
            
            if (statusInterval) {
              clearInterval(statusInterval);
            }
            
            const elapsedTime = Math.floor((Date.now() - stepStartTime) / 1000);
            executionResults.push(result);
            
            logger.agent('Executor', `Completed step ${i + 1}/${planSteps.length}`, {
              stepIndex: i,
              stepTitle: step.title,
              duration: stepDuration,
              elapsedTime,
              hasData: !!result.data,
              dataSize: result.data ? JSON.stringify(result.data).length : 0,
              summary: result.summary,
              requestId,
            });
            
            // Generate a concise summary for this step
            const stepSummary = result.summary ||
              (result.data ? `Found ${Array.isArray(result.data) ? result.data.length : 1} result(s)` : 'No data found');
            
            // Send step completion with summary
            await sendEvent('stepComplete', {
              stepIndex: i,
              title: step.title,
              description: step.description,
              summary: stepSummary,
              elapsedTime,
              hasData: !!result.data
            });
          } catch (error) {
            if (statusInterval) {
              clearInterval(statusInterval);
            }
            
            logger.error(`Error executing step ${i + 1}`, error, {
              stepIndex: i,
              stepTitle: step.title,
              requestId,
            });
            
            await sendEvent('stepError', {
              stepIndex: i,
              title: step.title,
              description: step.description,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // 3. Send execution results FIRST (in a separate event to avoid size issues)
        logger.info('Sending execution results', {
          executionResultsCount: executionResults.length,
          totalDataSize: executionResults.reduce((acc, r) =>
            acc + (r.data ? JSON.stringify(r.data).length : 0), 0
          ),
          requestId,
        });
        
        // Send execution results in a dedicated event
        await sendEvent('executionResults', {
          results: executionResults
        });
        
        // 4. Generate summary
        await sendEvent('status', { message: 'Summarizing research findings...' });
        
        logger.agent('Summarizer', 'Starting summary generation', {
          resultsCount: executionResults.length,
          requestId,
        });
        
        const summaryTimer = logger.startTimer('Summary Generation');
        const summarizer = new Summarizer(openrouterKey);
        const summary = await summarizer.summarizeResults(executionResults, query);
        const summaryDuration = summaryTimer();
        
        logger.agent('Summarizer', 'Summary generated successfully', {
          summaryLength: summary.length,
          duration: summaryDuration,
          requestId,
        });
        
        // Send just the summary text (smaller payload)
        await sendEvent('summary', {
          summary
        });

        // 5. Done
        const totalDuration = Date.now() - startTime;
        
        logger.info('Plan execution completed successfully', {
          totalDuration,
          stepsCompleted: executionResults.length,
          totalSteps: planSteps.length,
          requestId,
        });
        
        await sendEvent('done', {
          success: true,
          stepsCompleted: executionResults.length,
          totalSteps: planSteps.length
        });
      } catch (error) {
        logger.error('Fatal error in plan-run async processing', error, { requestId });
        await sendEvent('error', { 
          message: error instanceof Error ? error.message : 'An unexpected error occurred'
        });
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
    logger.error('Error in plan-run endpoint (sync)', error, { requestId });
    logger.groupEnd();
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}