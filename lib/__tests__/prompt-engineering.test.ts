import { PromptEngineeringService } from '../services/prompt-engineering';
import { Character, CharacterVersion } from '../types';

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => 'mocked-uuid')
  }
});

describe('PromptEngineeringService', () => {
  let service: PromptEngineeringService;
  let mockCharacter: Character;
  let mockVersion: CharacterVersion;

  beforeEach(() => {
    service = new PromptEngineeringService();

    mockVersion = {
      id: 'version-1',
      version: 'v1.0',
      description: 'Test version',
      referenceImages: [],
      appearance: {
        age: 'child',
        gender: 'female',
        style: 'cartoon',
        colors: ['#FF0000', '#00FF00'],
        physicalTraits: ['blue eyes', 'blonde hair'],
        clothingStyle: 'casual dress'
      },
      personality: ['friendly', 'curious', 'energetic'],
      voiceId: 'test-voice',
      prompts: {
        base: 'A friendly cartoon character',
        consistency: 'same character, consistent design, identical features',
        style: 'cartoon style, clean lines, professional digital art'
      },
      metadata: {
        generationSettings: {
          model: 'stable-diffusion',
          styleStrength: 0.7,
          consistencyWeight: 0.8,
          guidanceScale: 7.5,
          steps: 30
        },
        performanceMetrics: {
          avgGenerationTime: 25000,
          consistencyScore: 0.85,
          qualityScore: 0.9
        }
      },
      isActive: true,
      createdAt: new Date()
    };

    mockCharacter = {
      id: 'char-123',
      name: 'Test Character',
      description: 'A test character',
      category: 'cartoon',
      tags: ['friendly', 'child'],
      currentVersion: 'version-1',
      versions: [mockVersion],
      library: {
        isPublic: false,
        isReusable: true,
        usageCount: 0,
        rating: 0,
        reviews: 0
      },
      ownership: {
        createdBy: 'user-123',
        sharedWith: [],
        permissions: {}
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  describe('generateCharacterPrompt', () => {
    it('should generate a comprehensive character prompt', () => {
      const result = service.generateCharacterPrompt(mockCharacter);

      expect(result.optimizedPrompt).toContain('child female');
      expect(result.optimizedPrompt).toContain('cartoon style');
      expect(result.optimizedPrompt).toContain('blue eyes, blonde hair');
      expect(result.optimizedPrompt).toContain('casual dress');
      expect(result.optimizedPrompt).toContain('consistent design');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.consistencyScore).toBeGreaterThan(0);
      expect(result.styleScore).toBeGreaterThan(0);
    });

    it('should include context when provided', () => {
      const context = {
        scene: 'playground',
        emotion: 'happy',
        pose: 'jumping',
        setting: 'sunny day'
      };

      const result = service.generateCharacterPrompt(mockCharacter, undefined, context);

      expect(result.optimizedPrompt).toContain('in playground');
      expect(result.optimizedPrompt).toContain('happy expression');
      expect(result.optimizedPrompt).toContain('jumping pose');
      expect(result.optimizedPrompt).toContain('sunny day setting');
    });

    it('should generate suggestions for improvement', () => {
      const result = service.generateCharacterPrompt(mockCharacter);

      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should work with specific version ID', () => {
      const result = service.generateCharacterPrompt(mockCharacter, 'version-1');

      expect(result.optimizedPrompt).toContain('child female');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should throw error for non-existent version', () => {
      expect(() => {
        service.generateCharacterPrompt(mockCharacter, 'non-existent-version');
      }).toThrow('Character version not found');
    });
  });

  describe('generateVariationPrompt', () => {
    it('should generate pose variation prompt', () => {
      const basePrompt = 'A cartoon character';
      const variation = {
        type: 'pose' as const,
        description: 'dancing energetically',
        intensity: 0.6
      };

      const result = service.generateVariationPrompt(basePrompt, variation);

      expect(result).toContain(basePrompt);
      expect(result).toContain('dancing energetically pose');
      expect(result).toContain('consistent');
    });

    it('should generate expression variation prompt', () => {
      const basePrompt = 'A cartoon character';
      const variation = {
        type: 'expression' as const,
        description: 'surprised and amazed'
      };

      const result = service.generateVariationPrompt(basePrompt, variation);

      expect(result).toContain('surprised and amazed expression');
    });

    it('should adjust consistency based on intensity', () => {
      const basePrompt = 'A cartoon character';
      const highIntensityVariation = {
        type: 'pose' as const,
        description: 'different pose',
        intensity: 0.9
      };
      const lowIntensityVariation = {
        type: 'pose' as const,
        description: 'different pose',
        intensity: 0.1
      };

      const highIntensityResult = service.generateVariationPrompt(basePrompt, highIntensityVariation);
      const lowIntensityResult = service.generateVariationPrompt(basePrompt, lowIntensityVariation);

      // Low intensity should have more consistency keywords
      expect(lowIntensityResult.length).toBeGreaterThan(highIntensityResult.length);
    });
  });

  describe('analyzePromptEffectiveness', () => {
    it('should analyze effectiveness with multiple results', () => {
      const results = [
        { generationTime: 20000, quality: 0.8, consistency: 0.9 },
        { generationTime: 25000, quality: 0.7, consistency: 0.8 },
        { generationTime: 30000, quality: 0.9, consistency: 0.7 }
      ];

      const analysis = service.analyzePromptEffectiveness('test prompt', results);

      expect(analysis.averageQuality).toBeCloseTo(0.8);
      expect(analysis.averageConsistency).toBeCloseTo(0.8);
      expect(analysis.averageGenerationTime).toBe(25000);
      expect(analysis.effectivenessScore).toBeGreaterThan(0);
      expect(analysis.recommendations).toBeDefined();
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    it('should provide recommendations for poor performance', () => {
      const results = [
        { generationTime: 60000, quality: 0.5, consistency: 0.4 }
      ];

      const analysis = service.analyzePromptEffectiveness('low quality prompt', results);

      expect(analysis.recommendations).toContain('Add more quality modifiers like "masterpiece", "high quality", "detailed"');
      expect(analysis.recommendations).toContain('Include more consistency keywords to maintain character identity');
      expect(analysis.recommendations).toContain('Consider reducing complexity or steps to improve generation time');
    });

    it('should throw error with no results', () => {
      expect(() => {
        service.analyzePromptEffectiveness('test prompt', []);
      }).toThrow('No results provided for analysis');
    });
  });

  describe('savePromptTemplate', () => {
    it('should save a new prompt template', () => {
      const template = service.savePromptTemplate(
        'Test Template',
        '{age} {gender}, {style} style',
        'character',
        ['age', 'gender', 'style'],
        'A test template',
        ['test', 'character']
      );

      expect(template.id).toBe('mocked-uuid');
      expect(template.name).toBe('Test Template');
      expect(template.template).toBe('{age} {gender}, {style} style');
      expect(template.variables).toEqual(['age', 'gender', 'style']);
      expect(template.effectivenessScore).toBe(0);
      expect(template.usageCount).toBe(0);
    });
  });

  describe('getScenarioPrompts', () => {
    it('should return portrait scenario prompts', () => {
      const scenario = service.getScenarioPrompts('portrait');

      expect(scenario.basePrompt).toContain('portrait');
      expect(scenario.variations).toContain('smiling warmly');
      expect(scenario.negativePrompt).toContain('full body');
    });

    it('should return full-body scenario prompts', () => {
      const scenario = service.getScenarioPrompts('full-body');

      expect(scenario.basePrompt).toContain('full body');
      expect(scenario.variations).toContain('confident pose');
      expect(scenario.negativePrompt).toContain('close-up');
    });

    it('should return action scenario prompts', () => {
      const scenario = service.getScenarioPrompts('action');

      expect(scenario.basePrompt).toContain('dynamic');
      expect(scenario.variations).toContain('running motion');
      expect(scenario.negativePrompt).toContain('static');
    });

    it('should return emotion scenario prompts', () => {
      const scenario = service.getScenarioPrompts('emotion');

      expect(scenario.basePrompt).toContain('expressive');
      expect(scenario.variations).toContain('happy and joyful');
      expect(scenario.negativePrompt).toContain('emotionless');
    });
  });
});