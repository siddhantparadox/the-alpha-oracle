import { ChatMessage, OpenRouterService } from '../services/openrouter';
import { ExecutionResult } from './executor';
import { FMPQuote, FMPCandle } from '../services/fmp';
import { BraveNewsResult, BraveWebResult } from '../services/brave-search';
import logger from '../utils/logger';
export class Summarizer {
  private openRouterService: OpenRouterService;

  constructor(openRouterApiKey: string, model?: string) {
    this.openRouterService = new OpenRouterService({
      apiKey: openRouterApiKey,
      model: model || 'anthropic/claude-sonnet-4',
    });
    
    logger.agent('Summarizer', 'Agent initialized', {
      model: model || 'anthropic/claude-sonnet-4',
      hasApiKey: !!openRouterApiKey,
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
    const summaryId = `summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.agent('Summarizer', 'Starting single result summary', {
      summaryId,
      stepTitle: result.step.title,
      provider: result.provider,
      hasExistingSummary: !!result.summary,
      question: question.substring(0, 100),
    });
    
    // If we already have a summary, validate/enhance it
    if (result.summary) {
      logger.debug('Enhancing existing summary', {
        summaryId,
        existingSummaryLength: result.summary.length,
      });
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
      const startTime = Date.now();
      
      const summary = await this.openRouterService.complete(messages, {
        temperature: 0.3,
        maxTokens: 200,
      });
      
      const duration = Date.now() - startTime;
      
      logger.agent('Summarizer', 'Single result summary generated', {
        summaryId,
        duration,
        summaryLength: summary.length,
        stepTitle: result.step.title,
      });

      return summary.trim();
    } catch (error) {
      logger.error('Error generating summary', error, {
        summaryId,
        stepTitle: result.step.title,
      });
      
      logger.info('Using fallback summary', { summaryId });
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
    const summaryId = `multi_summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.agent('Summarizer', 'Starting multiple results summary', {
      summaryId,
      resultsCount: results.length,
      question: question.substring(0, 100),
      stepTitles: results.map(r => r.step.title),
    });
    
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
      const startTime = Date.now();
      
      const summary = await this.openRouterService.complete(messages, {
        temperature: 0.3,
        maxTokens: 300,
      });
      
      const duration = Date.now() - startTime;
      
      logger.agent('Summarizer', 'Multiple results summary generated', {
        summaryId,
        duration,
        summaryLength: summary.length,
        resultsCount: results.length,
      });

      return summary.trim();
    } catch (error) {
      logger.error('Error generating combined summary', error, {
        summaryId,
        resultsCount: results.length,
      });
      
      logger.info('Using fallback summaries', { summaryId });
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
    const enhanceId = `enhance_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.debug('Attempting to enhance summary', {
      enhanceId,
      existingLength: existingSummary.length,
      isGoodLength: existingSummary.length > 20 && existingSummary.length < 200,
    });
    
    // If summary is already good, return it
    if (existingSummary.length > 20 && existingSummary.length < 200) {
      logger.debug('Summary already optimal, returning as-is', { enhanceId });
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
      const startTime = Date.now();
      
      const enhanced = await this.openRouterService.complete(messages, {
        temperature: 0.3,
        maxTokens: 200,
      });
      
      const duration = Date.now() - startTime;
      
      logger.debug('Summary enhanced', {
        enhanceId,
        duration,
        originalLength: existingSummary.length,
        enhancedLength: enhanced.length,
      });

      return enhanced.trim();
    } catch (error) {
      logger.error('Failed to enhance summary', error, { enhanceId });
      return existingSummary;
    }
  }

  /**
   * Generate a fallback summary when API fails
   */
  private getFallbackSummary(result: ExecutionResult): string {
    logger.debug('Generating fallback summary', {
      stepTitle: result.step.title,
      provider: result.provider,
      hasError: !!result.error,
      hasData: !!result.data,
    });
    
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
    return `## 1. TASK CONTEXT
You are The Alpha Oracle, a premier financial analyst AI providing comprehensive market analysis to traders and investors.
Your role is to analyze the provided financial data and deliver accurate, data-driven insights.

## 2. TONE CONTEXT
- Professional and authoritative yet accessible
- Data-driven and factual
- Neutral and objective (no investment advice)
- Clear and concise

## 3. BACKGROUND DATA AND CONTEXT
You have been provided with REAL, CURRENT MARKET DATA that includes:
- Stock quotes with prices, changes, and percentages
- Financial metrics (market cap, P/E ratios, volumes)
- Latest news articles with titles and summaries
- Market movers (gainers/losers)
- Chart data when available

This data has been gathered from:
- Financial Modeling Prep (FMP) for market data
- Brave Search for news and web results
- Real-time market feeds

## 4. DETAILED TASK DESCRIPTION & RULES

YOUR PRIMARY TASK: Analyze the provided data and answer the user's question using ONLY the specific data given.

CRITICAL RULES:
1. **USE THE PROVIDED DATA** - Never say "data was not provided" or "I would need data"
2. **Be specific** - Quote exact prices, percentages, and metrics from the data
3. **Reference sources** - Mention which data points come from which sources
4. **Stay factual** - Only state what the data shows, no speculation
5. **Format clearly** - Use markdown for readability

DATA USAGE REQUIREMENTS:
- When stock prices are provided → Report the exact prices and changes
- When news is provided → Reference specific headlines and key points
- When metrics are provided → Include the actual numbers
- When comparisons are requested → Use the data to show differences

## 5. EXAMPLES

Example of GOOD response:
"Based on the provided data, NVDA is currently trading at $890.25, up +4.5% today. The latest news shows strong momentum with the Spectrum-XGS Ethernet launch. Market cap stands at $2.2T with a P/E ratio of 65.4."

Example of BAD response:
"I notice you mentioned gathering data, but the data content appears to be empty. I would need specific metrics to provide analysis."

## 6. CONVERSATION HISTORY CONTEXT
Previous messages and context will be provided if relevant to maintain continuity.

## 7. IMMEDIATE TASK
Analyze the financial data provided below and answer: ${question}

## 8. THINKING APPROACH
Take a systematic approach:
1. First, identify what data has been provided
2. Extract key metrics and facts
3. Organize the information logically
4. Present a comprehensive answer using the data

## 9. OUTPUT FORMATTING
Structure your response with:
- Clear headings using ## for main sections
- Bullet points for key metrics
- **Bold** for important numbers
- Tables when comparing multiple items
- Proper markdown throughout

## 10. RESPONSE FRAMEWORK
Begin your response by immediately using the provided data. Never question whether data exists - it has been provided in the context below.`;
  }

  /**
   * Generate the final answer based on all execution results
   */
  async generateFinalAnswer(
    question: string,
    results: ExecutionResult[],
    conversationHistory: ChatMessage[] = []
  ): Promise<AsyncGenerator<string, void, unknown>> {
    const answerId = `answer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.agent('Summarizer', 'Starting final answer generation', {
      answerId,
      question: question.substring(0, 100),
      resultsCount: results.length,
      conversationHistoryLength: conversationHistory.length,
      stepTitles: results.map(r => r.step.title),
    });
    
    // Build comprehensive context from all results - including actual data
    const context = results
      .map((r, index) => {
        let content = `### Data Source ${index + 1}: ${r.step.title}\n`;
        content += `**Provider:** ${r.provider}\n\n`;
        
        // Add the actual data first
        if (r.data) {
          // Format data based on provider type
          if (r.provider === 'fmp_quote') {
            const quote = r.data as FMPQuote;
            content += `**STOCK QUOTE DATA FOR ${quote.symbol}:**\n`;
            content += `- Current Price: $${quote.price?.toFixed(2)}\n`;
            content += `- Change Today: ${quote.change > 0 ? '+' : ''}${quote.change?.toFixed(2)} (${quote.changesPercentage > 0 ? '+' : ''}${quote.changesPercentage?.toFixed(2)}%)\n`;
            content += `- Day Range: $${quote.dayLow?.toFixed(2)} - $${quote.dayHigh?.toFixed(2)}\n`;
            content += `- 52 Week Range: $${quote.yearLow?.toFixed(2)} - $${quote.yearHigh?.toFixed(2)}\n`;
            content += `- Market Cap: $${quote.marketCap?.toLocaleString()}\n`;
            content += `- Volume: ${quote.volume?.toLocaleString()} shares\n`;
            content += `- Avg Volume: ${quote.avgVolume?.toLocaleString()} shares\n`;
            if (quote.pe) content += `- P/E Ratio: ${quote.pe.toFixed(2)}\n`;
            if (quote.eps) content += `- EPS: $${quote.eps.toFixed(2)}\n`;
            if (quote.previousClose) content += `- Previous Close: $${quote.previousClose.toFixed(2)}\n`;
            if (quote.open) content += `- Today's Open: $${quote.open.toFixed(2)}\n`;
          } else if (r.provider === 'brave_news') {
            const news = r.data as BraveNewsResult[];
            content += `**NEWS DATA (${news.length} articles found):**\n\n`;
            news.slice(0, 5).forEach((article, i) => {
              content += `Article ${i + 1}:\n`;
              content += `- Title: **${article.title}**\n`;
              content += `- Summary: ${article.description || 'No description'}\n`;
              content += `- Source: ${article.url}\n`;
              content += `- Time: ${article.age || 'Recent'}\n\n`;
            });
          } else if (r.provider === 'brave_web') {
            const web = r.data as BraveWebResult[];
            content += `**WEB SEARCH RESULTS (${web.length} found):**\n\n`;
            web.slice(0, 5).forEach((result, i) => {
              content += `Result ${i + 1}:\n`;
              content += `- Title: **${result.title}**\n`;
              content += `- Description: ${result.description}\n`;
              content += `- URL: ${result.url}\n\n`;
            });
          } else if (r.provider === 'fmp_chart') {
            const candles = r.data as FMPCandle[];
            if (candles.length > 0) {
              content += `Chart Data (${candles.length} data points):\n`;
              // Show recent data points
              const recent = candles.slice(0, 5);
              recent.forEach(candle => {
                content += `- ${candle.date}: Open $${candle.open.toFixed(2)}, Close $${candle.close.toFixed(2)}, `;
                content += `High $${candle.high.toFixed(2)}, Low $${candle.low.toFixed(2)}\n`;
              });
            }
          } else if (r.provider === 'fmp_movers') {
            const moversData = r.data as { gainers?: FMPQuote[]; losers?: FMPQuote[]; actives?: FMPQuote[] };
            
            // Handle gainers
            if (moversData.gainers && Array.isArray(moversData.gainers) && moversData.gainers.length > 0) {
              content += `**Top Gainers:**\n`;
              moversData.gainers.slice(0, 5).forEach((mover, i) => {
                content += `${i + 1}. ${mover.symbol}: $${mover.price?.toFixed(2)} (+${mover.changesPercentage?.toFixed(2)}%)\n`;
              });
              content += '\n';
            }
            
            // Handle losers
            if (moversData.losers && Array.isArray(moversData.losers) && moversData.losers.length > 0) {
              content += `**Top Losers:**\n`;
              moversData.losers.slice(0, 5).forEach((mover, i) => {
                content += `${i + 1}. ${mover.symbol}: $${mover.price?.toFixed(2)} (${mover.changesPercentage?.toFixed(2)}%)\n`;
              });
              content += '\n';
            }
            
            // Handle actives if present
            if (moversData.actives && Array.isArray(moversData.actives) && moversData.actives.length > 0) {
              content += `**Most Active:**\n`;
              moversData.actives.slice(0, 5).forEach((mover, i) => {
                const changeSymbol = mover.changesPercentage > 0 ? '+' : '';
                content += `${i + 1}. ${mover.symbol}: $${mover.price?.toFixed(2)} (${changeSymbol}${mover.changesPercentage?.toFixed(2)}%)\n`;
              });
            }
          } else {
            // Generic data display
            const dataStr = JSON.stringify(r.data, null, 2);
            if (dataStr.length > 2000) {
              content += `Data: ${dataStr.substring(0, 2000)}...\n`;
            } else {
              content += `Data: ${dataStr}\n`;
            }
          }
        }
        
        // Add summary if available
        if (r.summary) {
          content += `\nSummary: ${r.summary}\n`;
        } else if (r.error) {
          content += `\nError: ${r.error}\n`;
        }
        
        return content;
      })
      .join('\n---\n\n');
    
    logger.debug('Answer context prepared', {
      answerId,
      contextLength: context.length,
      resultsWithData: results.filter(r => !!r.data).length,
      resultsWithSummary: results.filter(r => !!r.summary).length,
      resultsWithError: results.filter(r => !!r.error).length,
    });

    const messages: ChatMessage[] = [
      {
        role: 'developer',
        content: this.getAnswerPrompt(question),
      },
      ...conversationHistory,
      {
        role: 'user',
        content: `## MARKET DATA COLLECTED

${context}

## YOUR ANALYSIS TASK

Using ONLY the specific data provided above, answer this question: **${question}**

Remember:
- USE the exact prices, percentages, and metrics shown above
- REFERENCE specific news headlines and data points
- NEVER say "data was not provided" - it's all above
- BE specific with numbers and sources`,
      },
    ];

    logger.info('Starting answer stream generation', {
      answerId,
      messagesCount: messages.length,
      totalContextLength: messages.reduce((acc, m) => acc + m.content.length, 0),
    });

    // Stream the response
    const startTime = Date.now();
    let tokenCount = 0;
    
    const stream = this.openRouterService.streamComplete(messages, {
      temperature: 0.2,
      maxTokens: 16000,
      onToken: () => {
        tokenCount++;
        if (tokenCount % 50 === 0) {
          logger.debug('Answer streaming progress', {
            answerId,
            tokensStreamed: tokenCount,
            elapsedTime: Date.now() - startTime,
          });
        }
      },
    });
    
    // Wrap the stream to add logging
    async function* loggedStream() {
      try {
        for await (const chunk of stream) {
          yield chunk;
        }
        
        const duration = Date.now() - startTime;
        logger.agent('Summarizer', 'Final answer generation completed', {
          answerId,
          duration,
          totalTokens: tokenCount,
          averageTokensPerSecond: Math.round(tokenCount / (duration / 1000)),
        });
      } catch (error) {
        logger.error('Error during answer streaming', error, {
          answerId,
          tokensStreamedBeforeError: tokenCount,
        });
        throw error;
      }
    }
    
    return loggedStream();
  }
}

/**
 * Factory function to create a summarizer
 */
export function createSummarizer(
  openRouterApiKey: string,
  model?: string
): Summarizer {
  logger.info('Creating Summarizer', {
    model: model || 'anthropic/claude-sonnet-4',
    hasApiKey: !!openRouterApiKey,
  });
  return new Summarizer(openRouterApiKey, model);
}