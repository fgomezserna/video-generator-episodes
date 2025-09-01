import { ProjectsDB } from '../db/projects'
import { Project, WorkflowState } from '../types'
import { 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore'

// Mock Firebase and database
jest.mock('../firebase', () => ({
  db: {}
}))

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  startAfter: jest.fn(),
  Timestamp: {
    fromDate: jest.fn((date) => ({
      toDate: () => date,
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
    })),
  },
}))

const mockedAddDoc = addDoc as jest.MockedFunction<typeof addDoc>
const mockedGetDoc = getDoc as jest.MockedFunction<typeof getDoc>
const mockedGetDocs = getDocs as jest.MockedFunction<typeof getDocs>
const mockedUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>
const mockedDeleteDoc = deleteDoc as jest.MockedFunction<typeof deleteDoc>

describe('ProjectsDB', () => {
  const mockProject: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
    userId: 'user-123',
    title: 'Test Project',
    description: 'Test project description',
    templateId: 'template-123',
    characters: [],
    variables: { title: 'Test Video' },
    status: 'draft',
    metadata: {
      aspectRatio: '16:9',
      quality: 'standard',
      tags: ['test']
    },
    collaboration: {
      isPublic: false,
      sharedWith: [],
      permissions: {}
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('should create a project successfully', async () => {
      const projectId = 'project-123'
      mockedAddDoc.mockResolvedValue({ id: projectId } as any)

      const result = await ProjectsDB.create(mockProject)

      expect(mockedAddDoc).toHaveBeenCalled()
      expect(result).toBe(projectId)
      
      const addDocCall = mockedAddDoc.mock.calls[0][1]
      expect(addDocCall).toHaveProperty('userId', 'user-123')
      expect(addDocCall).toHaveProperty('title', 'Test Project')
      expect(addDocCall).toHaveProperty('status', 'draft')
      expect(addDocCall).toHaveProperty('createdAt')
      expect(addDocCall).toHaveProperty('updatedAt')
    })

    it('should set timestamps when creating a project', async () => {
      const projectId = 'project-123'
      mockedAddDoc.mockResolvedValue({ id: projectId } as any)

      await ProjectsDB.create(mockProject)

      const addDocCall = mockedAddDoc.mock.calls[0][1]
      expect(addDocCall.createdAt).toBeDefined()
      expect(addDocCall.updatedAt).toBeDefined()
      expect(addDocCall.timeline.created).toBeDefined()
      expect(addDocCall.timeline.lastModified).toBeDefined()
    })
  })

  describe('get', () => {
    it('should retrieve a project successfully', async () => {
      const projectId = 'project-123'
      const mockDocData = {
        ...mockProject,
        createdAt: { toDate: () => new Date('2023-01-01') },
        updatedAt: { toDate: () => new Date('2023-01-02') },
        timeline: {
          created: { toDate: () => new Date('2023-01-01') },
          lastModified: { toDate: () => new Date('2023-01-02') }
        }
      }

      const mockDocSnap = {
        exists: () => true,
        data: () => mockDocData,
        id: projectId
      }

      mockedGetDoc.mockResolvedValue(mockDocSnap as any)

      const result = await ProjectsDB.get(projectId)

      expect(mockedGetDoc).toHaveBeenCalled()
      expect(result).toBeTruthy()
      expect(result!.id).toBe(projectId)
      expect(result!.title).toBe('Test Project')
      expect(result!.userId).toBe('user-123')
    })

    it('should return null for non-existent project', async () => {
      const projectId = 'non-existent'
      
      const mockDocSnap = {
        exists: () => false
      }

      mockedGetDoc.mockResolvedValue(mockDocSnap as any)

      const result = await ProjectsDB.get(projectId)

      expect(result).toBeNull()
    })
  })

  describe('update', () => {
    it('should update a project successfully', async () => {
      const projectId = 'project-123'
      const updates = { title: 'Updated Title', status: 'in_review' as WorkflowState }

      await ProjectsDB.update(projectId, updates)

      expect(mockedUpdateDoc).toHaveBeenCalled()
      
      const updateCall = mockedUpdateDoc.mock.calls[0][1]
      expect(updateCall).toHaveProperty('title', 'Updated Title')
      expect(updateCall).toHaveProperty('status', 'in_review')
      expect(updateCall).toHaveProperty('updatedAt')
      expect(updateCall['timeline.lastModified']).toBeDefined()
    })

    it('should update timeline when status changes', async () => {
      const projectId = 'project-123'
      const updates = { status: 'pending' as WorkflowState }

      await ProjectsDB.update(projectId, updates)

      const updateCall = mockedUpdateDoc.mock.calls[0][1]
      expect(updateCall['timeline.submitted']).toBeDefined()
    })

    it('should set correct timeline fields for different statuses', async () => {
      const projectId = 'project-123'
      const statusUpdates: { status: WorkflowState; expectedField: string }[] = [
        { status: 'pending', expectedField: 'timeline.submitted' },
        { status: 'in_review', expectedField: 'timeline.reviewed' },
        { status: 'approved', expectedField: 'timeline.approved' },
        { status: 'completed', expectedField: 'timeline.completed' }
      ]

      for (const { status, expectedField } of statusUpdates) {
        jest.clearAllMocks()
        await ProjectsDB.update(projectId, { status })
        
        const updateCall = mockedUpdateDoc.mock.calls[0][1]
        expect(updateCall[expectedField]).toBeDefined()
      }
    })
  })

  describe('delete', () => {
    it('should delete a project successfully', async () => {
      const projectId = 'project-123'

      await ProjectsDB.delete(projectId)

      expect(mockedDeleteDoc).toHaveBeenCalled()
    })
  })

  describe('getByUser', () => {
    it('should retrieve projects for a user', async () => {
      const userId = 'user-123'
      const mockProjects = [
        {
          id: 'project-1',
          data: () => ({
            ...mockProject,
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() },
            timeline: {
              created: { toDate: () => new Date() },
              lastModified: { toDate: () => new Date() }
            }
          })
        },
        {
          id: 'project-2',
          data: () => ({
            ...mockProject,
            title: 'Second Project',
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() },
            timeline: {
              created: { toDate: () => new Date() },
              lastModified: { toDate: () => new Date() }
            }
          })
        }
      ]

      const mockQuerySnapshot = {
        docs: mockProjects
      }

      mockedGetDocs.mockResolvedValue(mockQuerySnapshot as any)

      const result = await ProjectsDB.getByUser(userId)

      expect(result.projects).toHaveLength(2)
      expect(result.projects[0].id).toBe('project-1')
      expect(result.projects[1].title).toBe('Second Project')
    })

    it('should handle pagination options', async () => {
      const userId = 'user-123'
      const options = {
        limit: 10,
        status: 'draft' as WorkflowState,
        orderBy: 'updatedAt' as const,
        direction: 'desc' as const
      }

      mockedGetDocs.mockResolvedValue({ docs: [] } as any)

      await ProjectsDB.getByUser(userId, options)

      expect(mockedGetDocs).toHaveBeenCalled()
    })
  })

  describe('updateStatus', () => {
    it('should update project status', async () => {
      const projectId = 'project-123'
      const newStatus: WorkflowState = 'approved'

      await ProjectsDB.updateStatus(projectId, newStatus)

      expect(mockedUpdateDoc).toHaveBeenCalled()
      
      const updateCall = mockedUpdateDoc.mock.calls[0][1]
      expect(updateCall).toHaveProperty('status', 'approved')
    })
  })

  describe('addCollaborator', () => {
    it('should add a collaborator with permissions', async () => {
      const projectId = 'project-123'
      const collaboratorId = 'collaborator-123'
      const permission = 'edit' as const

      const mockFullProject = {
        ...mockProject,
        id: projectId,
        createdAt: { toDate: () => new Date() },
        updatedAt: { toDate: () => new Date() },
        collaboration: {
          isPublic: false,
          sharedWith: [],
          permissions: {}
        }
      }

      const mockDocSnap = {
        exists: () => true,
        data: () => mockFullProject,
        id: projectId
      }

      mockedGetDoc.mockResolvedValue(mockDocSnap as any)

      await ProjectsDB.addCollaborator(projectId, collaboratorId, permission)

      expect(mockedUpdateDoc).toHaveBeenCalled()
      
      const updateCall = mockedUpdateDoc.mock.calls[0][1]
      expect(updateCall.collaboration.sharedWith).toContain(collaboratorId)
      expect(updateCall.collaboration.permissions[collaboratorId]).toBe('edit')
    })
  })

  describe('removeCollaborator', () => {
    it('should remove a collaborator', async () => {
      const projectId = 'project-123'
      const collaboratorId = 'collaborator-123'

      const mockProjectWithCollaborators = {
        ...mockProject,
        id: projectId,
        createdAt: { toDate: () => new Date() },
        updatedAt: { toDate: () => new Date() },
        collaboration: {
          isPublic: false,
          sharedWith: [collaboratorId, 'other-user'],
          permissions: { [collaboratorId]: 'edit', 'other-user': 'view' }
        }
      }

      const mockDocSnap = {
        exists: () => true,
        data: () => mockProjectWithCollaborators,
        id: projectId
      }

      mockedGetDoc.mockResolvedValue(mockDocSnap as any)

      await ProjectsDB.removeCollaborator(projectId, collaboratorId)

      expect(mockedUpdateDoc).toHaveBeenCalled()
      
      const updateCall = mockedUpdateDoc.mock.calls[0][1]
      expect(updateCall.collaboration.sharedWith).not.toContain(collaboratorId)
      expect(updateCall.collaboration.permissions).not.toHaveProperty(collaboratorId)
      expect(updateCall.collaboration.sharedWith).toContain('other-user')
    })
  })
})