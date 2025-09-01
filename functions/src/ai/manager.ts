import { OpenAIService } from './openai';
import { AnthropicService } from './anthropic';
import { BaseAIService, AIResponse, GenerateScriptOptions, GenerateStoryboardOptions } from './base';
import { AIProvider } from '../../../lib/types';

export class AIManager {
  private services: Map<AIProvider, BaseAIService> = new Map();
  private fallbackOrder: AIProvider[] = ['openai', 'anthropic'];

  constructor(apiKeys: { openai?: string; anthropic?: string }) {
    if (apiKeys.openai) {
      this.services.set('openai', new OpenAIService(apiKeys.openai));
    }
    
    if (apiKeys.anthropic) {
      this.services.set('anthropic', new AnthropicService(apiKeys.anthropic));
    }
  }

  async generateScript(
    options: GenerateScriptOptions, 
    preferredProvider?: AIProvider,
    userId?: string
  ): Promise<AIResponse> {
    const providers = this.getProviderOrder(preferredProvider);
    
    for (const provider of providers) {
      const service = this.services.get(provider);
      
      if (!service || !service.isAvailable()) {
        continue;
      }

      if (userId) {
        const canMakeRequest = await service.checkRateLimit(userId);
        if (!canMakeRequest) {
          continue;
        }
      }

      try {
        return await service.generateScript(options);
      } catch (error) {
        console.error(`Error with ${provider} service:`, error);
        continue;
      }
    }

    throw new Error('All AI services are unavailable or rate limited');
  }

  async generateStoryboard(
    options: GenerateStoryboardOptions, 
    preferredProvider?: AIProvider,
    userId?: string
  ): Promise<AIResponse> {
    const providers = this.getProviderOrder(preferredProvider);
    
    for (const provider of providers) {
      const service = this.services.get(provider);
      
      if (!service || !service.isAvailable()) {
        continue;
      }

      if (userId) {
        const canMakeRequest = await service.checkRateLimit(userId);
        if (!canMakeRequest) {
          continue;
        }
      }

      try {
        return await service.generateStoryboard(options);
      } catch (error) {
        console.error(`Error with ${provider} service:`, error);
        continue;
      }
    }

    throw new Error('All AI services are unavailable or rate limited');
  }

  getAvailableProviders(): AIProvider[] {
    return Array.from(this.services.keys()).filter(provider => {
      const service = this.services.get(provider);
      return service && service.isAvailable();
    });
  }

  isProviderAvailable(provider: AIProvider): boolean {
    const service = this.services.get(provider);
    return service ? service.isAvailable() : false;
  }

  private getProviderOrder(preferredProvider?: AIProvider): AIProvider[] {
    if (preferredProvider && this.isProviderAvailable(preferredProvider)) {
      return [preferredProvider, ...this.fallbackOrder.filter(p => p !== preferredProvider)];
    }
    return this.fallbackOrder;
  }
}