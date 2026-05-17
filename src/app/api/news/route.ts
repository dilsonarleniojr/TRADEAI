import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

type NewsCategory = 'Market' | 'DeFi' | 'Regulation' | 'Tech' | 'Trading';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  summary: string;
  category: NewsCategory;
  timestamp: string;
  url: string;
}

interface CacheEntry {
  data: NewsItem[];
  timestamp: number;
}

let zaiInstance: InstanceType<typeof ZAI> | null = null;
const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

function categorizeNews(title: string, snippet: string): NewsCategory {
  const text = `${title} ${snippet}`.toLowerCase();
  if (/defi|lending|staking|yield|tvl|liquidity|aave|compound|uniswap/.test(text)) return 'DeFi';
  if (/sec|regulation|fed|law|legal|compliance|etf|congress|policy/.test(text)) return 'Regulation';
  if (/layer\s*2|scaling|bridge|protocol|smart\s*contract|upgrade|hack|vulnerability|zero[- ]knowledge/.test(text)) return 'Tech';
  if (/trading|volume|whale|flow|order|position|futures|open\s*interest|liquidat/.test(text)) return 'Trading';
  return 'Market';
}

async function fetchSearchResults(query: string, num: number, recencyDays: number) {
  try {
    const zai = await getZAI();
    const results = await zai.functions.invoke('web_search', {
      query,
      num,
      recency_days: recencyDays,
    });
    return results;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    // Check cache
    const cacheKey = 'crypto-news';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: cached.data,
        cached: true,
        lastUpdated: new Date(cached.timestamp).toISOString(),
      });
    }

    // Use a single search query to avoid rate limiting
    const results = await fetchSearchResults(
      'cryptocurrency bitcoin ethereum DeFi latest news today 2025',
      15,
      3
    );

    // If primary search fails or returns empty, try a secondary query
    let allResults = Array.isArray(results) ? results : [];

    if (allResults.length < 5) {
      const secondaryResults = await fetchSearchResults(
        'crypto regulation trading market news this week',
        10,
        7
      );
      if (Array.isArray(secondaryResults)) {
        allResults = [...allResults, ...secondaryResults];
      }
    }

    if (allResults.length === 0) {
      // Return success:false with empty data - client will fall back to mock data
      return NextResponse.json({
        success: false,
        data: [],
        cached: false,
        lastUpdated: new Date().toISOString(),
      });
    }

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const uniqueResults = allResults.filter((item) => {
      if (seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    });

    // Transform to NewsItem format
    const newsItems: NewsItem[] = uniqueResults
      .map((item, index) => ({
        id: `news-${index}-${Date.now()}`,
        title: item.name || 'Untitled',
        source: item.host_name || 'Unknown',
        summary: item.snippet || '',
        category: categorizeNews(item.name || '', item.snippet || ''),
        timestamp: item.date || new Date().toISOString(),
        url: item.url || '#',
      }))
      .filter((item) => item.title !== 'Untitled' && item.summary.length > 20)
      .sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        if (isNaN(dateA) || isNaN(dateB)) return 0;
        return dateB - dateA;
      })
      .slice(0, 15);

    // Cache the results
    cache.set(cacheKey, { data: newsItems, timestamp: Date.now() });

    return NextResponse.json({
      success: true,
      data: newsItems,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('News API error:', error);
    // Return 200 with success:false so client can fall back gracefully
    return NextResponse.json({
      success: false,
      data: [],
      error: message,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  }
}
