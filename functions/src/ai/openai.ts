import OpenAI from 'openai';
import { BaseAIService, AIResponse, GenerateScriptOptions, GenerateStoryboardOptions } from './base';
import { getScriptPrompt, getStoryboardPrompt } from './prompts';

export class OpenAIService extends BaseAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    super('openai', apiKey);
    this.client = new OpenAI({ 
      apiKey: this.apiKey,
    });
  }

  async generateScript(options: GenerateScriptOptions): Promise<AIResponse> {
    this.validateScriptOptions(options);
    
    const startTime = Date.now();
    const { systemPrompt, userPrompt } = getScriptPrompt(options);
    
    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      });

      const content = completion.choices[0]?.message?.content || '';
      const tokensUsed = completion.usage?.total_tokens || 0;
      const responseTime = Date.now() - startTime;

      return {
        content,
        tokensUsed,
        model: 'gpt-4',
        provider: 'openai',
        responseTime,
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateStoryboard(options: GenerateStoryboardOptions): Promise<AIResponse> {
    const startTime = Date.now();
    
    const { systemPrompt, userPrompt } = getStoryboardPrompt(options);
    
    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 3000,
        temperature: 0.6,
      });

      const content = completion.choices[0]?.message?.content || '';
      const tokensUsed = completion.usage?.total_tokens || 0;
      const responseTime = Date.now() - startTime;

      return {
        content,
        tokensUsed,
        model: 'gpt-4',
        provider: 'openai',
        responseTime,
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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