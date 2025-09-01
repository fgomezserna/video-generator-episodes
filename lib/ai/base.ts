import { AIProvider, ContentType } from '../types';

export interface AIResponse {
  content: string;
  tokensUsed: number;
  model: string;
  provider: AIProvider;
  responseTime: number;
}

export interface GenerateScriptOptions {
  topic: string;
  contentType: ContentType;
  duration: number;
  targetAudience: string;
  tone: string;
  characters?: string[];
  additionalInstructions?: string;
}

export interface GenerateStoryboardOptions {
  script: string;
  contentType: ContentType;
  style: string;
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
  additionalInstructions?: string;
}

export abstract class BaseAIService {
  protected provider: AIProvider;
  protected apiKey: string;
  protected rateLimiter: RateLimiter;

  constructor(provider: AIProvider, apiKey: string) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(`Invalid ${provider} API key provided`);
    }
    this.provider = provider;
    this.apiKey = apiKey;
    this.rateLimiter = new RateLimiter(provider);
  }

  abstract generateScript(options: GenerateScriptOptions): Promise<AIResponse>;
  abstract generateStoryboard(options: GenerateStoryboardOptions): Promise<AIResponse>;
  abstract isAvailable(): boolean;
  
  async checkRateLimit(userId: string): Promise<boolean> {
    return this.rateLimiter.checkRateLimit(userId);
  }
}

class RateLimiter {
  private requestCounts: Map<string, number[]> = new Map();
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async checkRateLimit(userId: string): Promise<boolean> {
    const now = Date.now();
    const userRequests = this.requestCounts.get(userId) || [];
    
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const recentRequests = userRequests.filter(time => time > oneMinuteAgo);
    const hourlyRequests = userRequests.filter(time => time > oneHourAgo);
    const dailyRequests = userRequests.filter(time => time > oneDayAgo);
    
    const limits = this.getLimits();
    
    if (recentRequests.length >= limits.requestsPerMinute ||
        hourlyRequests.length >= limits.requestsPerHour ||
        dailyRequests.length >= limits.requestsPerDay) {
      return false;
    }
    
    userRequests.push(now);
    this.requestCounts.set(userId, userRequests.filter(time => time > oneDayAgo));
    
    return true;
  }

  private getLimits() {
    if (this.provider === 'openai') {
      return {
        requestsPerMinute: 20,
        requestsPerHour: 500,
        requestsPerDay: 2000,
      };
    } else {
      return {
        requestsPerMinute: 15,
        requestsPerHour: 400,
        requestsPerDay: 1500,
      };
    }
  }
}