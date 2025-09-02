import { VideoGenerationService, createVideoGenerationService } from '../services/video-generation';
import { VideoGenerationRequest, VideoGenerationResponse } from '../types';

// Mock Firebase Functions first
jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => jest.fn()),
  getFunctions: jest.fn(),
  connectFunctionsEmulator: jest.fn()
}));

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {},
  functions: {},
  auth: {}
}));

// Mock all dependencies
jest.mock('../video/manager');
jest.mock('../video/cache');
jest.mock('../video/monitor');
jest.mock('../db/queue');

import { VideoManager } from '../video/manager';
import { VideoCache } from '../video/cache';
import { VideoMonitor } from '../video/monitor';
import { queueService } from '../db/queue';

const MockVideoManager = VideoManager as jest.MockedClass<typeof VideoManager>;
const MockVideoCache = VideoCache as jest.MockedClass<typeof VideoCache>;
const MockVideoMonitor = VideoMonitor as jest.MockedClass<typeof VideoMonitor>;
const mockQueueService = queueService as jest.Mocked<typeof queueService>;

describe('VideoGenerationService', () => {
  let service: VideoGenerationService;
  let mockManager: jest.Mocked<VideoManager>;
  let mockCache: jest.Mocked<VideoCache>;
  let mockMonitor: jest.Mocked<VideoMonitor>;

  const mockRequest: VideoGenerationRequest = {
    prompt: 'Test video generation',
    settings: {
      duration: 5,
      aspectRatio: '16:9',
      quality: 'high',
    },
    metadata: {
      userId: 'test-user',
      projectId: 'test-project',
      priority: 'normal',
    },
  };

  const mockResponse: VideoGenerationResponse = {
    id: 'test-123',
    provider: 'runway',
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

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockManager = {
      generateVideo: jest.fn().mockResolvedValue(mockResponse),
      getVideoStatus: jest.fn().mockResolvedValue(mockResponse),
      cancelVideoGeneration: jest.fn().mockResolvedValue(true),
      getAvailableProviders: jest.fn().mockReturnValue(['runway', 'pika']),
      getProviderQuota: jest.fn().mockResolvedValue({ requests: 100, cost: 50 }),
      getProviderCapabilities: jest.fn().mockReturnValue({
        maxDuration: 120,
        supportedAspectRatios: ['16:9'],
        costPerSecond: 0.12,
      }),
      getProviderMetrics: jest.fn().mockReturnValue({
        provider: 'runway',
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        uptime: 0.95,
      }),
    } as any;

    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockReturnValue({
        totalEntries: 10,
        totalSize: 10240000,
        hitRate: 0.85,
        providers: { runway: 5, pika: 5 },
      }),
    } as any;

    mockMonitor = {
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
      getHealthStatus: jest.fn().mockReturnValue([
        { provider: 'runway', isHealthy: true, uptime: 95 },
        { provider: 'pika', isHealthy: true, uptime: 92 },
      ]),
      generateUptimeReport: jest.fn().mockReturnValue({
        overallUptime: 93.5,
        providers: {
          runway: { uptime: 95, totalRequests: 100, avgResponseTime: 25000 },
          pika: { uptime: 92, totalRequests: 80, avgResponseTime: 30000 },
        },
        recommendations: ['All systems operating normally'],
      }),
    } as any;

    mockQueueService.enqueueJob = jest.fn().mockResolvedValue({
      jobId: 'job-123',
      status: 'queued',
    });

    // Mock constructors
    MockVideoManager.mockImplementation(() => mockManager);
    MockVideoCache.mockImplementation(() => mockCache);
    MockVideoMonitor.mockImplementation(() => mockMonitor);

    service = new VideoGenerationService({
      apiKeys: {
        runway: 'rw-test-key',
        pika: 'pk-test-key',
      },
      enableCache: true,
      enableMonitoring: true,
    });
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(MockVideoManager).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeys: { runway: 'rw-test-key', pika: 'pk-test-key' },
        })
      );
      expect(MockVideoCache).toHaveBeenCalled();
      expect(MockVideoMonitor).toHaveBeenCalled();
      expect(mockMonitor.startMonitoring).toHaveBeenCalledWith(['runway', 'pika']);
    });

    it('should initialize without cache when disabled', () => {
      jest.clearAllMocks();
      
      new VideoGenerationService({
        apiKeys: { runway: 'rw-test-key' },
        enableCache: false,
      });

      expect(MockVideoCache).not.toHaveBeenCalled();
    });

    it('should initialize without monitoring when disabled', () => {
      jest.clearAllMocks();
      
      new VideoGenerationService({
        apiKeys: { runway: 'rw-test-key' },
        enableMonitoring: false,
      });

      expect(MockVideoMonitor).not.toHaveBeenCalled();
    });

    it('should create service using factory function', () => {
      const factoryService = createVideoGenerationService({
        apiKeys: { runway: 'rw-test-key' },
      });

      expect(factoryService).toBeInstanceOf(VideoGenerationService);
    });
  });

  describe('Video Generation', () => {
    it('should generate video successfully', async () => {
      const result = await service.generateVideo(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockManager.generateVideo).toHaveBeenCalledWith(
        mockRequest,
        undefined,
        'test-user'
      );
    });

    it('should require user ID', async () => {
      const requestWithoutUser = {
        ...mockRequest,
        metadata: undefined,
      };

      await expect(service.generateVideo(requestWithoutUser))
        .rejects.toThrow('User ID is required for video generation');
    });

    it('should use cache when available', async () => {
      const cachedEntry = {
        id: 'cached-123',
        videoUrl: 'https://cached.com/video.mp4',
        thumbnailUrl: 'https://cached.com/thumb.jpg',
        provider: 'runway',
        metadata: { duration: 5, fileSize: 1024000, quality: 'high' },
      };

      mockCache.get.mockResolvedValueOnce(cachedEntry as any);

      const result = await service.generateVideo(mockRequest);

      expect(result.status).toBe('completed');
      expect(result.result?.videoUrl).toBe('https://cached.com/video.mp4');
      expect(mockManager.generateVideo).not.toHaveBeenCalled();
    });

    it('should cache successful responses', async () => {
      await service.generateVideo(mockRequest);

      expect(mockCache.set).toHaveBeenCalledWith(mockRequest, mockResponse);
    });

    it('should not cache failed responses', async () => {
      const failedResponse = {
        ...mockResponse,
        status: 'failed' as const,
        result: undefined,
      };

      mockManager.generateVideo.mockResolvedValueOnce(failedResponse);

      await service.generateVideo(mockRequest);

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should track usage metrics', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.generateVideo(mockRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        'VideoGeneration',
        expect.stringContaining('test-user')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Queue Integration', () => {
    it('should enqueue video generation job', async () => {
      const result = await service.generateVideoWithQueue(mockRequest);

      expect(result).toEqual({
        jobId: 'job-123',
        status: 'queued',
      });

      expect(mockQueueService.enqueueJob).toHaveBeenCalledWith(
        'video_generation',
        expect.objectContaining({
          userId: 'test-user',
          projectId: 'test-project',
          variables: { videoRequest: mockRequest },
        }),
        {
          priority: 'normal',
          maxRetries: 3,
        }
      );
    });

    it('should require metadata for queue jobs', async () => {
      const requestWithoutMetadata = {
        ...mockRequest,
        metadata: undefined,
      };

      await expect(service.generateVideoWithQueue(requestWithoutMetadata))
        .rejects.toThrow('Metadata is required for queued video generation');
    });
  });

  describe('Provider Management', () => {
    it('should get video status', async () => {
      const result = await service.getVideoStatus('test-123', 'runway');

      expect(result).toEqual(mockResponse);
      expect(mockManager.getVideoStatus).toHaveBeenCalledWith('test-123', 'runway');
    });

    it('should cancel video generation', async () => {
      const result = await service.cancelVideoGeneration('test-123', 'runway');

      expect(result).toBe(true);
      expect(mockManager.cancelVideoGeneration).toHaveBeenCalledWith('test-123', 'runway');
    });

    it('should get available providers', () => {
      const result = service.getAvailableProviders();

      expect(result).toEqual(['runway', 'pika']);
      expect(mockManager.getAvailableProviders).toHaveBeenCalled();
    });

    it('should get provider quota', async () => {
      const result = await service.getProviderQuota('runway', 'test-user');

      expect(result).toEqual({ requests: 100, cost: 50 });
      expect(mockManager.getProviderQuota).toHaveBeenCalledWith('runway', 'test-user');
    });

    it('should get provider capabilities', () => {
      const result = service.getProviderCapabilities('runway');

      expect(result).toEqual({
        maxDuration: 120,
        supportedAspectRatios: ['16:9'],
        costPerSecond: 0.12,
      });
    });

    it('should get provider metrics', () => {
      const result = service.getProviderMetrics('runway');

      expect(result).toEqual(
        expect.objectContaining({
          provider: 'runway',
          totalRequests: 100,
          successfulRequests: 95,
        })
      );
    });
  });

  describe('Monitoring and Health', () => {
    it('should get health status', () => {
      const result = service.getHealthStatus();

      expect(result).toEqual([
        { provider: 'runway', isHealthy: true, uptime: 95 },
        { provider: 'pika', isHealthy: true, uptime: 92 },
      ]);
    });

    it('should generate uptime report', () => {
      const result = service.generateUptimeReport(24);

      expect(result).toEqual(
        expect.objectContaining({
          overallUptime: 93.5,
          providers: expect.any(Object),
          recommendations: expect.any(Array),
        })
      );
    });

    it('should handle monitoring when disabled', () => {
      const serviceWithoutMonitoring = new VideoGenerationService({
        apiKeys: { runway: 'rw-test-key' },
        enableMonitoring: false,
      });

      const healthStatus = serviceWithoutMonitoring.getHealthStatus();
      const uptimeReport = serviceWithoutMonitoring.generateUptimeReport();

      expect(healthStatus).toBeUndefined();
      expect(uptimeReport).toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    it('should get cache statistics', () => {
      const result = service.getCacheStats();

      expect(result).toEqual({
        totalEntries: 10,
        totalSize: 10240000,
        hitRate: 0.85,
        providers: { runway: 5, pika: 5 },
      });
    });

    it('should clear cache', async () => {
      await service.clearCache('runway');

      expect(mockCache.clear).toHaveBeenCalledWith('runway');
    });

    it('should clear all cache', async () => {
      await service.clearCache();

      expect(mockCache.clear).toHaveBeenCalledWith(undefined);
    });

    it('should handle cache operations when disabled', async () => {
      const serviceWithoutCache = new VideoGenerationService({
        apiKeys: { runway: 'rw-test-key' },
        enableCache: false,
      });

      const stats = serviceWithoutCache.getCacheStats();
      await serviceWithoutCache.clearCache();

      expect(stats).toBeUndefined();
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate costs for all providers', async () => {
      mockManager.getAvailableProviders.mockReturnValue(['runway', 'pika']);
      mockManager.getProviderCapabilities
        .mockReturnValueOnce({
          maxDuration: 120,
          supportedAspectRatios: ['16:9'],
          costPerSecond: 0.12,
        })
        .mockReturnValueOnce({
          maxDuration: 60,
          supportedAspectRatios: ['16:9'],
          costPerSecond: 0.08,
        });

      const result = await service.estimateCost(mockRequest);

      expect(result.providers).toHaveProperty('runway');
      expect(result.providers).toHaveProperty('pika');
      expect(result.providers.runway.cost).toBe(0.6); // 5 * 0.12
      expect(result.providers.pika.cost).toBe(0.4); // 5 * 0.08
      expect(result.recommended.provider).toBe('pika'); // Cheaper option
    });

    it('should handle incompatible providers in cost estimation', async () => {
      const longVideoRequest = {
        ...mockRequest,
        settings: { ...mockRequest.settings, duration: 30 },
      };

      mockManager.getAvailableProviders.mockReturnValue(['kling']);
      mockManager.getProviderCapabilities.mockReturnValue({
        maxDuration: 10, // Too short for 30s video
        supportedAspectRatios: ['16:9'],
        costPerSecond: 0.06,
      });

      const result = await service.estimateCost(longVideoRequest);

      expect(result.providers.kling.available).toBe(false);
      expect(result.providers.kling.cost).toBe(0);
    });
  });

  describe('Service Cleanup', () => {
    it('should stop monitoring on destroy', () => {
      service.destroy();

      expect(mockMonitor.stopMonitoring).toHaveBeenCalled();
    });

    it('should handle destroy when monitoring disabled', () => {
      const serviceWithoutMonitoring = new VideoGenerationService({
        apiKeys: { runway: 'rw-test-key' },
        enableMonitoring: false,
      });

      expect(() => serviceWithoutMonitoring.destroy()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle video generation errors gracefully', async () => {
      mockManager.generateVideo.mockRejectedValueOnce(new Error('Generation failed'));

      await expect(service.generateVideo(mockRequest))
        .rejects.toThrow('Generation failed');
    });

    it('should handle cache errors gracefully', async () => {
      mockCache.get.mockRejectedValueOnce(new Error('Cache error'));

      const result = await service.generateVideo(mockRequest);

      // Should still work despite cache error
      expect(result).toEqual(mockResponse);
      expect(mockManager.generateVideo).toHaveBeenCalled();
    });

    it('should handle metrics tracking errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Force an error in metrics tracking by making the request malformed
      const malformedResponse = { ...mockResponse };
      delete (malformedResponse as any).provider;

      mockManager.generateVideo.mockResolvedValueOnce(malformedResponse);

      await service.generateVideo(mockRequest);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'VideoGeneration:TrackingError',
        expect.any(String)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});