import { Character, Template, Category } from './types';

export const seedCharacters: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Luna',
    description: 'A cheerful young girl who loves adventure and learning',
    appearance: {
      age: 'child',
      gender: 'female',
      style: 'cartoon',
      colors: ['#FF6B9D', '#4ECDC4', '#FFE66D']
    },
    personality: ['curious', 'energetic', 'kind', 'brave'],
    voiceId: 'luna-child-voice'
  },
  {
    name: 'Max',
    description: 'A friendly robot companion with advanced AI',
    appearance: {
      age: 'adult',
      gender: 'non-binary',
      style: 'futuristic',
      colors: ['#00D2FF', '#3A7BD5', '#FFFFFF']
    },
    personality: ['logical', 'helpful', 'patient', 'witty'],
    voiceId: 'max-robot-voice'
  },
  {
    name: 'Professor Oak',
    description: 'A wise elderly scientist and educator',
    appearance: {
      age: 'elderly',
      gender: 'male',
      style: 'realistic',
      colors: ['#8B4513', '#FFFFFF', '#2E8B57']
    },
    personality: ['wise', 'patient', 'knowledgeable', 'caring'],
    voiceId: 'professor-oak-voice'
  },
  {
    name: 'Zoe',
    description: 'A trendy teenager who loves social media and fashion',
    appearance: {
      age: 'teen',
      gender: 'female',
      style: 'modern',
      colors: ['#E91E63', '#9C27B0', '#FFD700']
    },
    personality: ['trendy', 'social', 'creative', 'confident'],
    voiceId: 'zoe-teen-voice'
  }
];

export const seedTemplates: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Kids Learning Adventure',
    type: 'kids',
    description: 'Interactive educational template for children aged 5-10',
    structure: {
      scenes: [
        {
          id: 'intro',
          title: 'Welcome Scene',
          description: 'Character introduction and topic preview',
          duration: 15,
          type: 'intro',
          elements: [
            {
              id: 'title-text',
              type: 'text',
              content: { text: '{{lesson_title}}', style: 'fun-title' },
              position: { x: 50, y: 20 },
              timing: { start: 0, end: 15 }
            },
            {
              id: 'main-character',
              type: 'character',
              content: { characterId: '{{main_character}}', animation: 'wave' },
              position: { x: 30, y: 60 },
              timing: { start: 5, end: 15 }
            }
          ]
        },
        {
          id: 'content',
          title: 'Learning Content',
          description: 'Main educational content with interactive elements',
          duration: 45,
          type: 'content',
          elements: [
            {
              id: 'lesson-content',
              type: 'text',
              content: { text: '{{lesson_content}}', style: 'educational' },
              position: { x: 50, y: 40 },
              timing: { start: 0, end: 45 }
            },
            {
              id: 'background-music',
              type: 'music',
              content: { track: 'upbeat-learning', volume: 0.3 },
              position: { x: 0, y: 0 },
              timing: { start: 0, end: 45 }
            }
          ]
        },
        {
          id: 'outro',
          title: 'Conclusion',
          description: 'Summary and encouragement',
          duration: 10,
          type: 'outro',
          elements: [
            {
              id: 'closing-text',
              type: 'text',
              content: { text: 'Great job learning about {{lesson_title}}!', style: 'celebration' },
              position: { x: 50, y: 50 },
              timing: { start: 0, end: 10 }
            }
          ]
        }
      ],
      duration: 70,
      aspectRatio: '16:9'
    },
    variables: [
      {
        id: 'lesson_title',
        name: 'Lesson Title',
        type: 'text',
        required: true,
        validation: { min: 5, max: 50 }
      },
      {
        id: 'lesson_content',
        name: 'Lesson Content',
        type: 'text',
        required: true,
        validation: { min: 20, max: 500 }
      },
      {
        id: 'main_character',
        name: 'Main Character',
        type: 'character',
        required: true,
        defaultValue: 'luna'
      }
    ],
    isPublic: true
  },
  {
    name: 'Product Marketing Video',
    type: 'marketing',
    description: 'Professional template for product marketing and promotions',
    structure: {
      scenes: [
        {
          id: 'hook',
          title: 'Attention Grabber',
          description: 'Strong opening to capture viewer attention',
          duration: 8,
          type: 'intro',
          elements: [
            {
              id: 'hook-text',
              type: 'text',
              content: { text: '{{hook_message}}', style: 'bold-impact' },
              position: { x: 50, y: 50 },
              timing: { start: 0, end: 8 }
            }
          ]
        },
        {
          id: 'product-showcase',
          title: 'Product Features',
          description: 'Highlight key product features and benefits',
          duration: 30,
          type: 'content',
          elements: [
            {
              id: 'product-info',
              type: 'text',
              content: { text: '{{product_description}}', style: 'professional' },
              position: { x: 50, y: 60 },
              timing: { start: 0, end: 30 }
            }
          ]
        },
        {
          id: 'cta',
          title: 'Call to Action',
          description: 'Strong call to action to drive conversions',
          duration: 7,
          type: 'outro',
          elements: [
            {
              id: 'cta-text',
              type: 'text',
              content: { text: '{{cta_message}}', style: 'call-to-action' },
              position: { x: 50, y: 50 },
              timing: { start: 0, end: 7 }
            }
          ]
        }
      ],
      duration: 45,
      aspectRatio: '9:16'
    },
    variables: [
      {
        id: 'hook_message',
        name: 'Hook Message',
        type: 'text',
        required: true,
        validation: { min: 5, max: 100 }
      },
      {
        id: 'product_description',
        name: 'Product Description',
        type: 'text',
        required: true,
        validation: { min: 50, max: 300 }
      },
      {
        id: 'cta_message',
        name: 'Call to Action',
        type: 'text',
        required: true,
        validation: { min: 5, max: 50 }
      },
      {
        id: 'brand_color',
        name: 'Brand Color',
        type: 'color',
        required: false,
        defaultValue: '#007BFF'
      }
    ],
    isPublic: true
  },
  {
    name: 'Documentary Style',
    type: 'documentary',
    description: 'Professional documentary template with narrative structure',
    structure: {
      scenes: [
        {
          id: 'setup',
          title: 'Context Setting',
          description: 'Establish the topic and its importance',
          duration: 20,
          type: 'intro',
          elements: [
            {
              id: 'narrator-voice',
              type: 'voice',
              content: { text: '{{introduction_text}}', voice: 'documentary-narrator' },
              position: { x: 0, y: 0 },
              timing: { start: 0, end: 20 }
            }
          ]
        },
        {
          id: 'evidence',
          title: 'Evidence Presentation',
          description: 'Present facts, data, and expert opinions',
          duration: 60,
          type: 'content',
          elements: [
            {
              id: 'main-content',
              type: 'text',
              content: { text: '{{main_content}}', style: 'documentary' },
              position: { x: 50, y: 70 },
              timing: { start: 0, end: 60 }
            }
          ]
        },
        {
          id: 'conclusion',
          title: 'Key Takeaways',
          description: 'Summarize findings and implications',
          duration: 15,
          type: 'outro',
          elements: [
            {
              id: 'conclusion-text',
              type: 'voice',
              content: { text: '{{conclusion_text}}', voice: 'documentary-narrator' },
              position: { x: 0, y: 0 },
              timing: { start: 0, end: 15 }
            }
          ]
        }
      ],
      duration: 95,
      aspectRatio: '16:9'
    },
    variables: [
      {
        id: 'introduction_text',
        name: 'Introduction',
        type: 'text',
        required: true,
        validation: { min: 50, max: 200 }
      },
      {
        id: 'main_content',
        name: 'Main Content',
        type: 'text',
        required: true,
        validation: { min: 200, max: 1000 }
      },
      {
        id: 'conclusion_text',
        name: 'Conclusion',
        type: 'text',
        required: true,
        validation: { min: 30, max: 150 }
      }
    ],
    isPublic: true
  }
];

export const seedCategories: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Education',
    description: 'Educational and learning content templates',
    icon: '🎓',
    color: '#4CAF50',
    templates: [],
    isActive: true,
    order: 1
  },
  {
    name: 'Marketing',
    description: 'Business and marketing video templates',
    icon: '📢',
    color: '#2196F3',
    templates: [],
    isActive: true,
    order: 2
  },
  {
    name: 'Entertainment',
    description: 'Fun and entertaining content templates',
    icon: '🎬',
    color: '#FF9800',
    templates: [],
    isActive: true,
    order: 3
  },
  {
    name: 'Documentary',
    description: 'Professional documentary and informational templates',
    icon: '📹',
    color: '#607D8B',
    templates: [],
    isActive: true,
    order: 4
  },
  {
    name: 'Kids',
    description: 'Child-friendly templates with fun characters',
    icon: '🧸',
    color: '#E91E63',
    templates: [],
    isActive: true,
    order: 5
  }
];

export const seedData = {
  characters: seedCharacters,
  templates: seedTemplates,
  categories: seedCategories
};