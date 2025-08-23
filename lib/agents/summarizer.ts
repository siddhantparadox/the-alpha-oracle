import { ChatMessage, OpenRouterService } from '../services/openrouter';
import { ExecutionResult } from './executor';
import { FMPQuote, FMPCandle } from '../services/fmp';
import { BraveNewsResult, BraveWebResult } from '../services/brave-search';

/**
 * Summarizer that creates concise summaries of execution results
 * Based on the original CLI's summary_prompt pattern
 */
export class Summarizer {
  private openRouterService: OpenRouterService;

  constructor(openRouterApiKey: string, model?: string) {
    this.openRouterService = new OpenRouterService({
      apiKey: openRouterApiKey,
      model: model || 'anthropic/claude-sonnet-4',
    });
  }

  /**
   * System prompt for summarization
   * Adapted from the original CLI's summary_prompt
   */
  private getSummaryPrompt(): string {
    return `You are an information summarizer for The Alpha Oracle financial analyst agent. 
You are given a question, data retrieved at various steps, and the latest action as well as what was required for that action.

Your job is to summarize the information concisely so users can quickly understand the results.

Rules:
- Summary should be less than 50 words unless there's a lot of data
- If there's extensive data, use line breaks to build paragraphs (but still be concise)
- Focus on the most important findings
- Include key numbers and percentages
- Be neutral and factual
- Do not add speculation or recommendations

Return ONLY the summary text, no prefixes or formatting markers.`;
  }

  /**
   * Summarize a single execution result
   */
  async summarizeResult(
    result: ExecutionResult,
    question: string
  ): Promise<string> {
    // If we already have a summary, validate/enhance it
    if (result.summary) {
      return this.enhanceSummary(result.summary, question);
    }

    const messages: ChatMessage[] = [
      {
        role: 'developer',
        content: this.getSummaryPrompt(),
      },
      {
        role: 'user',
        content: `Question: ${question}
Step: ${result.step.title}
Action: ${result.step.description}
Data Retrieved: ${JSON.stringify(result.data).slice(0, 2000)}...

Provide a concise summary of what was found.`,
      },
    ];

    try {
      const summary = await this.openRouterService.complete(messages, {
        temperature: 0.3,
        maxTokens: 200,
      });

      return summary.trim();
    } catch (error) {
      console.error('Error generating summary:', error);
      return this.getFallbackSummary(result);
    }
  }

  /**
   * Summarize multiple execution results
   */
  async summarizeResults(
    results: ExecutionResult[],
    question: string
  ): Promise<string> {
    const combinedData = results
      .map(r => `${r.step.title}: ${r.summary || JSON.stringify(r.data).slice(0, 200)}`)
      .join('\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'developer',
        content: this.getSummaryPrompt(),
      },
      {
        role: 'user',
        content: `Question: ${question}

Data gathered from multiple steps:
${combinedData}

Provide an overall summary of all findings.`,
      },
    ];

    try {
      const summary = await this.openRouterService.complete(messages, {
        temperature: 0.3,
        maxTokens: 300,
      });

      return summary.trim();
    } catch (error) {
      console.error('Error generating combined summary:', error);
      return results
        .map(r => r.summary || this.getFallbackSummary(r))
        .join(' ');
    }
  }

  /**
   * Enhance an existing summary
   */
  private async enhanceSummary(
    existingSummary: string,
    question: string
  ): Promise<string> {
    // If summary is already good, return it
    if (existingSummary.length > 20 && existingSummary.length < 200) {
      return existingSummary;
    }

    const messages: ChatMessage[] = [
      {
        role: 'developer',
        content: this.getSummaryPrompt(),
      },
      {
        role: 'user',
        content: `Question: ${question}
Current summary: ${existingSummary}

Make this summary more concise and informative if needed, or return as-is if it's already good.`,
      },
    ];

    try {
      const enhanced = await this.openRouterService.complete(messages, {
        temperature: 0.3,
        maxTokens: 200,
      });

      return enhanced.trim();
    } catch {
      return existingSummary;
    }
  }

  /**
   * Generate a fallback summary when API fails
   */
  private getFallbackSummary(result: ExecutionResult): string {
    if (result.error) {
      return `Error executing ${result.step.title}: ${result.error}`;
    }

    if (!result.data) {
      return `No data found for ${result.step.title}`;
    }

    // Try to create a basic summary based on data type
    if (result.provider === 'fmp_quote') {
      const quote = result.data as FMPQuote;
      return `${quote.symbol}: $${quote.price?.toFixed(2)} (${quote.changesPercentage?.toFixed(2)}%)`;
    }

    if (result.provider === 'brave_news') {
      const news = result.data as BraveNewsResult[];
      return `Found ${news.length} news articles`;
    }

    if (result.provider === 'brave_web') {
      const web = result.data as BraveWebResult[];
      return `Found ${web.length} web results`;
    }

    if (result.provider === 'fmp_chart') {
      const candles = result.data as FMPCandle[];
      return `Retrieved ${candles.length} chart data points`;
    }

    return `Completed ${result.step.title}`;
  }

  /**
   * Generate the final answer prompt
   * Adapted from the original CLI's answer_prompt
   */
  private getAnswerPrompt(question: string): string {
    return `You are The Alpha Oracle, a financial analyst providing comprehensive answers to traders and investors.

Review the gathered content and provide a complete answer to: ${question}

Use markdown format for the answer. Keep the markdown simple with text, bullets, and tables as needed.

Rules:
- Be comprehensive but concise
- Include all relevant data points
- Use proper markdown formatting
- Include numbers, percentages, and key metrics
- Be neutral and factual
- Do not provide investment advice or recommendations
- Focus on answering the specific question asked

All data comes from The Alpha Oracle platform using real-time market data and news sources.`;
  }

  /**
   * Generate the final answer based on all execution results
   */
  async generateFinalAnswer(
    question: string,
    results: ExecutionResult[],
    conversationHistory: ChatMessage[] = []
  ): Promise<AsyncGenerator<string, void, unknown>> {
    // Build context from all results
    const context = results
      .map(r => {
        const summary = r.summary || this.getFallbackSummary(r);
        return `**${r.step.title}**\n${summary}`;
      })
      .join('\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'developer',
        content: this.getAnswerPrompt(question),
      },
      ...conversationHistory,
      {
        role: 'user',
        content: `Data gathered:\n\n${context}\n\nProvide a complete answer based on this information.`,
      },
    ];

    // Stream the response
    return this.openRouterService.streamComplete(messages, {
      temperature: 0.7,
      maxTokens: 2000,
    });
  }
}

/**
 * Factory function to create a summarizer
 */
export function createSummarizer(
  openRouterApiKey: string,
  model?: string
): Summarizer {
  return new Summarizer(openRouterApiKey, model);
}