import { BaseVideoService } from './base';
import { VideoGenerationRequest, VideoGenerationResponse } from '../types';

export class LumaService extends BaseVideoService {
  constructor(apiKey: string) {
    super('luma', apiKey, 'https://api.lumalabs.ai/dream-machine/v1');
  }

  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    this.validateRequest(request);
    
    const id = this.generateRequestId();
    const cost = this.calculateCost(request.settings.duration, request.settings.quality);
    
    try {
      const response = await fetch(`${this.baseUrl}/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: request.prompt,
          aspect_ratio: request.settings.aspectRatio,
          loop: false,
          keyframes: request.referenceImages ? {
            frame0: {
              type: 'image',
              url: request.referenceImages[0],
            },
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Luma API error: ${response.status} ${errorData.detail || response.statusText}`);
      }

      const data = await response.json();
      
      if (request.metadata?.userId) {
        this.rateLimiter.addCost(request.metadata.userId, cost);
      }

      return {
        id: data.id || id,
        provider: 'luma',
        status: this.mapStatus(data.state),
        progress: this.calculateProgress(data.state),
        result: data.assets ? {
          videoUrl: data.assets.video,
          thumbnailUrl: data.assets.thumbnail,
          metadata: {
            duration: 5,
            resolution: this.getResolutionFromAspectRatio(request.settings.aspectRatio),
            fps: 30,
            fileSize: 0,
            format: 'mp4',
            generationTime: 0,
            cost,
          },
        } : undefined,
        error: data.failure_reason ? {
          message: data.failure_reason,
          code: 'LUMA_ERROR',
          retryable: !data.failure_reason.includes('policy'),
        } : undefined,
        estimatedCompletionTime: this.estimateCompletionTime(),
        createdAt: new Date(data.created_at || Date.now()),
        completedAt: data.state === 'completed' ? new Date() : undefined,
      };
    } catch (error) {
      return {
        id,
        provider: 'luma',
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'LUMA_API_ERROR',
          retryable: true,
        },
        createdAt: new Date(),
      };
    }
  }

  async getVideoStatus(id: string): Promise<VideoGenerationResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/generations/${id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Luma API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        id,
        provider: 'luma',
        status: this.mapStatus(data.state),
        progress: this.calculateProgress(data.state),
        result: data.assets ? {
          videoUrl: data.assets.video,
          thumbnailUrl: data.assets.thumbnail,
          metadata: {
            duration: 5,
            resolution: '1360x768',
            fps: 30,
            fileSize: 0,
            format: 'mp4',
            generationTime: 0,
            cost: 0,
          },
        } : undefined,
        error: data.failure_reason ? {
          message: data.failure_reason,
          code: 'LUMA_ERROR',
          retryable: !data.failure_reason.includes('policy'),
        } : undefined,
        estimatedCompletionTime: data.state === 'processing' ? this.estimateCompletionTime() : undefined,
        createdAt: new Date(data.created_at || Date.now()),
        completedAt: data.state === 'completed' ? new Date() : undefined,
      };
    } catch (error) {
      return {
        id,
        provider: 'luma',
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'LUMA_API_ERROR',
          retryable: true,
        },
        createdAt: new Date(),
      };
    }
  }

  async cancelVideoGeneration(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/generations/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to cancel Luma video generation:', error);
      return false;
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  getMaxDuration(): number {
    return 5;
  }

  getSupportedAspectRatios(): string[] {
    return ['16:9', '9:16', '4:3', '1:1'];
  }

  getCostPerSecond(): number {
    return 0.14;
  }

  private mapStatus(state: string): 'queued' | 'processing' | 'completed' | 'failed' {
    const mapping: Record<string, 'queued' | 'processing' | 'completed' | 'failed'> = {
      'queued': 'queued',
      'dreaming': 'processing',
      'completed': 'completed',
      'failed': 'failed',
    };
    return mapping[state?.toLowerCase()] || 'queued';
  }

  private calculateProgress(state: string): number {
    const progressMapping: Record<string, number> = {
      'queued': 10,
      'dreaming': 60,
      'completed': 100,
      'failed': 0,
    };
    return progressMapping[state?.toLowerCase()] || 0;
  }

  private estimateCompletionTime(): Date {
    return new Date(Date.now() + 2 * 60 * 1000);
  }

  private getResolutionFromAspectRatio(aspectRatio: string): string {
    const resolutions: Record<string, string> = {
      '16:9': '1360x768',
      '9:16': '768x1360',
      '4:3': '1024x768',
      '1:1': '768x768',
    };
    return resolutions[aspectRatio] || '1360x768';
  }
}