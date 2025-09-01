import { GenerateScriptOptions, GenerateStoryboardOptions } from './base';
import { ContentType } from '../types';

export function getScriptPrompt(options: GenerateScriptOptions) {
  const systemPrompt = getScriptSystemPrompt(options.contentType);
  const userPrompt = buildScriptUserPrompt(options);
  
  return { systemPrompt, userPrompt };
}

export function getStoryboardPrompt(options: GenerateStoryboardOptions) {
  const systemPrompt = getStoryboardSystemPrompt(options.contentType);
  const userPrompt = buildStoryboardUserPrompt(options);
  
  return { systemPrompt, userPrompt };
}

function getScriptSystemPrompt(contentType: ContentType): string {
  const basePrompt = `You are an expert scriptwriter specializing in creating engaging video content. Your scripts should be well-structured, compelling, and appropriate for video production.

Always respond with a JSON object containing:
- title: The script title
- scenes: Array of scene objects with id, title, description, dialogue, visualElements, duration, characters, setting, and mood
- metadata: Object with duration, wordCount, characterCount, targetAudience, and tone

Each scene should have:
- Clear visual descriptions
- Natural dialogue (if applicable)
- Specific timing and pacing
- Detailed setting and mood information`;

  switch (contentType) {
    case 'kids':
      return `${basePrompt}

CHILDREN'S CONTENT GUIDELINES:
- Use simple, age-appropriate language
- Include educational elements when possible
- Maintain positive, uplifting tone
- Ensure content is safe and appropriate for children
- Include interactive elements or questions
- Use bright, colorful visual descriptions
- Keep scenes short and engaging (30-60 seconds each)`;

    case 'marketing':
      return `${basePrompt}

MARKETING CONTENT GUIDELINES:
- Focus on clear value propositions
- Include strong call-to-action elements
- Maintain persuasive but not pushy tone
- Highlight benefits over features
- Use emotional storytelling
- Include brand personality elements
- Structure for conversion optimization`;

    case 'documentary':
      return `${basePrompt}

DOCUMENTARY CONTENT GUIDELINES:
- Prioritize factual accuracy and research
- Use authoritative, informative tone
- Include narrative structure with clear progression
- Incorporate expert perspectives when relevant
- Balance information with storytelling
- Use descriptive, cinematic visual language
- Structure for educational impact`;

    case 'educational':
      return `${basePrompt}

EDUCATIONAL CONTENT GUIDELINES:
- Break complex topics into digestible segments
- Use clear, instructional language
- Include examples and practical applications
- Structure content for learning progression
- Incorporate engagement techniques
- Use visual metaphors and analogies
- Design for knowledge retention`;

    default:
      return basePrompt;
  }
}

function buildScriptUserPrompt(options: GenerateScriptOptions): string {
  let prompt = `Create a video script with the following requirements:

Topic: ${options.topic}
Duration: ${options.duration} seconds
Target Audience: ${options.targetAudience}
Tone: ${options.tone}`;

  if (options.characters && options.characters.length > 0) {
    prompt += `\nCharacters to include: ${options.characters.join(', ')}`;
  }

  if (options.additionalInstructions) {
    prompt += `\nAdditional Instructions: ${options.additionalInstructions}`;
  }

  prompt += `\n\nPlease ensure the script:
- Fits within the specified duration
- Is appropriate for the target audience
- Maintains the specified tone throughout
- Has clear visual elements for each scene
- Flows naturally from scene to scene`;

  return prompt;
}

function getStoryboardSystemPrompt(contentType: ContentType): string {
  const basePrompt = `You are an expert visual director and storyboard artist. You create detailed visual breakdowns for video production, focusing on composition, lighting, camera work, and visual storytelling.

Always respond with a JSON object containing:
- scenes: Array of storyboard scene objects with sceneNumber, title, description, visualPrompt, characters, setting, composition, lighting, cameraAngle, mood, and duration

Each storyboard scene should include:
- Detailed visual composition descriptions
- Specific camera angles and movements
- Lighting mood and direction
- Character positioning and expressions
- Background and setting details
- Visual storytelling elements`;

  switch (contentType) {
    case 'kids':
      return `${basePrompt}

CHILDREN'S VISUAL GUIDELINES:
- Use bright, vibrant colors
- Include friendly, approachable character expressions
- Design safe, imaginative environments
- Use dynamic but not overwhelming compositions
- Include visual elements that support learning
- Maintain consistent, cheerful mood
- Use wide shots to establish safe spaces`;

    case 'marketing':
      return `${basePrompt}

MARKETING VISUAL GUIDELINES:
- Focus on product or service hero shots
- Use aspirational lifestyle imagery
- Include clean, professional compositions
- Emphasize brand colors and visual identity
- Create emotional connection through visuals
- Use dynamic camera movements for engagement
- Include clear focal points for key messages`;

    case 'documentary':
      return `${basePrompt}

DOCUMENTARY VISUAL GUIDELINES:
- Prioritize authentic, realistic imagery
- Use natural lighting when possible
- Include establishing shots for context
- Balance talking heads with B-roll footage
- Create visual metaphors for abstract concepts
- Use steady, professional camera work
- Include archival or reference imagery when relevant`;

    case 'educational':
      return `${basePrompt}

EDUCATIONAL VISUAL GUIDELINES:
- Design clear, uncluttered compositions
- Use visual aids and diagrams
- Include step-by-step visual progressions
- Create consistent visual language
- Use highlighting and emphasis techniques
- Balance close-ups with overview shots
- Include visual examples and demonstrations`;

    default:
      return basePrompt;
  }
}

function buildStoryboardUserPrompt(options: GenerateStoryboardOptions): string {
  let prompt = `Create a detailed storyboard based on this script:

${options.script}

Style: ${options.style}
Aspect Ratio: ${options.aspectRatio}`;

  if (options.additionalInstructions) {
    prompt += `\nAdditional Instructions: ${options.additionalInstructions}`;
  }

  prompt += `\n\nPlease ensure the storyboard:
- Breaks down each scene into specific visual shots
- Includes detailed camera and lighting information
- Maintains visual consistency throughout
- Supports the narrative flow of the script
- Is optimized for ${options.aspectRatio} aspect ratio`;

  return prompt;
}