import { NextRequest } from 'next/server';
import { PlanningAgent } from '@/lib/agents/planner';
import { Executor, ExecutionResult } from '@/lib/agents/executor';
import { Summarizer } from '@/lib/agents/summarizer';
import { createSSEResponse } from '@/lib/sse/stream-helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PlanRunRequest {
  query: string;
  openrouterKey: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}


export async function POST(req: NextRequest) {
  try {
    const body: PlanRunRequest = await req.json();
    const { query, openrouterKey, conversationHistory = [] } = body;

    if (!query || !openrouterKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: query and openrouterKey' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create SSE response stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Helper function to send SSE event
    const sendEvent = async (event: string, data: unknown) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Start async processing
    (async () => {
      try {
        // 1. Generate plan
        await sendEvent('status', { message: 'Generating research plan...' });
        const planner = new PlanningAgent(openrouterKey);
        const planSteps = await planner.generatePlan(query, conversationHistory);
        await sendEvent('plan', { steps: planSteps });

        // 2. Execute plan steps
        // Use environment variables for Brave and FMP API keys
        const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
        const fmpApiKey = process.env.FMP_API_KEY;
        
        console.log('[plan-run] API Keys status:', {
          hasBrave: !!braveApiKey,
          hasFMP: !!fmpApiKey,
          hasOpenRouter: !!openrouterKey,
          braveKey: braveApiKey ? 'Present' : 'Missing',
          fmpKey: fmpApiKey ? 'Present' : 'Missing'
        });
        
        const executor = new Executor(braveApiKey, fmpApiKey);
        const executionResults: ExecutionResult[] = [];
        
        for (let i = 0; i < planSteps.length; i++) {
          const step = planSteps[i];
          const startTime = Date.now();
          
          // Send step start event with description
          await sendEvent('stepStart', {
            stepIndex: i,
            title: step.title,
            description: step.description,
            currentStep: i + 1,
            totalSteps: planSteps.length
          });
          
          // Send periodic status updates during execution
          const statusInterval = setInterval(async () => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const statusMessage =
              elapsed < 5 ? 'Analyzing data...' :
              elapsed < 10 ? 'Processing insights...' :
              elapsed < 15 ? 'Synthesizing findings...' :
              'Finalizing results...';
              
            await sendEvent('stepProgress', {
              stepIndex: i,
              message: statusMessage,
              elapsedTime: elapsed
            });
          }, 1000);
          
          try {
            const result = await executor.executeStep(step, query);
            clearInterval(statusInterval);
            
            const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
            executionResults.push(result);
            
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
            clearInterval(statusInterval);
            console.error(`Error executing step ${i + 1}:`, error);
            await sendEvent('stepError', {
              stepIndex: i,
              title: step.title,
              description: step.description,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // 3. Generate summary
        await sendEvent('status', { message: 'Summarizing research findings...' });
        const summarizer = new Summarizer(openrouterKey);
        const summary = await summarizer.summarizeResults(executionResults, query);
        await sendEvent('summary', {
          summary,
          results: executionResults // Include the actual execution results
        });

        // 4. Done
        await sendEvent('done', {
          success: true,
          stepsCompleted: executionResults.length,
          totalSteps: planSteps.length
        });
      } catch (error) {
        console.error('Error in plan-run:', error);
        await sendEvent('error', { 
          message: error instanceof Error ? error.message : 'An unexpected error occurred'
        });
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
    console.error('Error in plan-run endpoint:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}