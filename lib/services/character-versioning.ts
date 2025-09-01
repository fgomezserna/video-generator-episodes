import { 
  Character, 
  CharacterVersion, 
  CharacterReferenceImage,
  AIImageGenerationRequest 
} from '../types';
import { CharactersDB } from '../db/characters';
import { AIImageGenerationService } from './ai-image-generation';
import { CharacterStorageService } from './character-storage';

export interface VersionCreationOptions {
  description?: string;
  baseOnVersion?: string;
  generateImages?: boolean;
  imageGenerationSettings?: {
    model: 'stable-diffusion' | 'dalle-3';
    variations: string[];
    basePrompt?: string;
  };
}

export interface VersionUpdateOptions {
  description?: string;
  appearance?: Partial<CharacterVersion['appearance']>;
  personality?: string[];
  prompts?: Partial<CharacterVersion['prompts']>;
  generationSettings?: Partial<CharacterVersion['metadata']['generationSettings']>;
}

export class CharacterVersioningService {
  private aiService: AIImageGenerationService;
  private storageService: CharacterStorageService;

  constructor() {
    this.aiService = new AIImageGenerationService();
    this.storageService = new CharacterStorageService();
  }

  /**
   * Create a new version of a character
   */
  async createVersion(
    characterId: string,
    options: VersionCreationOptions = {}
  ): Promise<CharacterVersion> {
    try {
      const character = await CharactersDB.get(characterId);
      if (!character) {
        throw new Error(`Character with ID ${characterId} not found`);
      }

      // Get base version if specified
      let baseVersion: CharacterVersion | undefined;
      if (options.baseOnVersion) {
        baseVersion = character.versions.find(v => v.id === options.baseOnVersion);
        if (!baseVersion) {
          throw new Error(`Base version ${options.baseOnVersion} not found`);
        }
      } else {
        // Use current version as base
        baseVersion = character.versions.find(v => v.id === character.currentVersion);
      }

      // Generate new version ID
      const newVersionId = crypto.randomUUID();
      const versionNumber = this.generateVersionNumber(character.versions);

      // Create new version
      const newVersion: CharacterVersion = {
        id: newVersionId,
        version: versionNumber,
        description: options.description || `Version ${versionNumber}`,
        referenceImages: [],
        appearance: baseVersion?.appearance || this.getDefaultAppearance(),
        personality: baseVersion?.personality || [],
        voiceId: baseVersion?.voiceId,
        prompts: baseVersion?.prompts || this.getDefaultPrompts(),
        metadata: {
          generationSettings: baseVersion?.metadata.generationSettings || this.getDefaultGenerationSettings(),
          performanceMetrics: {
            avgGenerationTime: 0,
            consistencyScore: 0,
            qualityScore: 0
          }
        },
        isActive: true,
        createdAt: new Date()
      };

      // Generate images if requested
      if (options.generateImages && options.imageGenerationSettings) {
        await this.generateVersionImages(
          characterId,
          newVersion,
          options.imageGenerationSettings
        );
      }

      // Add version to character
      character.versions.push(newVersion);
      
      // Update character in database
      await CharactersDB.update(characterId, {
        versions: character.versions,
        currentVersion: newVersionId,
        updatedAt: new Date()
      });

      return newVersion;
    } catch (error) {
      throw new Error(`Failed to create character version: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing version
   */
  async updateVersion(
    characterId: string,
    versionId: string,
    updates: VersionUpdateOptions
  ): Promise<CharacterVersion> {
    try {
      const character = await CharactersDB.get(characterId);
      if (!character) {
        throw new Error(`Character with ID ${characterId} not found`);
      }

      const versionIndex = character.versions.findIndex(v => v.id === versionId);
      if (versionIndex === -1) {
        throw new Error(`Version ${versionId} not found`);
      }

      const version = character.versions[versionIndex];

      // Update version properties
      if (updates.description) version.description = updates.description;
      if (updates.appearance) {
        version.appearance = { ...version.appearance, ...updates.appearance };
      }
      if (updates.personality) version.personality = updates.personality;
      if (updates.prompts) {
        version.prompts = { ...version.prompts, ...updates.prompts };
      }
      if (updates.generationSettings) {
        version.metadata.generationSettings = {
          ...version.metadata.generationSettings,
          ...updates.generationSettings
        };
      }

      // Update the version in the array
      character.versions[versionIndex] = version;

      // Update character in database
      await CharactersDB.update(characterId, {
        versions: character.versions,
        updatedAt: new Date()
      });

      return version;
    } catch (error) {
      throw new Error(`Failed to update character version: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set a version as the current active version
   */
  async setActiveVersion(characterId: string, versionId: string): Promise<void> {
    try {
      const character = await CharactersDB.get(characterId);
      if (!character) {
        throw new Error(`Character with ID ${characterId} not found`);
      }

      const version = character.versions.find(v => v.id === versionId);
      if (!version) {
        throw new Error(`Version ${versionId} not found`);
      }

      // Deactivate all versions
      character.versions.forEach(v => v.isActive = false);
      
      // Activate the selected version
      version.isActive = true;

      // Update character
      await CharactersDB.update(characterId, {
        currentVersion: versionId,
        versions: character.versions,
        updatedAt: new Date()
      });
    } catch (error) {
      throw new Error(`Failed to set active version: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a version (cannot delete if it's the only version or current version)
   */
  async deleteVersion(characterId: string, versionId: string): Promise<void> {
    try {
      const character = await CharactersDB.get(characterId);
      if (!character) {
        throw new Error(`Character with ID ${characterId} not found`);
      }

      if (character.versions.length <= 1) {
        throw new Error('Cannot delete the last remaining version');
      }

      if (character.currentVersion === versionId) {
        throw new Error('Cannot delete the current active version. Set another version as active first.');
      }

      const versionIndex = character.versions.findIndex(v => v.id === versionId);
      if (versionIndex === -1) {
        throw new Error(`Version ${versionId} not found`);
      }

      const version = character.versions[versionIndex];

      // Delete associated images from storage
      for (const image of version.referenceImages) {
        try {
          await this.storageService.deleteReferenceImage(characterId, versionId, image.id);
        } catch (error) {
          console.warn(`Failed to delete image ${image.id}:`, error);
        }
      }

      // Remove version from array
      character.versions.splice(versionIndex, 1);

      // Update character in database
      await CharactersDB.update(characterId, {
        versions: character.versions,
        updatedAt: new Date()
      });
    } catch (error) {
      throw new Error(`Failed to delete character version: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Compare two versions and return differences
   */
  compareVersions(version1: CharacterVersion, version2: CharacterVersion): {
    appearance: Record<string, { old: any; new: any }>;
    personality: { added: string[]; removed: string[] };
    prompts: Record<string, { old: string; new: string }>;
    settings: Record<string, { old: any; new: any }>;
  } {
    const differences: any = {
      appearance: {},
      personality: { added: [], removed: [] },
      prompts: {},
      settings: {}
    };

    // Compare appearance
    Object.keys(version1.appearance).forEach(key => {
      if (JSON.stringify(version1.appearance[key as keyof typeof version1.appearance]) !== 
          JSON.stringify(version2.appearance[key as keyof typeof version2.appearance])) {
        differences.appearance[key] = {
          old: version1.appearance[key as keyof typeof version1.appearance],
          new: version2.appearance[key as keyof typeof version2.appearance]
        };
      }
    });

    // Compare personality
    const personality1Set = new Set(version1.personality);
    const personality2Set = new Set(version2.personality);
    
    differences.personality.added = version2.personality.filter(p => !personality1Set.has(p));
    differences.personality.removed = version1.personality.filter(p => !personality2Set.has(p));

    // Compare prompts
    Object.keys(version1.prompts).forEach(key => {
      if (version1.prompts[key as keyof typeof version1.prompts] !== 
          version2.prompts[key as keyof typeof version2.prompts]) {
        differences.prompts[key] = {
          old: version1.prompts[key as keyof typeof version1.prompts],
          new: version2.prompts[key as keyof typeof version2.prompts]
        };
      }
    });

    // Compare generation settings
    Object.keys(version1.metadata.generationSettings).forEach(key => {
      if (version1.metadata.generationSettings[key as keyof typeof version1.metadata.generationSettings] !== 
          version2.metadata.generationSettings[key as keyof typeof version2.metadata.generationSettings]) {
        differences.settings[key] = {
          old: version1.metadata.generationSettings[key as keyof typeof version1.metadata.generationSettings],
          new: version2.metadata.generationSettings[key as keyof typeof version2.metadata.generationSettings]
        };
      }
    });

    return differences;
  }

  /**
   * Generate images for a version
   */
  private async generateVersionImages(
    characterId: string,
    version: CharacterVersion,
    settings: NonNullable<VersionCreationOptions['imageGenerationSettings']>
  ): Promise<void> {
    try {
      const basePrompt = settings.basePrompt || this.buildPromptFromVersion(version);
      
      const results = await this.aiService.generateConsistentVariations(
        characterId,
        basePrompt,
        settings.variations,
        settings.model
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'completed' && result.result) {
          try {
            const referenceImage = await this.storageService.uploadImageFromUrl(
              characterId,
              version.id,
              result.result.imageUrl,
              {
                type: 'generated',
                metadata: {
                  width: result.result.metadata.width,
                  height: result.result.metadata.height,
                  format: result.result.metadata.format,
                  size: result.result.metadata.size,
                  generatedWith: settings.model,
                  prompt: `${basePrompt}, ${settings.variations[i]}`,
                  seed: result.result.metadata.seed
                }
              }
            );

            version.referenceImages.push(referenceImage);
          } catch (storageError) {
            console.warn(`Failed to store generated image:`, storageError);
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to generate version images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build a prompt from version data
   */
  private buildPromptFromVersion(version: CharacterVersion): string {
    const parts = [
      `${version.appearance.gender} ${version.appearance.age}`,
      version.appearance.style,
      `wearing ${version.appearance.clothingStyle}`,
      `with ${version.appearance.physicalTraits.join(', ')}`,
      `personality: ${version.personality.join(', ')}`
    ];

    return parts.filter(Boolean).join(', ');
  }

  private generateVersionNumber(existingVersions: CharacterVersion[]): string {
    const numbers = existingVersions
      .map(v => {
        const match = v.version.match(/^v?(\d+)\.(\d+)$/);
        return match ? [parseInt(match[1]), parseInt(match[2])] : [0, 0];
      })
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    const lastVersion = numbers[numbers.length - 1] || [0, 0];
    return `v${lastVersion[0]}.${lastVersion[1] + 1}`;
  }

  private getDefaultAppearance(): CharacterVersion['appearance'] {
    return {
      age: 'adult',
      gender: 'non-binary',
      style: 'cartoon',
      colors: ['#000000', '#FFFFFF'],
      physicalTraits: [],
      clothingStyle: 'casual'
    };
  }

  private getDefaultPrompts(): CharacterVersion['prompts'] {
    return {
      base: 'A character illustration',
      consistency: 'same character, consistent design, same facial features',
      style: 'professional digital art, clean lines, detailed'
    };
  }

  private getDefaultGenerationSettings(): CharacterVersion['metadata']['generationSettings'] {
    return {
      model: 'stable-diffusion',
      styleStrength: 0.7,
      consistencyWeight: 0.8,
      guidanceScale: 7.5,
      steps: 30
    };
  }
}