import Anthropic from '@anthropic-ai/sdk';
import { BaseAIService, AIResponse, GenerateScriptOptions, GenerateStoryboardOptions } from './base';
import { getScriptPrompt, getStoryboardPrompt } from './prompts';

export class AnthropicService extends BaseAIService {
  private client: Anthropic;

  constructor(apiKey: string) {
    super('anthropic', apiKey);
    this.client = new Anthropic({ 
      apiKey: this.apiKey,
    });
  }

  async generateScript(options: GenerateScriptOptions): Promise<AIResponse> {
    this.validateScriptOptions(options);
    
    const startTime = Date.now();
    const { systemPrompt, userPrompt } = getScriptPrompt(options);
    
    try {
      const message = await this.client.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      });

      const content = message.content[0]?.type === 'text' ? message.content[0].text : '';
      const tokensUsed = message.usage.input_tokens + message.usage.output_tokens;
      const responseTime = Date.now() - startTime;

      return {
        content,
        tokensUsed,
        model: 'claude-3-sonnet-20240229',
        provider: 'anthropic',
        responseTime,
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateStoryboard(options: GenerateStoryboardOptions): Promise<AIResponse> {
    const startTime = Date.now();
    
    const { systemPrompt, userPrompt } = getStoryboardPrompt(options);
    
    try {
      const message = await this.client.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 3000,
        temperature: 0.6,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      });

      const content = message.content[0]?.type === 'text' ? message.content[0].text : '';
      const tokensUsed = message.usage.input_tokens + message.usage.output_tokens;
      const responseTime = Date.now() - startTime;

      return {
        content,
        tokensUsed,
        model: 'claude-3-sonnet-20240229',
        provider: 'anthropic',
        responseTime,
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  private validateScriptOptions(options: GenerateScriptOptions): void {
    if (!options.topic || options.topic.trim().length === 0) {
      throw new Error('Topic is required and cannot be empty');
    }
    if (options.duration < 5 || options.duration > 600) {
      throw new Error('Duration must be between 5 and 600 seconds');
    }
    if (!options.targetAudience || options.targetAudience.trim().length === 0) {
      throw new Error('Target audience is required');
    }
    if (!options.tone || options.tone.trim().length === 0) {
      throw new Error('Tone is required');
    }
  }
}