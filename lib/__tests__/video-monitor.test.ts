import { VideoMonitor, AlertConfig } from '../video/monitor';
import { VideoProvider, VideoProviderMetrics } from '../types';

// Mock fetch for testing
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('VideoMonitor', () => {
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
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const providers: VideoProvider[] = ['runway', 'pika', 'kling', 'luma'];
      const results = await monitor.performHealthChecks(providers);

      expect(results).toHaveLength(4);
      expect(results.every(r => r.isHealthy)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should detect unhealthy providers', async () => {
      mockFetch.mockImplementation((url) => {
        if (url === 'https://api.runwayml.com/health') {
          return Promise.resolve({
            ok: false,
            status: 500,
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response);
      });

      const providers: VideoProvider[] = ['runway', 'pika'];
      const results = await monitor.performHealthChecks(providers);

      expect(results[0].isHealthy).toBe(false);
      expect(results[1].isHealthy).toBe(true);
      expect(results[0].provider).toBe('runway');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const providers: VideoProvider[] = ['runway'];
      const results = await monitor.performHealthChecks(providers);

      expect(results[0].isHealthy).toBe(false);
      expect(results[0].error).toBe('Network error');
    });

    it('should measure response times', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
            } as Response);
          }, 100);
        });
      });

      const providers: VideoProvider[] = ['runway'];
      const results = await monitor.performHealthChecks(providers);

      expect(results[0].responseTime).toBeGreaterThanOrEqual(100);
    });

    it('should calculate uptime correctly', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response)  // First check: healthy
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response) // Second check: unhealthy
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response); // Third check: healthy

      const providers: VideoProvider[] = ['runway'];
      
      // Perform multiple health checks
      await monitor.performHealthChecks(providers);
      await monitor.performHealthChecks(providers);
      const results = await monitor.performHealthChecks(providers);

      // Uptime should be weighted average (90% * previous + 10% * current)
      expect(results[0].uptime).toBeGreaterThan(0);
      expect(results[0].uptime).toBeLessThan(100);
    });
  });

  describe('Health Status Retrieval', () => {
    it('should get health status for specific provider', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
      
      await monitor.performHealthChecks(['runway']);
      const status = monitor.getHealthStatus('runway');

      expect(status).not.toBeInstanceOf(Array);
      expect((status as any).provider).toBe('runway');
      expect((status as any).isHealthy).toBe(true);
    });

    it('should get health status for all providers', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
      
      await monitor.performHealthChecks(['runway', 'pika']);
      const status = monitor.getHealthStatus();

      expect(Array.isArray(status)).toBe(true);
      expect((status as any[]).length).toBe(2);
    });

    it('should return default status for unknown provider', () => {
      const status = monitor.getHealthStatus('runway');
      
      expect((status as any).isHealthy).toBe(false);
      expect((status as any).error).toBe('No health check performed');
    });
  });

  describe('SLA Calculations', () => {
    const mockMetrics: VideoProviderMetrics = {
      id: 'test-metrics',
      provider: 'runway',
      totalRequests: 1000,
      successfulRequests: 950,
      failedRequests: 50,
      averageGenerationTime: 25000,
      averageQueueTime: 5000,
      uptime: 0.95,
      costPerRequest: 0.5,
      qualityScore: 8.5,
      timestamp: new Date(),
    };

    it('should calculate SLA metrics correctly', () => {
      const sla = monitor.calculateSLA('runway', mockMetrics, 24);

      expect(sla.uptime).toBe(95); // 950/1000 * 100
      expect(sla.availability).toBe(95); // uptime * 100
      expect(sla.mtbf).toBe(28.8); // 24*60 / 50
      expect(sla.mttr).toBeCloseTo(0.417, 2); // 25000/1000/60
    });

    it('should handle zero failures in MTBF calculation', () => {
      const perfectMetrics = {
        ...mockMetrics,
        failedRequests: 0,
        successfulRequests: 1000,
      };

      const sla = monitor.calculateSLA('runway', perfectMetrics, 24);
      
      expect(sla.uptime).toBe(100);
      expect(sla.mtbf).toBe(1440); // 24*60 (full period)
    });
  });

  describe('Uptime Reports', () => {
    it('should generate comprehensive uptime report', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
      
      await monitor.performHealthChecks(['runway', 'pika']);
      const report = monitor.generateUptimeReport(24);

      expect(report).toHaveProperty('overallUptime');
      expect(report).toHaveProperty('providers');
      expect(report).toHaveProperty('recommendations');
      
      expect(typeof report.overallUptime).toBe('number');
      expect(report.providers).toHaveProperty('runway');
      expect(report.providers).toHaveProperty('pika');
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should provide recommendations for poor performance', async () => {
      // Mock a provider with poor health
      mockFetch.mockImplementation((url) => {
        if (url === 'https://api.runwayml.com/health') {
          return Promise.resolve({ ok: false, status: 500 } as Response);
        }
        return Promise.resolve({ ok: true, status: 200 } as Response);
      });

      await monitor.performHealthChecks(['runway', 'pika']);
      const report = monitor.generateUptimeReport(24);

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('runway'))).toBe(true);
    });

    it('should recommend system improvements for low overall uptime', async () => {
      // Mock all providers as unhealthy
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

      await monitor.performHealthChecks(['runway', 'pika', 'kling', 'luma']);
      const report = monitor.generateUptimeReport(24);

      expect(report.overallUptime).toBeLessThan(99);
      expect(report.recommendations.some(r => 
        r.includes('Overall system uptime') || r.includes('adding more providers')
      )).toBe(true);
    });
  });

  describe('Alerting System', () => {
    it('should trigger alert for low uptime', async () => {
      // Mock unhealthy responses to create low uptime
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

      const providers: VideoProvider[] = ['runway'];
      await monitor.performHealthChecks(providers);

      expect(alertCallback).toHaveBeenCalledWith(
        'runway',
        expect.stringContaining('Uptime below threshold')
      );
    });

    it('should trigger alert for high response time', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({ ok: true, status: 200 } as Response);
          }, 35000); // Above threshold
        });
      });

      const providers: VideoProvider[] = ['runway'];
      await monitor.performHealthChecks(providers);

      expect(alertCallback).toHaveBeenCalledWith(
        'runway',
        expect.stringContaining('Response time above threshold')
      );
    }, 40000); // Increase test timeout

    it('should trigger alert for health check failures', async () => {
      mockFetch.mockRejectedValue(new Error('Connection failed'));

      const providers: VideoProvider[] = ['runway'];
      await monitor.performHealthChecks(providers);

      expect(alertCallback).toHaveBeenCalledWith(
        'runway',
        expect.stringContaining('Health check failed')
      );
    });

    it('should not trigger alerts when monitor has no alert config', async () => {
      const monitorWithoutAlerts = new VideoMonitor();
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

      const providers: VideoProvider[] = ['runway'];
      await monitorWithoutAlerts.performHealthChecks(providers);

      // No alerts should be triggered
      expect(alertCallback).not.toHaveBeenCalled();
    });
  });

  describe('Continuous Monitoring', () => {
    it('should start and stop monitoring', () => {
      const providers: VideoProvider[] = ['runway', 'pika'];
      
      monitor.startMonitoring(providers);
      expect(monitor['checkInterval']).toBeDefined();
      
      monitor.stopMonitoring();
      expect(monitor['checkInterval']).toBeUndefined();
    });

    it('should perform periodic health checks', (done) => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
      
      // Spy on performHealthChecks
      const performHealthChecksSpy = jest.spyOn(monitor, 'performHealthChecks');
      
      // Start monitoring with a very short interval for testing
      monitor['CHECK_INTERVAL_MS'] = 100; // Override interval for testing
      monitor.startMonitoring(['runway']);

      setTimeout(() => {
        expect(performHealthChecksSpy).toHaveBeenCalled();
        monitor.stopMonitoring();
        done();
      }, 150);
    });

    it('should handle restart of monitoring', () => {
      const providers: VideoProvider[] = ['runway'];
      
      monitor.startMonitoring(providers);
      const firstInterval = monitor['checkInterval'];
      
      monitor.startMonitoring(providers);
      const secondInterval = monitor['checkInterval'];
      
      expect(firstInterval).toBeDefined();
      expect(secondInterval).toBeDefined();
      expect(firstInterval).not.toBe(secondInterval);
      
      monitor.stopMonitoring();
    });
  });

  describe('Provider Endpoint Mapping', () => {
    it('should ping correct endpoints for each provider', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      const providers: VideoProvider[] = ['runway', 'pika', 'kling', 'luma'];
      await monitor.performHealthChecks(providers);

      expect(mockFetch).toHaveBeenCalledWith('https://api.runwayml.com/health', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith('https://api.pika.art/health', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith('https://api.klingai.com/health', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith('https://api.lumalabs.ai/health', expect.any(Object));
    });

    it('should use HEAD method for efficiency', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      await monitor.performHealthChecks(['runway']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.runwayml.com/health',
        expect.objectContaining({
          method: 'HEAD',
        })
      );
    });

    it('should respect timeout for health checks', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 15000);
        });
      });

      const providers: VideoProvider[] = ['runway'];
      const results = await monitor.performHealthChecks(providers);

      expect(results[0].isHealthy).toBe(false);
    });
  });
});