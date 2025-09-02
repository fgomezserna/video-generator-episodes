import { VideoProvider, VideoCacheEntry, VideoGenerationRequest, VideoGenerationResponse } from '../types';
import { createHash } from 'crypto';

export class VideoCache {
  private cache: Map<string, VideoCacheEntry> = new Map();
  private readonly DEFAULT_EXPIRY_HOURS = 24;
  private readonly MAX_CACHE_SIZE = 1000;

  async get(request: VideoGenerationRequest): Promise<VideoCacheEntry | null> {
    const key = this.generateCacheKey(request);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    entry.usageCount++;
    entry.lastAccessed = new Date();
    this.cache.set(key, entry);
    
    return entry;
  }

  async set(
    request: VideoGenerationRequest, 
    response: VideoGenerationResponse
  ): Promise<void> {
    if (response.status !== 'completed' || !response.result) {
      return;
    }

    const key = this.generateCacheKey(request);
    const entry: VideoCacheEntry = {
      id: `cache_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      promptHash: this.hashPrompt(request.prompt),
      provider: response.provider,
      settings: request.settings,
      videoUrl: response.result.videoUrl,
      thumbnailUrl: response.result.thumbnailUrl,
      metadata: {
        duration: response.result.metadata.duration,
        fileSize: response.result.metadata.fileSize,
        quality: request.settings.quality,
      },
      usageCount: 1,
      lastAccessed: new Date(),
      expiresAt: new Date(Date.now() + this.DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000),
      createdAt: new Date(),
    };

    this.cache.set(key, entry);
    this.cleanup();
  }

  async clear(provider?: VideoProvider): Promise<void> {
    if (provider) {
      const entriesToDelete: string[] = [];
      this.cache.forEach((entry, key) => {
        if (entry.provider === provider) {
          entriesToDelete.push(key);
        }
      });
      entriesToDelete.forEach(key => this.cache.delete(key));
    } else {
      this.cache.clear();
    }
  }

  getStats(): {
    totalEntries: number;
    totalSize: number;
    hitRate: number;
    providers: Record<VideoProvider, number>;
  } {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.metadata.fileSize, 0);
    const providers: Record<string, number> = {};
    
    entries.forEach(entry => {
      providers[entry.provider] = (providers[entry.provider] || 0) + 1;
    });

    return {
      totalEntries: entries.length,
      totalSize,
      hitRate: 0,
      providers: providers as Record<VideoProvider, number>,
    };
  }

  private generateCacheKey(request: VideoGenerationRequest): string {
    const keyData = {
      prompt: request.prompt,
      duration: request.settings.duration,
      aspectRatio: request.settings.aspectRatio,
      quality: request.settings.quality,
      style: request.settings.style,
      referenceImages: request.referenceImages,
    };
    
    return this.hashObject(keyData);
  }

  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('sha256').update(str).digest('hex').substring(0, 32);
  }

  private isExpired(entry: VideoCacheEntry): boolean {
    return new Date() > entry.expiresAt;
  }

  private cleanup(): void {
    if (this.cache.size <= this.MAX_CACHE_SIZE) {
      return;
    }

    const entries = Array.from(this.cache.entries());
    
    entries.sort((a, b) => {
      if (this.isExpired(a[1]) && !this.isExpired(b[1])) return 1;
      if (!this.isExpired(a[1]) && this.isExpired(b[1])) return -1;
      
      return a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime();
    });

    const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE + 100);
    toRemove.forEach(([key]) => this.cache.delete(key));
  }
}