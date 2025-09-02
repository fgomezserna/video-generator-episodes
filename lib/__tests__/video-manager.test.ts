import { VideoManager } from '../video/manager';
import { VideoProvider, VideoGenerationRequest, VideoGenerationResponse } from '../types';

// Mock the individual provider services
jest.mock('../video/runway');
jest.mock('../video/pika');
jest.mock('../video/kling');
jest.mock('../video/luma');

import { RunwayService } from '../video/runway';
import { PikaService } from '../video/pika';
import { KlingService } from '../video/kling';
import { LumaService } from '../video/luma';

const MockRunwayService = RunwayService as jest.MockedClass<typeof RunwayService>;
const MockPikaService = PikaService as jest.MockedClass<typeof PikaService>;
const MockKlingService = KlingService as jest.MockedClass<typeof KlingService>;
const MockLumaService = LumaService as jest.MockedClass<typeof LumaService>;

describe('VideoManager', () => {
  let manager: VideoManager;
  let mockRunway: jest.Mocked<RunwayService>;
  let mockPika: jest.Mocked<PikaService>;
  let mockKling: jest.Mocked<KlingService>;
  let mockLuma: jest.Mocked<LumaService>;

  const mockRequest: VideoGenerationRequest = {
    prompt: 'Test video generation',
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

  const mockSuccessResponse: VideoGenerationResponse = {
    id: 'test-123',
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

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockRunway = {
      isAvailable: jest.fn().mockReturnValue(true),
      checkRateLimit: jest.fn().mockResolvedValue(true),
      generateVideo: jest.fn().mockResolvedValue(mockSuccessResponse),
      getVideoStatus: jest.fn().mockResolvedValue(mockSuccessResponse),
      cancelVideoGeneration: jest.fn().mockResolvedValue(true),
      getMaxDuration: jest.fn().mockReturnValue(120),
      getSupportedAspectRatios: jest.fn().mockReturnValue(['16:9', '9:16', '4:3', '1:1']),
      getCostPerSecond: jest.fn().mockReturnValue(0.12),
      getRemainingQuota: jest.fn().mockResolvedValue({ requests: 100, cost: 50 }),
      getProviderName: jest.fn().mockReturnValue('runway'),
    } as any;

    mockPika = {
      isAvailable: jest.fn().mockReturnValue(true),
      checkRateLimit: jest.fn().mockResolvedValue(true),
      generateVideo: jest.fn().mockResolvedValue({ ...mockSuccessResponse, provider: 'pika' }),
      getVideoStatus: jest.fn().mockResolvedValue({ ...mockSuccessResponse, provider: 'pika' }),
      cancelVideoGeneration: jest.fn().mockResolvedValue(true),
      getMaxDuration: jest.fn().mockReturnValue(60),
      getSupportedAspectRatios: jest.fn().mockReturnValue(['16:9', '9:16', '4:3', '1:1']),
      getCostPerSecond: jest.fn().mockReturnValue(0.08),
      getRemainingQuota: jest.fn().mockResolvedValue({ requests: 80, cost: 40 }),
      getProviderName: jest.fn().mockReturnValue('pika'),
    } as any;

    mockKling = {
      isAvailable: jest.fn().mockReturnValue(true),
      checkRateLimit: jest.fn().mockResolvedValue(true),
      generateVideo: jest.fn().mockResolvedValue({ ...mockSuccessResponse, provider: 'kling' }),
      getVideoStatus: jest.fn().mockResolvedValue({ ...mockSuccessResponse, provider: 'kling' }),
      cancelVideoGeneration: jest.fn().mockResolvedValue(false),
      getMaxDuration: jest.fn().mockReturnValue(10),
      getSupportedAspectRatios: jest.fn().mockReturnValue(['16:9', '9:16', '1:1']),
      getCostPerSecond: jest.fn().mockReturnValue(0.06),
      getRemainingQuota: jest.fn().mockResolvedValue({ requests: 60, cost: 30 }),
      getProviderName: jest.fn().mockReturnValue('kling'),
    } as any;

    mockLuma = {
      isAvailable: jest.fn().mockReturnValue(true),
      checkRateLimit: jest.fn().mockResolvedValue(true),
      generateVideo: jest.fn().mockResolvedValue({ ...mockSuccessResponse, provider: 'luma' }),
      getVideoStatus: jest.fn().mockResolvedValue({ ...mockSuccessResponse, provider: 'luma' }),
      cancelVideoGeneration: jest.fn().mockResolvedValue(true),
      getMaxDuration: jest.fn().mockReturnValue(5),
      getSupportedAspectRatios: jest.fn().mockReturnValue(['16:9', '9:16', '4:3', '1:1']),
      getCostPerSecond: jest.fn().mockReturnValue(0.14),
      getRemainingQuota: jest.fn().mockResolvedValue({ requests: 40, cost: 20 }),
      getProviderName: jest.fn().mockReturnValue('luma'),
    } as any;

    // Mock constructors
    MockRunwayService.mockImplementation(() => mockRunway);
    MockPikaService.mockImplementation(() => mockPika);
    MockKlingService.mockImplementation(() => mockKling);
    MockLumaService.mockImplementation(() => mockLuma);

    manager = new VideoManager({
      apiKeys: {
        runway: 'rw-test-key',
        pika: 'pk-test-key',
        kling: 'kl_test-key',
        luma: 'luma_test-key',
      },
    });
  });

  describe('Initialization', () => {
    it('should initialize with provided API keys', () => {
      expect(MockRunwayService).toHaveBeenCalledWith('rw-test-key');
      expect(MockPikaService).toHaveBeenCalledWith('pk-test-key');
      expect(MockKlingService).toHaveBeenCalledWith('kl_test-key');
      expect(MockLumaService).toHaveBeenCalledWith('luma_test-key');
    });

    it('should return available providers', () => {
      const providers = manager.getAvailableProviders();
      expect(providers).toEqual(['runway', 'pika', 'kling', 'luma']);
    });

    it('should check provider availability', () => {
      expect(manager.isProviderAvailable('runway')).toBe(true);
      expect(manager.isProviderAvailable('pika')).toBe(true);
      
      mockRunway.isAvailable.mockReturnValue(false);
      expect(manager.isProviderAvailable('runway')).toBe(false);
    });
  });

  describe('Video Generation', () => {
    it('should generate video with default provider order', async () => {
      const result = await manager.generateVideo(mockRequest, undefined, 'test-user');
      
      expect(result).toEqual(mockSuccessResponse);
      expect(mockRunway.checkRateLimit).toHaveBeenCalledWith('test-user');
      expect(mockRunway.generateVideo).toHaveBeenCalledWith(mockRequest);
    });

    it('should use preferred provider when specified', async () => {
      const result = await manager.generateVideo(mockRequest, 'pika', 'test-user');
      
      expect(result.provider).toBe('pika');
      expect(mockPika.generateVideo).toHaveBeenCalledWith(mockRequest);
      expect(mockRunway.generateVideo).not.toHaveBeenCalled();
    });

    it('should fallback to next provider when first fails', async () => {
      mockRunway.generateVideo.mockRejectedValueOnce(new Error('API Error'));
      
      const result = await manager.generateVideo(mockRequest, undefined, 'test-user');
      
      expect(result.provider).toBe('pika');
      expect(mockRunway.generateVideo).toHaveBeenCalled();
      expect(mockPika.generateVideo).toHaveBeenCalled();
    });

    it('should skip rate-limited providers', async () => {
      mockRunway.checkRateLimit.mockResolvedValueOnce(false);
      
      const result = await manager.generateVideo(mockRequest, undefined, 'test-user');
      
      expect(result.provider).toBe('pika');
      expect(mockRunway.generateVideo).not.toHaveBeenCalled();
      expect(mockPika.generateVideo).toHaveBeenCalled();
    });

    it('should skip unavailable providers', async () => {
      mockRunway.isAvailable.mockReturnValue(false);
      
      const result = await manager.generateVideo(mockRequest, undefined, 'test-user');
      
      expect(result.provider).toBe('pika');
      expect(mockRunway.generateVideo).not.toHaveBeenCalled();
      expect(mockPika.generateVideo).toHaveBeenCalled();
    });

    it('should skip incompatible providers', async () => {
      const longVideoRequest = {
        ...mockRequest,
        settings: { ...mockRequest.settings, duration: 15 },
      };
      
      // Kling supports max 10s, so should be skipped
      const result = await manager.generateVideo(longVideoRequest, undefined, 'test-user');
      
      expect(mockKling.generateVideo).not.toHaveBeenCalled();
    });

    it('should throw error when all providers fail', async () => {
      mockRunway.generateVideo.mockRejectedValue(new Error('Runway Error'));
      mockPika.generateVideo.mockRejectedValue(new Error('Pika Error'));
      mockKling.generateVideo.mockRejectedValue(new Error('Kling Error'));
      mockLuma.generateVideo.mockRejectedValue(new Error('Luma Error'));
      
      await expect(manager.generateVideo(mockRequest, undefined, 'test-user'))
        .rejects.toThrow('All video generation services are unavailable or rate limited');
    });
  });

  describe('Cost Optimization', () => {
    it('should select cheapest provider when cost optimization enabled', async () => {
      const costOptimizedManager = new VideoManager({
        apiKeys: {
          runway: 'rw-test-key',
          pika: 'pk-test-key',
          kling: 'kl_test-key',
          luma: 'luma_test-key',
        },
        costOptimization: true,
      });
      
      const result = await costOptimizedManager.generateVideo(mockRequest, undefined, 'test-user');
      
      // Kling has lowest cost per second (0.06), but duration might exceed limit
      // So next cheapest compatible should be Pika (0.08)
      expect(result.provider).toBe('kling'); // Since 5s is within Kling's 10s limit
    });

    it('should select highest quality provider when quality priority enabled', async () => {
      const qualityManager = new VideoManager({
        apiKeys: {
          runway: 'rw-test-key',
          pika: 'pk-test-key',
          kling: 'kl_test-key',
          luma: 'luma_test-key',
        },
        qualityPriority: true,
      });
      
      const result = await qualityManager.generateVideo(mockRequest, undefined, 'test-user');
      
      // Quality order: runway > luma > pika > kling
      expect(result.provider).toBe('runway');
    });
  });

  describe('Provider Management', () => {
    it('should get video status from specific provider', async () => {
      const result = await manager.getVideoStatus('test-123', 'pika');
      
      expect(result.provider).toBe('pika');
      expect(mockPika.getVideoStatus).toHaveBeenCalledWith('test-123');
    });

    it('should cancel video generation', async () => {
      const result = await manager.cancelVideoGeneration('test-123', 'runway');
      
      expect(result).toBe(true);
      expect(mockRunway.cancelVideoGeneration).toHaveBeenCalledWith('test-123');
    });

    it('should get provider quota', async () => {
      const quota = await manager.getProviderQuota('runway', 'test-user');
      
      expect(quota).toEqual({ requests: 100, cost: 50 });
      expect(mockRunway.getRemainingQuota).toHaveBeenCalledWith('test-user');
    });

    it('should get provider capabilities', () => {
      const capabilities = manager.getProviderCapabilities('runway');
      
      expect(capabilities).toEqual({
        maxDuration: 120,
        supportedAspectRatios: ['16:9', '9:16', '4:3', '1:1'],
        costPerSecond: 0.12,
      });
    });

    it('should throw error for non-existent provider', () => {
      expect(() => manager.getProviderCapabilities('nonexistent' as VideoProvider))
        .toThrow('nonexistent service not found');
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track provider metrics', async () => {
      await manager.generateVideo(mockRequest, 'runway', 'test-user');
      
      const metrics = manager.getProviderMetrics('runway');
      expect(Array.isArray(metrics) ? metrics[0].provider : metrics.provider).toBe('runway');
      expect(Array.isArray(metrics) ? metrics[0].totalRequests : metrics.totalRequests).toBeGreaterThan(0);
    });

    it('should record successful requests', async () => {
      await manager.generateVideo(mockRequest, 'runway', 'test-user');
      
      const metrics = manager.getProviderMetrics('runway');
      const metricsData = Array.isArray(metrics) ? metrics[0] : metrics;
      expect(metricsData.successfulRequests).toBe(1);
      expect(metricsData.failedRequests).toBe(0);
    });

    it('should record failed requests', async () => {
      mockRunway.generateVideo.mockRejectedValueOnce(new Error('API Error'));
      
      // This should fallback to pika, but runway should record a failure
      await manager.generateVideo(mockRequest, 'runway', 'test-user');
      
      const metrics = manager.getProviderMetrics('runway');
      const metricsData = Array.isArray(metrics) ? metrics[0] : metrics;
      expect(metricsData.failedRequests).toBe(1);
    });

    it('should get all provider metrics', () => {
      const allMetrics = manager.getProviderMetrics();
      expect(Array.isArray(allMetrics)).toBe(true);
      expect(allMetrics.length).toBe(4); // All 4 providers
    });
  });

  describe('Custom Fallback Order', () => {
    it('should respect custom fallback order', async () => {
      const customManager = new VideoManager({
        apiKeys: {
          runway: 'rw-test-key',
          pika: 'pk-test-key',
          kling: 'kl_test-key',
          luma: 'luma_test-key',
        },
        fallbackOrder: ['luma', 'kling', 'pika', 'runway'],
      });
      
      const result = await customManager.generateVideo(mockRequest, undefined, 'test-user');
      
      expect(result.provider).toBe('luma');
      expect(mockLuma.generateVideo).toHaveBeenCalled();
      expect(mockRunway.generateVideo).not.toHaveBeenCalled();
    });
  });
});