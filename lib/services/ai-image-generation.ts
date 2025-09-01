import { 
  AIImageGenerationRequest, 
  AIImageGenerationResponse, 
  CharacterReferenceImage 
} from '../types';

export interface AIProvider {
  generateImage(request: AIImageGenerationRequest): Promise<AIImageGenerationResponse>;
  getGenerationStatus(jobId: string): Promise<AIImageGenerationResponse>;
  validateSettings(settings: AIImageGenerationRequest['settings']): boolean;
}

class StableDiffusionProvider implements AIProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.STABLE_DIFFUSION_API_KEY || '';
    this.baseUrl = process.env.STABLE_DIFFUSION_BASE_URL || 'https://api.stability.ai/v1';
    
    if (!this.apiKey) {
      throw new Error('STABLE_DIFFUSION_API_KEY environment variable is required');
    }
  }

  async generateImage(request: AIImageGenerationRequest): Promise<AIImageGenerationResponse> {
    const startTime = Date.now();
    
    try {
      // Prepare the Stable Diffusion API request
      const payload = {
        text_prompts: [
          {
            text: this.enhancePromptForConsistency(request.prompt, request.referenceImages),
            weight: 1.0
          }
        ],
        cfg_scale: request.settings.guidanceScale,
        steps: request.settings.steps,
        width: request.settings.width,
        height: request.settings.height,
        seed: request.settings.seed || Math.floor(Math.random() * 2147483647),
        style_preset: "enhance",
        samples: 1
      };

      const response = await fetch(`${this.baseUrl}/generation/stable-diffusion-xl-1024-v1-0/text-to-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Stable Diffusion API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const generationTime = Date.now() - startTime;

      if (result.artifacts && result.artifacts.length > 0) {
        const artifact = result.artifacts[0];
        
        return {
          id: crypto.randomUUID(),
          status: 'completed',
          result: {
            imageUrl: `data:image/png;base64,${artifact.base64}`,
            metadata: {
              width: request.settings.width,
              height: request.settings.height,
              format: 'png',
              size: artifact.base64.length,
              seed: payload.seed,
              generationTime,
              model: 'stable-diffusion-xl-1024-v1-0'
            }
          },
          createdAt: new Date(),
          completedAt: new Date()
        };
      } else {
        throw new Error('No image generated from Stable Diffusion API');
      }
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date()
      };
    }
  }

  async getGenerationStatus(jobId: string): Promise<AIImageGenerationResponse> {
    throw new Error('Stable Diffusion direct API doesn\'t support async job status checking');
  }

  validateSettings(settings: AIImageGenerationRequest['settings']): boolean {
    const validWidths = [512, 768, 1024, 1536, 2048];
    const validHeights = [512, 768, 1024, 1536, 2048];
    
    return validWidths.includes(settings.width) &&
           validHeights.includes(settings.height) &&
           settings.guidanceScale >= 1 && settings.guidanceScale <= 30 &&
           settings.steps >= 10 && settings.steps <= 50;
  }

  private enhancePromptForConsistency(prompt: string, referenceImages?: string[]): string {
    let enhancedPrompt = prompt;
    
    // Add consistency keywords
    const consistencyModifiers = [
      "consistent character design",
      "same character",
      "character reference",
      "maintaining visual identity"
    ];
    
    // Add style consistency
    const styleModifiers = [
      "professional digital art",
      "clean lines",
      "consistent lighting",
      "high quality",
      "detailed"
    ];
    
    // Combine with original prompt
    enhancedPrompt += `, ${consistencyModifiers.join(", ")}, ${styleModifiers.join(", ")}`;
    
    return enhancedPrompt;
  }
}

class DallE3Provider implements AIProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseUrl = 'https://api.openai.com/v1';
    
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  async generateImage(request: AIImageGenerationRequest): Promise<AIImageGenerationResponse> {
    const startTime = Date.now();
    
    try {
      // DALL-E 3 has different size constraints
      const size = this.mapToDallESize(request.settings.width, request.settings.height);
      
      const payload = {
        model: "dall-e-3",
        prompt: this.enhancePromptForConsistency(request.prompt, request.referenceImages),
        n: 1,
        size: size,
        quality: "hd",
        style: "vivid"
      };

      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DALL-E 3 API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      const generationTime = Date.now() - startTime;

      if (result.data && result.data.length > 0) {
        const imageData = result.data[0];
        
        return {
          id: crypto.randomUUID(),
          status: 'completed',
          result: {
            imageUrl: imageData.url,
            metadata: {
              width: this.getSizeFromDallEFormat(size).width,
              height: this.getSizeFromDallEFormat(size).height,
              format: 'png',
              size: 0, // DALL-E doesn't provide file size
              seed: 0, // DALL-E doesn't expose seed
              generationTime,
              model: 'dall-e-3'
            }
          },
          createdAt: new Date(),
          completedAt: new Date()
        };
      } else {
        throw new Error('No image generated from DALL-E 3 API');
      }
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date()
      };
    }
  }

  async getGenerationStatus(jobId: string): Promise<AIImageGenerationResponse> {
    throw new Error('DALL-E 3 doesn\'t support async job status checking');
  }

  validateSettings(settings: AIImageGenerationRequest['settings']): boolean {
    const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
    const requestedSize = `${settings.width}x${settings.height}`;
    
    return validSizes.includes(requestedSize);
  }

  private mapToDallESize(width: number, height: number): string {
    // DALL-E 3 only supports specific sizes
    if (width === height) return '1024x1024';
    if (width > height) return '1792x1024';
    return '1024x1792';
  }

  private getSizeFromDallEFormat(size: string): { width: number; height: number } {
    const [width, height] = size.split('x').map(Number);
    return { width, height };
  }

  private enhancePromptForConsistency(prompt: string, referenceImages?: string[]): string {
    let enhancedPrompt = prompt;
    
    // Add DALL-E specific consistency instructions
    enhancedPrompt = `Create a consistent character design: ${enhancedPrompt}. ` +
                    `Ensure the character maintains the same visual identity, ` +
                    `facial features, clothing style, and proportions. ` +
                    `Professional digital art style with clean details.`;
    
    return enhancedPrompt;
  }
}

export class AIImageGenerationService {
  private providers: Map<string, AIProvider>;

  constructor() {
    this.providers = new Map();
    
    try {
      this.providers.set('stable-diffusion', new StableDiffusionProvider());
    } catch (error) {
      console.warn('Stable Diffusion provider not available:', error);
    }
    
    try {
      this.providers.set('dalle-3', new DallE3Provider());
    } catch (error) {
      console.warn('DALL-E 3 provider not available:', error);
    }
  }

  async generateCharacterImage(request: AIImageGenerationRequest): Promise<AIImageGenerationResponse> {
    const provider = this.providers.get(request.model);
    if (!provider) {
      return {
        id: crypto.randomUUID(),
        status: 'failed',
        error: `AI provider '${request.model}' is not available or configured`,
        createdAt: new Date()
      };
    }

    if (!provider.validateSettings(request.settings)) {
      return {
        id: crypto.randomUUID(),
        status: 'failed',
        error: `Invalid settings for ${request.model}`,
        createdAt: new Date()
      };
    }

    return await provider.generateImage(request);
  }

  async generateConsistentVariations(
    characterId: string,
    basePrompt: string,
    variations: string[],
    model: 'stable-diffusion' | 'dalle-3' = 'stable-diffusion',
    referenceImages: string[] = []
  ): Promise<AIImageGenerationResponse[]> {
    const results: AIImageGenerationResponse[] = [];

    for (const variation of variations) {
      const request: AIImageGenerationRequest = {
        prompt: `${basePrompt}, ${variation}`,
        model,
        referenceImages,
        settings: {
          width: model === 'dalle-3' ? 1024 : 1024,
          height: model === 'dalle-3' ? 1024 : 1024,
          guidanceScale: 7.5,
          steps: 30,
          consistencyWeight: 0.8,
          styleStrength: 0.7
        },
        metadata: {
          characterId,
          type: 'variation'
        }
      };

      const result = await this.generateCharacterImage(request);
      results.push(result);

      // Add small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  isProviderAvailable(model: string): boolean {
    return this.providers.has(model);
  }
}