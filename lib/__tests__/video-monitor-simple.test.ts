import { VideoMonitor, AlertConfig } from '../video/monitor';
import { VideoProvider } from '../types';

// Mock fetch with complete Response interface
const createMockResponse = (ok: boolean, status: number): Response => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Error',
  headers: new Headers(),
  url: '',
  redirected: false,
  type: 'basic',
  body: null,
  bodyUsed: false,
  clone: jest.fn(),
  arrayBuffer: jest.fn(),
  blob: jest.fn(),
  formData: jest.fn(),
  json: jest.fn(),
  text: jest.fn()
} as Response);

global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('VideoMonitor - Simplified', () => {
  let monitor: VideoMonitor;
  let alertCallback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    alertCallback = jest.fn();
    
    const alertConfig: AlertConfig = {
      uptimeThreshold: 95,
      responseTimeThreshold: 30000,
      failureRateThreshold: 0.1,
      onAlert: alertCallback,
    };

    monitor = new VideoMonitor(alertConfig);
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  describe('Health Checks', () => {
    it('should perform health checks for all providers', async () => {
      mockFetch.mockResolvedValue(createMockResponse(true, 200));

      const providers: VideoProvider[] = ['runway', 'pika', 'kling', 'luma'];
      const results = await monitor.performHealthChecks(providers);

      expect(results).toHaveLength(4);
      expect(results.every(r => r.isHealthy)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should detect unhealthy providers', async () => {
      mockFetch.mockImplementation((url) => {
        if (url === 'https://api.runwayml.com/health') {
          return Promise.resolve(createMockResponse(false, 500));
        }
        return Promise.resolve(createMockResponse(true, 200));
      });

      const providers: VideoProvider[] = ['runway', 'pika'];
      const results = await monitor.performHealthChecks(providers);

      expect(results).toHaveLength(2);
      expect(results[0].isHealthy).toBe(false);
      expect(results[1].isHealthy).toBe(true);
      expect(results[0].provider).toBe('runway');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const providers: VideoProvider[] = ['runway'];
      const results = await monitor.performHealthChecks(providers);

      expect(results[0].isHealthy).toBe(false);
      expect(results[0].error).toBeDefined();
    });

    it('should measure response times', async () => {
      // Mock a delayed response
      mockFetch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve(createMockResponse(true, 200)), 50)
        )
      );

      const providers: VideoProvider[] = ['runway'];
      const results = await monitor.performHealthChecks(providers);

      expect(results[0].responseTime).toBeGreaterThan(40); // Allow for timing variance
    });

    it('should calculate uptime correctly', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(true, 200))   // First: healthy (100)
        .mockResolvedValueOnce(createMockResponse(false, 500))  // Second: unhealthy (10)
        .mockResolvedValueOnce(createMockResponse(true, 200));  // Third: healthy

      const providers: VideoProvider[] = ['runway'];
      
      // First check
      await monitor.performHealthChecks(providers);
      // Second check  
      await monitor.performHealthChecks(providers);
      // Third check
      const results = await monitor.performHealthChecks(providers);

      // Should be between 0 and 100
      expect(results[0].uptime).toBeGreaterThan(10);
      expect(results[0].uptime).toBeLessThan(100);
    });
  });

  describe('Health Status Retrieval', () => {
    it('should get health status for specific provider', async () => {
      mockFetch.mockResolvedValue(createMockResponse(true, 200));
      
      await monitor.performHealthChecks(['runway']);
      const status = monitor.getHealthStatus('runway');
      
      expect(status).toBeDefined();
      expect(status).not.toBeInstanceOf(Array);
      expect((status as any).provider).toBe('runway');
      expect((status as any).isHealthy).toBe(true);
    });

    it('should get health status for all providers', async () => {
      mockFetch.mockResolvedValue(createMockResponse(true, 200));
      
      await monitor.performHealthChecks(['runway', 'pika']);
      const statuses = monitor.getHealthStatus();
      
      expect(Array.isArray(statuses)).toBe(true);
      expect(statuses).toHaveLength(2);
    });

    it('should return default status for unknown provider', () => {
      const status = monitor.getHealthStatus('runway');
      
      expect(status).toBeDefined();
      expect((status as any).provider).toBe('runway');
      expect((status as any).isHealthy).toBe(false); // Default should be false
    });
  });

  describe('Alerting System', () => {
    it('should trigger alert for low uptime', async () => {
      // Mock multiple failures to trigger low uptime
      mockFetch.mockResolvedValue(createMockResponse(false, 500));

      const providers: VideoProvider[] = ['runway'];
      await monitor.performHealthChecks(providers);

      expect(alertCallback).toHaveBeenCalledWith(
        'runway',
        expect.stringContaining('Uptime below threshold')
      );
    });

    it('should trigger alert for health check failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection timeout'));

      const providers: VideoProvider[] = ['runway'];
      await monitor.performHealthChecks(providers);

      expect(alertCallback).toHaveBeenCalledWith(
        'runway',
        expect.stringContaining('Health check failed')
      );
    });
  });

  describe('Provider Endpoints', () => {
    it('should use correct endpoints for each provider', async () => {
      mockFetch.mockResolvedValue(createMockResponse(true, 200));

      await monitor.performHealthChecks(['runway', 'pika', 'kling', 'luma']);

      expect(mockFetch).toHaveBeenCalledWith('https://api.runwayml.com/health', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith('https://api.pika.art/health', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith('https://api.klingai.com/health', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith('https://api.lumalabs.ai/health', expect.any(Object));
    });

    it('should use HEAD method for efficiency', async () => {
      mockFetch.mockResolvedValue(createMockResponse(true, 200));

      await monitor.performHealthChecks(['runway']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.runwayml.com/health',
        expect.objectContaining({
          method: 'HEAD'
        })
      );
    });
  });
});