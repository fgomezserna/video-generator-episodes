import { BaseVideoService } from './base';
import { VideoGenerationRequest, VideoGenerationResponse } from '../types';

export class PikaService extends BaseVideoService {
  constructor(apiKey: string) {
    super('pika', apiKey, 'https://api.pika.art/v1');
  }

  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    this.validateRequest(request);
    
    const id = this.generateRequestId();
    const cost = this.calculateCost(request.settings.duration, request.settings.quality);
    
    try {
      const response = await fetch(`${this.baseUrl}/videos/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: request.prompt,
          duration: request.settings.duration,
          aspect_ratio: request.settings.aspectRatio,
          quality: this.mapQuality(request.settings.quality),
          style: request.settings.style,
          seed: request.settings.seed,
          motion_strength: request.settings.motionIntensity || 0.5,
          camera_motion: request.settings.cameraMovement || 'static',
          fps: request.settings.frameRate || 24,
          reference_images: request.referenceImages || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Pika API error: ${response.status} ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (request.metadata?.userId) {
        this.rateLimiter.addCost(request.metadata.userId, cost);
      }

      return {
        id: data.id || id,
        provider: 'pika',
        status: this.mapStatus(data.status),
        progress: data.progress || 0,
        result: data.video ? {
          videoUrl: data.video.url,
          thumbnailUrl: data.video.thumbnail_url,
          metadata: {
            duration: request.settings.duration,
            resolution: this.getResolutionFromAspectRatio(request.settings.aspectRatio),
            fps: request.settings.frameRate || 24,
            fileSize: data.video.file_size || 0,
            format: 'mp4',
            generationTime: data.generation_time_seconds || 0,
            cost,
          },
        } : undefined,
        error: data.error ? {
          message: data.error.message || 'Pika generation failed',
          code: data.error.type || 'PIKA_ERROR',
          retryable: data.error.retryable !== false,
        } : undefined,
        estimatedCompletionTime: data.estimated_completion ? new Date(data.estimated_completion) : undefined,
        createdAt: new Date(),
        completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      };
    } catch (error) {
      return {
        id,
        provider: 'pika',
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'PIKA_API_ERROR',
          retryable: true,
        },
        createdAt: new Date(),
      };
    }
  }

  async getVideoStatus(id: string): Promise<VideoGenerationResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/videos/${id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Pika API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        id,
        provider: 'pika',
        status: this.mapStatus(data.status),
        progress: data.progress || 0,
        result: data.video ? {
          videoUrl: data.video.url,
          thumbnailUrl: data.video.thumbnail_url,
          metadata: {
            duration: data.video.duration || 0,
            resolution: data.video.resolution || '1280x720',
            fps: data.video.fps || 24,
            fileSize: data.video.file_size || 0,
            format: 'mp4',
            generationTime: data.generation_time_seconds || 0,
            cost: data.cost || 0,
          },
        } : undefined,
        error: data.error ? {
          message: data.error.message || 'Pika generation failed',
          code: data.error.type || 'PIKA_ERROR',
          retryable: data.error.retryable !== false,
        } : undefined,
        estimatedCompletionTime: data.estimated_completion ? new Date(data.estimated_completion) : undefined,
        createdAt: new Date(data.created_at || Date.now()),
        completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      };
    } catch (error) {
      return {
        id,
        provider: 'pika',
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'PIKA_API_ERROR',
          retryable: true,
        },
        createdAt: new Date(),
      };
    }
  }

  async cancelVideoGeneration(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/videos/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to cancel Pika video generation:', error);
      return false;
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  getMaxDuration(): number {
    return 60;
  }

  getSupportedAspectRatios(): string[] {
    return ['16:9', '9:16', '4:3', '1:1'];
  }

  getCostPerSecond(): number {
    return 0.08;
  }

  private mapQuality(quality: string): string {
    const mapping: Record<string, string> = {
      'draft': 'fast',
      'standard': 'balanced',
      'high': 'quality',
      'premium': 'ultra',
    };
    return mapping[quality] || 'balanced';
  }

  private mapStatus(status: string): 'queued' | 'processing' | 'completed' | 'failed' {
    const mapping: Record<string, 'queued' | 'processing' | 'completed' | 'failed'> = {
      'pending': 'queued',
      'queued': 'queued',
      'waiting': 'queued',
      'generating': 'processing',
      'processing': 'processing',
      'completed': 'completed',
      'finished': 'completed',
      'success': 'completed',
      'failed': 'failed',
      'error': 'failed',
      'cancelled': 'failed',
      'timeout': 'failed',
    };
    return mapping[status?.toLowerCase()] || 'queued';
  }

  private getResolutionFromAspectRatio(aspectRatio: string): string {
    const resolutions: Record<string, string> = {
      '16:9': '1280x720',
      '9:16': '720x1280',
      '4:3': '960x720',
      '1:1': '720x720',
    };
    return resolutions[aspectRatio] || '1280x720';
  }
}