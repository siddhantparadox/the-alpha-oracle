import { PlanStep } from '../store/api-keys';
import { BraveSearchService } from '../services/brave-search';
import { FMPService } from '../services/fmp';

export interface ExecutionResult {
  step: PlanStep;
  provider: 'brave_news' | 'brave_web' | 'fmp_quote' | 'fmp_chart' | 'combined';
  data: unknown;
  summary?: string;
  error?: string;
}

/**
 * Executor that runs plan steps using appropriate data providers
 */
export class Executor {
  private braveSearch: BraveSearchService;
  private fmpService: FMPService;

  constructor(braveApiKey?: string, fmpApiKey?: string) {
    this.braveSearch = new BraveSearchService(braveApiKey);
    this.fmpService = new FMPService(fmpApiKey);
  }

  /**
   * Execute a single plan step
   */
  async executeStep(step: PlanStep, context?: string): Promise<ExecutionResult> {
    const { title, description } = step;
    const combinedText = `${title} ${description} ${context || ''}`.toLowerCase();

    try {
      // Detect ticker symbols
      const tickerMatch = combinedText.match(/\b[A-Z]{1,5}\b/g);
      const tickers = tickerMatch ? [...new Set(tickerMatch)] : [];
      const primaryTicker = tickers[0];

      // Determine the best provider based on step content
      if (this.needsQuoteData(combinedText) && primaryTicker) {
        return await this.executeQuoteStep(step, primaryTicker);
      }

      if (this.needsChartData(combinedText) && primaryTicker) {
        return await this.executeChartStep(step, primaryTicker);
      }

      if (this.needsNewsData(combinedText)) {
        if (primaryTicker) {
          return await this.executeTickerNewsStep(step, primaryTicker);
        }
        return await this.executeGeneralNewsStep(step, combinedText);
      }

      if (this.needsWebSearch(combinedText)) {
        return await this.executeWebSearchStep(step, combinedText);
      }

      // Default: Combined search for comprehensive data
      if (primaryTicker) {
        return await this.executeCombinedTickerStep(step, primaryTicker);
      }

      return await this.executeGeneralSearchStep(step, combinedText);
    } catch (error) {
      console.error(`[Executor] Step execution failed for "${step.title}":`, error);
      return {
        step,
        provider: 'combined',
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Execute multiple steps in sequence
   */
  async executeSteps(
    steps: PlanStep[],
    onProgress?: (result: ExecutionResult, index: number) => void
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const result = await this.executeStep(steps[i]);
      results.push(result);
      onProgress?.(result, i);
    }

    return results;
  }

  private needsQuoteData(text: string): boolean {
    const quoteKeywords = ['price', 'quote', 'trading', 'volume', 'market cap', 'pe', 'eps', 'metrics'];
    return quoteKeywords.some(keyword => text.includes(keyword));
  }

  private needsChartData(text: string): boolean {
    const chartKeywords = ['chart', 'intraday', 'technical', 'graph', 'candlestick', '5min', '5 min'];
    return chartKeywords.some(keyword => text.includes(keyword));
  }

  private needsNewsData(text: string): boolean {
    const newsKeywords = ['news', 'article', 'report', 'announcement', 'headline', 'latest', 'recent'];
    return newsKeywords.some(keyword => text.includes(keyword));
  }

  private needsWebSearch(text: string): boolean {
    const webKeywords = ['company', 'about', 'website', 'info', 'search', 'find'];
    return webKeywords.some(keyword => text.includes(keyword));
  }

  private async executeQuoteStep(step: PlanStep, ticker: string): Promise<ExecutionResult> {
    console.log(`[Executor] Fetching quote for ${ticker}`);
    try {
      const quote = await this.fmpService.getQuote(ticker);
      
      if (!quote) {
        console.log(`[Executor] No quote data for ${ticker}, falling back to web search`);
        // Fallback to web search for quote info
        const webResults = await this.braveSearch.searchWeb(`${ticker} stock price quote`);
        return {
          step,
          provider: 'brave_web',
          data: webResults,
          summary: `Found ${webResults.length} web results for ${ticker} stock information`,
        };
      }

      console.log(`[Executor] Got quote for ${ticker}:`, quote);
      return {
        step,
        provider: 'fmp_quote',
        data: quote,
        summary: FMPService.formatQuote(quote),
      };
    } catch (error) {
      console.error(`[Executor] Error fetching quote for ${ticker}:`, error);
      throw error;
    }
  }

  private async executeChartStep(step: PlanStep, ticker: string): Promise<ExecutionResult> {
    const candles = await this.fmpService.getIntradayChart(ticker, '5min');
    
    if (!candles || candles.length === 0) {
      // Fallback to web search for chart info
      const webResults = await this.braveSearch.searchWeb(`${ticker} stock chart intraday`);
      return {
        step,
        provider: 'brave_web',
        data: webResults,
        summary: `Found ${webResults.length} web results for ${ticker} chart information`,
      };
    }

    return {
      step,
      provider: 'fmp_chart',
      data: candles,
      summary: FMPService.formatChartSummary(candles),
    };
  }

  private async executeTickerNewsStep(step: PlanStep, ticker: string): Promise<ExecutionResult> {
    console.log(`[Executor] Fetching news for ${ticker}`);
    try {
      const news = await this.braveSearch.searchNews(`${ticker} stock`);
      console.log(`[Executor] Got ${news.length} news items for ${ticker}`);
      
      return {
        step,
        provider: 'brave_news',
        data: news,
        summary: BraveSearchService.formatNewsItems(news, 5),
      };
    } catch (error) {
      console.error(`[Executor] Error fetching news for ${ticker}:`, error);
      throw error;
    }
  }

  private async executeGeneralNewsStep(step: PlanStep, query: string): Promise<ExecutionResult> {
    const news = await this.braveSearch.searchNews(query);
    
    return {
      step,
      provider: 'brave_news',
      data: news,
      summary: BraveSearchService.formatNewsItems(news, 5),
    };
  }

  private async executeWebSearchStep(step: PlanStep, query: string): Promise<ExecutionResult> {
    const webResults = await this.braveSearch.searchWeb(query);
    
    return {
      step,
      provider: 'brave_web',
      data: webResults,
      summary: BraveSearchService.formatWebResults(webResults, 5),
    };
  }

  private async executeCombinedTickerStep(step: PlanStep, ticker: string): Promise<ExecutionResult> {
    const [quote, news, web] = await Promise.all([
      this.fmpService.getQuote(ticker),
      this.braveSearch.searchNews(`${ticker} stock`),
      this.braveSearch.searchWeb(`${ticker} company`),
    ]);

    const combinedData = {
      quote,
      news: news.slice(0, 5),
      web: web.slice(0, 3),
    };

    let summary = '';
    if (quote) {
      summary += `**Quote**: $${quote.price.toFixed(2)} (${quote.changesPercentage >= 0 ? '+' : ''}${quote.changesPercentage.toFixed(2)}%)\n\n`;
    }
    summary += `**News**: ${news.length} articles found\n`;
    summary += `**Web**: ${web.length} results found`;

    return {
      step,
      provider: 'combined',
      data: combinedData,
      summary,
    };
  }

  private async executeGeneralSearchStep(step: PlanStep, query: string): Promise<ExecutionResult> {
    const { news, web } = await this.braveSearch.searchAll(query);

    return {
      step,
      provider: 'combined',
      data: { news: news.slice(0, 5), web: web.slice(0, 5) },
      summary: `Found ${news.length} news articles and ${web.length} web results`,
    };
  }

  /**
   * Check if FMP service is available
   */
  hasFMPAccess(): boolean {
    return this.fmpService.isAvailable();
  }
}

/**
 * Factory function to create an executor
 */
export function createExecutor(braveApiKey?: string, fmpApiKey?: string): Executor {
  return new Executor(braveApiKey, fmpApiKey);
}