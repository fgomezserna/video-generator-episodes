import { Character, CharacterVersion, PromptEngineering } from '../types';

export interface PromptTemplate {
  id: string;
  name: string;
  category: 'character' | 'style' | 'consistency' | 'scene';
  template: string;
  variables: string[];
  description: string;
  tags: string[];
  effectivenessScore: number;
  usageCount: number;
}

export interface PromptOptimizationResult {
  optimizedPrompt: string;
  confidence: number;
  suggestions: string[];
  consistencyScore: number;
  styleScore: number;
}

export class PromptEngineeringService {
  private templates: Map<string, PromptTemplate> = new Map();
  private consistencyKeywords: string[] = [
    'same character',
    'consistent design',
    'identical facial features',
    'same proportions',
    'character reference',
    'maintaining visual identity',
    'consistent appearance',
    'same person'
  ];

  private styleModifiers: string[] = [
    'professional digital art',
    'high quality illustration',
    'detailed artwork',
    'clean lines',
    'consistent lighting',
    'professional rendering',
    'masterpiece quality',
    'studio quality'
  ];

  private negativePrompts: string[] = [
    'blurry',
    'low quality',
    'distorted features',
    'inconsistent style',
    'bad anatomy',
    'deformed',
    'ugly',
    'bad proportions',
    'duplicate',
    'mutation'
  ];

  constructor() {
    this.initializeDefaultTemplates();
  }

  /**
   * Generate an optimized prompt for character generation
   */
  generateCharacterPrompt(
    character: Character,
    versionId?: string,
    context?: {
      scene?: string;
      emotion?: string;
      pose?: string;
      setting?: string;
    }
  ): PromptOptimizationResult {
    const version = versionId 
      ? character.versions.find(v => v.id === versionId)
      : character.versions.find(v => v.id === character.currentVersion);

    if (!version) {
      throw new Error('Character version not found');
    }

    // Build base character description
    const characterDesc = this.buildCharacterDescription(version);
    
    // Add consistency keywords
    const consistencyPrompt = this.buildConsistencyPrompt(version);
    
    // Add style modifiers
    const stylePrompt = this.buildStylePrompt(version);
    
    // Add context if provided
    const contextPrompt = context ? this.buildContextPrompt(context) : '';
    
    // Combine all parts
    const parts = [
      characterDesc,
      contextPrompt,
      consistencyPrompt,
      stylePrompt
    ].filter(Boolean);

    const optimizedPrompt = parts.join(', ');
    
    // Calculate confidence and scores
    const confidence = this.calculateConfidence(optimizedPrompt, version);
    const consistencyScore = this.calculateConsistencyScore(optimizedPrompt);
    const styleScore = this.calculateStyleScore(optimizedPrompt);
    
    // Generate suggestions
    const suggestions = this.generateSuggestions(optimizedPrompt, version);

    return {
      optimizedPrompt,
      confidence,
      suggestions,
      consistencyScore,
      styleScore
    };
  }

  /**
   * Create a variation prompt based on an existing character
   */
  generateVariationPrompt(
    basePrompt: string,
    variation: {
      type: 'pose' | 'expression' | 'clothing' | 'setting' | 'lighting';
      description: string;
      intensity?: number; // 0-1, how much to vary
    }
  ): string {
    const intensity = variation.intensity || 0.5;
    
    let variationPrompt = '';
    
    switch (variation.type) {
      case 'pose':
        variationPrompt = `${variation.description} pose`;
        break;
      case 'expression':
        variationPrompt = `${variation.description} expression`;
        break;
      case 'clothing':
        variationPrompt = `wearing ${variation.description}`;
        break;
      case 'setting':
        variationPrompt = `in ${variation.description}`;
        break;
      case 'lighting':
        variationPrompt = `${variation.description} lighting`;
        break;
    }

    // Adjust consistency keywords based on intensity
    const consistencyWeight = Math.max(0.3, 1 - intensity);
    const consistencyKeywords = this.consistencyKeywords
      .slice(0, Math.ceil(this.consistencyKeywords.length * consistencyWeight))
      .join(', ');

    return `${basePrompt}, ${variationPrompt}, ${consistencyKeywords}`;
  }

  /**
   * Analyze prompt effectiveness based on generation results
   */
  analyzePromptEffectiveness(
    prompt: string,
    results: {
      generationTime: number;
      quality: number; // 0-1
      consistency: number; // 0-1
      userRating?: number; // 0-5
    }[]
  ): {
    averageQuality: number;
    averageConsistency: number;
    averageGenerationTime: number;
    effectivenessScore: number;
    recommendations: string[];
  } {
    if (results.length === 0) {
      throw new Error('No results provided for analysis');
    }

    const averageQuality = results.reduce((sum, r) => sum + r.quality, 0) / results.length;
    const averageConsistency = results.reduce((sum, r) => sum + r.consistency, 0) / results.length;
    const averageGenerationTime = results.reduce((sum, r) => sum + r.generationTime, 0) / results.length;

    // Calculate effectiveness score (weighted combination)
    const effectivenessScore = (
      averageQuality * 0.4 +
      averageConsistency * 0.4 +
      (1 - Math.min(averageGenerationTime / 60000, 1)) * 0.2 // Prefer faster generation
    );

    const recommendations = this.generateRecommendations(
      prompt,
      averageQuality,
      averageConsistency,
      averageGenerationTime
    );

    return {
      averageQuality,
      averageConsistency,
      averageGenerationTime,
      effectivenessScore,
      recommendations
    };
  }

  /**
   * Save and optimize a prompt template
   */
  savePromptTemplate(
    name: string,
    template: string,
    category: PromptTemplate['category'],
    variables: string[],
    description: string,
    tags: string[] = []
  ): PromptTemplate {
    const id = crypto.randomUUID();
    
    const promptTemplate: PromptTemplate = {
      id,
      name,
      category,
      template,
      variables,
      description,
      tags,
      effectivenessScore: 0,
      usageCount: 0
    };

    this.templates.set(id, promptTemplate);
    return promptTemplate;
  }

  /**
   * Get optimized prompts for different scenarios
   */
  getScenarioPrompts(scenario: 'portrait' | 'full-body' | 'action' | 'emotion'): {
    basePrompt: string;
    variations: string[];
    negativePrompt: string;
  } {
    const scenarios = {
      portrait: {
        basePrompt: 'close-up portrait, detailed facial features, professional headshot',
        variations: [
          'smiling warmly',
          'serious expression',
          'looking directly at camera',
          'slight head tilt',
          'three-quarter view'
        ],
        negativePrompt: 'full body, distant shot, blurry face, bad facial features'
      },
      'full-body': {
        basePrompt: 'full body shot, complete character view, standing pose',
        variations: [
          'confident pose',
          'relaxed stance',
          'dynamic action pose',
          'sitting position',
          'walking forward'
        ],
        negativePrompt: 'close-up, cropped, cut off limbs, incomplete body'
      },
      action: {
        basePrompt: 'dynamic action scene, movement, energy',
        variations: [
          'running motion',
          'jumping in air',
          'fighting pose',
          'dancing movement',
          'sports action'
        ],
        negativePrompt: 'static pose, stiff, motionless, boring composition'
      },
      emotion: {
        basePrompt: 'expressive character, clear emotions, facial expression',
        variations: [
          'happy and joyful',
          'sad and melancholic',
          'angry and determined',
          'surprised and amazed',
          'thoughtful and contemplative'
        ],
        negativePrompt: 'emotionless, blank expression, robotic'
      }
    };

    return scenarios[scenario];
  }

  private buildCharacterDescription(version: CharacterVersion): string {
    const parts = [
      `${version.appearance.age} ${version.appearance.gender}`,
      `${version.appearance.style} style`,
      version.appearance.physicalTraits.length > 0 ? version.appearance.physicalTraits.join(', ') : '',
      `wearing ${version.appearance.clothingStyle}`
    ];

    return parts.filter(Boolean).join(', ');
  }

  private buildConsistencyPrompt(version: CharacterVersion): string {
    // Use version-specific consistency keywords if available
    const versionConsistency = version.prompts.consistency || '';
    const defaultConsistency = this.consistencyKeywords.slice(0, 3).join(', ');
    
    return versionConsistency || defaultConsistency;
  }

  private buildStylePrompt(version: CharacterVersion): string {
    // Use version-specific style prompt if available
    const versionStyle = version.prompts.style || '';
    const defaultStyle = this.styleModifiers.slice(0, 3).join(', ');
    
    return versionStyle || defaultStyle;
  }

  private buildContextPrompt(context: NonNullable<Parameters<PromptEngineeringService['generateCharacterPrompt']>[2]>): string {
    const parts = [
      context.scene ? `in ${context.scene}` : '',
      context.emotion ? `${context.emotion} expression` : '',
      context.pose ? `${context.pose} pose` : '',
      context.setting ? `${context.setting} setting` : ''
    ];

    return parts.filter(Boolean).join(', ');
  }

  private calculateConfidence(prompt: string, version: CharacterVersion): number {
    let confidence = 0.5; // Base confidence
    
    // Check for consistency keywords
    const consistencyKeywordCount = this.consistencyKeywords.filter(keyword => 
      prompt.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    confidence += (consistencyKeywordCount / this.consistencyKeywords.length) * 0.3;
    
    // Check for style modifiers
    const styleModifierCount = this.styleModifiers.filter(modifier => 
      prompt.toLowerCase().includes(modifier.toLowerCase())
    ).length;
    confidence += (styleModifierCount / this.styleModifiers.length) * 0.2;
    
    return Math.min(confidence, 1);
  }

  private calculateConsistencyScore(prompt: string): number {
    const consistencyKeywordCount = this.consistencyKeywords.filter(keyword => 
      prompt.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    
    return consistencyKeywordCount / this.consistencyKeywords.length;
  }

  private calculateStyleScore(prompt: string): number {
    const styleModifierCount = this.styleModifiers.filter(modifier => 
      prompt.toLowerCase().includes(modifier.toLowerCase())
    ).length;
    
    return styleModifierCount / this.styleModifiers.length;
  }

  private generateSuggestions(prompt: string, version: CharacterVersion): string[] {
    const suggestions: string[] = [];
    
    // Check if more consistency keywords could be added
    const missingConsistency = this.consistencyKeywords.filter(keyword => 
      !prompt.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (missingConsistency.length > 0) {
      suggestions.push(`Consider adding consistency keywords: ${missingConsistency.slice(0, 2).join(', ')}`);
    }
    
    // Check for specific traits that could be emphasized
    if (version.appearance.physicalTraits.length > 0) {
      suggestions.push(`Emphasize unique physical traits: ${version.appearance.physicalTraits.slice(0, 2).join(', ')}`);
    }
    
    // Suggest negative prompts if not present
    suggestions.push('Add negative prompts to avoid common issues');
    
    return suggestions;
  }

  private generateRecommendations(
    prompt: string,
    quality: number,
    consistency: number,
    generationTime: number
  ): string[] {
    const recommendations: string[] = [];
    
    if (quality < 0.7) {
      recommendations.push('Add more quality modifiers like "masterpiece", "high quality", "detailed"');
    }
    
    if (consistency < 0.7) {
      recommendations.push('Include more consistency keywords to maintain character identity');
    }
    
    if (generationTime > 45000) { // 45 seconds
      recommendations.push('Consider reducing complexity or steps to improve generation time');
    }
    
    return recommendations;
  }

  private initializeDefaultTemplates(): void {
    // Character portrait template
    this.templates.set('portrait-base', {
      id: 'portrait-base',
      name: 'Character Portrait Base',
      category: 'character',
      template: '{age} {gender}, {style} style, {traits}, portrait, detailed face',
      variables: ['age', 'gender', 'style', 'traits'],
      description: 'Base template for character portraits',
      tags: ['portrait', 'character', 'face'],
      effectivenessScore: 0.8,
      usageCount: 0
    });

    // Full body template  
    this.templates.set('fullbody-base', {
      id: 'fullbody-base',
      name: 'Full Body Character',
      category: 'character',
      template: '{age} {gender}, {style} style, full body, {pose}, {clothing}',
      variables: ['age', 'gender', 'style', 'pose', 'clothing'],
      description: 'Template for full body character illustrations',
      tags: ['full-body', 'character', 'pose'],
      effectivenessScore: 0.75,
      usageCount: 0
    });
  }
}