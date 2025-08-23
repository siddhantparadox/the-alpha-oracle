import logger from './logger';

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string, 
  options: FetchOptions = {}
): Promise<Response> {
  const { timeout = 4000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch with timeout and retry support
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { 
    retries = 2, 
    retryDelay = 500,
    timeout = 4000,
    ...fetchOptions 
  } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        logger.debug(`Retrying request (attempt ${attempt + 1}/${retries + 1})`, {
          url: url.replace(/apikey=[^&]+/, 'apikey=[REDACTED]'),
          delay: retryDelay,
        });
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
      
      const response = await fetchWithTimeout(url, { 
        ...fetchOptions, 
        timeout 
      });
      
      if (response.ok) {
        return response;
      }

      // On last attempt, let error handling below deal with non-OK response
      if (attempt === retries) {
        if (response.status >= 500) {
          throw new Error(`Server error after ${retries + 1} attempts: ${response.status}`);
        }
        // For client errors, return the response even on last attempt
        return response;
      }      
      // For server errors (5xx), retry
      if (response.status >= 500) {
        lastError = new Error(`Server error: ${response.status}`);
        continue;
      }
      
      // For client errors (4xx), don't retry
      return response;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === retries) {
        logger.error('All retry attempts failed', lastError, {
          url: url.replace(/apikey=[^&]+/, 'apikey=[REDACTED]'),
          attempts: retries + 1,
        });
        throw lastError;
      }
    }
  }
  
  throw lastError || new Error('Fetch failed');
}

/**
 * Fetch JSON with timeout and retry
 */
export async function fetchJson<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T | null> {
  try {
    const response = await fetchWithRetry(url, options);
    if (!response.ok) {
      logger.warn('Non-OK response', {
        url: url.replace(/apikey=[^&]+/, 'apikey=[REDACTED]'),
        status: response.status,
      });
      return null;
    }
    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch JSON', error, {
      url: url.replace(/apikey=[^&]+/, 'apikey=[REDACTED]'),
    });
    return null;
  }
}