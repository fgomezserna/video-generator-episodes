import { VideoManager, VideoManagerConfig, VideoCache, VideoMonitor } from '../video';
import { 
  VideoProvider, 
  VideoGenerationRequest, 
  VideoGenerationResponse,
  VideoProviderMetrics,
  Job,
  JobType,
  JobStatus,
  JobPriority
} from '../types';
import { queueService } from '../db/queue';

export interface VideoGenerationServiceConfig extends VideoManagerConfig {
  enableCache?: boolean;
  enableMonitoring?: boolean;
  monitoringInterval?: number;
}

export class VideoGenerationService {
  private videoManager: VideoManager;
  private cache?: VideoCache;
  private monitor?: VideoMonitor;

  constructor(config: VideoGenerationServiceConfig) {
    this.videoManager = new VideoManager(config);
    
    if (config.enableCache !== false) {
      this.cache = new VideoCache();
    }
    
    if (config.enableMonitoring !== false) {
      this.monitor = new VideoMonitor({
        uptimeThreshold: 95,
        responseTimeThreshold: 30000,
        failureRateThreshold: 0.1,
        onAlert: this.handleAlert.bind(this),
      });
      
      const providers = this.videoManager.getAvailableProviders();
      this.monitor.startMonitoring(providers);
    }
  }

  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    if (!request.metadata?.userId) {
      throw new Error('User ID is required for video generation');
    }

    if (this.cache) {
      try {
        const cachedEntry = await this.cache.get(request);
        if (cachedEntry) {
          return {
            id: `cached_${Date.now()}`,
            provider: cachedEntry.provider,
            status: 'completed',
            progress: 100,
            result: {
              videoUrl: cachedEntry.videoUrl,
              thumbnailUrl: cachedEntry.thumbnailUrl,
              metadata: {
                duration: cachedEntry.metadata.duration,
                resolution: '1920x1080',
                fps: 30,
                fileSize: cachedEntry.metadata.fileSize,
                format: 'mp4',
                generationTime: 0,
                cost: 0,
              },
            },
            createdAt: new Date(),
            completedAt: new Date(),
          };
        }
      } catch (error) {
        // Cache error shouldn't prevent video generation
        console.warn('Cache get failed:', error);
      }
    }

    const response = await this.videoManager.generateVideo(
      request,
      request.provider,
      request.metadata.userId
    );

    if (this.cache && response?.status === 'completed') {
      try {
        await this.cache.set(request, response);
      } catch (error) {
        // Cache error shouldn't prevent returning the response
        console.warn('Cache set failed:', error);
      }
    }

    if (response) {
      await this.trackUsageMetrics(request, response);
    }

    return response;
  }

  async generateVideoWithQueue(request: VideoGenerationRequest): Promise<{ jobId: string; status: string }> {
    if (!request.metadata) {
      throw new Error('Metadata is required for queued video generation');
    }

    const jobData = {
      projectId: request.metadata.projectId || '',
      userId: request.metadata.userId,
      templateId: '',
      variables: { videoRequest: request },
      quality: request.settings.quality,
      aspectRatio: request.settings.aspectRatio,
      metadata: {
        provider: request.provider,
        duration: request.settings.duration,
        prompt: request.prompt,
      },
    };

    const result = await queueService.enqueueJob(
      'video_generation' as JobType,
      jobData,
      {
        priority: request.metadata.priority,
        maxRetries: 3,
      }
    );

    return result;
  }

  async getVideoStatus(id: string, provider: VideoProvider): Promise<VideoGenerationResponse> {
    return this.videoManager.getVideoStatus(id, provider);
  }

  async cancelVideoGeneration(id: string, provider: VideoProvider): Promise<boolean> {
    return this.videoManager.cancelVideoGeneration(id, provider);
  }

  getAvailableProviders(): VideoProvider[] {
    return this.videoManager.getAvailableProviders();
  }

  async getProviderQuota(provider: VideoProvider, userId: string): Promise<{ requests: number; cost: number }> {
    return this.videoManager.getProviderQuota(provider, userId);
  }

  getProviderCapabilities(provider: VideoProvider) {
    return this.videoManager.getProviderCapabilities(provider);
  }

  getProviderMetrics(provider?: VideoProvider): VideoProviderMetrics | VideoProviderMetrics[] {
    return this.videoManager.getProviderMetrics(provider);
  }

  getHealthStatus() {
    return this.monitor?.getHealthStatus();
  }

  generateUptimeReport(periodHours: number = 24) {
    return this.monitor?.generateUptimeReport(periodHours);
  }

  getCacheStats() {
    return this.cache?.getStats();
  }

  async clearCache(provider?: VideoProvider): Promise<void> {
    if (this.cache) {
      await this.cache.clear(provider);
    }
  }

  async estimateCost(request: VideoGenerationRequest): Promise<{
    providers: Record<VideoProvider, { cost: number; available: boolean }>;
    recommended: {
      provider: VideoProvider;
      cost: number;
      reason: string;
    };
  }> {
    const providers = this.videoManager.getAvailableProviders();
    const costs: Record<string, { cost: number; available: boolean }> = {};

    for (const provider of providers) {
      try {
        const capabilities = this.videoManager.getProviderCapabilities(provider);
        const isCompatible = 
          request.settings.duration <= capabilities.maxDuration &&
          capabilities.supportedAspectRatios.includes(request.settings.aspectRatio);

        costs[provider] = {
          cost: isCompatible ? capabilities.costPerSecond * request.settings.duration : 0,
          available: isCompatible,
        };
      } catch (error) {
        costs[provider] = { cost: 0, available: false };
      }
    }

    const availableCosts = Object.entries(costs).filter(([, info]) => info.available);
    const cheapest = availableCosts.reduce((min, [provider, info]) => 
      info.cost < min.cost ? { provider: provider as VideoProvider, cost: info.cost } : min,
      { provider: providers[0], cost: Infinity }
    );

    return {
      providers: costs as Record<VideoProvider, { cost: number; available: boolean }>,
      recommended: {
        provider: cheapest.provider,
        cost: cheapest.cost,
        reason: `Lowest cost option for ${request.settings.duration}s video`,
      },
    };
  }

  destroy(): void {
    if (this.monitor) {
      this.monitor.stopMonitoring();
    }
  }

  private async trackUsageMetrics(
    request: VideoGenerationRequest, 
    response: VideoGenerationResponse
  ): Promise<void> {
    try {
      const logData = {
        timestamp: new Date().toISOString(),
        provider: response.provider,
        status: response.status,
        duration: request.settings.duration,
        quality: request.settings.quality,
        userId: request.metadata?.userId,
        projectId: request.metadata?.projectId,
        cost: response.result?.metadata.cost || 0,
        generationTime: response.result?.metadata.generationTime || 0,
      };
      
      console.log('VideoGeneration', JSON.stringify(logData));
    } catch (error) {
      console.error('VideoGeneration:TrackingError', JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }));
    }
  }

  private handleAlert(provider: VideoProvider, issue: string): void {
    const alertData = {
      timestamp: new Date().toISOString(),
      level: 'WARNING',
      provider,
      issue,
      component: 'VideoProviderMonitor',
    };
    
    console.warn('VideoProvider:Alert', JSON.stringify(alertData));
  }
}

export const createVideoGenerationService = (config: VideoGenerationServiceConfig) => {
  return new VideoGenerationService(config);
};