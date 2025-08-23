// Financial Modeling Prep API Service
// Based on official FMP API documentation
// Base URL: https://financialmodelingprep.com/api/v3/ and /stable/

import logger from '../utils/logger';
import { fetchJson, fetchWithRetry } from '../utils/http-client';

export interface FMPQuote {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  priceAvg50: number;
  priceAvg200: number;
  exchange: string;
  volume: number;
  avgVolume: number;
  open: number;
  previousClose: number;
  eps: number;
  pe: number;
  earningsAnnouncement?: string;
  sharesOutstanding: number;
  timestamp: number;
}

export interface FMPQuoteShort {
  symbol: string;
  price: number;
  volume: number;
}

export interface FMPCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FMPCompanyProfile {
  symbol: string;
  price: number;
  beta: number;
  volAvg: number;
  mktCap: number;
  lastDiv: number;
  range: string;
  changes: number;
  companyName: string;
  currency: string;
  cik: string;
  isin: string;
  cusip: string;
  exchange: string;
  exchangeShortName: string;
  industry: string;
  website: string;
  description: string;
  ceo: string;
  sector: string;
  country: string;
  fullTimeEmployees: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  dcfDiff?: number;
  dcf?: number;
  image: string;
  ipoDate: string;
  defaultImage: boolean;
}

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com';

export class FMPService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || FMP_API_KEY || '';
    this.baseUrl = FMP_BASE_URL;
    
    logger.fmp('Service initialized', {
      hasApiKey: !!this.apiKey,
      apiKeySource: apiKey ? 'provided' : (FMP_API_KEY ? 'environment' : 'none'),
      baseUrl: this.baseUrl,
    });
    
    // FMP is optional - if no key, methods will return null
    if (!this.apiKey) {
      logger.warn('FMP API key not provided. Stock data features will be limited.', {
        providedKey: !!apiKey,
        envKey: !!FMP_API_KEY,
      });
    }
  }

  /**
   * Check if FMP service is available
   */
  isAvailable(): boolean {
    const available = !!this.apiKey;
    logger.debug('FMP availability check', { available });
    return available;
  }

  /**
   * Get real-time quote for a stock symbol using stable endpoint
   */
  async getQuote(symbol: string): Promise<FMPQuote | null> {
    if (!this.isAvailable()) {
      logger.info('FMP quote request skipped - no API key', { symbol });
      return null;
    }

    const requestId = `fmp_quote_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}/stable/quote?symbol=${symbol.toUpperCase()}&apikey=${this.apiKey}`;
    
    logger.fmp('Quote request', {
      requestId,
      symbol: symbol.toUpperCase(),
      endpoint: endpoint.replace(this.apiKey, '[REDACTED]'),
    });
    
    logger.apiRequest('FMP', 'GET', '/stable/quote', {
      symbol: symbol.toUpperCase(),
    });

    try {
      const data = await fetchJson<FMPQuote[]>(endpoint);
      const duration = Date.now() - startTime;
      
      if (!data || data.length === 0) {
        logger.warn('No quote data found', {
          requestId,
          symbol,
          duration,
        });
        logger.apiResponse('FMP', 'GET', '/stable/quote', 200, null, duration);
        return null;
      }

      const quote = data[0];
      
      logger.fmp('Quote retrieved successfully', {
        requestId,
        duration,
        symbol: quote.symbol,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changesPercentage,
        volume: quote.volume,
      });
      
      logger.apiResponse('FMP', 'GET', '/stable/quote', 200, {
        symbol: quote.symbol,
        price: quote.price,
      }, duration);
      
      return quote;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching FMP quote', error, {
        requestId,
        symbol,
        duration,
      });
      return null;
    }
  }

  /**
   * Get lightweight quote (price and volume only) using quote-short endpoint
   */
  async getQuoteLight(symbol: string): Promise<FMPQuoteShort | null> {
    if (!this.isAvailable()) {
      logger.info('FMP quote-short request skipped - no API key', { symbol });
      return null;
    }

    const requestId = `fmp_quote_short_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}/stable/quote-short?symbol=${symbol.toUpperCase()}&apikey=${this.apiKey}`;
    
    logger.fmp('Quote-short request', {
      requestId,
      symbol: symbol.toUpperCase(),
    });

    try {
      const data = await fetchJson<FMPQuoteShort[]>(endpoint);
      const duration = Date.now() - startTime;
      
      if (!data || data.length === 0) {
        logger.warn('No quote-short data found', {
          requestId,
          symbol,
          duration,
        });
        return null;
      }

      const quote = data[0];
      
      logger.fmp('Quote-short retrieved successfully', {
        requestId,
        duration,
        symbol: quote.symbol,
        price: quote.price,
        volume: quote.volume,
      });
      
      return quote;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching FMP quote-short', error, {
        requestId,
        symbol,
        duration,
      });
      return null;
    }
  }

  /**
   * Get top gainers
   */
  async getTopGainers(): Promise<FMPQuote[]> {
    if (!this.isAvailable()) {
      logger.info('FMP gainers request skipped - no API key');
      return [];
    }

    const requestId = `fmp_gainers_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}/api/v3/stock_market/gainers?apikey=${this.apiKey}`;
    
    logger.fmp('Top gainers request', { requestId });
    logger.apiRequest('FMP', 'GET', '/api/v3/stock_market/gainers', {});

    try {
      const data = await fetchJson<FMPQuote[]>(endpoint);
      const duration = Date.now() - startTime;
      
      if (!data) {
        logger.warn('No gainers data found', { requestId, duration });
        return [];
      }

      logger.fmp('Top gainers retrieved successfully', {
        requestId,
        duration,
        count: data.length,
        topSymbols: data.slice(0, 5).map(q => ({
          symbol: q.symbol,
          change: q.changesPercentage,
        })),
      });
      
      logger.apiResponse('FMP', 'GET', '/api/v3/stock_market/gainers', 200, {
        count: data.length,
      }, duration);
      
      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching FMP gainers', error, {
        requestId,
        duration,
      });
      return [];
    }
  }

  /**
   * Get top losers
   */
  async getTopLosers(): Promise<FMPQuote[]> {
    if (!this.isAvailable()) {
      logger.info('FMP losers request skipped - no API key');
      return [];
    }

    const requestId = `fmp_losers_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}/api/v3/stock_market/losers?apikey=${this.apiKey}`;
    
    logger.fmp('Top losers request', { requestId });
    logger.apiRequest('FMP', 'GET', '/api/v3/stock_market/losers', {});

    try {
      const data = await fetchJson<FMPQuote[]>(endpoint);
      const duration = Date.now() - startTime;
      
      if (!data) {
        logger.warn('No losers data found', { requestId, duration });
        return [];
      }

      logger.fmp('Top losers retrieved successfully', {
        requestId,
        duration,
        count: data.length,
        topSymbols: data.slice(0, 5).map(q => ({
          symbol: q.symbol,
          change: q.changesPercentage,
        })),
      });
      
      logger.apiResponse('FMP', 'GET', '/api/v3/stock_market/losers', 200, {
        count: data.length,
      }, duration);
      
      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching FMP losers', error, {
        requestId,
        duration,
      });
      return [];
    }
  }

  /**
   * Get most active stocks
   */
  async getMostActives(): Promise<FMPQuote[]> {
    if (!this.isAvailable()) {
      logger.info('FMP actives request skipped - no API key');
      return [];
    }

    const requestId = `fmp_actives_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}/api/v3/stock_market/actives?apikey=${this.apiKey}`;
    
    logger.fmp('Most actives request', { requestId });
    logger.apiRequest('FMP', 'GET', '/api/v3/stock_market/actives', {});

    try {
      const data = await fetchJson<FMPQuote[]>(endpoint);
      const duration = Date.now() - startTime;
      
      if (!data) {
        logger.warn('No actives data found', { requestId, duration });
        return [];
      }

      logger.fmp('Most actives retrieved successfully', {
        requestId,
        duration,
        count: data.length,
        topSymbols: data.slice(0, 5).map(q => ({
          symbol: q.symbol,
          volume: q.volume,
        })),
      });
      
      logger.apiResponse('FMP', 'GET', '/api/v3/stock_market/actives', 200, {
        count: data.length,
      }, duration);
      
      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching FMP actives', error, {
        requestId,
        duration,
      });
      return [];
    }
  }

  /**
   * Get bulk quotes for multiple symbols
   */
  async getBulkQuotes(symbols: string[]): Promise<FMPQuote[]> {
    if (!this.isAvailable() || symbols.length === 0) {
      logger.info('FMP bulk quotes request skipped', {
        available: this.isAvailable(),
        symbolsCount: symbols.length,
      });
      return [];
    }

    const requestId = `fmp_bulk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    const symbolList = symbols.map(s => s.toUpperCase()).join(',');
    const endpoint = `${this.baseUrl}/stable/batch-quote?symbols=${symbolList}&apikey=${this.apiKey}`;
    
    logger.fmp('Bulk quotes request', {
      requestId,
      symbols: symbolList,
      symbolsCount: symbols.length,
      endpoint: endpoint.replace(this.apiKey, '[REDACTED]'),
    });
    
    logger.apiRequest('FMP', 'GET', '/stable/batch-quote', {
      symbolsCount: symbols.length,
      symbols: symbols.slice(0, 5), // Log first 5 symbols
    });

    try {
      const data = await fetchJson<FMPQuote[]>(endpoint);
      const duration = Date.now() - startTime;
      
      if (!data) {
        logger.warn('No bulk quotes data found', {
          requestId,
          symbolsCount: symbols.length,
          duration,
        });
        return [];
      }

      logger.fmp('Bulk quotes retrieved successfully', {
        requestId,
        duration,
        requestedCount: symbols.length,
        receivedCount: data.length,
        symbols: data.map((q: FMPQuote) => ({
          symbol: q.symbol,
          price: q.price,
          change: q.changesPercentage,
        })),
      });
      
      logger.apiResponse('FMP', 'GET', '/stable/batch-quote', 200, {
        quotesCount: data.length,
      }, duration);
      
      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching FMP bulk quotes', error, {
        requestId,
        symbolsCount: symbols.length,
        duration,
      });
      return [];
    }
  }

  /**
   * Get 5-minute intraday chart data using stable endpoint
   */
  async getIntradayChart(
    symbol: string, 
    interval: '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour' = '5min'
  ): Promise<FMPCandle[]> {
    if (!this.isAvailable()) {
      logger.info('FMP chart request skipped - no API key', { symbol, interval });
      return [];
    }

    const requestId = `fmp_chart_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}/stable/historical-chart/${interval}?symbol=${symbol.toUpperCase()}&apikey=${this.apiKey}`;
    
    logger.fmp('Intraday chart request', {
      requestId,
      symbol: symbol.toUpperCase(),
      interval,
      endpoint: endpoint.replace(this.apiKey, '[REDACTED]'),
    });
    
    logger.apiRequest('FMP', 'GET', `/stable/historical-chart/${interval}`, {
      symbol: symbol.toUpperCase(),
      interval,
    });

    try {
      const data = await fetchJson<FMPCandle[]>(endpoint);
      const duration = Date.now() - startTime;
      
      if (!data) {
        logger.warn('No chart data found', {
          requestId,
          symbol,
          interval,
          duration,
        });
        return [];
      }

      // Return last 100 candles for display (most recent first in API response)
      const candles = data.slice(0, 100).reverse();
      
      logger.fmp('Chart data retrieved successfully', {
        requestId,
        duration,
        symbol,
        interval,
        candlesCount: candles.length,
        dateRange: candles.length > 0 ? {
          start: candles[0].date,
          end: candles[candles.length - 1].date,
        } : null,
      });
      
      logger.apiResponse('FMP', 'GET', `/stable/historical-chart/${interval}`, 200, {
        candlesCount: candles.length,
      }, duration);
      
      if (candles.length > 0) {
        logger.data('Chart data sample', {
          requestId,
          firstCandle: candles[0],
          lastCandle: candles[candles.length - 1],
        });
      }
      
      return candles;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching FMP chart data', error, {
        requestId,
        symbol,
        interval,
        duration,
      });
      return [];
    }
  }

  /**
   * Get company profile information using v3 endpoint
   */
  async getCompanyProfile(symbol: string): Promise<FMPCompanyProfile | null> {
    if (!this.isAvailable()) {
      logger.info('FMP profile request skipped - no API key', { symbol });
      return null;
    }

    const requestId = `fmp_profile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}/api/v3/profile/${symbol.toUpperCase()}?apikey=${this.apiKey}`;
    
    logger.fmp('Company profile request', {
      requestId,
      symbol: symbol.toUpperCase(),
      endpoint: endpoint.replace(this.apiKey, '[REDACTED]'),
    });
    
    logger.apiRequest('FMP', 'GET', '/api/v3/profile', {
      symbol: symbol.toUpperCase(),
    });

    try {
      const data = await fetchJson<FMPCompanyProfile[]>(endpoint);
      const duration = Date.now() - startTime;
      
      if (!data || data.length === 0) {
        logger.warn('No company profile found', {
          requestId,
          symbol,
          duration,
        });
        return null;
      }

      const profile = data[0];
      
      logger.fmp('Company profile retrieved successfully', {
        requestId,
        duration,
        symbol: profile.symbol,
        companyName: profile.companyName,
        sector: profile.sector,
        industry: profile.industry,
        marketCap: profile.mktCap,
        employees: profile.fullTimeEmployees,
      });
      
      logger.apiResponse('FMP', 'GET', '/api/v3/profile', 200, {
        symbol: profile.symbol,
        companyName: profile.companyName,
      }, duration);
      
      logger.data('Company profile summary', {
        requestId,
        symbol: profile.symbol,
        name: profile.companyName,
        sector: profile.sector,
        industry: profile.industry,
        country: profile.country,
      });
      
      return profile;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching FMP company profile', error, {
        requestId,
        symbol,
        duration,
      });
      return null;
    }
  }

  /**
   * Get historical price data (daily)
   */
  async getHistoricalPrices(
    symbol: string,
    from?: string,
    to?: string
  ): Promise<Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    adjClose: number;
    volume: number;
    unadjustedVolume: number;
    change: number;
    changePercent: number;
    vwap: number;
    label: string;
    changeOverTime: number;
  }>> {
    if (!this.isAvailable()) {
      logger.info('FMP historical prices request skipped - no API key', { symbol, from, to });
      return [];
    }

    const requestId = `fmp_hist_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    let url = `${this.baseUrl}/api/v3/historical-price-full/${symbol.toUpperCase()}?apikey=${this.apiKey}`;
    if (from) url += `&from=${from}`;
    if (to) url += `&to=${to}`;
    
    logger.fmp('Historical prices request', {
      requestId,
      symbol: symbol.toUpperCase(),
      from,
      to,
      endpoint: url.replace(this.apiKey, '[REDACTED]'),
    });
    
    logger.apiRequest('FMP', 'GET', '/api/v3/historical-price-full', {
      symbol: symbol.toUpperCase(),
      from,
      to,
    });

    try {
      const response = await fetchWithRetry(url);
      const duration = Date.now() - startTime;

      if (!response.ok) {
        logger.error(`FMP Historical API error`, new Error(`Status: ${response.status}`), {
          requestId,
          status: response.status,
          symbol,
          duration,
        });
        logger.apiResponse('FMP', 'GET', '/api/v3/historical-price-full', response.status, null, duration);
        return [];
      }

      const data = await response.json();
      const historical = data.historical || [];
      
      logger.fmp('Historical prices retrieved successfully', {
        requestId,
        duration,
        symbol,
        dataPoints: historical.length,
        dateRange: historical.length > 0 ? {
          start: historical[historical.length - 1].date,
          end: historical[0].date,
        } : null,
      });
      
      logger.apiResponse('FMP', 'GET', '/api/v3/historical-price-full', response.status, {
        dataPoints: historical.length,
      }, duration);
      
      return historical;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error fetching FMP historical prices', error, {
        requestId,
        symbol,
        duration,
      });
      return [];
    }
  }

  /**
   * Search for stock symbols - prefer stable endpoint, fallback to v3
   */
  async searchSymbols(query: string): Promise<Array<{
    symbol: string;
    name: string;
    currency: string;
    stockExchange: string;
    exchangeShortName: string;
  }>> {
    if (!this.isAvailable()) {
      logger.info('FMP symbol search skipped - no API key', { query });
      return [];
    }

    const requestId = `fmp_search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const startTime = Date.now();
    
    // Try stable endpoint first
    const stableEndpoint = `${this.baseUrl}/stable/search-symbol?query=${encodeURIComponent(query)}&apikey=${this.apiKey}`;
    
    logger.fmp('Symbol search request (stable)', {
      requestId,
      query,
      endpoint: stableEndpoint.replace(this.apiKey, '[REDACTED]'),
    });
    
    logger.apiRequest('FMP', 'GET', '/stable/search-symbol', {
      query,
    });

    try {
      const stableResponse = await fetchWithRetry(stableEndpoint);
      
      if (stableResponse.ok) {
        const results = await stableResponse.json();
        const duration = Date.now() - startTime;
        
        logger.fmp('Symbol search successful (stable)', {
          requestId,
          duration,
          query,
          resultsCount: results.length,
          symbols: results.slice(0, 5).map((r: { symbol: string }) => r.symbol),
        });
        
        logger.apiResponse('FMP', 'GET', '/stable/search-symbol', stableResponse.status, {
          resultsCount: results.length,
        }, duration);
        
        return results;
      }
      
      // Fallback to v3 endpoint
      logger.info('Falling back to v3 search endpoint', { requestId });
      
      const v3Endpoint = `${this.baseUrl}/api/v3/search?query=${encodeURIComponent(query)}&limit=10&apikey=${this.apiKey}`;
      
      logger.apiRequest('FMP', 'GET', '/api/v3/search', {
        query,
        limit: 10,
      });
      
      const v3Response = await fetchWithRetry(v3Endpoint);
      const duration = Date.now() - startTime;
      
      if (!v3Response.ok) {
        logger.error(`FMP Search API error`, new Error(`Status: ${v3Response.status}`), {
          requestId,
          status: v3Response.status,
          query,
          duration,
        });
        logger.apiResponse('FMP', 'GET', '/api/v3/search', v3Response.status, null, duration);
        return [];
      }

      const results = await v3Response.json();
      
      logger.fmp('Symbol search successful (v3)', {
        requestId,
        duration,
        query,
        resultsCount: results.length,
        symbols: results.slice(0, 5).map((r: { symbol: string }) => r.symbol),
      });
      
      logger.apiResponse('FMP', 'GET', '/api/v3/search', v3Response.status, {
        resultsCount: results.length,
      }, duration);
      
      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error searching symbols', error, {
        requestId,
        query,
        duration,
      });
      return [];
    }
  }

  /**
   * Format quote data for display
   */
  static formatQuote(quote: FMPQuote): string {
    const changeIcon = quote.change >= 0 ? '📈' : '📉';
    const changePrefix = quote.change >= 0 ? '+' : '';
    
    logger.debug('Formatting FMP quote', {
      symbol: quote.symbol,
      price: quote.price,
      change: quote.change,
    });
    
    return `
**${quote.symbol}** - ${quote.name}
${changeIcon} **$${quote.price.toFixed(2)}** ${changePrefix}${quote.change.toFixed(2)} (${changePrefix}${quote.changesPercentage.toFixed(2)}%)

📊 **Trading Data**
• Open: $${quote.open.toFixed(2)}
• High: $${quote.dayHigh.toFixed(2)}
• Low: $${quote.dayLow.toFixed(2)}
• Volume: ${(quote.volume / 1000000).toFixed(2)}M
• Avg Volume: ${(quote.avgVolume / 1000000).toFixed(2)}M

📈 **Key Metrics**
• Market Cap: $${(quote.marketCap / 1000000000).toFixed(2)}B
• P/E Ratio: ${quote.pe?.toFixed(2) || 'N/A'}
• EPS: $${quote.eps?.toFixed(2) || 'N/A'}
• 52W High: $${quote.yearHigh.toFixed(2)}
• 52W Low: $${quote.yearLow.toFixed(2)}
    `.trim();
  }

  /**
   * Format chart data for display summary
   */
  static formatChartSummary(candles: FMPCandle[]): string {
    if (candles.length === 0) {
      logger.debug('No chart data to format');
      return 'No chart data available';
    }

    const latest = candles[candles.length - 1];
    const earliest = candles[0];
    const priceChange = latest.close - earliest.close;
    const priceChangePercent = (priceChange / earliest.close) * 100;
    const changeIcon = priceChange >= 0 ? '📈' : '📉';

    const high = Math.max(...candles.map(c => c.high));
    const low = Math.min(...candles.map(c => c.low));
    const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);
    
    logger.debug('Formatting chart summary', {
      candlesCount: candles.length,
      priceChange,
      priceChangePercent,
      high,
      low,
    });

    return `
**Intraday Chart Summary** (${candles.length} data points)
${changeIcon} Period Change: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)} (${priceChange >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%)

• Period High: $${high.toFixed(2)}
• Period Low: $${low.toFixed(2)}
• Latest: $${latest.close.toFixed(2)}
• Total Volume: ${(totalVolume / 1000000).toFixed(2)}M
    `.trim();
  }

  /**
   * Format market movers for display
   */
  static formatMovers(movers: FMPQuote[], title: string, limit = 5): string {
    if (movers.length === 0) {
      return `No ${title.toLowerCase()} data available`;
    }

    const formatted = movers.slice(0, limit).map((stock, i) => {
      const changeIcon = stock.changesPercentage >= 0 ? '🟢' : '🔴';
      const changePrefix = stock.changesPercentage >= 0 ? '+' : '';
      return `${i + 1}. ${changeIcon} **${stock.symbol}** - $${stock.price.toFixed(2)} (${changePrefix}${stock.changesPercentage.toFixed(2)}%)`;
    }).join('\n');

    return `**${title}**\n${formatted}`;
  }

  /**
   * Get formatted financial summary combining quote and profile
   */
  async getFinancialSummary(symbol: string): Promise<string> {
    if (!this.isAvailable()) {
      logger.info('Financial summary skipped - FMP not available', { symbol });
      return `Financial data not available (FMP API key required)`;
    }

    const requestId = `fmp_summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    logger.info('Generating financial summary', {
      requestId,
      symbol: symbol.toUpperCase(),
    });

    const [quote, profile] = await Promise.all([
      this.getQuote(symbol),
      this.getCompanyProfile(symbol)
    ]);

    if (!quote) {
      logger.warn('No financial summary available', {
        requestId,
        symbol,
        hasQuote: false,
      });
      return `No data found for symbol: ${symbol}`;
    }

    let summary = FMPService.formatQuote(quote);

    if (profile) {
      summary += `\n\n**Company Info**
• Sector: ${profile.sector}
• Industry: ${profile.industry}
• Exchange: ${profile.exchange}
• Website: ${profile.website}
• Employees: ${profile.fullTimeEmployees}`;

      if (profile.description) {
        summary += `\n\n**About**\n${profile.description.slice(0, 200)}...`;
      }
    }
    
    logger.info('Financial summary generated', {
      requestId,
      symbol,
      hasQuote: !!quote,
      hasProfile: !!profile,
      summaryLength: summary.length,
    });

    return summary;
  }

  /**
   * Format data for The Alpha Oracle presentation
   */
  static formatForAlphaOracle(
    quote: FMPQuote | null,
    candles: FMPCandle[]
  ): {
    quoteCard: object | null;
    chartData: object[] | null;
  } {
    logger.debug('Formatting data for Alpha Oracle', {
      hasQuote: !!quote,
      candlesCount: candles.length,
    });
    
    const quoteCard = quote ? {
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changesPercentage,
      volume: quote.volume,
      marketCap: quote.marketCap,
      dayRange: { low: quote.dayLow, high: quote.dayHigh },
      yearRange: { low: quote.yearLow, high: quote.yearHigh },
      pe: quote.pe,
      eps: quote.eps,
    } : null;

    const chartData = candles.length > 0 ? candles.map(c => ({
      time: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    })) : null;

    return { quoteCard, chartData };
  }
}

/**
 * Factory function to create FMP service
 */
export function createFMPService(apiKey?: string): FMPService {
  logger.info('Creating FMP service', {
    hasApiKey: !!apiKey,
    usingEnvKey: !apiKey && !!FMP_API_KEY,
  });
  return new FMPService(apiKey);
}