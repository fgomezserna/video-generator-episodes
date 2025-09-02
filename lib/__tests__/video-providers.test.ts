import { RunwayService } from '../video/runway';
import { PikaService } from '../video/pika';
import { KlingService } from '../video/kling';
import { LumaService } from '../video/luma';
import { VideoGenerationRequest, VideoProvider } from '../types';

// Mock fetch for testing
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('Video Providers', () => {
  const mockRequest: VideoGenerationRequest = {
    prompt: 'A beautiful sunset over mountains',
    settings: {
      duration: 5,
      aspectRatio: '16:9',
      quality: 'high',
    },
    metadata: {
      userId: 'test-user',
      priority: 'normal',
    },
  };

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('RunwayService', () => {
    let service: RunwayService;

    beforeEach(() => {
      service = new RunwayService('rw-test-api-key-1234567890123456789');
    });

    it('should initialize with valid API key', () => {
      expect(service.isAvailable()).toBe(true);
      expect(service.getProviderName()).toBe('runway');
    });

    it('should throw error with invalid API key', () => {
      expect(() => new RunwayService('')).toThrow('Invalid runway API key provided');
      expect(() => new RunwayService('invalid-key')).not.toThrow(); // Warning logged but doesn't throw
    });

    it('should return correct capabilities', () => {
      expect(service.getMaxDuration()).toBe(120);
      expect(service.getSupportedAspectRatios()).toEqual(['16:9', '9:16', '4:3', '1:1']);
      expect(service.getCostPerSecond()).toBe(0.12);
    });

    it('should generate video successfully', async () => {
      const mockResponseData = {
        id: 'runway-123',
        status: 'completed',
        progress: 100,
        output: {
          video_url: 'https://runway.com/video.mp4',
          thumbnail_url: 'https://runway.com/thumb.jpg',
          file_size: 2048000,
        },
        generation_time: 45000,
        completed_at: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      } as Response);

      const result = await service.generateVideo(mockRequest);

      expect(result.provider).toBe('runway');
      expect(result.status).toBe('completed');
      expect(result.result?.videoUrl).toBe('https://runway.com/video.mp4');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.runwayml.com/v1/generate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer rw-test-api-key-1234567890123456789',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'Invalid prompt' }),
      } as Response);

      const result = await service.generateVideo(mockRequest);

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Runway API error: 400');
    });

    it('should get video status', async () => {
      const mockStatusData = {
        status: 'processing',
        progress: 50,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatusData,
      } as Response);

      const result = await service.getVideoStatus('runway-123');

      expect(result.status).toBe('processing');
      expect(result.progress).toBe(50);
    });

    it('should validate request parameters', async () => {
      const invalidRequest = {
        ...mockRequest,
        prompt: '', // Invalid empty prompt
      };

      await expect(service.generateVideo(invalidRequest)).rejects.toThrow('Video prompt is required');
    });

    it('should validate duration limits', async () => {
      const invalidRequest = {
        ...mockRequest,
        settings: {
          ...mockRequest.settings,
          duration: 200, // Exceeds max duration
        },
      };

      await expect(service.generateVideo(invalidRequest)).rejects.toThrow('Duration must be between 1 and 120 seconds');
    });
  });

  describe('PikaService', () => {
    let service: PikaService;

    beforeEach(() => {
      service = new PikaService('pk-test-key-12345678901234567890');
    });

    it('should initialize correctly', () => {
      expect(service.isAvailable()).toBe(true);
      expect(service.getProviderName()).toBe('pika');
      expect(service.getMaxDuration()).toBe(60);
      expect(service.getCostPerSecond()).toBe(0.08);
    });

    it('should generate video with Pika API format', async () => {
      const mockResponseData = {
        id: 'pika-456',
        status: 'completed',
        progress: 100,
        video: {
          url: 'https://pika.art/video.mp4',
          thumbnail_url: 'https://pika.art/thumb.jpg',
          file_size: 1536000,
        },
        generation_time_seconds: 35,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      } as Response);

      const result = await service.generateVideo(mockRequest);

      expect(result.provider).toBe('pika');
      expect(result.result?.videoUrl).toBe('https://pika.art/video.mp4');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pika.art/v1/videos/generate',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('KlingService', () => {
    let service: KlingService;

    beforeEach(() => {
      service = new KlingService('kl_test-key-123456789012345678901234');
    });

    it('should initialize correctly', () => {
      expect(service.isAvailable()).toBe(true);
      expect(service.getProviderName()).toBe('kling');
      expect(service.getMaxDuration()).toBe(10);
      expect(service.getCostPerSecond()).toBe(0.06);
      expect(service.getSupportedAspectRatios()).toEqual(['16:9', '9:16', '1:1']);
    });

    it('should generate video with Kling API format', async () => {
      const mockResponseData = {
        task_id: 'kling-789',
        task_status: 'succeed',
        task_result: [{
          url: 'https://kling.ai/video.mp4',
          cover_image_url: 'https://kling.ai/cover.jpg',
          duration: 5,
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      } as Response);

      const result = await service.generateVideo(mockRequest);

      expect(result.provider).toBe('kling');
      expect(result.status).toBe('completed');
      expect(result.result?.videoUrl).toBe('https://kling.ai/video.mp4');
    });

    it('should not support cancellation', async () => {
      const result = await service.cancelVideoGeneration('test-id');
      expect(result).toBe(false);
    });
  });

  describe('LumaService', () => {
    let service: LumaService;

    beforeEach(() => {
      service = new LumaService('luma_test-key-1234567890123456789012345678');
    });

    it('should initialize correctly', () => {
      expect(service.isAvailable()).toBe(true);
      expect(service.getProviderName()).toBe('luma');
      expect(service.getMaxDuration()).toBe(5); // Fixed 5s duration
      expect(service.getCostPerSecond()).toBe(0.14);
    });

    it('should generate video with Luma API format', async () => {
      const mockResponseData = {
        id: 'luma-101',
        state: 'completed',
        assets: {
          video: 'https://luma.ai/video.mp4',
          thumbnail: 'https://luma.ai/thumb.jpg',
        },
        created_at: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      } as Response);

      const result = await service.generateVideo(mockRequest);

      expect(result.provider).toBe('luma');
      expect(result.status).toBe('completed');
      expect(result.result?.videoUrl).toBe('https://luma.ai/video.mp4');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.lumalabs.ai/dream-machine/v1/generations',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should support cancellation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      const result = await service.cancelVideoGeneration('luma-101');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.lumalabs.ai/dream-machine/v1/generations/luma-101',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Cross-Provider Validation', () => {
    const providers = [
      { name: 'runway', service: new RunwayService('rw-test-key-1234567890123456789') },
      { name: 'pika', service: new PikaService('pk-test-key-12345678901234567890') },
      { name: 'kling', service: new KlingService('kl_test-key-123456789012345678901234') },
      { name: 'luma', service: new LumaService('luma_test-key-1234567890123456789012345678') },
    ];

    it('should all validate prompts consistently', () => {
      providers.forEach(({ name, service }) => {
        const invalidRequest = {
          ...mockRequest,
          prompt: '',
        };

        expect(() => service['validateRequest'](invalidRequest)).toThrow('Video prompt is required');
      });
    });

    it('should all have consistent API key validation', () => {
      expect(() => new RunwayService('')).toThrow();
      expect(() => new PikaService('')).toThrow();
      expect(() => new KlingService('')).toThrow();
      expect(() => new LumaService('')).toThrow();
    });

    it('should all implement rate limiting', async () => {
      for (const { service } of providers) {
        const canMakeRequest = await service.checkRateLimit('test-user');
        expect(typeof canMakeRequest).toBe('boolean');
        
        const quota = await service.getRemainingQuota('test-user');
        expect(quota).toHaveProperty('requests');
        expect(quota).toHaveProperty('cost');
        expect(typeof quota.requests).toBe('number');
        expect(typeof quota.cost).toBe('number');
      }
    });

    it('should all calculate costs correctly', () => {
      providers.forEach(({ service }) => {
        const cost = service['calculateCost'](10, 'high');
        expect(typeof cost).toBe('number');
        expect(cost).toBeGreaterThan(0);
      });
    });

    it('should all support aspect ratio validation', () => {
      providers.forEach(({ service }) => {
        const supportedRatios = service.getSupportedAspectRatios();
        expect(Array.isArray(supportedRatios)).toBe(true);
        expect(supportedRatios.length).toBeGreaterThan(0);
        
        // All should support at least 16:9
        if (service.getProviderName() !== 'kling') { // Kling supports different ratios
          expect(supportedRatios).toContain('16:9');
        }
      });
    });
  });
});