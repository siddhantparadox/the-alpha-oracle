import React from 'react';
import { ExternalLink, TrendingUp, TrendingDown, Minus, Calendar, DollarSign } from 'lucide-react';

interface ResearchSummaryProps {
  summary: string;
  type?: 'news' | 'quote' | 'general';
}

export function ResearchSummary({ summary, type = 'general' }: ResearchSummaryProps) {
  // Parse and format the summary based on content
  const formatSummary = (text: string): React.ReactNode => {
    // Clean up raw data dumps
    if (text.includes('https://') || text.includes('http://')) {
      // Extract key information from news data
      const lines = text.split('\n').filter(line => line.trim());
      const items: React.ReactNode[] = [];
      
      lines.forEach((line, idx) => {
        // Skip URLs and technical details
        if (line.includes('https://') || line.includes('http://')) return;
        if (line.includes('**') || line.includes(']]')) return;
        
        // Extract meaningful content
        const cleanLine = line
          .replace(/\*\*/g, '')
          .replace(/\[\[/g, '')
          .replace(/\]\]/g, '')
          .replace(/\d+\.\s*/, '')
          .trim();
        
        if (cleanLine && cleanLine.length > 10) {
          items.push(
            <div key={idx} className="flex items-start gap-1.5">
              <span className="text-purple-500 mt-0.5">•</span>
              <span className="text-xs leading-relaxed">{cleanLine.substring(0, 100)}...</span>
            </div>
          );
        }
      });
      
      if (items.length > 0) {
        return <div className="space-y-1">{items.slice(0, 3)}</div>;
      }
    }
    
    // Check for stock price data
    if (text.includes('$') || text.includes('%') || text.includes('price')) {
      const priceMatch = text.match(/\$[\d,]+\.?\d*/);
      const percentMatch = text.match(/[+-]?\d+\.?\d*%/);
      const volumeMatch = text.match(/volume[:\s]+[\d,]+/i);
      
      if (priceMatch || percentMatch) {
        return (
          <div className="flex flex-wrap gap-2">
            {priceMatch && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                <DollarSign className="w-3 h-3" />
                {priceMatch[0]}
              </span>
            )}
            {percentMatch && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                percentMatch[0].startsWith('-') 
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' 
                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              }`}>
                {percentMatch[0].startsWith('-') ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {percentMatch[0]}
              </span>
            )}
          </div>
        );
      }
    }
    
    // Check for result counts
    if (text.match(/found \d+ (result|item|article|news)/i)) {
      const countMatch = text.match(/\d+/);
      const typeMatch = text.match(/(result|item|article|news|quote|price)/i);
      
      return (
        <div className="inline-flex items-center gap-1.5 text-xs">
          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
          <span className="text-purple-600 dark:text-purple-400 font-medium">
            {countMatch?.[0] || 'Multiple'} {typeMatch?.[0] || 'results'} found
          </span>
        </div>
      );
    }
    
    // Default formatting for general text
    const cleanText = text
      .replace(/\[\[.*?\]\]/g, '')
      .replace(/\*\*/g, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .trim();
    
    if (cleanText.length > 150) {
      return <span className="text-xs leading-relaxed">{cleanText.substring(0, 150)}...</span>;
    }
    
    return <span className="text-xs leading-relaxed">{cleanText || 'Processing complete'}</span>;
  };
  
  return (
    <div className="mt-2">
      {formatSummary(summary)}
    </div>
  );
}