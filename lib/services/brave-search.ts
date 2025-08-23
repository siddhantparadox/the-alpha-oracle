// Based on official Brave Search API documentation
// Web Search: https://api.search.brave.com/res/v1/web/search
// News Search: https://api.search.brave.com/res/v1/news/search

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
    if (!this.apiKey) {
      throw new Error('Brave Search API key is required');
    }
  }

  /**
   * Search for news articles using the dedicated news endpoint
   */
  async searchNews(
    query: string,
    options: BraveSearchOptions = {}
  ): Promise<BraveNewsResult[]> {
    const params = new URLSearchParams({
      q: query,
      count: (options.count || 10).toString(),
      offset: (options.offset || 0).toString(),
      country: options.country || 'US',
      search_lang: options.search_lang || 'en',
      safesearch: options.safesearch || 'moderate',
      spellcheck: (options.spellcheck !== false).toString(),
      ...(options.freshness && { freshness: options.freshness }),
    });

    const response = await fetch(`${BRAVE_BASE_URL}/news/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brave News API error: ${response.status} - ${error}`);
    }

    const data: BraveNewsResponse = await response.json();
    return data.results || [];
  }

  /**
   * Search the web for general information
   */
  async searchWeb(
    query: string,
    options: BraveSearchOptions = {}
  ): Promise<BraveWebResult[]> {
    const params = new URLSearchParams({
      q: query,
      count: Math.min(options.count || 10, 20).toString(), // Max 20 for web
      offset: (options.offset || 0).toString(),
      country: options.country || 'US',
      search_lang: options.search_lang || 'en',
      safesearch: options.safesearch || 'moderate',
      spellcheck: (options.spellcheck !== false).toString(),
      result_filter: 'web', // Only get web results
      ...(options.freshness && { freshness: options.freshness }),
    });

    const response = await fetch(`${BRAVE_BASE_URL}/web/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brave Web API error: ${response.status} - ${error}`);
    }

    const data: BraveWebSearchResponse = await response.json();
    return data.web?.results || [];
  }

  /**
   * Combined search for both news and web from the web endpoint
   */
  async searchAll(
    query: string,
    options: BraveSearchOptions = {}
  ): Promise<{
    news: BraveNewsResult[];
    web: BraveWebResult[];
  }> {
    const params = new URLSearchParams({
      q: query,
      count: Math.min(options.count || 10, 20).toString(),
      offset: (options.offset || 0).toString(),
      country: options.country || 'US',
      search_lang: options.search_lang || 'en',
      safesearch: options.safesearch || 'moderate',
      spellcheck: (options.spellcheck !== false).toString(),
      result_filter: 'web,news', // Get both web and news
      ...(options.freshness && { freshness: options.freshness }),
    });

    const response = await fetch(`${BRAVE_BASE_URL}/web/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brave API error: ${response.status} - ${error}`);
    }

    const data: BraveWebSearchResponse = await response.json();
    
    return {
      news: data.news?.results || [],
      web: data.web?.results || [],
    };
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
    // Search for financial news and info about the ticker
    const [newsResults, webResults] = await Promise.all([
      this.searchNews(`${ticker} stock financial`, { 
        count: 8, 
        freshness: 'pd' // Past day for latest news
      }),
      this.searchWeb(`${ticker} company stock price`, { 
        count: 5 
      })
    ]);

    // Try to extract company info from web results
    const financialSites = ['yahoo.com', 'marketwatch.com', 'bloomberg.com', 'reuters.com', 'finance.yahoo.com'];
    const relevantResult = webResults.find(r => 
      financialSites.some(site => r.url.includes(site))
    );

    const companyInfo = relevantResult ? {
      ticker: ticker.toUpperCase(),
      source: relevantResult.url,
      description: relevantResult.description,
    } : undefined;

    return {
      news: newsResults,
      web: webResults,
      companyInfo,
    };
  }

  /**
   * Search for market events and economic data
   */
  async searchMarketEvents(
    topic: string = 'stock market today'
  ): Promise<BraveNewsResult[]> {
    return this.searchNews(topic, {
      count: 15,
      freshness: 'pd', // Past day for latest market events
    });
  }

  /**
   * Format news items for display in markdown
   */
  static formatNewsItems(items: BraveNewsResult[], maxItems: number = 5): string {
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

    return { headlines, sources, summary };
  }
}

/**
 * Factory function to create Brave Search service
 */
export function createBraveSearchService(apiKey?: string): BraveSearchService {
  return new BraveSearchService(apiKey);
}