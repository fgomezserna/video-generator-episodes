import { 
  Character, 
  Template, 
  Project, 
  Category, 
  WorkflowState,
  User 
} from '../types'

describe('Type Definitions', () => {
  describe('Character', () => {
    it('should define a valid character structure', () => {
      const character: Omit<Character, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test Character',
        description: 'A test character for unit testing',
        appearance: {
          age: 'child',
          gender: 'female',
          style: 'cartoon',
          colors: ['#FF0000', '#00FF00']
        },
        personality: ['friendly', 'curious'],
        voiceId: 'test-voice'
      }
      
      expect(character.name).toBe('Test Character')
      expect(character.appearance.age).toBe('child')
      expect(character.appearance.gender).toBe('female')
      expect(character.personality).toContain('friendly')
      expect(character.appearance.colors).toHaveLength(2)
    })

    it('should validate appearance age options', () => {
      const validAges: Character['appearance']['age'][] = ['child', 'teen', 'adult', 'elderly']
      
      validAges.forEach(age => {
        expect(['child', 'teen', 'adult', 'elderly']).toContain(age)
      })
    })

    it('should validate appearance gender options', () => {
      const validGenders: Character['appearance']['gender'][] = ['male', 'female', 'non-binary']
      
      validGenders.forEach(gender => {
        expect(['male', 'female', 'non-binary']).toContain(gender)
      })
    })
  })

  describe('Template', () => {
    it('should define a valid template structure', () => {
      const template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test Template',
        type: 'kids',
        description: 'A test template',
        structure: {
          scenes: [{
            id: 'test-scene',
            title: 'Test Scene',
            description: 'A test scene',
            duration: 10,
            type: 'intro',
            elements: [{
              id: 'test-element',
              type: 'text',
              content: { text: 'Hello World' },
              position: { x: 50, y: 50 },
              timing: { start: 0, end: 10 }
            }]
          }],
          duration: 10,
          aspectRatio: '16:9'
        },
        variables: [{
          id: 'test-var',
          name: 'Test Variable',
          type: 'text',
          required: true
        }],
        isPublic: true
      }
      
      expect(template.type).toBe('kids')
      expect(template.structure.scenes).toHaveLength(1)
      expect(template.structure.aspectRatio).toBe('16:9')
      expect(template.variables).toHaveLength(1)
      expect(template.isPublic).toBe(true)
    })

    it('should validate template types', () => {
      const validTypes: Template['type'][] = ['kids', 'marketing', 'documentary', 'educational']
      
      validTypes.forEach(type => {
        expect(['kids', 'marketing', 'documentary', 'educational']).toContain(type)
      })
    })

    it('should validate aspect ratios', () => {
      const validRatios = ['16:9', '9:16', '4:3', '1:1'] as const
      
      validRatios.forEach(ratio => {
        expect(['16:9', '9:16', '4:3', '1:1']).toContain(ratio)
      })
    })

    it('should validate scene types', () => {
      const validSceneTypes = ['intro', 'content', 'transition', 'outro'] as const
      
      validSceneTypes.forEach(type => {
        expect(['intro', 'content', 'transition', 'outro']).toContain(type)
      })
    })

    it('should validate element types', () => {
      const validElementTypes = ['text', 'character', 'background', 'music', 'voice'] as const
      
      validElementTypes.forEach(type => {
        expect(['text', 'character', 'background', 'music', 'voice']).toContain(type)
      })
    })

    it('should validate variable types', () => {
      const validVariableTypes = ['text', 'number', 'image', 'character', 'color'] as const
      
      validVariableTypes.forEach(type => {
        expect(['text', 'number', 'image', 'character', 'color']).toContain(type)
      })
    })
  })

  describe('Project', () => {
    it('should define a valid project structure', () => {
      const project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: 'test-user-123',
        title: 'Test Project',
        description: 'A test project for unit testing',
        templateId: 'template-123',
        characters: [],
        variables: { lesson_title: 'Test Lesson' },
        status: 'draft',
        metadata: {
          aspectRatio: '16:9',
          quality: 'standard',
          tags: ['test', 'unit-test']
        },
        collaboration: {
          isPublic: false,
          sharedWith: [],
          permissions: {}
        }
      }
      
      expect(project.status).toBe('draft')
      expect(project.metadata.quality).toBe('standard')
      expect(project.collaboration.isPublic).toBe(false)
      expect(project.metadata.tags).toContain('test')
    })

    it('should validate workflow states', () => {
      const validStates: WorkflowState[] = [
        'draft', 'pending', 'in_review', 'approved', 'rejected', 
        'processing', 'completed', 'failed', 'archived'
      ]
      
      validStates.forEach(state => {
        expect([
          'draft', 'pending', 'in_review', 'approved', 'rejected', 
          'processing', 'completed', 'failed', 'archived'
        ]).toContain(state)
      })
    })

    it('should validate quality options', () => {
      const validQualities = ['draft', 'standard', 'high', 'premium'] as const
      
      validQualities.forEach(quality => {
        expect(['draft', 'standard', 'high', 'premium']).toContain(quality)
      })
    })
  })

  describe('Category', () => {
    it('should define a valid category structure', () => {
      const category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test Category',
        description: 'A test category for unit testing',
        icon: '🧪',
        color: '#FF5733',
        templates: ['template-1', 'template-2'],
        isActive: true,
        order: 1
      }
      
      expect(category.name).toBe('Test Category')
      expect(category.isActive).toBe(true)
      expect(category.templates).toHaveLength(2)
      expect(category.order).toBe(1)
      expect(category.icon).toBe('🧪')
      expect(category.color).toBe('#FF5733')
    })
  })

  describe('User', () => {
    it('should define a valid user structure', () => {
      const user: Omit<User, 'uid' | 'createdAt' | 'updatedAt'> = {
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
        role: 'user',
        subscription: {
          plan: 'free',
          status: 'active',
          startDate: new Date()
        },
        usage: {
          videosGenerated: 5,
          storageUsed: 1024,
          lastActivity: new Date()
        },
        preferences: {
          defaultAspectRatio: '16:9',
          defaultQuality: 'standard',
          notifications: {
            email: true,
            browser: false
          }
        }
      }
      
      expect(user.role).toBe('user')
      expect(user.subscription.plan).toBe('free')
      expect(user.subscription.status).toBe('active')
      expect(user.usage.videosGenerated).toBe(5)
      expect(user.preferences.defaultAspectRatio).toBe('16:9')
    })

    it('should validate user roles', () => {
      const validRoles: User['role'][] = ['user', 'admin']
      
      validRoles.forEach(role => {
        expect(['user', 'admin']).toContain(role)
      })
    })

    it('should validate subscription plans', () => {
      const validPlans: User['subscription']['plan'][] = ['free', 'pro', 'enterprise']
      
      validPlans.forEach(plan => {
        expect(['free', 'pro', 'enterprise']).toContain(plan)
      })
    })

    it('should validate subscription status', () => {
      const validStatuses: User['subscription']['status'][] = ['active', 'cancelled', 'expired']
      
      validStatuses.forEach(status => {
        expect(['active', 'cancelled', 'expired']).toContain(status)
      })
    })
  })
})