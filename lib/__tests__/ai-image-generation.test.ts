import { AIImageGenerationService } from '../services/ai-image-generation';
import { AIImageGenerationRequest } from '../types';

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => 'mocked-uuid')
  }
});

// Mock fetch
global.fetch = jest.fn();
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('AIImageGenerationService', () => {
  let service: AIImageGenerationService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up environment variables for testing
    process.env.STABLE_DIFFUSION_API_KEY = 'test-sd-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    
    service = new AIImageGenerationService();
  });

  afterEach(() => {
    delete process.env.STABLE_DIFFUSION_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  describe('generateCharacterImage', () => {
    const mockRequest: AIImageGenerationRequest = {
      prompt: 'A friendly cartoon character',
      model: 'stable-diffusion',
      settings: {
        width: 1024,
        height: 1024,
        guidanceScale: 7.5,
        steps: 30,
        seed: 12345
      },
      metadata: {
        characterId: 'char-123',
        versionId: 'version-1',
        type: 'reference'
      }
    };

    it('should successfully generate image with Stable Diffusion', async () => {
      const mockResponse = {
        artifacts: [{
          base64: 'base64-encoded-image-data',
          seed: 12345
        }]
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateCharacterImage(mockRequest);

      expect(result.status).toBe('completed');
      expect(result.result?.imageUrl).toContain('data:image/png;base64,');
      expect(result.result?.metadata.seed).toBe(12345);
      expect(result.result?.metadata.model).toBe('stable-diffusion-xl-1024-v1-0');
    });

    it('should successfully generate image with DALL-E 3', async () => {
      const dalleRequest = { ...mockRequest, model: 'dalle-3' as const };
      const mockResponse = {
        data: [{
          url: 'https://example.com/generated-image.png'
        }]
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await service.generateCharacterImage(dalleRequest);

      expect(result.status).toBe('completed');
      expect(result.result?.imageUrl).toBe('https://example.com/generated-image.png');
      expect(result.result?.metadata.model).toBe('dall-e-3');
    });

    it('should handle API errors gracefully', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      } as Response);

      const result = await service.generateCharacterImage(mockRequest);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Stable Diffusion API error');
    });

    it('should validate settings before generation', async () => {
      const invalidRequest = {
        ...mockRequest,
        settings: {
          ...mockRequest.settings,
          width: 999, // Invalid width
          guidanceScale: 50 // Too high
        }
      };

      const result = await service.generateCharacterImage(invalidRequest);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Invalid settings');
    });

    it('should return error for unavailable provider', async () => {
      const invalidRequest = {
        ...mockRequest,
        model: 'non-existent-model' as any
      };

      const result = await service.generateCharacterImage(invalidRequest);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('not available or configured');
    });
  });

  describe('generateConsistentVariations', () => {
    it('should generate multiple variations with consistent prompts', async () => {
      const mockResponse = {
        artifacts: [{
          base64: 'base64-encoded-image-data',
          seed: 12345
        }]
      };

      // Mock multiple successful responses
      mockedFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        } as Response);

      const results = await service.generateConsistentVariations(
        'char-123',
        'A friendly cartoon character',
        ['smiling happily', 'waving hello'],
        'stable-diffusion'
      );

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('completed');
      expect(results[1].status).toBe('completed');
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success/failure results', async () => {
      mockedFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ artifacts: [{ base64: 'image1', seed: 1 }] })
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Server Error'
        } as Response);

      const results = await service.generateConsistentVariations(
        'char-123',
        'A cartoon character',
        ['happy', 'sad'],
        'stable-diffusion'
      );

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('completed');
      expect(results[1].status).toBe('failed');
    });
  });

  describe('provider availability', () => {
    it('should return available providers', () => {
      const providers = service.getAvailableProviders();
      expect(providers).toContain('stable-diffusion');
      expect(providers).toContain('dalle-3');
    });

    it('should check provider availability', () => {
      expect(service.isProviderAvailable('stable-diffusion')).toBe(true);
      expect(service.isProviderAvailable('dalle-3')).toBe(true);
      expect(service.isProviderAvailable('non-existent')).toBe(false);
    });
  });

  describe('without API keys', () => {
    beforeEach(() => {
      delete process.env.STABLE_DIFFUSION_API_KEY;
      delete process.env.OPENAI_API_KEY;
    });

    it('should handle missing API keys gracefully', () => {
      // Service should still instantiate but log warnings
      const newService = new AIImageGenerationService();
      const providers = newService.getAvailableProviders();
      
      // Should have no providers available
      expect(providers).toHaveLength(0);
    });
  });
});