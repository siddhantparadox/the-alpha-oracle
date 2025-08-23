// Based on official Brave Search API documentation
// Web Search: https://api.search.brave.com/res/v1/web/search
// News Search: https://api.search.brave.com/res/v1/news/search

import logger from '../utils/logger';
import { fetchJson, fetchWithRetry } from '../utils/http-client';

export interface BraveNewsResult {
  type: 'news_result';
  url: string;
  title: string;
  description?: string;
  age?: string;
  page_age?: string;
  page_fetched?: string;
  breaking?: boolean;
  thumbnail?: {
    src: string;
    original?: string;
  };
  meta_url?: {
    scheme?: string;
    netloc?: string;
    hostname?: string;
    favicon?: string;
    path?: string;
  };
  extra_snippets?: string[];
}

export interface BraveWebResult {
  title: string;
  url: string;
  description?: string;
  age?: string;
  language?: string;
  extra_snippets?: string[];
  meta_url?: {
    scheme?: string;
    netloc?: string;
    hostname?: string;
    favicon?: string;
    path?: string;
  };
}

export interface BraveSearchOptions {
  count?: number;
  offset?: number;
  freshness?: 'pd' | 'pw' | 'pm' | 'py'; // past day, week, month, year
  search_lang?: string;
  country?: string;
  safesearch?: 'off' | 'moderate' | 'strict';
  spellcheck?: boolean;
}

export interface BraveNewsResponse {
  type: 'news';
  query: {
    original: string;
    altered?: string;
    cleaned?: string;
    spellcheck_off?: boolean;
  };
  results: BraveNewsResult[];
}

export interface BraveVideoResult {
  type: 'video_result';
  url: string;
  title: string;
  description?: string;
  thumbnail?: {
    src: string;
  };
  duration?: string;
  creator?: string;
}

export interface BraveDiscussionResult {
  type: 'discussion_result';
  url: string;
  title: string;
  description?: string;
  forum_name?: string;
  num_answers?: number;
}

export interface BraveWebSearchResponse {
  type: 'search';
  query?: {
    original: string;
    altered?: string;
    cleaned?: string;
    spellcheck_off?: boolean;
  };
  web?: {
    type: 'web';
    results: BraveWebResult[];
  };
  news?: {
    type: 'news';
    results: BraveNewsResult[];
  };
  videos?: {
    type: 'videos';
    results: BraveVideoResult[];
  };
  discussions?: {
    type: 'discussions';
    results: BraveDiscussionResult[];
  };
}

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
const BRAVE_BASE_URL = 'https://api.search.brave.com/res/v1';

export class BraveSearchService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || BRAVE_API_KEY || '';
    
    logger.braveSearch('Service initialized', {
      hasApiKey: !!this.apiKey,
      apiKeySource: apiKey ? 'provided' : (BRAVE_API_KEY ? 'environment' : 'none'),
    });
    
    if (!this.apiKey) {
      logger.warn('Brave Search API key is missing', {
        providedKey: !!apiKey,
        envKey: !!BRAVE_API_KEY,
      });
      throw new Error('Brave Search API key is required');
    }
  }

  /**
   * Check if query wants recent/today information
   */
  private detectRecencyIntent(query: string): 'pd' | undefined {
    const wantsToday = /\b(today|now|latest|current|recent|breaking)\b/i.test(query);
    const freshness = wantsToday ? 'pd' : undefined;
    
    if (freshness) {
      logger.debug('Recency intent detected', {
        query: query.substring(0, 50),
        freshness,
      });
    }
    
    return freshness;
  }
  /**
   * Search for news articles using the dedicated news endpoint
   */
  async searchNews(
    query: string,
    options: BraveSearchOptions = {}
  ): Promise<BraveNewsResult[]> {
    const requestId = `brave_news_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    // Auto-detect freshness if not provided
    const freshness = options.freshness || this.detectRecencyIntent(query);
    
    const params = new URLSearchParams({
      q: query,
      count: (options.count || 10).toString(),
      offset: (options.offset || 0).toString(),
      country: options.country || 'US',
      search_lang: options.search_lang || 'en',
      safesearch: options.safesearch || 'moderate',
      spellcheck: (options.spellcheck !== false).toString(),
      ...(freshness && { freshness }),
    });

    const endpoint = `${BRAVE_BASE_URL}/news/search?${params}`;
    
    logger.braveSearch('News search request', {
      requestId,
      query,
      options: { ...options, freshness },
      endpoint,
    });
    
    logger.apiRequest('BraveSearch', 'GET', '/news/search', {
      query,
      count: options.count || 10,
      freshness,
    });

    try {
      const response = await fetchWithRetry(endpoint, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
        timeout: 4000,
        retries: 2,
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.text();
        logger.error('Brave News API error', new Error(error), {
          requestId,
          status: response.status,
          duration,
        });
        logger.apiResponse('BraveSearch', 'GET', '/news/search', response.status, error, duration);
        throw new Error(`Brave News API error: ${response.status} - ${error}`);
      }

      const data: BraveNewsResponse = await response.json();
      let results = data.results || [];
      
      // Optionally filter by page_fetched for extra recency
      if (freshness === 'pd' && results.length > 0) {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const filtered = results.filter(item => {
          if (!item.page_fetched) return true; // Keep if no date
          try {
            const fetchedTime = new Date(item.page_fetched).getTime();
            return fetchedTime >= oneDayAgo;
          } catch {
            return true; // Keep if date parsing fails
          }
        });
        
        if (filtered.length > 0) {
          logger.debug('Filtered news by recency', {
            requestId,
            original: results.length,
            filtered: filtered.length,
          });
          results = filtered;
        }
      }
      
      logger.braveSearch('News search successful', {
        requestId,
        duration,
        resultsCount: results.length,
        query: data.query,
        freshness,
      });
      
      logger.apiResponse('BraveSearch', 'GET', '/news/search', response.status, {
        resultsCount: results.length,
        hasAltered: !!data.query?.altered,
      }, duration);
      
      logger.data('News search results preview', {
        requestId,
        count: results.length,
        titles: results.slice(0, 3).map(r => r.title),
      });
      
      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Brave news search failed', error, {
        requestId,
        duration,
        query,
      });
      throw error;
    }
  }

  /**
   * Search the web for general information
   */
  async searchWeb(
    query: string,
    options: BraveSearchOptions = {}
  ): Promise<BraveWebResult[]> {
    const requestId = `brave_web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    // Auto-detect freshness if not provided
    const freshness = options.freshness || this.detectRecencyIntent(query);
    
    const params = new URLSearchParams({
      q: query,
      count: Math.min(options.count || 10, 20).toString(), // Max 20 for web
      offset: (options.offset || 0).toString(),
      country: options.country || 'US',
      search_lang: options.search_lang || 'en',
      safesearch: options.safesearch || 'moderate',
      spellcheck: (options.spellcheck !== false).toString(),
      result_filter: 'web', // Only get web results
      ...(freshness && { freshness }),
    });

    const endpoint = `${BRAVE_BASE_URL}/web/search?${params}`;
    
    logger.braveSearch('Web search request', {
      requestId,
      query,
      options: { ...options, freshness },
      endpoint,
    });
    
    logger.apiRequest('BraveSearch', 'GET', '/web/search', {
      query,
      count: Math.min(options.count || 10, 20),
      result_filter: 'web',
      freshness,
    });

    try {
      const response = await fetchWithRetry(endpoint, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
        timeout: 4000,
        retries: 2,
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.text();
        logger.error('Brave Web API error', new Error(error), {
          requestId,
          status: response.status,
          duration,
        });
        logger.apiResponse('BraveSearch', 'GET', '/web/search', response.status, error, duration);
        throw new Error(`Brave Web API error: ${response.status} - ${error}`);
      }

      const data: BraveWebSearchResponse = await response.json();
      const results = data.web?.results || [];
      
      logger.braveSearch('Web search successful', {
        requestId,
        duration,
        resultsCount: results.length,
        query: data.query,
        freshness,
      });
      
      logger.apiResponse('BraveSearch', 'GET', '/web/search', response.status, {
        resultsCount: results.length,
        hasAltered: !!data.query?.altered,
      }, duration);
      
      logger.data('Web search results preview', {
        requestId,
        count: results.length,
        urls: results.slice(0, 3).map(r => r.url),
      });
      
      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Brave web search failed', error, {
        requestId,
        duration,
        query,
      });
      throw error;
    }
  }

  /**
   * Search both news and web in parallel
   * This is the preferred method for getting both types of results
   */
  async searchBoth(
    query: string,
    options: BraveSearchOptions = {}
  ): Promise<{
    news: BraveNewsResult[];
    web: BraveWebResult[];
  }> {
    const requestId = `brave_both_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    logger.braveSearch('Parallel news and web search starting', {
      requestId,
      query,
      options,
    });
    
    try {
      // Call both endpoints in parallel
      const [news, web] = await Promise.all([
        this.searchNews(query, options),
        this.searchWeb(query, options),
      ]);
      
      const duration = Date.now() - startTime;
      
      logger.braveSearch('Parallel search completed', {
        requestId,
        duration,
        newsCount: news.length,
        webCount: web.length,
      });
      
      return { news, web };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Parallel search failed', error, {
        requestId,
        duration,
        query,
      });
      
      // Try to return partial results if one succeeded
      try {
        const news = await this.searchNews(query, options).catch(() => []);
        const web = await this.searchWeb(query, options).catch(() => []);
        return { news, web };
      } catch {
        throw error;
      }
    }
  }

  /**
   * Search for company/ticker information with financial focus
   */
  async searchCompany(ticker: string): Promise<{
    news: BraveNewsResult[];
    web: BraveWebResult[];
    companyInfo?: {
      ticker: string;
      source?: string;
      description?: string;
    };
  }> {
    const requestId = `brave_company_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    logger.braveSearch('Company search starting', {
      requestId,
      ticker: ticker.toUpperCase(),
    });
    
    try {
      // Search for financial news and info about the ticker in parallel
      const [news, web] = await Promise.all([
        this.searchNews(`${ticker} stock financial`, { 
          count: 8, 
          freshness: 'pd' // Past day for latest news
        }),
        this.searchWeb(`${ticker} company stock price`, { 
          count: 5,
          freshness: 'pd' // Recent price info
        })
      ]);

      // Try to extract company info from web results
      const financialSites = ['yahoo.com', 'marketwatch.com', 'bloomberg.com', 'reuters.com', 'finance.yahoo.com'];
      const relevantResult = web.find(r => 
        financialSites.some(site => r.url.includes(site))
      );

      const companyInfo = relevantResult ? {
        ticker: ticker.toUpperCase(),
        source: relevantResult.url,
        description: relevantResult.description,
      } : undefined;

      const duration = Date.now() - startTime;
      
      logger.braveSearch('Company search completed', {
        requestId,
        duration,
        ticker: ticker.toUpperCase(),
        newsCount: news.length,
        webCount: web.length,
        hasCompanyInfo: !!companyInfo,
        companyInfoSource: companyInfo?.source,
      });
      
      return {
        news,
        web,
        companyInfo,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Company search failed', error, {
        requestId,
        duration,
        ticker,
      });
      throw error;
    }
  }

  /**
   * Search for market events and economic data
   */
  async searchMarketEvents(
    topic: string = 'stock market today'
  ): Promise<BraveNewsResult[]> {
    const requestId = `brave_market_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.braveSearch('Market events search', {
      requestId,
      topic,
    });
    
    try {
      const results = await this.searchNews(topic, {
        count: 15,
        freshness: 'pd', // Past day for latest market events
      });
      
      logger.info('Market events search completed', {
        requestId,
        topic,
        resultsCount: results.length,
        breakingNews: results.filter(r => r.breaking).length,
      });
      
      return results;
    } catch (error) {
      logger.error('Market events search failed', error, {
        requestId,
        topic,
      });
      throw error;
    }
  }

  /**
   * Format news items for display in markdown
   */
  static formatNewsItems(items: BraveNewsResult[], maxItems: number = 5): string {
    logger.debug('Formatting news items', {
      totalItems: items.length,
      maxItems,
    });
    
    return items
      .slice(0, maxItems)
      .map((item, i) => {
        const source = item.meta_url?.hostname || 'Unknown Source';
        const age = item.age || 'Recent';
        return `${i + 1}. **[${item.title}](${item.url})**\n   _${source} • ${age}_\n   ${item.description || ''}`;
      })
      .join('\n\n');
  }

  /**
   * Format web results for display in markdown
   */
  static formatWebResults(results: BraveWebResult[], maxItems: number = 5): string {
    logger.debug('Formatting web results', {
      totalResults: results.length,
      maxItems,
    });
    
    return results
      .slice(0, maxItems)
      .map((result, i) => {
        const source = result.meta_url?.hostname || new URL(result.url).hostname;
        return `${i + 1}. **[${result.title}](${result.url})**\n   _${source}_\n   ${result.description || ''}`;
      })
      .join('\n\n');
  }

  /**
   * Extract key information from search results
   */
  static extractKeyInfo(
    news: BraveNewsResult[], 
    web: BraveWebResult[]
  ): {
    headlines: string[];
    sources: string[];
    summary: string;
  } {
    const headlines = news.slice(0, 5).map(n => n.title);
    const sources = [...new Set([
      ...news.slice(0, 5).map(n => n.meta_url?.hostname).filter(Boolean),
      ...web.slice(0, 3).map(w => w.meta_url?.hostname).filter(Boolean),
    ])] as string[];

    const summary = `Found ${news.length} news articles and ${web.length} web results. Top sources: ${sources.slice(0, 3).join(', ')}`;
    
    logger.debug('Extracted key info', {
      headlinesCount: headlines.length,
      sourcesCount: sources.length,
      newsCount: news.length,
      webCount: web.length,
    });

    return { headlines, sources, summary };
  }
}

/**
 * Factory function to create Brave Search service
 */
export function createBraveSearchService(apiKey?: string): BraveSearchService {
  logger.info('Creating Brave Search service', {
    hasApiKey: !!apiKey,
    usingEnvKey: !apiKey && !!BRAVE_API_KEY,
  });
  return new BraveSearchService(apiKey);
}