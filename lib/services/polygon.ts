// Polygon.io API Service
// Based on official Polygon.io API documentation
// Base URL: https://api.polygon.io

// Try different import approaches to debug the issue
import { restClient } from '@polygon.io/client-js';
// Alternative import for debugging
// const { restClient } = require('@polygon.io/client-js');
import logger from '../utils/logger';

export interface PolygonQuote {
  symbol: string;
  last: {
    price: number;
    size: number;
    exchange: number;
    timestamp: number;
  };
  min: {
    av: number; // average volume
    t: number;  // timestamp
    n: number;  // number of transactions
    o: number;  // open
    h: number;  // high
    l: number;  // low
    c: number;  // close
    v: number;  // volume
    vw: number; // volume weighted average price
  };
  prevDay: {
    o: number;  // previous day open
    h: number;  // previous day high
    l: number;  // previous day low
    c: number;  // previous day close
    v: number;  // previous day volume
    vw: number; // previous day volume weighted average price
  };
  updated: number;
}

export interface PolygonAggregate {
  c: number;  // close
  h: number;  // high
  l: number;  // low
  n: number;  // number of transactions
  o: number;  // open
  t: number;  // timestamp
  v: number;  // volume
  vw: number; // volume weighted average price
}

export interface PolygonTicker {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
  cik?: string;
  composite_figi?: string;
  share_class_figi?: string;
  last_updated_utc: string;
}

export interface PolygonTickerDetails {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
  description?: string;
  homepage_url?: string;
  total_employees?: number;
  list_date?: string;
  branding?: {
    logo_url?: string;
    icon_url?: string;
  };
  share_class_shares_outstanding?: number;
  weighted_shares_outstanding?: number;
  market_cap?: number;
}

export interface PolygonNews {
  id: string;
  publisher: {
    name: string;
    homepage_url: string;
    logo_url?: string;
    favicon_url?: string;
  };
  title: string;
  author?: string;
  published_utc: string;
  article_url: string;
  tickers: string[];
  image_url?: string;
  description?: string;
  keywords?: string[];
}

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export class PolygonService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || POLYGON_API_KEY || '';
    
    logger.info('Polygon service initialized', {
      hasApiKey: !!this.apiKey,
      apiKeySource: apiKey ? 'provided' : (POLYGON_API_KEY ? 'environment' : 'none'),
    });
    
    if (this.apiKey) {
      try {
        this.client = restClient(this.apiKey);
        
        // Debug the client structure
        logger.info('Polygon client created', {
          clientType: typeof this.client,
          clientKeys: Object.keys(this.client || {}),
          hasStocks: !!this.client?.stocks,
          hasReference: !!this.client?.reference,
          stocksType: typeof this.client?.stocks,
          stocksKeys: this.client?.stocks ? Object.keys(this.client.stocks) : [],
        });
      } catch (error) {
        logger.error('Failed to create Polygon client', error);
        this.client = null;
      }
    } else {
      this.client = null;
      logger.warn('Polygon API key not provided. Market data features will be limited.', {
        providedKey: !!apiKey,
        envKey: !!POLYGON_API_KEY,
      });
    }
  }

  /**
   * Check if Polygon service is available
   */
  isAvailable(): boolean {
    const available = !!this.apiKey;
    logger.debug('Polygon availability check', { available });
    return available;
  }

  /**
   * Get real-time quote for a stock symbol
   */
  async getQuote(symbol: string): Promise<PolygonQuote | null> {
    if (!this.isAvailable()) {
      logger.info('Polygon quote request skipped - no API key', { symbol });
      return null;
    }

    const requestId = `polygon_quote_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    logger.info('Polygon quote request', {
      requestId,
      symbol: symbol.toUpperCase(),
    });
    
    logger.apiRequest('Polygon', 'GET', '/v2/snapshot/locale/us/markets/stocks/tickers', {
      symbol: symbol.toUpperCase(),
    });

    try {
      // Check if the client has the expected structure
      if (!this.client.stocks || typeof this.client.stocks.lastTrade !== 'function') {
        logger.warn('Polygon stocks API not available - trying alternative approach', {
          requestId,
          hasStocks: !!this.client.stocks,
          hasLastTrade: !!(this.client.stocks && typeof this.client.stocks.lastTrade === 'function'),
          hasLastQuote: !!(this.client.stocks && typeof this.client.stocks.lastQuote === 'function'),
          clientMethods: Object.keys(this.client || {}),
          stocksMethods: this.client.stocks ? Object.keys(this.client.stocks) : [],
        });
        
        // Try alternative approach - maybe the client structure is different
        if (this.client && typeof this.client.get === 'function') {
          logger.info('Trying direct HTTP approach with Polygon client', { requestId, symbol });
          
          try {
            const response = await this.client.get(`/v2/last/trade/${symbol.toUpperCase()}`);
            const duration = Date.now() - startTime;
            
            if (response?.data?.results) {
              const trade = response.data.results;
              const polygonQuote: PolygonQuote = {
                symbol: symbol.toUpperCase(),
                last: {
                  price: trade.p || 0,
                  size: trade.s || 0,
                  exchange: trade.x || 0,
                  timestamp: trade.t || Date.now()
                },
                min: {
                  av: 0, t: Date.now(), n: 0, o: trade.p || 0, h: trade.p || 0,
                  l: trade.p || 0, c: trade.p || 0, v: trade.s || 0, vw: trade.p || 0
                },
                prevDay: { o: 0, h: 0, l: 0, c: 0, v: 0, vw: 0 },
                updated: Date.now()
              };
              
              logger.info('Polygon quote retrieved via HTTP approach', {
                requestId, duration, symbol: polygonQuote.symbol, price: polygonQuote.last.price,
              });
              
              return polygonQuote;
            }
          } catch (httpError) {
            logger.warn('HTTP approach also failed', { requestId, error: httpError });
          }
        }
        
        return null;
      }

      // Get last trade and quote data for the symbol using the expected SDK methods
      const [tradeResponse, quoteResponse] = await Promise.all([
        this.client.stocks.lastTrade(symbol.toUpperCase()),
        this.client.stocks.lastQuote(symbol.toUpperCase())
      ]);
      
      const duration = Date.now() - startTime;
      
      if (!tradeResponse?.results && !quoteResponse?.results) {
        logger.warn('No quote data found', {
          requestId,
          symbol,
          duration,
        });
        logger.apiResponse('Polygon', 'GET', '/v1/last/stocks', 200, null, duration);
        return null;
      }

      // Construct quote object from trade and quote data
      const trade = tradeResponse?.results;
      const quote = quoteResponse?.results;
      
      const polygonQuote: PolygonQuote = {
        symbol: symbol.toUpperCase(),
        last: {
          price: trade?.price || 0,
          size: trade?.size || 0,
          exchange: trade?.exchange || 0,
          timestamp: trade?.participant_timestamp || Date.now()
        },
        min: {
          av: 0,
          t: Date.now(),
          n: 0,
          o: trade?.price || 0,
          h: trade?.price || 0,
          l: trade?.price || 0,
          c: trade?.price || 0,
          v: trade?.size || 0,
          vw: trade?.price || 0
        },
        prevDay: {
          o: 0,
          h: 0,
          l: 0,
          c: 0,
          v: 0,
          vw: 0
        },
        updated: Date.now()
      };
      
      logger.info('Polygon quote retrieved successfully', {
        requestId,
        duration,
        symbol: polygonQuote.symbol,
        price: polygonQuote.last.price,
        hasTradeData: !!trade,
        hasQuoteData: !!quote,
      });
      
      logger.apiResponse('Polygon', 'GET', '/v1/last/stocks', 200, {
        symbol: polygonQuote.symbol,
        price: polygonQuote.last.price,
      }, duration);
      
      return polygonQuote;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching Polygon quote', error, {
        requestId,
        symbol,
        duration,
      });
      return null;
    }
  }

  /**
   * Get historical aggregates (bars) for a stock
   */
  async getAggregates(
    symbol: string,
    multiplier: number = 1,
    timespan: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year' = 'day',
    from: string,
    to: string,
    options: {
      adjusted?: boolean;
      sort?: 'asc' | 'desc';
      limit?: number;
    } = {}
  ): Promise<PolygonAggregate[]> {
    if (!this.isAvailable()) {
      logger.info('Polygon aggregates request skipped - no API key', { symbol, timespan, from, to });
      return [];
    }

    const requestId = `polygon_aggs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    logger.info('Polygon aggregates request', {
      requestId,
      symbol: symbol.toUpperCase(),
      multiplier,
      timespan,
      from,
      to,
      options,
    });
    
    logger.apiRequest('Polygon', 'GET', '/v2/aggs/ticker', {
      symbol: symbol.toUpperCase(),
      multiplier,
      timespan,
      from,
      to,
    });

    try {
      const response = await this.client.stocks.aggregates(
        symbol.toUpperCase(),
        multiplier,
        timespan,
        from,
        to,
        {
          adjusted: options.adjusted !== false,
          sort: options.sort || 'asc',
          limit: options.limit || 5000,
        }
      );
      
      const duration = Date.now() - startTime;
      
      if (!response || !response.results) {
        logger.warn('No aggregates data found', {
          requestId,
          symbol,
          timespan,
          duration,
        });
        return [];
      }

      const aggregates = response.results;
      
      logger.info('Polygon aggregates retrieved successfully', {
        requestId,
        duration,
        symbol,
        timespan,
        count: aggregates.length,
        dateRange: aggregates.length > 0 ? {
          start: new Date(aggregates[0].t).toISOString(),
          end: new Date(aggregates[aggregates.length - 1].t).toISOString(),
        } : null,
      });
      
      logger.apiResponse('Polygon', 'GET', '/v2/aggs/ticker', 200, {
        count: aggregates.length,
      }, duration);
      
      return aggregates;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching Polygon aggregates', error, {
        requestId,
        symbol,
        timespan,
        duration,
      });
      return [];
    }
  }

  /**
   * Get ticker details
   */
  async getTickerDetails(symbol: string): Promise<PolygonTickerDetails | null> {
    if (!this.isAvailable()) {
      logger.info('Polygon ticker details request skipped - no API key', { symbol });
      return null;
    }

    const requestId = `polygon_details_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    logger.info('Polygon ticker details request', {
      requestId,
      symbol: symbol.toUpperCase(),
    });
    
    logger.apiRequest('Polygon', 'GET', '/v3/reference/tickers', {
      symbol: symbol.toUpperCase(),
    });

    try {
      const response = await this.client.reference.tickerDetails(symbol.toUpperCase());
      const duration = Date.now() - startTime;
      
      if (!response || !response.results) {
        logger.warn('No ticker details found', {
          requestId,
          symbol,
          duration,
        });
        return null;
      }

      const details = response.results;
      
      logger.info('Polygon ticker details retrieved successfully', {
        requestId,
        duration,
        symbol: details.ticker,
        name: details.name,
        market: details.market,
        type: details.type,
      });
      
      logger.apiResponse('Polygon', 'GET', '/v3/reference/tickers', 200, {
        symbol: details.ticker,
        name: details.name,
      }, duration);
      
      return details;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching Polygon ticker details', error, {
        requestId,
        symbol,
        duration,
      });
      return null;
    }
  }

  /**
   * Search for tickers
   */
  async searchTickers(
    query: string,
    options: {
      type?: string;
      market?: 'stocks' | 'crypto' | 'fx' | 'otc';
      exchange?: string;
      active?: boolean;
      limit?: number;
    } = {}
  ): Promise<PolygonTicker[]> {
    if (!this.isAvailable()) {
      logger.info('Polygon ticker search skipped - no API key', { query });
      return [];
    }

    const requestId = `polygon_search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    logger.info('Polygon ticker search request', {
      requestId,
      query,
      options,
    });
    
    logger.apiRequest('Polygon', 'GET', '/v3/reference/tickers', {
      query,
      ...options,
    });

    try {
      const response = await this.client.reference.tickers({
        search: query,
        type: options.type,
        market: options.market || 'stocks',
        exchange: options.exchange,
        active: options.active !== false,
        limit: options.limit || 100,
      });
      
      const duration = Date.now() - startTime;
      
      if (!response || !response.results) {
        logger.warn('No ticker search results found', {
          requestId,
          query,
          duration,
        });
        return [];
      }

      const tickers = response.results;
      
      logger.info('Polygon ticker search successful', {
        requestId,
        duration,
        query,
        count: tickers.length,
        symbols: tickers.slice(0, 5).map((t: PolygonTicker) => t.ticker),
      });
      
      logger.apiResponse('Polygon', 'GET', '/v3/reference/tickers', 200, {
        count: tickers.length,
      }, duration);
      
      return tickers;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error searching Polygon tickers', error, {
        requestId,
        query,
        duration,
      });
      return [];
    }
  }

  /**
   * Get market news
   */
  async getNews(
    options: {
      ticker?: string;
      published_utc?: string;
      order?: 'asc' | 'desc';
      limit?: number;
    } = {}
  ): Promise<PolygonNews[]> {
    if (!this.isAvailable()) {
      logger.info('Polygon news request skipped - no API key', { options });
      return [];
    }

    const requestId = `polygon_news_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    logger.info('Polygon news request', {
      requestId,
      options,
    });
    
    logger.apiRequest('Polygon', 'GET', '/v2/reference/news', options);

    try {
      // Check if the client has the expected structure
      if (!this.client.reference || typeof this.client.reference.news !== 'function') {
        logger.warn('Polygon news API not available', {
          requestId,
          hasReference: !!this.client.reference,
          hasNewsMethod: !!(this.client.reference && typeof this.client.reference.news === 'function'),
          clientMethods: Object.keys(this.client || {}),
        });
        return [];
      }

      const response = await this.client.reference.news({
        ticker: options.ticker,
        'published_utc.gte': options.published_utc,
        order: options.order || 'desc',
        limit: options.limit || 50,
      });
      
      const duration = Date.now() - startTime;
      
      if (!response || !response.results) {
        logger.warn('No news data found', {
          requestId,
          options,
          duration,
        });
        return [];
      }

      const news = response.results;
      
      logger.info('Polygon news retrieved successfully', {
        requestId,
        duration,
        count: news.length,
        ticker: options.ticker,
        titles: news.slice(0, 3).map((n: PolygonNews) => n.title),
      });
      
      logger.apiResponse('Polygon', 'GET', '/v2/reference/news', 200, {
        count: news.length,
      }, duration);
      
      return news;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching Polygon news', error, {
        requestId,
        options,
        duration,
      });
      return [];
    }
  }

  /**
   * Format quote data for display
   */
  static formatQuote(quote: PolygonQuote): string {
    const price = quote.last?.price || 0;
    const prevClose = quote.prevDay?.c || 0;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    const changeIcon = change >= 0 ? '📈' : '📉';
    const changePrefix = change >= 0 ? '+' : '';
    
    logger.debug('Formatting Polygon quote', {
      symbol: quote.symbol,
      price,
      change,
      changePercent,
    });
    
    return `
**${quote.symbol}**
${changeIcon} **$${price.toFixed(2)}** ${changePrefix}${change.toFixed(2)} (${changePrefix}${changePercent.toFixed(2)}%)

📊 **Trading Data**
• Open: $${quote.min?.o?.toFixed(2) || 'N/A'}
• High: $${quote.min?.h?.toFixed(2) || 'N/A'}
• Low: $${quote.min?.l?.toFixed(2) || 'N/A'}
• Volume: ${quote.min?.v ? (quote.min.v / 1000000).toFixed(2) + 'M' : 'N/A'}
• VWAP: $${quote.min?.vw?.toFixed(2) || 'N/A'}

📈 **Previous Day**
• Open: $${quote.prevDay?.o?.toFixed(2) || 'N/A'}
• High: $${quote.prevDay?.h?.toFixed(2) || 'N/A'}
• Low: $${quote.prevDay?.l?.toFixed(2) || 'N/A'}
• Close: $${quote.prevDay?.c?.toFixed(2) || 'N/A'}
    `.trim();
  }

  /**
   * Format news items for display
   */
  static formatNews(news: PolygonNews[], maxItems: number = 5): string {
    logger.debug('Formatting Polygon news', {
      totalItems: news.length,
      maxItems,
    });
    
    return news
      .slice(0, maxItems)
      .map((item, i) => {
        const publishedDate = new Date(item.published_utc).toLocaleDateString();
        const tickers = item.tickers.slice(0, 3).join(', ');
        return `${i + 1}. **[${item.title}](${item.article_url})**\n   _${item.publisher.name} • ${publishedDate}${tickers ? ` • ${tickers}` : ''}_\n   ${item.description || ''}`;
      })
      .join('\n\n');
  }

  /**
   * Get comprehensive stock data combining quote, details, and recent news
   */
  async getStockSummary(symbol: string): Promise<{
    quote: PolygonQuote | null;
    details: PolygonTickerDetails | null;
    news: PolygonNews[];
    formatted: string;
  }> {
    if (!this.isAvailable()) {
      logger.info('Stock summary skipped - Polygon not available', { symbol });
      return {
        quote: null,
        details: null,
        news: [],
        formatted: 'Market data not available (Polygon API key required)',
      };
    }

    const requestId = `polygon_summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.info('Generating stock summary', {
      requestId,
      symbol: symbol.toUpperCase(),
    });

    const [quote, details, news] = await Promise.all([
      this.getQuote(symbol),
      this.getTickerDetails(symbol),
      this.getNews({ ticker: symbol, limit: 5 }),
    ]);

    let formatted = '';

    if (quote) {
      formatted += PolygonService.formatQuote(quote);
    }

    if (details) {
      formatted += `\n\n**Company Info**
• Name: ${details.name}
• Market: ${details.market}
• Type: ${details.type}
• Exchange: ${details.primary_exchange}`;

      if (details.description) {
        formatted += `\n\n**About**\n${details.description.slice(0, 200)}...`;
      }

      if (details.homepage_url) {
        formatted += `\n• Website: ${details.homepage_url}`;
      }

      if (details.total_employees) {
        formatted += `\n• Employees: ${details.total_employees.toLocaleString()}`;
      }
    }

    if (news.length > 0) {
      formatted += `\n\n**Recent News**\n${PolygonService.formatNews(news, 3)}`;
    }

    if (!quote && !details && news.length === 0) {
      formatted = `No data found for symbol: ${symbol}`;
    }
    
    logger.info('Stock summary generated', {
      requestId,
      symbol,
      hasQuote: !!quote,
      hasDetails: !!details,
      newsCount: news.length,
      summaryLength: formatted.length,
    });

    return { quote, details, news, formatted };
  }
}

/**
 * Factory function to create Polygon service
 */
export function createPolygonService(apiKey?: string): PolygonService {
  logger.info('Creating Polygon service', {
    hasApiKey: !!apiKey,
    usingEnvKey: !apiKey && !!POLYGON_API_KEY,
  });
  return new PolygonService(apiKey);
}