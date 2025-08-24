import { ChatMessage, OpenRouterService } from '../services/openrouter';
import { PlanStep } from '../store/api-keys';
import logger from '../utils/logger';

export class PlanningAgent {
  private openRouterService: OpenRouterService;

  constructor(openRouterApiKey: string, model?: string) {
    this.openRouterService = new OpenRouterService({
      apiKey: openRouterApiKey,
      model: model || 'anthropic/claude-sonnet-4',
    });
    
    logger.agent('Planner', 'Agent initialized', {
      model: model || 'anthropic/claude-sonnet-4',
      hasApiKey: !!openRouterApiKey,
    });
  }

  /**
   * System prompt for the planning agent
   * Adapted from the original CLI's agent_prompt
   */
  private getPlannerPrompt(maxSteps: number = 15): string {
    return `You are The Alpha Oracle, a financial analyst agent tasked to help traders get the information and answers they want. Your job is to carefully plan steps that we need to take in order to fully answer the question. Your main objective is to act as a planner.
 
 Your output will be a JSON array of steps that explain what needs to be done:
 [
  {
    "title": "Check NVDA news",
    "description": "Let me first check the latest news on NVDA to understand current market sentiment"
  },
  {
    "title": "Get NVDA price",
    "description": "Next, I need to see NVDA's current price and movement to gauge its performance"
  }
 ]
 
 Instructions:
 - Be aware of retail trading lingo (ETH = Ethereum, BTC = Bitcoin, etc.)
 - Understand trading terms like "inside days", "cup and handle", "gex" (gamma exposure), etc.
 - Make assumptions for typos - traders often type quickly
 - Keep titles short (max 5 words) for the sidebar
 - Write FULL, CONVERSATIONAL descriptions (15-25 words) that explain what you're doing and why
 - Descriptions should be written as if you're talking to the user: "Let me check...", "I'll now look at...", "Next, I need to..."
 - Vary your description openings: "Let me first", "I'll now", "Next, I need to", "Let's look at", "I should check", "Time to analyze", "Let's explore"
 - Plan up to ${maxSteps} steps maximum
 - Focus on actionable data retrieval steps
 - When done planning, return an empty array []
 
 Financial data sources available:
 - Stock quotes and intraday charts (if ticker mentioned)
 - Financial news from multiple sources
 - Web search for company information
 - Market analysis and trends
 
 Output ONLY valid JSON, no markdown formatting or explanation.`;
  }

  /**
   * Generate a plan for answering a financial question
   */
  async generatePlan(
    question: string,
    conversationHistory: ChatMessage[] = [],
    maxSteps: number = 15
  ): Promise<PlanStep[]> {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.agent('Planner', 'Starting plan generation', {
      planId,
      question,
      conversationHistoryLength: conversationHistory.length,
    });
    
    const messages: ChatMessage[] = [
      {
        role: 'developer',
        content: this.getPlannerPrompt(maxSteps),
      },
      ...conversationHistory,
      {
        role: 'user',
        content: question,
      },
    ];

    try {
      const startTime = Date.now();
      
      logger.debug('Calling OpenRouter for plan generation', {
        planId,
        messagesCount: messages.length,
      });
      
      const response = await this.openRouterService.complete(messages, {
        temperature: 0.7,
        maxTokens: 1000,
        responseFormat: 'json',
      });
      
      const duration = Date.now() - startTime;

      // Parse the JSON response
      const plan = JSON.parse(response);
      
      logger.agent('Planner', 'Received plan response', {
        planId,
        duration,
        responseLength: response.length,
        parsedType: Array.isArray(plan) ? 'array' : typeof plan,
      });
      
      // Validate it's an array
      if (!Array.isArray(plan)) {
        logger.error('Invalid plan format - not an array', new Error('Invalid plan format'), {
          planId,
          receivedType: typeof plan,
          received: plan,
        });
        return [];
      }

      // Validate and clean each step
      const validatedPlan: PlanStep[] = plan
        .filter(step => step.title && step.description)
        .map(step => ({
          title: String(step.title).slice(0, 50), // Limit title length
          description: String(step.description).slice(0, 200), // Allow longer descriptions
        }));
      
      logger.agent('Planner', 'Plan generation successful', {
        planId,
        duration,
        originalSteps: plan.length,
        validatedSteps: validatedPlan.length,
        steps: validatedPlan.map(s => s.title),
      });

      return validatedPlan;
    } catch (error) {
      logger.error('Error generating plan', error, {
        planId,
        question,
      });
      
      // Fallback plan for common queries
      logger.info('Using fallback plan', { planId });
      return this.getFallbackPlan(question);
    }
  }

  /**
   * Check if planning is complete
   */
  async isPlanningComplete(
    conversationHistory: ChatMessage[]
  ): Promise<boolean> {
    logger.debug('Checking if planning is complete', {
      conversationHistoryLength: conversationHistory.length,
    });
    
    // Check the last assistant message
    const lastMessage = conversationHistory
      .filter(m => m.role === 'assistant')
      .pop();

    if (!lastMessage) {
      logger.debug('No assistant message found - planning not complete');
      return false;
    }

    try {
      const plan = JSON.parse(lastMessage.content);
      const isComplete = Array.isArray(plan) && plan.length === 0;
      
      logger.debug('Planning complete check result', {
        isComplete,
        planLength: Array.isArray(plan) ? plan.length : 'not-array',
      });
      
      return isComplete;
    } catch {
      logger.debug('Failed to parse last message as JSON - planning not complete');
      return false;
    }
  }

  /**
   * Get a fallback plan for common query types
   */
  private getFallbackPlan(question: string): PlanStep[] {
    const query = question.toLowerCase();
    
    logger.debug('Generating fallback plan', {
      question,
      queryLength: query.length,
    });

    // Check for ticker symbols (1-5 uppercase letters)
    const tickerMatch = question.match(/\b[A-Z]{1,5}\b/);
    const hasTicker = !!tickerMatch;
    const ticker = tickerMatch?.[0];
    
    logger.debug('Ticker detection in fallback', {
      hasTicker,
      ticker,
    });

    // Check for common query types
    if (hasTicker && (query.includes('price') || query.includes('quote'))) {
      const plan = [
        {
          title: `Get ${ticker} quote`,
          description: `Let me first check ${ticker}'s current price and today's trading performance`,
        },
        {
          title: `Get ${ticker} news`,
          description: `I'll also look for any recent news that might be affecting ${ticker}'s price movement`,
        },
      ];
      logger.info('Fallback plan: price/quote with ticker', { ticker, steps: plan.length });
      return plan;
    }

    if (hasTicker && query.includes('news')) {
      const plan = [
        {
          title: `Get ${ticker} news`,
          description: `Let me retrieve the latest news and developments about ${ticker}`,
        },
      ];
      logger.info('Fallback plan: news with ticker', { ticker, steps: plan.length });
      return plan;
    }

    if (query.includes('market') || query.includes('today')) {
      const plan = [
        {
          title: 'Get market news',
          description: 'Let me check today\'s market news and see what\'s moving the markets',
        },
      ];
      logger.info('Fallback plan: market news', { steps: plan.length });
      return plan;
    }

    if (hasTicker) {
      const plan = [
        {
          title: `Research ${ticker}`,
          description: `Let me gather comprehensive information about ${ticker} including price and news`,
        },
      ];
      logger.info('Fallback plan: general ticker research', { ticker, steps: plan.length });
      return plan;
    }

    // Generic financial research
    const plan = [
      {
        title: 'Search financial news',
        description: 'Let me search for relevant financial news and market information',
      },
    ];
    logger.info('Fallback plan: generic financial search', { steps: plan.length });
    return plan;
  }

  /**
   * Refine plan based on execution results
   */
  async refinePlan(
    originalQuestion: string,
    executedSteps: Array<{ step: PlanStep; result: unknown }>,
    conversationHistory: ChatMessage[]
  ): Promise<PlanStep[]> {
    const refineId = `refine_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.agent('Planner', 'Starting plan refinement', {
      refineId,
      originalQuestion,
      executedStepsCount: executedSteps.length,
      conversationHistoryLength: conversationHistory.length,
    });
    
    // Build context from executed steps
    const context = executedSteps
      .map(({ step, result }) => 
        `Completed: ${step.title}\nResult: ${JSON.stringify(result).slice(0, 200)}...`
      )
      .join('\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'developer',
        content: this.getPlannerPrompt(),
      },
      ...conversationHistory,
      {
        role: 'user',
        content: `Original question: ${originalQuestion}\n\nProgress so far:\n${context}\n\nWhat additional steps are needed? Return [] if complete.`,
      },
    ];

    try {
      const startTime = Date.now();
      
      const response = await this.openRouterService.complete(messages, {
        temperature: 0.7,
        maxTokens: 500,
        responseFormat: 'json',
      });
      
      const duration = Date.now() - startTime;

      const additionalSteps = JSON.parse(response);
      
      logger.agent('Planner', 'Plan refinement response received', {
        refineId,
        duration,
        isArray: Array.isArray(additionalSteps),
        stepsCount: Array.isArray(additionalSteps) ? additionalSteps.length : 0,
      });
      
      if (!Array.isArray(additionalSteps)) {
        logger.warn('Refined plan is not an array', {
          refineId,
          receivedType: typeof additionalSteps,
        });
        return [];
      }

      const refined = additionalSteps
        .filter(step => step.title && step.description)
        .map(step => ({
          title: String(step.title).slice(0, 50),
          description: String(step.description).slice(0, 100),
        }));
      
      logger.agent('Planner', 'Plan refinement successful', {
        refineId,
        duration,
        additionalSteps: refined.length,
        steps: refined.map(s => s.title),
      });
      
      return refined;
    } catch (error) {
      logger.error('Error refining plan', error, {
        refineId,
        originalQuestion,
      });
      return [];
    }
  }
}

/**
 * Factory function to create a planning agent
 */
export function createPlanningAgent(
  openRouterApiKey: string,
  model?: string
): PlanningAgent {
  logger.info('Creating Planning Agent', {
    model: model || 'anthropic/claude-sonnet-4',
    hasApiKey: !!openRouterApiKey,
  });
  return new PlanningAgent(openRouterApiKey, model);
}