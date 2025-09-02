import { VideoProvider, VideoProviderMetrics } from '../types';

export interface HealthCheckResult {
  provider: VideoProvider;
  isHealthy: boolean;
  responseTime: number;
  error?: string;
  uptime: number;
  lastCheck: Date;
}

export interface AlertConfig {
  uptimeThreshold: number;
  responseTimeThreshold: number;
  failureRateThreshold: number;
  onAlert: (provider: VideoProvider, issue: string) => void;
}

export class VideoMonitor {
  private healthChecks: Map<VideoProvider, HealthCheckResult> = new Map();
  private alertConfig?: AlertConfig;
  private checkInterval?: NodeJS.Timeout;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000;

  constructor(alertConfig?: AlertConfig) {
    this.alertConfig = alertConfig;
  }

  startMonitoring(providers: VideoProvider[]): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      await this.performHealthChecks(providers);
    }, this.CHECK_INTERVAL_MS);

    this.performHealthChecks(providers);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  async performHealthChecks(providers: VideoProvider[]): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const provider of providers) {
      const result = await this.checkProviderHealth(provider);
      this.healthChecks.set(provider, result);
      results.push(result);

      if (this.alertConfig) {
        this.checkForAlerts(result);
      }
    }

    return results;
  }

  getHealthStatus(provider?: VideoProvider): HealthCheckResult | HealthCheckResult[] {
    if (provider) {
      return this.healthChecks.get(provider) || this.createDefaultHealthCheck(provider);
    }
    return Array.from(this.healthChecks.values());
  }

  calculateSLA(
    provider: VideoProvider, 
    metrics: VideoProviderMetrics, 
    periodHours: number = 24
  ): {
    uptime: number;
    availability: number;
    mtbf: number;
    mttr: number;
  } {
    const totalRequests = metrics.totalRequests;
    const successfulRequests = metrics.successfulRequests;
    const failedRequests = metrics.failedRequests;

    const uptime = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
    const availability = metrics.uptime * 100;
    
    const mtbf = failedRequests > 0 ? (periodHours * 60) / failedRequests : periodHours * 60;
    const mttr = metrics.averageGenerationTime / 1000 / 60;

    return {
      uptime,
      availability,
      mtbf,
      mttr,
    };
  }

  generateUptimeReport(periodHours: number = 24): {
    overallUptime: number;
    providers: Record<VideoProvider, {
      uptime: number;
      totalRequests: number;
      avgResponseTime: number;
    }>;
    recommendations: string[];
  } {
    const healthChecks = Array.from(this.healthChecks.values());
    const overallUptime = healthChecks.length > 0 
      ? healthChecks.reduce((sum, check) => sum + check.uptime, 0) / healthChecks.length 
      : 0;

    const providers: Record<string, any> = {};
    const recommendations: string[] = [];

    healthChecks.forEach(check => {
      providers[check.provider] = {
        uptime: check.uptime,
        totalRequests: 0,
        avgResponseTime: check.responseTime,
      };

      if (check.uptime < 95) {
        recommendations.push(`Consider reducing priority for ${check.provider} due to low uptime (${check.uptime.toFixed(1)}%)`);
      }

      if (check.responseTime > 30000) {
        recommendations.push(`${check.provider} has high response times (${check.responseTime}ms), consider alternative providers`);
      }

      if (!check.isHealthy) {
        recommendations.push(`${check.provider} is currently unhealthy: ${check.error}`);
      }
    });

    if (overallUptime < 99) {
      recommendations.push('Overall system uptime is below 99%. Consider adding more providers or improving fallback mechanisms.');
    }

    return {
      overallUptime,
      providers: providers as Record<VideoProvider, any>,
      recommendations,
    };
  }

  private async checkProviderHealth(provider: VideoProvider): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let isHealthy = true;
    let error: string | undefined;

    try {
      const success = await this.pingProvider(provider);
      isHealthy = success;
      if (!success) {
        error = 'Provider ping failed';
      }
    } catch (err) {
      isHealthy = false;
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const responseTime = Date.now() - startTime;
    const existingHealth = this.healthChecks.get(provider);
    const uptime = existingHealth ? 
      (existingHealth.uptime * 0.9 + (isHealthy ? 100 : 0) * 0.1) : 
      (isHealthy ? 100 : 0);

    return {
      provider,
      isHealthy,
      responseTime,
      error,
      uptime,
      lastCheck: new Date(),
    };
  }

  private async pingProvider(provider: VideoProvider): Promise<boolean> {
    const endpoints: Record<VideoProvider, string> = {
      runway: 'https://api.runwayml.com/health',
      pika: 'https://api.pika.art/health',
      kling: 'https://api.klingai.com/health',
      luma: 'https://api.lumalabs.ai/health',
    };

    try {
      const response = await fetch(endpoints[provider], { 
        method: 'HEAD',
        signal: AbortSignal.timeout(10000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private checkForAlerts(result: HealthCheckResult): void {
    if (!this.alertConfig) return;

    if (result.uptime < this.alertConfig.uptimeThreshold) {
      this.alertConfig.onAlert(result.provider, `Uptime below threshold: ${result.uptime.toFixed(1)}%`);
    }

    if (result.responseTime > this.alertConfig.responseTimeThreshold) {
      this.alertConfig.onAlert(result.provider, `Response time above threshold: ${result.responseTime}ms`);
    }

    if (!result.isHealthy) {
      this.alertConfig.onAlert(result.provider, `Health check failed: ${result.error}`);
    }
  }

  private createDefaultHealthCheck(provider: VideoProvider): HealthCheckResult {
    return {
      provider,
      isHealthy: false,
      responseTime: 0,
      error: 'No health check performed',
      uptime: 0,
      lastCheck: new Date(),
    };
  }
}