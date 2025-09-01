import { BaseVideoService } from './base';
import { VideoGenerationRequest, VideoGenerationResponse } from '../types';

export class RunwayService extends BaseVideoService {
  constructor(apiKey: string) {
    super('runway', apiKey, 'https://api.runwayml.com/v1');
  }

  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    this.validateRequest(request);
    
    const id = this.generateRequestId();
    const cost = this.calculateCost(request.settings.duration, request.settings.quality);
    
    try {
      const response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text_prompt: request.prompt,
          duration: request.settings.duration,
          aspect_ratio: this.mapAspectRatio(request.settings.aspectRatio),
          quality: this.mapQuality(request.settings.quality),
          style: request.settings.style,
          seed: request.settings.seed,
          motion_intensity: request.settings.motionIntensity || 5,
          camera_movement: request.settings.cameraMovement || 'static',
          frame_rate: request.settings.frameRate || 30,
          image_prompts: request.referenceImages || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Runway API error: ${response.status} ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (request.metadata?.userId) {
        this.rateLimiter.addCost(request.metadata.userId, cost);
      }

      return {
        id: data.id || id,
        provider: 'runway',
        status: this.mapStatus(data.status),
        progress: data.progress || 0,
        result: data.output ? {
          videoUrl: data.output.video_url,
          thumbnailUrl: data.output.thumbnail_url,
          metadata: {
            duration: request.settings.duration,
            resolution: this.getResolutionFromAspectRatio(request.settings.aspectRatio),
            fps: request.settings.frameRate || 30,
            fileSize: data.output.file_size || 0,
            format: 'mp4',
            generationTime: data.generation_time || 0,
            cost,
          },
        } : undefined,
        error: data.error ? {
          message: data.error.message,
          code: data.error.code || 'RUNWAY_ERROR',
          retryable: data.error.retryable !== false,
        } : undefined,
        estimatedCompletionTime: data.estimated_completion_time ? new Date(data.estimated_completion_time) : undefined,
        createdAt: new Date(),
        completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      };
    } catch (error) {
      return {
        id,
        provider: 'runway',
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'RUNWAY_API_ERROR',
          retryable: true,
        },
        createdAt: new Date(),
      };
    }
  }

  async getVideoStatus(id: string): Promise<VideoGenerationResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/generate/${id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Runway API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        id,
        provider: 'runway',
        status: this.mapStatus(data.status),
        progress: data.progress || 0,
        result: data.output ? {
          videoUrl: data.output.video_url,
          thumbnailUrl: data.output.thumbnail_url,
          metadata: {
            duration: data.output.duration || 0,
            resolution: data.output.resolution || '1920x1080',
            fps: data.output.fps || 30,
            fileSize: data.output.file_size || 0,
            format: 'mp4',
            generationTime: data.generation_time || 0,
            cost: data.cost || 0,
          },
        } : undefined,
        error: data.error ? {
          message: data.error.message,
          code: data.error.code || 'RUNWAY_ERROR',
          retryable: data.error.retryable !== false,
        } : undefined,
        estimatedCompletionTime: data.estimated_completion_time ? new Date(data.estimated_completion_time) : undefined,
        createdAt: new Date(data.created_at || Date.now()),
        completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      };
    } catch (error) {
      return {
        id,
        provider: 'runway',
        status: 'failed',
        progress: 0,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'RUNWAY_API_ERROR',
          retryable: true,
        },
        createdAt: new Date(),
      };
    }
  }

  async cancelVideoGeneration(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/generate/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to cancel Runway video generation:', error);
      return false;
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  getMaxDuration(): number {
    return 120;
  }

  getSupportedAspectRatios(): string[] {
    return ['16:9', '9:16', '4:3', '1:1'];
  }

  getCostPerSecond(): number {
    return 0.12;
  }

  private mapAspectRatio(aspectRatio: string): string {
    const mapping: Record<string, string> = {
      '16:9': '1920:1080',
      '9:16': '1080:1920',
      '4:3': '1440:1080',
      '1:1': '1080:1080',
    };
    return mapping[aspectRatio] || '1920:1080';
  }

  private mapQuality(quality: string): string {
    const mapping: Record<string, string> = {
      'draft': 'low',
      'standard': 'medium',
      'high': 'high',
      'premium': 'ultra',
    };
    return mapping[quality] || 'medium';
  }

  private mapStatus(status: string): 'queued' | 'processing' | 'completed' | 'failed' {
    const mapping: Record<string, 'queued' | 'processing' | 'completed' | 'failed'> = {
      'pending': 'queued',
      'queued': 'queued',
      'running': 'processing',
      'processing': 'processing',
      'completed': 'completed',
      'successful': 'completed',
      'failed': 'failed',
      'error': 'failed',
      'cancelled': 'failed',
    };
    return mapping[status?.toLowerCase()] || 'queued';
  }

  private getResolutionFromAspectRatio(aspectRatio: string): string {
    const resolutions: Record<string, string> = {
      '16:9': '1920x1080',
      '9:16': '1080x1920',
      '4:3': '1440x1080',
      '1:1': '1080x1080',
    };
    return resolutions[aspectRatio] || '1920x1080';
  }
}