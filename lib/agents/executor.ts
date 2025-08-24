import { PlanStep } from '../store/api-keys';
import { BraveSearchService } from '../services/brave-search';
import { FMPService } from '../services/fmp';
import { PolygonService } from '../services/polygon';
import logger from '../utils/logger';

export interface ExecutionResult {
  step: PlanStep;
  provider: 'brave_news' | 'brave_web' | 'fmp_quote' | 'fmp_chart' | 'fmp_movers' | 'polygon_quote' | 'polygon_news' | 'polygon_aggregates' | 'combined';
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
  private polygonService: PolygonService;

  constructor(braveApiKey?: string, fmpApiKey?: string, polygonApiKey?: string) {
    this.braveSearch = new BraveSearchService(braveApiKey);
    this.fmpService = new FMPService(fmpApiKey);
    this.polygonService = new PolygonService(polygonApiKey);
    
    logger.agent('Executor', 'Agent initialized', {
      hasBraveKey: !!braveApiKey,
      hasFMPKey: !!fmpApiKey,
      hasPolygonKey: !!polygonApiKey,
      fmpAvailable: this.fmpService.isAvailable(),
      polygonAvailable: this.polygonService.isAvailable(),
    });
  }

  /**
   * Execute a single plan step
   */
  async executeStep(step: PlanStep, context?: string): Promise<ExecutionResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const { title, description } = step;
    const combinedText = `${title} ${description} ${context || ''}`.toLowerCase();
    
    logger.agent('Executor', 'Starting step execution', {
      executionId,
      stepTitle: title,
      stepDescription: description,
      hasContext: !!context,
    });

    try {
      const startTime = Date.now();
      
      // Detect ticker symbols - search in original case-sensitive text
      const originalText = `${title} ${description} ${context || ''}`;
      // Improved regex: 2-5 uppercase letters, avoiding common single letters and words
      const tickerMatch = originalText.match(/\b[A-Z]{2,5}\b/g);
      const commonWords = ['AI', 'IT', 'US', 'UK', 'EU', 'CEO', 'CFO', 'CTO', 'IPO', 'ETF', 'API', 'URL', 'USD', 'NYSE', 'NASDAQ'];
      const filteredTickers = tickerMatch ?
        [...new Set(tickerMatch)].filter(ticker => !commonWords.includes(ticker)) : [];
      const tickers = filteredTickers;
      const primaryTicker = tickers[0];
      
      logger.debug('Ticker detection', {
        executionId,
        foundTickers: tickers,
        primaryTicker,
      });

      let result: ExecutionResult;
      
      // Determine the best provider based on step content
      if (this.needsMarketMovers(combinedText)) {
        logger.info('Executing market movers step', { executionId });
        result = await this.executeMarketMoversStep(step, combinedText);
      }
      else if (this.needsQuoteData(combinedText) && primaryTicker) {
        logger.info('Executing quote step', { executionId, ticker: primaryTicker });
        result = await this.executeQuoteStep(step, primaryTicker);
      }
      else if (this.needsChartData(combinedText) && primaryTicker) {
        logger.info('Executing chart step', { executionId, ticker: primaryTicker });
        result = await this.executeChartStep(step, primaryTicker);
      }
      else if (this.needsNewsData(combinedText)) {
        if (primaryTicker) {
          logger.info('Executing ticker news step', { executionId, ticker: primaryTicker });
          result = await this.executeTickerNewsStep(step, primaryTicker);
        } else {
          logger.info('Executing general news step', { executionId });
          result = await this.executeGeneralNewsStep(step, combinedText);
        }
      }
      else if (this.needsWebSearch(combinedText)) {
        logger.info('Executing web search step', { executionId });
        result = await this.executeWebSearchStep(step, combinedText);
      }
      else if (primaryTicker) {
        logger.info('Executing combined ticker step', { executionId, ticker: primaryTicker });
        result = await this.executeCombinedTickerStep(step, primaryTicker);
      }
      else {
        logger.info('Executing general search step', { executionId });
        result = await this.executeGeneralSearchStep(step, combinedText);
      }
      
      const duration = Date.now() - startTime;
      
      logger.agent('Executor', 'Step execution completed', {
        executionId,
        duration,
        stepTitle: title,
        provider: result.provider,
        hasData: !!result.data,
        hasError: !!result.error,
        dataSize: result.data ? JSON.stringify(result.data).length : 0,
      });
      
      return result;
    } catch (error) {
      logger.error(`Step execution failed for "${step.title}"`, error, {
        executionId,
        stepTitle: title,
      });
      
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
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.agent('Executor', 'Starting batch execution', {
      batchId,
      stepsCount: steps.length,
      stepTitles: steps.map(s => s.title),
    });
    
    const results: ExecutionResult[] = [];
    const batchStartTime = Date.now();

    for (let i = 0; i < steps.length; i++) {
      logger.info(`Executing step ${i + 1}/${steps.length}`, {
        batchId,
        stepIndex: i,
        stepTitle: steps[i].title,
      });
      
      const result = await this.executeStep(steps[i]);
      results.push(result);
      onProgress?.(result, i);
    }
    
    const batchDuration = Date.now() - batchStartTime;
    
    logger.agent('Executor', 'Batch execution completed', {
      batchId,
      duration: batchDuration,
      stepsCompleted: results.length,
      successfulSteps: results.filter(r => !r.error).length,
      failedSteps: results.filter(r => !!r.error).length,
    });

    return results;
  }

  private needsQuoteData(text: string): boolean {
    const quoteKeywords = ['price', 'quote', 'trading', 'volume', 'market cap', 'pe', 'eps', 'metrics'];
    const needs = quoteKeywords.some(keyword => text.includes(keyword));
    logger.debug('Quote data check', { needs, text: text.substring(0, 100) });
    return needs;
  }

  private needsChartData(text: string): boolean {
    const chartKeywords = ['chart', 'intraday', 'technical', 'graph', 'candlestick', '5min', '5 min'];
    const needs = chartKeywords.some(keyword => text.includes(keyword));
    logger.debug('Chart data check', { needs, text: text.substring(0, 100) });
    return needs;
  }

  private needsNewsData(text: string): boolean {
    const newsKeywords = ['news', 'article', 'report', 'announcement', 'headline', 'latest', 'recent'];
    const needs = newsKeywords.some(keyword => text.includes(keyword));
    logger.debug('News data check', { needs, text: text.substring(0, 100) });
    return needs;
  }

  private needsWebSearch(text: string): boolean {
    const webKeywords = ['company', 'about', 'website', 'info', 'search', 'find'];
    const needs = webKeywords.some(keyword => text.includes(keyword));
    logger.debug('Web search check', { needs, text: text.substring(0, 100) });
    return needs;
  }

  private needsMarketMovers(text: string): boolean {
    const moverKeywords = ['movers', 'gainers', 'losers', 'active', 'actives', 'top stocks', 'best performing', 'worst performing'];
    const needs = moverKeywords.some(keyword => text.includes(keyword));
    logger.debug('Market movers check', { needs, text: text.substring(0, 100) });
    return needs;
  }

  private async executeMarketMoversStep(step: PlanStep, query: string): Promise<ExecutionResult> {
    const stepId = `movers_${Date.now()}`;
    
    logger.info('Fetching market movers', { stepId });
    
    try {
      // Determine which movers to fetch
      const wantsGainers = query.includes('gainer') || query.includes('best') || query.includes('top');
      const wantsLosers = query.includes('loser') || query.includes('worst') || query.includes('down');
      const wantsActives = query.includes('active') || query.includes('volume');
      
      const [gainers, losers, actives] = await Promise.all([
        wantsGainers || (!wantsLosers && !wantsActives) ? this.fmpService.getTopGainers() : Promise.resolve([]),
        wantsLosers || (!wantsGainers && !wantsActives) ? this.fmpService.getTopLosers() : Promise.resolve([]),
        wantsActives ? this.fmpService.getMostActives() : Promise.resolve([]),
      ]);
      
      logger.info('Market movers retrieved', {
        stepId,
        gainersCount: gainers.length,
        losersCount: losers.length,
        activesCount: actives.length,
      });
      
      const data = {
        gainers: gainers.slice(0, 5),
        losers: losers.slice(0, 5),
        actives: actives.slice(0, 5),
      };
      
      let summary = '';
      if (gainers.length > 0) {
        summary += FMPService.formatMovers(gainers, 'Top Gainers', 5) + '\n\n';
      }
      if (losers.length > 0) {
        summary += FMPService.formatMovers(losers, 'Top Losers', 5) + '\n\n';
      }
      if (actives.length > 0) {
        summary += FMPService.formatMovers(actives, 'Most Active', 5);
      }
      
      return {
        step,
        provider: 'fmp_movers',
        data,
        summary: summary.trim() || 'No market movers data available',
      };
    } catch (error) {
      logger.error('Error fetching market movers', error, { stepId });
      
      // Fallback to news search
      const news = await this.braveSearch.searchNews('stock market movers today', {
        count: 10,
        freshness: 'pd',
      });
      
      return {
        step,
        provider: 'brave_news',
        data: news,
        summary: BraveSearchService.formatNewsItems(news, 5),
      };
    }
  }

  private async executeQuoteStep(step: PlanStep, ticker: string): Promise<ExecutionResult> {
    const stepId = `quote_${Date.now()}`;
    
    logger.info(`Fetching quote for ${ticker}`, { stepId, ticker });
    
    try {
      // Try Polygon first if available, then fallback to FMP
      if (this.polygonService.isAvailable()) {
        logger.info(`Trying Polygon for ${ticker} quote`, { stepId, ticker });
        
        const polygonQuote = await this.polygonService.getQuote(ticker);
        
        if (polygonQuote) {
          logger.info(`Polygon quote retrieved for ${ticker}`, {
            stepId,
            ticker,
            price: polygonQuote.last?.price,
          });
          
          return {
            step,
            provider: 'polygon_quote',
            data: polygonQuote,
            summary: PolygonService.formatQuote(polygonQuote),
          };
        }
        
        logger.info(`No Polygon quote for ${ticker}, trying FMP`, { stepId, ticker });
      }
      
      // Use lightweight quote if we only need basic data
      const needsFullQuote = step.description.includes('detail') || step.description.includes('metric');
      const quote = needsFullQuote
        ? await this.fmpService.getQuote(ticker)
        : await this.fmpService.getQuoteLight(ticker);
      
      if (!quote) {
        logger.info(`No quote data for ${ticker}, falling back to web search`, {
          stepId,
          ticker,
        });
        
        // Fallback to web search for quote info
        const webResults = await this.braveSearch.searchWeb(`${ticker} stock price quote`, {
          count: 5,
          freshness: 'pd',
        });
        
        logger.info('Quote fallback to web search completed', {
          stepId,
          ticker,
          resultsCount: webResults.length,
        });
        
        return {
          step,
          provider: 'brave_web',
          data: webResults,
          summary: `Found ${webResults.length} web results for ${ticker} stock information`,
        };
      }

      logger.info(`FMP quote retrieved for ${ticker}`, {
        stepId,
        ticker,
        price: quote.price,
        volume: quote.volume,
      });
      
      return {
        step,
        provider: 'fmp_quote',
        data: quote,
        summary: 'symbol' in quote && 'name' in quote && 'changesPercentage' in quote
          ? FMPService.formatQuote(quote as import('../services/fmp').FMPQuote)
          : `${ticker}: $${quote.price.toFixed(2)} (Volume: ${(quote.volume / 1000000).toFixed(2)}M)`,
      };
    } catch (error) {
      logger.error(`Error fetching quote for ${ticker}`, error, {
        stepId,
        ticker,
      });
      throw error;
    }
  }

  private async executeChartStep(step: PlanStep, ticker: string): Promise<ExecutionResult> {
    const stepId = `chart_${Date.now()}`;
    
    logger.info(`Fetching chart data for ${ticker}`, { stepId, ticker });
    
    const candles = await this.fmpService.getIntradayChart(ticker, '5min');
    
    if (!candles || candles.length === 0) {
      logger.info(`No chart data for ${ticker}, falling back to web search`, {
        stepId,
        ticker,
      });
      
      // Fallback to web search for chart info
      const webResults = await this.braveSearch.searchWeb(`${ticker} stock chart intraday`, {
        count: 5,
        freshness: 'pd',
      });
      
      return {
        step,
        provider: 'brave_web',
        data: webResults,
        summary: `Found ${webResults.length} web results for ${ticker} chart information`,
      };
    }

    logger.info(`Chart data retrieved for ${ticker}`, {
      stepId,
      ticker,
      candlesCount: candles.length,
      dateRange: candles.length > 0 ? {
        start: candles[0].date,
        end: candles[candles.length - 1].date,
      } : null,
    });

    return {
      step,
      provider: 'fmp_chart',
      data: candles,
      summary: FMPService.formatChartSummary(candles),
    };
  }

  private async executeTickerNewsStep(step: PlanStep, ticker: string): Promise<ExecutionResult> {
    const stepId = `ticker_news_${Date.now()}`;
    
    logger.info(`Fetching news for ${ticker}`, { stepId, ticker });
    
    try {
      // Try Polygon news first if available
      if (this.polygonService.isAvailable()) {
        logger.info(`Trying Polygon news for ${ticker}`, { stepId, ticker });
        
        const polygonNews = await this.polygonService.getNews({
          ticker,
          limit: 10,
          order: 'desc',
        });
        
        if (polygonNews.length > 0) {
          logger.info(`Polygon news retrieved for ${ticker}`, {
            stepId,
            ticker,
            newsCount: polygonNews.length,
          });
          
          return {
            step,
            provider: 'polygon_news',
            data: polygonNews,
            summary: PolygonService.formatNews(polygonNews, 5),
          };
        }
        
        logger.info(`No Polygon news for ${ticker}, trying Brave`, { stepId, ticker });
      }
      
      const news = await this.braveSearch.searchNews(`${ticker} stock`, {
        count: 10,
        freshness: 'pd', // Past day for latest news
      });
      
      logger.info(`Brave news retrieved for ${ticker}`, {
        stepId,
        ticker,
        newsCount: news.length,
        sources: [...new Set(news.slice(0, 5).map(n => n.meta_url?.hostname))],
      });
      
      return {
        step,
        provider: 'brave_news',
        data: news,
        summary: BraveSearchService.formatNewsItems(news, 5),
      };
    } catch (error) {
      logger.error(`Error fetching news for ${ticker}`, error, {
        stepId,
        ticker,
      });
      throw error;
    }
  }

  private async executeGeneralNewsStep(step: PlanStep, query: string): Promise<ExecutionResult> {
    const stepId = `general_news_${Date.now()}`;
    
    logger.info('Fetching general news', {
      stepId,
      query: query.substring(0, 100),
    });
    
    const freshness = /\btoday|now|latest|current|breaking\b/i.test(query) ? 'pd' : undefined;
    
    const news = await this.braveSearch.searchNews(query, {
      count: 10,
      freshness,
    });
    
    logger.info('General news retrieved', {
      stepId,
      newsCount: news.length,
      freshness,
    });
    
    return {
      step,
      provider: 'brave_news',
      data: news,
      summary: BraveSearchService.formatNewsItems(news, 5),
    };
  }

  private async executeWebSearchStep(step: PlanStep, query: string): Promise<ExecutionResult> {
    const stepId = `web_search_${Date.now()}`;
    
    logger.info('Executing web search', {
      stepId,
      query: query.substring(0, 100),
    });
    
    const freshness = /\btoday|now|latest|current\b/i.test(query) ? 'pd' : undefined;
    
    const webResults = await this.braveSearch.searchWeb(query, {
      count: 10,
      freshness,
    });
    
    logger.info('Web search completed', {
      stepId,
      resultsCount: webResults.length,
      freshness,
    });
    
    return {
      step,
      provider: 'brave_web',
      data: webResults,
      summary: BraveSearchService.formatWebResults(webResults, 5),
    };
  }

  private async executeCombinedTickerStep(step: PlanStep, ticker: string): Promise<ExecutionResult> {
    const stepId = `combined_${Date.now()}`;
    
    logger.info(`Executing combined data fetch for ${ticker}`, {
      stepId,
      ticker,
    });
    
    const [quote, news, web] = await Promise.all([
      this.fmpService.getQuoteLight(ticker), // Use light quote for combined
      this.braveSearch.searchNews(`${ticker} stock`, {
        count: 8,
        freshness: 'pd',
      }),
      this.braveSearch.searchWeb(`${ticker} company`, {
        count: 5,
        freshness: 'pd',
      }),
    ]);

    const combinedData = {
      quote,
      news: news.slice(0, 5),
      web: web.slice(0, 3),
    };
    
    logger.info(`Combined data retrieved for ${ticker}`, {
      stepId,
      ticker,
      hasQuote: !!quote,
      newsCount: news.length,
      webCount: web.length,
    });

    let summary = '';
    if (quote) {
      summary += `**Quote**: $${quote.price.toFixed(2)} (Volume: ${(quote.volume / 1000000).toFixed(2)}M)\n\n`;
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
    const stepId = `general_search_${Date.now()}`;
    
    logger.info('Executing general search', {
      stepId,
      query: query.substring(0, 100),
    });
    
    // Use the improved parallel search method
    const { news, web } = await this.braveSearch.searchBoth(query, {
      count: 10,
      freshness: /\btoday|now|latest|current\b/i.test(query) ? 'pd' : undefined
    });
    
    logger.info('General search completed', {
      stepId,
      newsCount: news.length,
      webCount: web.length,
    });

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
    const available = this.fmpService.isAvailable();
    logger.debug('FMP access check', { available });
    return available;
  }
}

/**
 * Factory function to create an executor
 */
export function createExecutor(braveApiKey?: string, fmpApiKey?: string, polygonApiKey?: string): Executor {
  logger.info('Creating Executor', {
    hasBraveKey: !!braveApiKey,
    hasFMPKey: !!fmpApiKey,
    hasPolygonKey: !!polygonApiKey,
  });
  return new Executor(braveApiKey, fmpApiKey, polygonApiKey);
}