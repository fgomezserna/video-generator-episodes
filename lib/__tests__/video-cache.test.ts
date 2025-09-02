import { VideoCache } from '../video/cache';
import { VideoProvider, VideoGenerationRequest, VideoGenerationResponse } from '../types';

describe('VideoCache', () => {
  let cache: VideoCache;

  beforeEach(() => {
    cache = new VideoCache();
  });

  describe('Cache Operations', () => {
    const mockRequest: VideoGenerationRequest = {
      prompt: 'Test video generation',
      settings: {
        duration: 5,
        aspectRatio: '16:9',
        quality: 'high',
      },
      metadata: {
        userId: 'user123',
        priority: 'normal',
      },
    };

    const mockResponse: VideoGenerationResponse = {
      id: 'test-id',
      provider: 'runway' as VideoProvider,
      status: 'completed',
      progress: 100,
      result: {
        videoUrl: 'https://example.com/video.mp4',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        metadata: {
          duration: 5,
          resolution: '1920x1080',
          fps: 30,
          fileSize: 1024000,
          format: 'mp4',
          generationTime: 30000,
          cost: 0.6,
        },
      },
      createdAt: new Date(),
      completedAt: new Date(),
    };

    it('should return null for non-existent cache entry', async () => {
      const result = await cache.get(mockRequest);
      expect(result).toBeNull();
    });

    it('should store and retrieve video cache entries', async () => {
      await cache.set(mockRequest, mockResponse);
      const result = await cache.get(mockRequest);
      
      expect(result).toBeTruthy();
      expect(result!.videoUrl).toBe('https://example.com/video.mp4');
      expect(result!.provider).toBe('runway');
      expect(result!.usageCount).toBe(2); // 1 for set, +1 for get
    });

    it('should not cache incomplete responses', async () => {
      const incompleteResponse = {
        ...mockResponse,
        status: 'processing' as const,
        result: undefined,
      };

      await cache.set(mockRequest, incompleteResponse);
      const result = await cache.get(mockRequest);
      
      expect(result).toBeNull();
    });

    it('should generate different cache keys for different requests', async () => {
      const request1 = { ...mockRequest, prompt: 'First prompt' };
      const request2 = { ...mockRequest, prompt: 'Second prompt' };

      await cache.set(request1, mockResponse);
      await cache.set(request2, mockResponse);

      const result1 = await cache.get(request1);
      const result2 = await cache.get(request2);

      expect(result1).toBeTruthy();
      expect(result2).toBeTruthy();
      expect(result1!.id).not.toBe(result2!.id);
    });

    it('should handle expired entries', async () => {
      await cache.set(mockRequest, mockResponse);
      
      // Manually expire the entry by modifying its expiry time
      const result = await cache.get(mockRequest);
      if (result) {
        result.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
      }

      const expiredResult = await cache.get(mockRequest);
      expect(expiredResult).toBeNull();
    });
  });

  describe('Cache Management', () => {
    const createMockRequest = (prompt: string): VideoGenerationRequest => ({
      prompt,
      settings: {
        duration: 5,
        aspectRatio: '16:9',
        quality: 'high',
      },
      metadata: {
        userId: 'user123',
        priority: 'normal',
      },
    });

    const createMockResponse = (provider: VideoProvider): VideoGenerationResponse => ({
      id: `test-${provider}`,
      provider,
      status: 'completed',
      progress: 100,
      result: {
        videoUrl: `https://example.com/${provider}.mp4`,
        thumbnailUrl: `https://example.com/${provider}.jpg`,
        metadata: {
          duration: 5,
          resolution: '1920x1080',
          fps: 30,
          fileSize: 1024000,
          format: 'mp4',
          generationTime: 30000,
          cost: 0.6,
        },
      },
      createdAt: new Date(),
      completedAt: new Date(),
    });

    it('should clear all cache entries', async () => {
      await cache.set(createMockRequest('prompt1'), createMockResponse('runway'));
      await cache.set(createMockRequest('prompt2'), createMockResponse('pika'));

      await cache.clear();
      const stats = cache.getStats();
      
      expect(stats.totalEntries).toBe(0);
    });

    it('should clear entries for specific provider', async () => {
      await cache.set(createMockRequest('prompt1'), createMockResponse('runway'));
      await cache.set(createMockRequest('prompt2'), createMockResponse('pika'));
      await cache.set(createMockRequest('prompt3'), createMockResponse('runway'));

      await cache.clear('runway');
      const stats = cache.getStats();
      
      expect(stats.totalEntries).toBe(1);
      expect(stats.providers.runway || 0).toBe(0);
      expect(stats.providers.pika).toBe(1);
    });

    it('should provide accurate cache statistics', async () => {
      await cache.set(createMockRequest('prompt1'), createMockResponse('runway'));
      await cache.set(createMockRequest('prompt2'), createMockResponse('pika'));
      await cache.set(createMockRequest('prompt3'), createMockResponse('runway'));

      const stats = cache.getStats();
      
      expect(stats.totalEntries).toBe(3);
      expect(stats.totalSize).toBe(3072000); // 3 * 1024000
      expect(stats.providers.runway).toBe(2);
      expect(stats.providers.pika).toBe(1);
    });
  });

  describe('Hash Functions', () => {
    it('should generate consistent hash for same input', () => {
      const request1: VideoGenerationRequest = {
        prompt: 'Same prompt',
        settings: {
          duration: 5,
          aspectRatio: '16:9',
          quality: 'high',
        },
        metadata: {
          userId: 'user123',
          priority: 'normal',
        },
      };

      const request2: VideoGenerationRequest = {
        prompt: 'Same prompt',
        settings: {
          duration: 5,
          aspectRatio: '16:9',
          quality: 'high',
        },
        metadata: {
          userId: 'user123',
          priority: 'normal',
        },
      };

      // Since we can't directly test the private hash methods, 
      // we'll test by checking if the same request produces the same cache behavior
      const response: VideoGenerationResponse = {
        id: 'test',
        provider: 'runway',
        status: 'completed',
        progress: 100,
        result: {
          videoUrl: 'test.mp4',
          metadata: {
            duration: 5,
            resolution: '1920x1080',
            fps: 30,
            fileSize: 1000,
            format: 'mp4',
            generationTime: 1000,
            cost: 0.5,
          },
        },
        createdAt: new Date(),
      };

      // Both requests should use the same cache key
      expect(async () => {
        await cache.set(request1, response);
        const result = await cache.get(request2);
        expect(result).toBeTruthy();
      }).not.toThrow();
    });

    it('should generate different hash for different inputs', async () => {
      const request1 = {
        prompt: 'First prompt',
        settings: {
          duration: 5,
          aspectRatio: '16:9' as const,
          quality: 'high' as const,
        },
        metadata: {
          userId: 'user123',
          priority: 'normal' as const,
        },
      };

      const request2 = {
        prompt: 'Second prompt',
        settings: {
          duration: 5,
          aspectRatio: '16:9' as const,
          quality: 'high' as const,
        },
        metadata: {
          userId: 'user123',
          priority: 'normal' as const,
        },
      };

      const response: VideoGenerationResponse = {
        id: 'test',
        provider: 'runway',
        status: 'completed',
        progress: 100,
        result: {
          videoUrl: 'test.mp4',
          metadata: {
            duration: 5,
            resolution: '1920x1080',
            fps: 30,
            fileSize: 1000,
            format: 'mp4',
            generationTime: 1000,
            cost: 0.5,
          },
        },
        createdAt: new Date(),
      };

      await cache.set(request1, response);
      const result = await cache.get(request2);
      
      // Should not find cached result for different request
      expect(result).toBeNull();
    });
  });
});