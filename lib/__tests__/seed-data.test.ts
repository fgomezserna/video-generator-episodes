import { seedData } from '../seed-data'
import { Character, Template, Category } from '../types'

describe('Seed Data', () => {
  describe('Characters', () => {
    it('should have valid character data', () => {
      expect(seedData.characters).toBeDefined()
      expect(seedData.characters.length).toBeGreaterThan(0)
      
      seedData.characters.forEach((character, index) => {
        expect(character.name).toBeTruthy()
        expect(character.description).toBeTruthy()
        expect(character.appearance).toBeDefined()
        expect(character.appearance.age).toMatch(/^(child|teen|adult|elderly)$/)
        expect(character.appearance.gender).toMatch(/^(male|female|non-binary)$/)
        expect(character.appearance.style).toBeTruthy()
        expect(character.appearance.colors).toBeInstanceOf(Array)
        expect(character.appearance.colors.length).toBeGreaterThan(0)
        expect(character.personality).toBeInstanceOf(Array)
        expect(character.personality.length).toBeGreaterThan(0)
        
        // Each color should be a valid hex color
        character.appearance.colors.forEach(color => {
          expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
        })
      })
    })

    it('should have diverse character types', () => {
      const ages = seedData.characters.map(c => c.appearance.age)
      const genders = seedData.characters.map(c => c.appearance.gender)
      
      // Should have multiple different ages and genders
      expect(new Set(ages).size).toBeGreaterThan(1)
      expect(new Set(genders).size).toBeGreaterThan(1)
    })

    it('should include required character Luna', () => {
      const luna = seedData.characters.find(c => c.name === 'Luna')
      expect(luna).toBeDefined()
      expect(luna!.appearance.age).toBe('child')
      expect(luna!.appearance.gender).toBe('female')
    })

    it('should include required character Max', () => {
      const max = seedData.characters.find(c => c.name === 'Max')
      expect(max).toBeDefined()
      expect(max!.appearance.gender).toBe('non-binary')
    })
  })

  describe('Templates', () => {
    it('should have valid template data', () => {
      expect(seedData.templates).toBeDefined()
      expect(seedData.templates.length).toBeGreaterThan(0)
      
      seedData.templates.forEach((template, index) => {
        expect(template.name).toBeTruthy()
        expect(template.type).toMatch(/^(kids|marketing|documentary|educational)$/)
        expect(template.description).toBeTruthy()
        expect(template.structure).toBeDefined()
        expect(template.structure.scenes).toBeInstanceOf(Array)
        expect(template.structure.scenes.length).toBeGreaterThan(0)
        expect(template.structure.duration).toBeGreaterThan(0)
        expect(template.structure.aspectRatio).toMatch(/^(16:9|9:16|4:3|1:1)$/)
        expect(template.variables).toBeInstanceOf(Array)
        expect(template.isPublic).toBeDefined()
      })
    })

    it('should have scenes with valid structure', () => {
      seedData.templates.forEach(template => {
        template.structure.scenes.forEach(scene => {
          expect(scene.id).toBeTruthy()
          expect(scene.title).toBeTruthy()
          expect(scene.description).toBeTruthy()
          expect(scene.duration).toBeGreaterThan(0)
          expect(scene.type).toMatch(/^(intro|content|transition|outro)$/)
          expect(scene.elements).toBeInstanceOf(Array)
        })
      })
    })

    it('should have elements with valid structure', () => {
      seedData.templates.forEach(template => {
        template.structure.scenes.forEach(scene => {
          scene.elements.forEach(element => {
            expect(element.id).toBeTruthy()
            expect(element.type).toMatch(/^(text|character|background|music|voice)$/)
            expect(element.content).toBeDefined()
            expect(element.position).toBeDefined()
            expect(element.position.x).toBeGreaterThanOrEqual(0)
            expect(element.position.y).toBeGreaterThanOrEqual(0)
            expect(element.timing).toBeDefined()
            expect(element.timing.start).toBeGreaterThanOrEqual(0)
            expect(element.timing.end).toBeGreaterThan(element.timing.start)
          })
        })
      })
    })

    it('should have variables with valid structure', () => {
      seedData.templates.forEach(template => {
        template.variables.forEach(variable => {
          expect(variable.id).toBeTruthy()
          expect(variable.name).toBeTruthy()
          expect(variable.type).toMatch(/^(text|number|image|character|color)$/)
          expect(typeof variable.required).toBe('boolean')
        })
      })
    })

    it('should include kids learning template', () => {
      const kidsTemplate = seedData.templates.find(t => t.type === 'kids')
      expect(kidsTemplate).toBeDefined()
      expect(kidsTemplate!.name).toBe('Kids Learning Adventure')
    })

    it('should include marketing template', () => {
      const marketingTemplate = seedData.templates.find(t => t.type === 'marketing')
      expect(marketingTemplate).toBeDefined()
      expect(marketingTemplate!.name).toBe('Product Marketing Video')
    })

    it('should include documentary template', () => {
      const docTemplate = seedData.templates.find(t => t.type === 'documentary')
      expect(docTemplate).toBeDefined()
      expect(docTemplate!.name).toBe('Documentary Style')
    })

    it('should have consistent durations', () => {
      seedData.templates.forEach(template => {
        const totalSceneDuration = template.structure.scenes.reduce(
          (sum, scene) => sum + scene.duration,
          0
        )
        expect(totalSceneDuration).toBe(template.structure.duration)
      })
    })
  })

  describe('Categories', () => {
    it('should have valid category data', () => {
      expect(seedData.categories).toBeDefined()
      expect(seedData.categories.length).toBeGreaterThan(0)
      
      seedData.categories.forEach((category, index) => {
        expect(category.name).toBeTruthy()
        expect(category.description).toBeTruthy()
        expect(category.icon).toBeTruthy()
        expect(category.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
        expect(category.templates).toBeInstanceOf(Array)
        expect(typeof category.isActive).toBe('boolean')
        expect(category.order).toBeGreaterThan(0)
      })
    })

    it('should have unique category names', () => {
      const names = seedData.categories.map(c => c.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })

    it('should have unique order values', () => {
      const orders = seedData.categories.map(c => c.order)
      const uniqueOrders = new Set(orders)
      expect(uniqueOrders.size).toBe(orders.length)
    })

    it('should have sequential order values', () => {
      const orders = seedData.categories.map(c => c.order).sort((a, b) => a - b)
      for (let i = 0; i < orders.length; i++) {
        expect(orders[i]).toBe(i + 1)
      }
    })

    it('should include required categories', () => {
      const requiredCategories = ['Education', 'Marketing', 'Entertainment', 'Documentary', 'Kids']
      
      requiredCategories.forEach(categoryName => {
        const category = seedData.categories.find(c => c.name === categoryName)
        expect(category).toBeDefined()
        expect(category!.isActive).toBe(true)
      })
    })

    it('should have appropriate icons', () => {
      seedData.categories.forEach(category => {
        // Should have emoji icons or other valid icon formats
        expect(category.icon).toBeTruthy()
        expect(category.icon.length).toBeGreaterThan(0)
        // Test that it's likely an emoji (Unicode characters)
        expect(category.icon).toMatch(/[\u{1F000}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u)
      })
    })
  })

  describe('Data Consistency', () => {
    it('should have matching template counts', () => {
      const templateTypes = seedData.templates.map(t => t.type)
      const templateTypeCount = templateTypes.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      // Should have at least one template of each major type
      expect(templateTypeCount.kids).toBeGreaterThanOrEqual(1)
      expect(templateTypeCount.marketing).toBeGreaterThanOrEqual(1)
      expect(templateTypeCount.documentary).toBeGreaterThanOrEqual(1)
    })

    it('should have reasonable data sizes', () => {
      // Should have reasonable amounts of seed data
      expect(seedData.characters.length).toBeGreaterThanOrEqual(3)
      expect(seedData.characters.length).toBeLessThanOrEqual(10)
      
      expect(seedData.templates.length).toBeGreaterThanOrEqual(3)
      expect(seedData.templates.length).toBeLessThanOrEqual(10)
      
      expect(seedData.categories.length).toBeGreaterThanOrEqual(3)
      expect(seedData.categories.length).toBeLessThanOrEqual(10)
    })

    it('should have all public templates', () => {
      seedData.templates.forEach(template => {
        expect(template.isPublic).toBe(true)
      })
    })

    it('should have all active categories', () => {
      seedData.categories.forEach(category => {
        expect(category.isActive).toBe(true)
      })
    })
  })
})