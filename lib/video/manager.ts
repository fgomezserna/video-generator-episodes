import { RunwayService } from './runway';
import { PikaService } from './pika';
import { KlingService } from './kling';
import { LumaService } from './luma';
import { BaseVideoService } from './base';
import { VideoProvider, VideoGenerationRequest, VideoGenerationResponse, VideoProviderMetrics } from '../types';

export interface VideoManagerConfig {
  apiKeys: {
    runway?: string;
    pika?: string;
    kling?: string;
    luma?: string;
  };
  fallbackOrder?: VideoProvider[];
  costOptimization?: boolean;
  qualityPriority?: boolean;
}

export class VideoManager {
  private services: Map<VideoProvider, BaseVideoService> = new Map();
  private fallbackOrder: VideoProvider[] = ['runway', 'pika', 'luma', 'kling'];
  private metrics: Map<VideoProvider, VideoProviderMetrics> = new Map();
  private costOptimization: boolean = false;
  private qualityPriority: boolean = false;

  constructor(config: VideoManagerConfig) {
    this.costOptimization = config.costOptimization || false;
    this.qualityPriority = config.qualityPriority || false;
    this.fallbackOrder = config.fallbackOrder || this.fallbackOrder;

    if (config.apiKeys.runway) {
      this.services.set('runway', new RunwayService(config.apiKeys.runway));
    }
    
    if (config.apiKeys.pika) {
      this.services.set('pika', new PikaService(config.apiKeys.pika));
    }

    if (config.apiKeys.kling) {
      this.services.set('kling', new KlingService(config.apiKeys.kling));
    }
    
    if (config.apiKeys.luma) {
      this.services.set('luma', new LumaService(config.apiKeys.luma));
    }

    this.initializeMetrics();
  }

  async generateVideo(
    request: VideoGenerationRequest,
    preferredProvider?: VideoProvider,
    userId?: string
  ): Promise<VideoGenerationResponse> {
    const providers = this.getOptimalProviderOrder(request, preferredProvider);
    
    for (const provider of providers) {
      const service = this.services.get(provider);
      
      if (!service || !service.isAvailable()) {
        this.recordProviderFailure(provider, 'SERVICE_UNAVAILABLE');
        continue;
      }

      if (!this.isProviderCompatible(provider, request)) {
        continue;
      }

      if (userId) {
        const canMakeRequest = await service.checkRateLimit(userId);
        if (!canMakeRequest) {
          this.recordProviderFailure(provider, 'RATE_LIMITED');
          continue;
        }
      }

      try {
        const startTime = Date.now();
        const response = await service.generateVideo(request);
        const endTime = Date.now();
        
        this.recordProviderSuccess(provider, endTime - startTime);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.recordProviderFailure(provider, errorMessage);
        console.error(`Error with ${provider} service:`, error);
        continue;
      }
    }

    throw new Error('All video generation services are unavailable or rate limited');
  }

  async getVideoStatus(
    id: string, 
    provider: VideoProvider
  ): Promise<VideoGenerationResponse> {
    const service = this.services.get(provider);
    
    if (!service || !service.isAvailable()) {
      throw new Error(`${provider} service is not available`);
    }

    return service.getVideoStatus(id);
  }

  async cancelVideoGeneration(
    id: string, 
    provider: VideoProvider
  ): Promise<boolean> {
    const service = this.services.get(provider);
    
    if (!service || !service.isAvailable()) {
      return false;
    }

    return service.cancelVideoGeneration(id);
  }

  getAvailableProviders(): VideoProvider[] {
    return Array.from(this.services.keys()).filter(provider => {
      const service = this.services.get(provider);
      return service && service.isAvailable();
    });
  }

  isProviderAvailable(provider: VideoProvider): boolean {
    const service = this.services.get(provider);
    return service ? service.isAvailable() : false;
  }

  async getProviderQuota(provider: VideoProvider, userId: string): Promise<{ requests: number; cost: number }> {
    const service = this.services.get(provider);
    if (!service) {
      throw new Error(`${provider} service not found`);
    }
    return service.getRemainingQuota(userId);
  }

  getProviderMetrics(provider?: VideoProvider): VideoProviderMetrics | VideoProviderMetrics[] {
    if (provider) {
      return this.metrics.get(provider) || this.createEmptyMetrics(provider);
    }
    return Array.from(this.metrics.values());
  }

  getProviderCapabilities(provider: VideoProvider): {
    maxDuration: number;
    supportedAspectRatios: string[];
    costPerSecond: number;
  } {
    const service = this.services.get(provider);
    if (!service) {
      throw new Error(`${provider} service not found`);
    }

    return {
      maxDuration: service.getMaxDuration(),
      supportedAspectRatios: service.getSupportedAspectRatios(),
      costPerSecond: service.getCostPerSecond(),
    };
  }

  private getOptimalProviderOrder(
    request: VideoGenerationRequest, 
    preferredProvider?: VideoProvider
  ): VideoProvider[] {
    if (preferredProvider && this.isProviderAvailable(preferredProvider)) {
      return [preferredProvider, ...this.fallbackOrder.filter(p => p !== preferredProvider)];
    }

    if (this.costOptimization) {
      return this.getProvidersByCost(request);
    }

    if (this.qualityPriority) {
      return this.getProvidersByQuality(request);
    }

    return this.getProvidersByReliability();
  }

  private getProvidersByCost(request: VideoGenerationRequest): VideoProvider[] {
    const availableProviders = this.getAvailableProviders();
    
    return availableProviders
      .map(provider => {
        const service = this.services.get(provider)!;
        const cost = service.getCostPerSecond() * request.settings.duration;
        return { provider, cost };
      })
      .filter(({ provider }) => this.isProviderCompatible(provider, request))
      .sort((a, b) => a.cost - b.cost)
      .map(({ provider }) => provider);
  }

  private getProvidersByQuality(request: VideoGenerationRequest): VideoProvider[] {
    const qualityOrder: VideoProvider[] = ['runway', 'luma', 'pika', 'kling'];
    
    return qualityOrder.filter(provider => 
      this.isProviderAvailable(provider) && 
      this.isProviderCompatible(provider, request)
    );
  }

  private getProvidersByReliability(): VideoProvider[] {
    const availableProviders = this.getAvailableProviders();
    
    return availableProviders.sort((a, b) => {
      const metricsA = this.metrics.get(a);
      const metricsB = this.metrics.get(b);
      
      if (!metricsA || !metricsB) return 0;
      
      const reliabilityA = metricsA.successfulRequests / Math.max(1, metricsA.totalRequests);
      const reliabilityB = metricsB.successfulRequests / Math.max(1, metricsB.totalRequests);
      
      return reliabilityB - reliabilityA;
    });
  }

  private isProviderCompatible(provider: VideoProvider, request: VideoGenerationRequest): boolean {
    const service = this.services.get(provider);
    if (!service) return false;

    if (request.settings.duration > service.getMaxDuration()) {
      return false;
    }

    if (!service.getSupportedAspectRatios().includes(request.settings.aspectRatio)) {
      return false;
    }

    return true;
  }

  private recordProviderSuccess(provider: VideoProvider, responseTime: number): void {
    const metrics = this.metrics.get(provider) || this.createEmptyMetrics(provider);
    
    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.averageGenerationTime = 
      (metrics.averageGenerationTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;
    metrics.uptime = metrics.successfulRequests / metrics.totalRequests;
    metrics.timestamp = new Date();
    
    this.metrics.set(provider, metrics);
  }

  private recordProviderFailure(provider: VideoProvider, reason: string): void {
    const metrics = this.metrics.get(provider) || this.createEmptyMetrics(provider);
    
    metrics.totalRequests++;
    metrics.failedRequests++;
    metrics.uptime = metrics.successfulRequests / metrics.totalRequests;
    metrics.timestamp = new Date();
    
    this.metrics.set(provider, metrics);
  }

  private createEmptyMetrics(provider: VideoProvider): VideoProviderMetrics {
    return {
      id: `${provider}_metrics_${Date.now()}`,
      provider,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageGenerationTime: 0,
      averageQueueTime: 0,
      uptime: 0,
      costPerRequest: 0,
      qualityScore: 0,
      timestamp: new Date(),
    };
  }

  private initializeMetrics(): void {
    for (const provider of Array.from(this.services.keys())) {
      this.metrics.set(provider, this.createEmptyMetrics(provider));
    }
  }
}