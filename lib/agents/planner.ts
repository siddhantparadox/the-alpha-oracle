import { ChatMessage, OpenRouterService } from '../services/openrouter';
import { PlanStep } from '../store/api-keys';

/**
 * Planning agent that generates steps to answer financial questions
 * Based on the original CLI implementation's agent_prompt pattern
 */
export class PlanningAgent {
  private openRouterService: OpenRouterService;

  constructor(openRouterApiKey: string, model?: string) {
    this.openRouterService = new OpenRouterService({
      apiKey: openRouterApiKey,
      model: model || 'anthropic/claude-sonnet-4',
    });
  }

  /**
   * System prompt for the planning agent
   * Adapted from the original CLI's agent_prompt
   */
  private getPlannerPrompt(): string {
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
- Plan 1-4 steps maximum
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
    conversationHistory: ChatMessage[] = []
  ): Promise<PlanStep[]> {
    const messages: ChatMessage[] = [
      {
        role: 'developer',
        content: this.getPlannerPrompt(),
      },
      ...conversationHistory,
      {
        role: 'user',
        content: question,
      },
    ];

    try {
      const response = await this.openRouterService.complete(messages, {
        temperature: 0.7,
        maxTokens: 1000,
        responseFormat: 'json',
      });

      // Parse the JSON response
      const plan = JSON.parse(response);
      
      // Validate it's an array
      if (!Array.isArray(plan)) {
        console.error('Invalid plan format:', plan);
        return [];
      }

      // Validate and clean each step
      const validatedPlan: PlanStep[] = plan
        .filter(step => step.title && step.description)
        .map(step => ({
          title: String(step.title).slice(0, 50), // Limit title length
          description: String(step.description).slice(0, 200), // Allow longer descriptions
        }));

      return validatedPlan;
    } catch (error) {
      console.error('Error generating plan:', error);
      // Fallback plan for common queries
      return this.getFallbackPlan(question);
    }
  }

  /**
   * Check if planning is complete
   */
  async isPlanningComplete(
    conversationHistory: ChatMessage[]
  ): Promise<boolean> {
    // Check the last assistant message
    const lastMessage = conversationHistory
      .filter(m => m.role === 'assistant')
      .pop();

    if (!lastMessage) return false;

    try {
      const plan = JSON.parse(lastMessage.content);
      return Array.isArray(plan) && plan.length === 0;
    } catch {
      return false;
    }
  }

  /**
   * Get a fallback plan for common query types
   */
  private getFallbackPlan(question: string): PlanStep[] {
    const query = question.toLowerCase();

    // Check for ticker symbols (1-5 uppercase letters)
    const tickerMatch = question.match(/\b[A-Z]{1,5}\b/);
    const hasTicker = !!tickerMatch;
    const ticker = tickerMatch?.[0];

    // Check for common query types
    if (hasTicker && (query.includes('price') || query.includes('quote'))) {
      return [
        {
          title: `Get ${ticker} quote`,
          description: `Let me first check ${ticker}'s current price and today's trading performance`,
        },
        {
          title: `Get ${ticker} news`,
          description: `I'll also look for any recent news that might be affecting ${ticker}'s price movement`,
        },
      ];
    }

    if (hasTicker && query.includes('news')) {
      return [
        {
          title: `Get ${ticker} news`,
          description: `Let me retrieve the latest news and developments about ${ticker}`,
        },
      ];
    }

    if (query.includes('market') || query.includes('today')) {
      return [
        {
          title: 'Get market news',
          description: 'Let me check today\'s market news and see what\'s moving the markets',
        },
      ];
    }

    if (hasTicker) {
      return [
        {
          title: `Research ${ticker}`,
          description: `Let me gather comprehensive information about ${ticker} including price and news`,
        },
      ];
    }

    // Generic financial research
    return [
      {
        title: 'Search financial news',
        description: 'Let me search for relevant financial news and market information',
      },
    ];
  }

  /**
   * Refine plan based on execution results
   */
  async refinePlan(
    originalQuestion: string,
    executedSteps: Array<{ step: PlanStep; result: unknown }>,
    conversationHistory: ChatMessage[]
  ): Promise<PlanStep[]> {
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
      const response = await this.openRouterService.complete(messages, {
        temperature: 0.7,
        maxTokens: 500,
        responseFormat: 'json',
      });

      const additionalSteps = JSON.parse(response);
      
      if (!Array.isArray(additionalSteps)) {
        return [];
      }

      return additionalSteps
        .filter(step => step.title && step.description)
        .map(step => ({
          title: String(step.title).slice(0, 50),
          description: String(step.description).slice(0, 100),
        }));
    } catch (error) {
      console.error('Error refining plan:', error);
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
  return new PlanningAgent(openRouterApiKey, model);
}