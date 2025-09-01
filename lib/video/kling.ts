import { BaseVideoService } from './base';
import { VideoGenerationRequest, VideoGenerationResponse } from '../types';

export class KlingService extends BaseVideoService {
  constructor(apiKey: string) {
    super('kling', apiKey, 'https://api.klingai.com/v1');
  }

  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    this.validateRequest(request);
    
    const id = this.generateRequestId();
    const cost = this.calculateCost(request.settings.duration, request.settings.quality);
    
    try {
      const response = await fetch(`${this.baseUrl}/videos/text2video`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.getModelByQuality(request.settings.quality),
          prompt: request.prompt,
          duration: request.settings.duration,
          aspect_ratio: request.settings.aspectRatio,
          cfg_scale: 7.5,
          seed: request.settings.seed,
          motion_bucket_id: this.mapMotionIntensity(request.settings.motionIntensity),
          fps: request.settings.frameRate || 25,
          image_url: request.referenceImages?.[0],
          style: request.settings.style,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Kling AI error: ${response.status} ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (request.metadata?.userId) {
        this.rateLimiter.addCost(request.metadata.userId, cost);
      }

      return {
        id: data.task_id || id,
        provider: 'kling',
        status: this.mapStatus(data.task_status),
        progress: this.calculateProgress(data.task_status),
        result: data.task_result ? {
          videoUrl: data.task_result[0]?.url,
          thumbnailUrl: data.task_result[0]?.cover_image_url,
          metadata: {
            duration: request.settings.duration,
            resolution: this.getResolutionFromAspectRatio(request.settings.aspectRatio),
            fps: request.settings.frameRate || 25,
            fileSize: 0,
            format: 'mp4',
            generationTime: 0,
            cost,
          },
        } : undefined,
        error: data.error ? {
          message: data.error.message || 'Kling AI generation failed',
          code: data.error.code || 'KLING_ERROR',
          retryable: data.error.retryable !== false,
        } : undefined,
        estimatedCompletionTime: this.estimateCompletionTime(request.settings.duration),
        createdAt: new Date(),
        completedAt: data.task_status === 'succeed' ? new Date() : undefined,
      };
    } catch (error) {
      return {
        id,
        provider: 'kling',
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'KLING_API_ERROR',
          retryable: true,
        },
        createdAt: new Date(),
      };
    }
  }

  async getVideoStatus(id: string): Promise<VideoGenerationResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/videos/text2video/${id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Kling AI error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        id,
        provider: 'kling',
        status: this.mapStatus(data.task_status),
        progress: this.calculateProgress(data.task_status),
        result: data.task_result ? {
          videoUrl: data.task_result[0]?.url,
          thumbnailUrl: data.task_result[0]?.cover_image_url,
          metadata: {
            duration: data.task_result[0]?.duration || 0,
            resolution: '1280x720',
            fps: 25,
            fileSize: 0,
            format: 'mp4',
            generationTime: 0,
            cost: 0,
          },
        } : undefined,
        error: data.error ? {
          message: data.error.message || 'Kling AI generation failed',
          code: data.error.code || 'KLING_ERROR',
          retryable: data.error.retryable !== false,
        } : undefined,
        estimatedCompletionTime: data.task_status === 'processing' ? this.estimateCompletionTime(5) : undefined,
        createdAt: new Date(data.created_at || Date.now()),
        completedAt: data.task_status === 'succeed' ? new Date() : undefined,
      };
    } catch (error) {
      return {
        id,
        provider: 'kling',
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'KLING_API_ERROR',
          retryable: true,
        },
        createdAt: new Date(),
      };
    }
  }

  async cancelVideoGeneration(id: string): Promise<boolean> {
    return false;
  }

  isAvailable(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  getMaxDuration(): number {
    return 10;
  }

  getSupportedAspectRatios(): string[] {
    return ['16:9', '9:16', '1:1'];
  }

  getCostPerSecond(): number {
    return 0.06;
  }

  private getModelByQuality(quality: string): string {
    const mapping: Record<string, string> = {
      'draft': 'kling-v1',
      'standard': 'kling-v1',
      'high': 'kling-v1-5',
      'premium': 'kling-v1-5',
    };
    return mapping[quality] || 'kling-v1';
  }

  private mapMotionIntensity(intensity?: number): number {
    if (intensity === undefined) return 127;
    return Math.round((intensity * 255) / 10);
  }

  private mapStatus(status: string): 'queued' | 'processing' | 'completed' | 'failed' {
    const mapping: Record<string, 'queued' | 'processing' | 'completed' | 'failed'> = {
      'submitted': 'queued',
      'processing': 'processing',
      'succeed': 'completed',
      'failed': 'failed',
      'rejected': 'failed',
    };
    return mapping[status?.toLowerCase()] || 'queued';
  }

  private calculateProgress(status: string): number {
    const progressMapping: Record<string, number> = {
      'submitted': 10,
      'processing': 50,
      'succeed': 100,
      'failed': 0,
      'rejected': 0,
    };
    return progressMapping[status?.toLowerCase()] || 0;
  }

  private estimateCompletionTime(duration: number): Date {
    const estimatedMinutes = Math.max(2, duration * 0.5);
    return new Date(Date.now() + estimatedMinutes * 60 * 1000);
  }

  private getResolutionFromAspectRatio(aspectRatio: string): string {
    const resolutions: Record<string, string> = {
      '16:9': '1280x720',
      '9:16': '720x1280',
      '1:1': '720x720',
    };
    return resolutions[aspectRatio] || '1280x720';
  }
}