import { CharactersDB } from '../db/characters'
import { Character } from '../types'
import { 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  Timestamp
} from 'firebase/firestore'

// Mock Firebase and database
jest.mock('../firebase', () => ({
  db: {}
}))

jest.mock('firebase/firestore')

const mockedAddDoc = addDoc as jest.MockedFunction<typeof addDoc>
const mockedGetDoc = getDoc as jest.MockedFunction<typeof getDoc>
const mockedGetDocs = getDocs as jest.MockedFunction<typeof getDocs>
const mockedUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>
const mockedDeleteDoc = deleteDoc as jest.MockedFunction<typeof deleteDoc>

describe('CharactersDB', () => {
  const mockCharacterVersion = {
    id: 'version-1',
    version: 'v1.0',
    description: 'Initial version',
    referenceImages: [],
    appearance: {
      age: 'child' as const,
      gender: 'female' as const,
      style: 'cartoon',
      colors: ['#FF0000', '#00FF00'],
      physicalTraits: ['blue eyes', 'blonde hair'],
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
        model: 'stable-diffusion' as const,
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
    createdAt: new Date('2023-01-01')
  };

  const mockCharacter: Omit<Character, 'id' | 'createdAt' | 'updatedAt'> = {
    name: 'Test Character',
    description: 'A test character for unit testing',
    category: 'cartoon',
    tags: ['friendly', 'child'],
    currentVersion: 'version-1',
    versions: [mockCharacterVersion],
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
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('should create a character successfully', async () => {
      const characterId = 'character-123'
      mockedAddDoc.mockResolvedValue({ id: characterId } as any)

      const result = await CharactersDB.create(mockCharacter)

      expect(mockedAddDoc).toHaveBeenCalled()
      expect(result).toBe(characterId)
      
      const addDocCall = mockedAddDoc.mock.calls[0][1]
      expect(addDocCall).toHaveProperty('name', 'Test Character')
      expect(addDocCall).toHaveProperty('description', 'A test character for unit testing')
      expect(addDocCall).toHaveProperty('createdAt')
      expect(addDocCall).toHaveProperty('updatedAt')
    })

    it('should set timestamps when creating a character', async () => {
      const characterId = 'character-123'
      mockedAddDoc.mockResolvedValue({ id: characterId } as any)

      await CharactersDB.create(mockCharacter)

      const addDocCall = mockedAddDoc.mock.calls[0][1]
      expect(addDocCall.createdAt).toBeDefined()
      expect(addDocCall.updatedAt).toBeDefined()
    })

    it('should preserve character structure and version data', async () => {
      const characterId = 'character-123'
      mockedAddDoc.mockResolvedValue({ id: characterId } as any)

      await CharactersDB.create(mockCharacter)

      const addDocCall = mockedAddDoc.mock.calls[0][1]
      expect(addDocCall.name).toBe('Test Character')
      expect(addDocCall.category).toBe('cartoon')
      expect(addDocCall.currentVersion).toBe('version-1')
      expect(addDocCall.versions).toHaveLength(1)
      expect(addDocCall.versions[0].appearance.age).toBe('child')
      expect(addDocCall.versions[0].appearance.gender).toBe('female')
      expect(addDocCall.versions[0].personality).toEqual(['friendly', 'curious'])
      expect(addDocCall.library.isPublic).toBe(false)
      expect(addDocCall.ownership.createdBy).toBe('user-123')
    })
  })

  describe('get', () => {
    it('should retrieve a character successfully', async () => {
      const characterId = 'character-123'
      const mockDocData = {
        ...mockCharacter,
        versions: [{
          ...mockCharacterVersion,
          createdAt: { toDate: () => new Date('2023-01-01') },
          referenceImages: []
        }],
        createdAt: { toDate: () => new Date('2023-01-01') },
        updatedAt: { toDate: () => new Date('2023-01-02') }
      }

      const mockDocSnap = {
        exists: () => true,
        data: () => mockDocData,
        id: characterId
      }

      mockedGetDoc.mockResolvedValue(mockDocSnap as any)

      const result = await CharactersDB.get(characterId)

      expect(mockedGetDoc).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result!.id).toBe(characterId)
      expect(result!.name).toBe('Test Character')
      expect(result!.versions).toHaveLength(1)
      expect(result!.versions[0].appearance.age).toBe('child')
    })

    it('should return null for non-existent character', async () => {
      const characterId = 'non-existent'
      
      const mockDocSnap = {
        exists: () => false
      }

      mockedGetDoc.mockResolvedValue(mockDocSnap as any)

      const result = await CharactersDB.get(characterId)

      expect(result).toBeNull()
    })
  })

  describe('getAll', () => {
    it('should retrieve all characters with default options', async () => {
      const mockCharacters = [
        {
          id: 'char-1',
          data: () => ({
            ...mockCharacter,
            name: 'Character 1',
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() }
          })
        },
        {
          id: 'char-2',
          data: () => ({
            ...mockCharacter,
            name: 'Character 2',
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() }
          })
        }
      ]

      const mockQuerySnapshot = {
        docs: mockCharacters
      }

      mockedGetDocs.mockResolvedValue(mockQuerySnapshot as any)

      const result = await CharactersDB.getAll()

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Character 1')
      expect(result[1].name).toBe('Character 2')
    })

    it('should handle custom options', async () => {
      const options = {
        limit: 10,
        orderBy: 'createdAt' as const,
        direction: 'desc' as const
      }

      mockedGetDocs.mockResolvedValue({ docs: [] } as any)

      await CharactersDB.getAll(options)

      expect(mockedGetDocs).toHaveBeenCalled()
    })
  })

  describe('getByIds', () => {
    it('should return empty array for empty ids', async () => {
      const result = await CharactersDB.getByIds([])
      expect(result).toEqual([])
    })

    it('should retrieve characters by multiple IDs', async () => {
      const characterIds = ['char-1', 'char-2']
      
      // Mock the get method to return different characters for each ID
      const mockGetMethod = jest.spyOn(CharactersDB, 'get')
      mockGetMethod
        .mockResolvedValueOnce({
          ...mockCharacter,
          id: 'char-1',
          name: 'Character 1',
          createdAt: new Date(),
          updatedAt: new Date()
        } as Character)
        .mockResolvedValueOnce({
          ...mockCharacter,
          id: 'char-2',
          name: 'Character 2',
          createdAt: new Date(),
          updatedAt: new Date()
        } as Character)

      const result = await CharactersDB.getByIds(characterIds)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Character 1')
      expect(result[1].name).toBe('Character 2')
      
      mockGetMethod.mockRestore()
    })

    it('should filter out null results', async () => {
      const characterIds = ['char-1', 'non-existent', 'char-2']
      
      const mockGetMethod = jest.spyOn(CharactersDB, 'get')
      mockGetMethod
        .mockResolvedValueOnce({
          ...mockCharacter,
          id: 'char-1',
          name: 'Character 1',
          createdAt: new Date(),
          updatedAt: new Date()
        } as Character)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...mockCharacter,
          id: 'char-2',
          name: 'Character 2',
          createdAt: new Date(),
          updatedAt: new Date()
        } as Character)

      const result = await CharactersDB.getByIds(characterIds)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Character 1')
      expect(result[1].name).toBe('Character 2')
      
      mockGetMethod.mockRestore()
    })
  })

  describe('update', () => {
    it('should update a character successfully', async () => {
      const characterId = 'character-123'
      const updates = { 
        name: 'Updated Character',
        description: 'Updated description'
      }

      await CharactersDB.update(characterId, updates)

      expect(mockedUpdateDoc).toHaveBeenCalled()
      
      const updateCall = mockedUpdateDoc.mock.calls[0][1]
      expect(updateCall).toHaveProperty('name', 'Updated Character')
      expect(updateCall).toHaveProperty('description', 'Updated description')
      expect(updateCall).toHaveProperty('updatedAt')
    })
  })

  describe('delete', () => {
    it('should delete a character successfully', async () => {
      const characterId = 'character-123'

      await CharactersDB.delete(characterId)

      expect(mockedDeleteDoc).toHaveBeenCalled()
    })
  })

  describe('searchByName', () => {
    it('should search characters by name', async () => {
      const searchTerm = 'test'
      const mockCharacters = [
        {
          id: 'char-1',
          data: () => ({
            ...mockCharacter,
            name: 'Test Character',
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() }
          })
        },
        {
          id: 'char-2',
          data: () => ({
            ...mockCharacter,
            name: 'Another Character',
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() }
          })
        }
      ]

      const mockQuerySnapshot = {
        docs: mockCharacters
      }

      mockedGetDocs.mockResolvedValue(mockQuerySnapshot as any)

      const result = await CharactersDB.searchByName(searchTerm)

      // Should only return characters that match the search term
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test Character')
    })

    it('should handle case insensitive search', async () => {
      const searchTerm = 'TEST'
      const mockCharacters = [
        {
          id: 'char-1',
          data: () => ({
            ...mockCharacter,
            name: 'Test Character',
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() }
          })
        }
      ]

      const mockQuerySnapshot = {
        docs: mockCharacters
      }

      mockedGetDocs.mockResolvedValue(mockQuerySnapshot as any)

      const result = await CharactersDB.searchByName(searchTerm)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test Character')
    })
  })

  describe('getByAppearance', () => {
    it('should filter by appearance criteria', async () => {
      const filters = {
        age: 'child',
        gender: 'female',
        style: 'cartoon'
      }

      const mockCharacters = [
        {
          id: 'char-1',
          data: () => ({
            ...mockCharacter,
            versions: [{
              ...mockCharacterVersion,
              appearance: { ...mockCharacterVersion.appearance, age: 'child', gender: 'female', style: 'cartoon' },
              createdAt: { toDate: () => new Date() }
            }],
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() }
          })
        },
        {
          id: 'char-2',
          data: () => ({
            ...mockCharacter,
            name: 'Different Character',
            currentVersion: 'version-2',
            versions: [{
              ...mockCharacterVersion,
              id: 'version-2',
              appearance: { ...mockCharacterVersion.appearance, age: 'adult', gender: 'male', style: 'realistic' },
              createdAt: { toDate: () => new Date() }
            }],
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() }
          })
        }
      ]

      const mockQuerySnapshot = {
        docs: mockCharacters
      }

      mockedGetDocs.mockResolvedValue(mockQuerySnapshot as any)

      const result = await CharactersDB.getByAppearance(filters)

      // Should filter based on current version appearance
      expect(result).toHaveLength(1)
      expect(result[0].versions[0].appearance.style).toBe('cartoon')
    })

    it('should handle partial filters', async () => {
      const filters = {
        age: 'child' as const
      }

      mockedGetDocs.mockResolvedValue({ docs: [] } as any)

      await CharactersDB.getByAppearance(filters)

      expect(mockedGetDocs).toHaveBeenCalled()
    })
  })
})