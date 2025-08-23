// Financial Modeling Prep API Service
// Based on official FMP API documentation
// Base URL: https://financialmodelingprep.com/api/v3/ and /stable/

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
    
    // FMP is optional - if no key, methods will return null
    if (!this.apiKey) {
      console.warn('FMP API key not provided. Stock data features will be limited.');
    }
  }

  /**
   * Check if FMP service is available
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get real-time quote for a stock symbol using stable endpoint
   */
  async getQuote(symbol: string): Promise<FMPQuote | null> {
    if (!this.isAvailable()) return null;

    try {
      const response = await fetch(
        `${this.baseUrl}/stable/quote?symbol=${symbol.toUpperCase()}&apikey=${this.apiKey}`
      );

      if (!response.ok) {
        console.error(`FMP Quote API error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data[0] || null;
    } catch (error) {
      console.error('Error fetching FMP quote:', error);
      return null;
    }
  }

  /**
   * Get bulk quotes for multiple symbols
   */
  async getBulkQuotes(symbols: string[]): Promise<FMPQuote[]> {
    if (!this.isAvailable() || symbols.length === 0) return [];

    try {
      const symbolList = symbols.map(s => s.toUpperCase()).join(',');
      const response = await fetch(
        `${this.baseUrl}/stable/batch-quote?symbols=${symbolList}&apikey=${this.apiKey}`
      );

      if (!response.ok) {
        console.error(`FMP Bulk Quote API error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching FMP bulk quotes:', error);
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
    if (!this.isAvailable()) return [];

    try {
      const response = await fetch(
        `${this.baseUrl}/stable/historical-chart/${interval}?symbol=${symbol.toUpperCase()}&apikey=${this.apiKey}`
      );

      if (!response.ok) {
        console.error(`FMP Chart API error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      // Return last 100 candles for display (most recent first in API response)
      return (data || []).slice(0, 100).reverse();
    } catch (error) {
      console.error('Error fetching FMP chart data:', error);
      return [];
    }
  }

  /**
   * Get company profile information using v3 endpoint
   */
  async getCompanyProfile(symbol: string): Promise<FMPCompanyProfile | null> {
    if (!this.isAvailable()) return null;

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v3/profile/${symbol.toUpperCase()}?apikey=${this.apiKey}`
      );

      if (!response.ok) {
        console.error(`FMP Profile API error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data[0] || null;
    } catch (error) {
      console.error('Error fetching FMP company profile:', error);
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
    if (!this.isAvailable()) return [];

    try {
      let url = `${this.baseUrl}/api/v3/historical-price-full/${symbol.toUpperCase()}?apikey=${this.apiKey}`;
      
      if (from) url += `&from=${from}`;
      if (to) url += `&to=${to}`;

      const response = await fetch(url);

      if (!response.ok) {
        console.error(`FMP Historical API error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data.historical || [];
    } catch (error) {
      console.error('Error fetching FMP historical prices:', error);
      return [];
    }
  }

  /**
   * Search for stock symbols
   */
  async searchSymbols(query: string): Promise<Array<{
    symbol: string;
    name: string;
    currency: string;
    stockExchange: string;
    exchangeShortName: string;
  }>> {
    if (!this.isAvailable()) return [];

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v3/search?query=${encodeURIComponent(query)}&limit=10&apikey=${this.apiKey}`
      );

      if (!response.ok) {
        console.error(`FMP Search API error: ${response.status}`);
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error('Error searching symbols:', error);
      return [];
    }
  }

  /**
   * Format quote data for display
   */
  static formatQuote(quote: FMPQuote): string {
    const changeIcon = quote.change >= 0 ? '📈' : '📉';
    const changePrefix = quote.change >= 0 ? '+' : '';
    
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
    if (candles.length === 0) return 'No chart data available';

    const latest = candles[candles.length - 1];
    const earliest = candles[0];
    const priceChange = latest.close - earliest.close;
    const priceChangePercent = (priceChange / earliest.close) * 100;
    const changeIcon = priceChange >= 0 ? '📈' : '📉';

    const high = Math.max(...candles.map(c => c.high));
    const low = Math.min(...candles.map(c => c.low));
    const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);

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
   * Get formatted financial summary combining quote and profile
   */
  async getFinancialSummary(symbol: string): Promise<string> {
    if (!this.isAvailable()) {
      return `Financial data not available (FMP API key required)`;
    }

    const [quote, profile] = await Promise.all([
      this.getQuote(symbol),
      this.getCompanyProfile(symbol)
    ]);

    if (!quote) {
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
  return new FMPService(apiKey);
}