import { CharacterVersioningService } from '../services/character-versioning';
import { CharactersDB } from '../db/characters';
import { AIImageGenerationService } from '../services/ai-image-generation';
import { CharacterStorageService } from '../services/character-storage';
import { Character, CharacterVersion } from '../types';

// Mock dependencies
jest.mock('../db/characters');
jest.mock('../services/ai-image-generation');
jest.mock('../services/character-storage');

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => 'mocked-uuid')
  }
});

const mockedCharactersDB = CharactersDB as jest.Mocked<typeof CharactersDB>;
const mockedAIImageGenerationService = AIImageGenerationService as jest.MockedClass<typeof AIImageGenerationService>;
const mockedCharacterStorageService = CharacterStorageService as jest.MockedClass<typeof CharacterStorageService>;

describe('CharacterVersioningService', () => {
  let service: CharacterVersioningService;
  let mockCharacter: Character;
  let mockVersion: CharacterVersion;

  beforeEach(() => {
    jest.clearAllMocks();
    
    service = new CharacterVersioningService();

    mockVersion = {
      id: 'version-1',
      version: 'v1.0',
      description: 'Initial version',
      referenceImages: [],
      appearance: {
        age: 'child',
        gender: 'female',
        style: 'cartoon',
        colors: ['#FF0000', '#00FF00'],
        physicalTraits: ['blue eyes'],
        clothingStyle: 'casual'
      },
      personality: ['friendly', 'curious'],
      voiceId: 'test-voice',
      prompts: {
        base: 'A friendly cartoon character',
        consistency: 'same character, consistent design',
        style: 'cartoon style, clean lines'
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

  describe('createVersion', () => {
    it('should create a new version without image generation', async () => {
      mockedCharactersDB.get.mockResolvedValue(mockCharacter);
      mockedCharactersDB.update.mockResolvedValue(undefined);

      const options = {
        description: 'Updated version with new features'
      };

      const newVersion = await service.createVersion('char-123', options);

      expect(newVersion.id).toBe('mocked-uuid');
      expect(newVersion.version).toBe('v1.1');
      expect(newVersion.description).toBe('Updated version with new features');
      expect(newVersion.isActive).toBe(true);
      expect(mockedCharactersDB.update).toHaveBeenCalledWith('char-123', 
        expect.objectContaining({
          currentVersion: 'mocked-uuid'
        })
      );
    });

    it('should create version based on specific base version', async () => {
      const baseVersion = { ...mockVersion, id: 'version-0', version: 'v0.9' };
      const characterWithMultipleVersions = {
        ...mockCharacter,
        versions: [baseVersion, mockVersion]
      };

      mockedCharactersDB.get.mockResolvedValue(characterWithMultipleVersions);
      mockedCharactersDB.update.mockResolvedValue(undefined);

      const options = {
        baseOnVersion: 'version-0',
        description: 'Based on v0.9'
      };

      const newVersion = await service.createVersion('char-123', options);

      expect(newVersion.description).toBe('Based on v0.9');
      // Should inherit from the base version
      expect(newVersion.appearance).toEqual(baseVersion.appearance);
    });

    it('should create version with image generation', async () => {
      mockedCharactersDB.get.mockResolvedValue(mockCharacter);
      mockedCharactersDB.update.mockResolvedValue(undefined);

      const mockAIService = new mockedAIImageGenerationService();
      mockAIService.generateConsistentVariations = jest.fn().mockResolvedValue([
        {
          id: 'gen-1',
          status: 'completed',
          result: {
            imageUrl: 'https://example.com/image1.png',
            metadata: {
              width: 1024,
              height: 1024,
              format: 'png',
              size: 500000,
              seed: 12345,
              generationTime: 25000,
              model: 'stable-diffusion'
            }
          },
          createdAt: new Date()
        }
      ]);

      const mockStorageService = new mockedCharacterStorageService();
      mockStorageService.uploadImageFromUrl = jest.fn().mockResolvedValue({
        id: 'img-1',
        url: 'https://storage.example.com/image1.png',
        type: 'generated',
        metadata: {
          width: 1024,
          height: 1024,
          format: 'png',
          size: 500000,
          generatedWith: 'stable-diffusion',
          seed: 12345
        },
        isActive: true,
        createdAt: new Date()
      });

      // Replace service instances with mocks
      (service as any).aiService = mockAIService;
      (service as any).storageService = mockStorageService;

      const options = {
        generateImages: true,
        imageGenerationSettings: {
          model: 'stable-diffusion' as const,
          variations: ['happy expression', 'waving'],
          basePrompt: 'cartoon character'
        }
      };

      const newVersion = await service.createVersion('char-123', options);

      expect(mockAIService.generateConsistentVariations).toHaveBeenCalled();
      expect(mockStorageService.uploadImageFromUrl).toHaveBeenCalled();
      expect(newVersion.referenceImages).toHaveLength(1);
    });

    it('should throw error if character not found', async () => {
      mockedCharactersDB.get.mockResolvedValue(null);

      await expect(service.createVersion('non-existent', {}))
        .rejects.toThrow('Character with ID non-existent not found');
    });

    it('should throw error if base version not found', async () => {
      mockedCharactersDB.get.mockResolvedValue(mockCharacter);

      const options = {
        baseOnVersion: 'non-existent-version'
      };

      await expect(service.createVersion('char-123', options))
        .rejects.toThrow('Base version non-existent-version not found');
    });
  });

  describe('updateVersion', () => {
    it('should update version properties', async () => {
      mockedCharactersDB.get.mockResolvedValue(mockCharacter);
      mockedCharactersDB.update.mockResolvedValue(undefined);

      const updates = {
        description: 'Updated description',
        appearance: {
          clothingStyle: 'formal wear'
        },
        personality: ['serious', 'professional']
      };

      const updatedVersion = await service.updateVersion('char-123', 'version-1', updates);

      expect(updatedVersion.description).toBe('Updated description');
      expect(updatedVersion.appearance.clothingStyle).toBe('formal wear');
      expect(updatedVersion.personality).toEqual(['serious', 'professional']);
      expect(mockedCharactersDB.update).toHaveBeenCalled();
    });

    it('should throw error if character not found', async () => {
      mockedCharactersDB.get.mockResolvedValue(null);

      await expect(service.updateVersion('non-existent', 'version-1', {}))
        .rejects.toThrow('Character with ID non-existent not found');
    });

    it('should throw error if version not found', async () => {
      mockedCharactersDB.get.mockResolvedValue(mockCharacter);

      await expect(service.updateVersion('char-123', 'non-existent', {}))
        .rejects.toThrow('Version non-existent not found');
    });
  });

  describe('setActiveVersion', () => {
    it('should set version as active', async () => {
      const inactiveVersion = { ...mockVersion, id: 'version-2', isActive: false };
      const characterWithMultipleVersions = {
        ...mockCharacter,
        versions: [mockVersion, inactiveVersion]
      };

      mockedCharactersDB.get.mockResolvedValue(characterWithMultipleVersions);
      mockedCharactersDB.update.mockResolvedValue(undefined);

      await service.setActiveVersion('char-123', 'version-2');

      expect(mockedCharactersDB.update).toHaveBeenCalledWith('char-123',
        expect.objectContaining({
          currentVersion: 'version-2'
        })
      );
    });

    it('should throw error if version not found', async () => {
      mockedCharactersDB.get.mockResolvedValue(mockCharacter);

      await expect(service.setActiveVersion('char-123', 'non-existent'))
        .rejects.toThrow('Version non-existent not found');
    });
  });

  describe('deleteVersion', () => {
    it('should delete a version', async () => {
      const versionToDelete = { ...mockVersion, id: 'version-2', isActive: false };
      const characterWithMultipleVersions = {
        ...mockCharacter,
        versions: [mockVersion, versionToDelete]
      };

      mockedCharactersDB.get.mockResolvedValue(characterWithMultipleVersions);
      mockedCharactersDB.update.mockResolvedValue(undefined);

      const mockStorageService = new mockedCharacterStorageService();
      mockStorageService.deleteReferenceImage = jest.fn().mockResolvedValue(undefined);
      (service as any).storageService = mockStorageService;

      await service.deleteVersion('char-123', 'version-2');

      expect(mockedCharactersDB.update).toHaveBeenCalledWith('char-123',
        expect.objectContaining({
          versions: expect.arrayContaining([
            expect.objectContaining({ id: 'version-1' })
          ])
        })
      );
    });

    it('should not delete the last remaining version', async () => {
      mockedCharactersDB.get.mockResolvedValue(mockCharacter);

      await expect(service.deleteVersion('char-123', 'version-1'))
        .rejects.toThrow('Cannot delete the last remaining version');
    });

    it('should not delete the current active version', async () => {
      const inactiveVersion = { ...mockVersion, id: 'version-2', isActive: false };
      const characterWithMultipleVersions = {
        ...mockCharacter,
        versions: [mockVersion, inactiveVersion]
      };

      mockedCharactersDB.get.mockResolvedValue(characterWithMultipleVersions);

      await expect(service.deleteVersion('char-123', 'version-1'))
        .rejects.toThrow('Cannot delete the current active version');
    });
  });

  describe('compareVersions', () => {
    it('should compare two versions and return differences', () => {
      const version2 = {
        ...mockVersion,
        id: 'version-2',
        appearance: {
          ...mockVersion.appearance,
          clothingStyle: 'formal wear',
          colors: ['#0000FF', '#FFFF00']
        },
        personality: ['serious', 'professional'],
        prompts: {
          ...mockVersion.prompts,
          style: 'realistic style, detailed'
        }
      };

      const differences = service.compareVersions(mockVersion, version2);

      expect(differences.appearance).toHaveProperty('clothingStyle');
      expect(differences.appearance.clothingStyle.old).toBe('casual');
      expect(differences.appearance.clothingStyle.new).toBe('formal wear');

      expect(differences.personality.added).toContain('serious');
      expect(differences.personality.added).toContain('professional');
      expect(differences.personality.removed).toContain('friendly');
      expect(differences.personality.removed).toContain('curious');

      expect(differences.prompts).toHaveProperty('style');
      expect(differences.prompts.style.old).toBe('cartoon style, clean lines');
      expect(differences.prompts.style.new).toBe('realistic style, detailed');
    });

    it('should handle identical versions', () => {
      const differences = service.compareVersions(mockVersion, mockVersion);

      expect(Object.keys(differences.appearance)).toHaveLength(0);
      expect(differences.personality.added).toHaveLength(0);
      expect(differences.personality.removed).toHaveLength(0);
      expect(Object.keys(differences.prompts)).toHaveLength(0);
    });
  });
});