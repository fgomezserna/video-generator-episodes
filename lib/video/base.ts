import { VideoProvider, VideoGenerationRequest, VideoGenerationResponse, VideoRateLimitConfig } from '../types';

export abstract class BaseVideoService {
  protected provider: VideoProvider;
  protected apiKey: string;
  protected baseUrl: string;
  protected rateLimiter: VideoRateLimiter;

  constructor(provider: VideoProvider, apiKey: string, baseUrl: string) {
    this.validateApiKey(provider, apiKey);
    this.provider = provider;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.rateLimiter = new VideoRateLimiter(provider);
  }

  abstract generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse>;
  abstract getVideoStatus(id: string): Promise<VideoGenerationResponse>;
  abstract cancelVideoGeneration(id: string): Promise<boolean>;
  abstract isAvailable(): boolean;
  abstract getMaxDuration(): number;
  abstract getSupportedAspectRatios(): string[];
  abstract getCostPerSecond(): number;

  async checkRateLimit(userId: string): Promise<boolean> {
    return this.rateLimiter.checkRateLimit(userId);
  }

  async getRemainingQuota(userId: string): Promise<{ requests: number; cost: number }> {
    return this.rateLimiter.getRemainingQuota(userId);
  }

  getProviderName(): VideoProvider {
    return this.provider;
  }

  private validateApiKey(provider: VideoProvider, apiKey: string): void {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error(`Invalid ${provider} API key provided: empty or invalid format`);
    }

    // Provider-specific API key format validation
    const apiKeyPatterns: Record<VideoProvider, RegExp> = {
      runway: /^rw-[a-zA-Z0-9_-]{32,}$/,
      pika: /^pk-[a-zA-Z0-9_-]{20,}$/,
      kling: /^kl_[a-zA-Z0-9_-]{24,}$/,
      luma: /^luma_[a-zA-Z0-9_-]{28,}$/,
    };

    const pattern = apiKeyPatterns[provider];
    if (pattern && !pattern.test(apiKey)) {
      console.warn(`API key format validation failed for ${provider}. Using anyway but this may cause authentication errors.`);
    }
  }

  private sanitizePrompt(prompt: string): string {
    // Remove potentially harmful patterns
    const sanitized = prompt
      .replace(/[<>"'&]/g, '') // Remove HTML/XML chars
      .replace(/javascript:/gi, '') // Remove javascript protocols
      .replace(/data:/gi, '') // Remove data protocols
      .replace(/vbscript:/gi, '') // Remove vbscript protocols
      .trim();

    return sanitized;
  }

  protected generateRequestId(): string {
    return `${this.provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected calculateCost(duration: number, quality: string): number {
    const baseCost = this.getCostPerSecond() * duration;
    const qualityMultipliers: Record<string, number> = {
      draft: 0.5,
      standard: 1.0,
      high: 1.5,
      premium: 2.0,
    };
    return baseCost * (qualityMultipliers[quality] || 1.0);
  }

  protected validateRequest(request: VideoGenerationRequest): void {
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error('Video prompt is required');
    }

    // Validate prompt length and content
    if (request.prompt.length > 2000) {
      throw new Error('Video prompt must be less than 2000 characters');
    }

    // Basic content validation - prevent potentially harmful content
    const sanitizedPrompt = this.sanitizePrompt(request.prompt);
    if (sanitizedPrompt !== request.prompt) {
      throw new Error('Prompt contains potentially unsafe content');
    }

    if (request.settings.duration <= 0 || request.settings.duration > this.getMaxDuration()) {
      throw new Error(`Duration must be between 1 and ${this.getMaxDuration()} seconds`);
    }

    if (!this.getSupportedAspectRatios().includes(request.settings.aspectRatio)) {
      throw new Error(`Aspect ratio ${request.settings.aspectRatio} not supported by ${this.provider}`);
    }

    // Validate metadata if present
    if (request.metadata && !request.metadata.userId) {
      throw new Error('User ID is required in metadata');
    }
  }
}

class VideoRateLimiter {
  private requestCounts: Map<string, { count: number; cost: number; timestamps: number[] }> = new Map();
  private provider: VideoProvider;

  constructor(provider: VideoProvider) {
    this.provider = provider;
  }

  async checkRateLimit(userId: string): Promise<boolean> {
    const now = Date.now();
    const userData = this.requestCounts.get(userId) || { count: 0, cost: 0, timestamps: [] };
    
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const recentRequests = userData.timestamps.filter(time => time > oneMinuteAgo);
    const hourlyRequests = userData.timestamps.filter(time => time > oneHourAgo);
    const dailyRequests = userData.timestamps.filter(time => time > oneDayAgo);
    
    const limits = this.getLimits();
    
    if (recentRequests.length >= limits.requestsPerMinute ||
        hourlyRequests.length >= limits.requestsPerHour ||
        dailyRequests.length >= limits.requestsPerDay ||
        userData.cost >= limits.maxCostPerUser) {
      return false;
    }
    
    userData.timestamps.push(now);
    userData.timestamps = userData.timestamps.filter(time => time > oneDayAgo);
    userData.count = userData.timestamps.length;
    
    this.requestCounts.set(userId, userData);
    
    return true;
  }

  async getRemainingQuota(userId: string): Promise<{ requests: number; cost: number }> {
    const now = Date.now();
    const userData = this.requestCounts.get(userId) || { count: 0, cost: 0, timestamps: [] };
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const dailyRequests = userData.timestamps.filter(time => time > oneDayAgo);
    const limits = this.getLimits();
    
    return {
      requests: Math.max(0, limits.requestsPerDay - dailyRequests.length),
      cost: Math.max(0, limits.maxCostPerUser - userData.cost),
    };
  }

  addCost(userId: string, cost: number): void {
    const userData = this.requestCounts.get(userId) || { count: 0, cost: 0, timestamps: [] };
    userData.cost += cost;
    this.requestCounts.set(userId, userData);
  }

  private getLimits(): VideoRateLimitConfig {
    const baseConfig: VideoRateLimitConfig = {
      provider: this.provider,
      requestsPerMinute: 10,
      requestsPerHour: 100,
      requestsPerDay: 500,
      costPerRequest: 0.5,
      maxCostPerUser: 50.0,
      maxConcurrentJobs: 3,
    };

    switch (this.provider) {
      case 'runway':
        return {
          ...baseConfig,
          requestsPerMinute: 15,
          requestsPerHour: 120,
          requestsPerDay: 600,
          costPerRequest: 1.0,
          maxCostPerUser: 100.0,
        };
      case 'pika':
        return {
          ...baseConfig,
          requestsPerMinute: 12,
          requestsPerHour: 100,
          requestsPerDay: 500,
          costPerRequest: 0.8,
          maxCostPerUser: 75.0,
        };
      case 'kling':
        return {
          ...baseConfig,
          requestsPerMinute: 8,
          requestsPerHour: 80,
          requestsPerDay: 400,
          costPerRequest: 0.6,
          maxCostPerUser: 60.0,
        };
      case 'luma':
        return {
          ...baseConfig,
          requestsPerMinute: 10,
          requestsPerHour: 90,
          requestsPerDay: 450,
          costPerRequest: 0.7,
          maxCostPerUser: 70.0,
        };
      default:
        return baseConfig;
    }
  }
}