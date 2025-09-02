import { WorkflowPipelineService } from '../services/workflow-pipeline';
import { PipelineManager } from '../services/pipeline-manager';
import { PipelineTracker } from '../services/pipeline-tracker';
import { PipelineDB } from '../db/pipeline';
import { 
  WorkflowPipeline, 
  PipelineStage, 
  PipelineCheckpoint,
  CheckpointStatus 
} from '../types';

// Mock Firebase dependencies
jest.mock('../firebase', () => ({
  db: {},
  functions: {}
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(() => Promise.resolve({
    exists: () => true,
    data: () => ({ test: 'data' }),
    id: 'mock-doc-id'
  })),
  getDocs: jest.fn(() => Promise.resolve({
    empty: false,
    docs: [{
      id: 'mock-doc-id',
      data: () => ({ test: 'data' })
    }]
  })),
  addDoc: jest.fn(() => Promise.resolve({ id: 'mock-doc-id' })),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  startAfter: jest.fn(),
  onSnapshot: jest.fn(),
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date }),
    now: () => ({ toDate: () => new Date() })
  },
  serverTimestamp: () => ({ toDate: () => new Date() })
}));

jest.mock('../db/queue', () => ({
  queueService: {
    enqueueJob: jest.fn(() => Promise.resolve({ jobId: 'test-job', status: 'queued' }))
  }
}));

describe('WorkflowPipelineService', () => {
  const mockProjectId = 'test-project-123';
  const mockUserId = 'test-user-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPipeline', () => {
    it('should create a pipeline with initial stages', async () => {
      const pipelineId = await WorkflowPipelineService.createPipeline(mockProjectId, mockUserId);
      
      expect(pipelineId).toBe('mock-doc-id');
      expect(require('firebase/firestore').addDoc).toHaveBeenCalled();
      
      // Verify the call was made with correct structure
      const callArgs = require('firebase/firestore').addDoc.mock.calls[0][1];
      expect(callArgs.projectId).toBe(mockProjectId);
      expect(callArgs.currentStage).toBe('idea');
      expect(callArgs.stages).toHaveLength(9);
    });

    it('should initialize all pipeline stages correctly', async () => {
      await WorkflowPipelineService.createPipeline(mockProjectId, mockUserId);
      
      const addDocCall = require('firebase/firestore').addDoc.mock.calls[0][1];
      const stages = addDocCall.stages;
      
      expect(stages).toHaveLength(9); // All pipeline stages
      expect(stages[0]).toMatchObject({
        stage: 'idea',
        status: 'in_progress'
      });
      
      // All other stages should be not_started
      stages.slice(1).forEach((stage: any) => {
        expect(stage.status).toBe('not_started');
      });
    });
  });

  describe('advanceToNextStage', () => {
    const mockPipeline: WorkflowPipeline = {
      id: 'test-pipeline',
      projectId: mockProjectId,
      currentStage: 'idea',
      stages: [
        {
          stage: 'idea',
          status: 'in_progress',
          startedAt: new Date(),
          artifacts: []
        },
        {
          stage: 'idea_review',
          status: 'not_started',
          artifacts: []
        }
      ],
      metrics: {
        stageMetrics: {
          idea: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
          idea_review: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
          script: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
          script_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
          storyboard: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
          storyboard_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
          video: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
          video_qa: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
          published: { averageDuration: 0, completionRate: 100, revisionRate: 0 }
        }
      },
      notifications: {
        email: true,
        push: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should advance to next stage successfully', async () => {
      jest.spyOn(WorkflowPipelineService, 'getPipeline')
        .mockResolvedValueOnce(mockPipeline);

      await WorkflowPipelineService.advanceToNextStage('test-pipeline', mockUserId);

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentStage: 'idea_review'
        })
      );
    });

    it('should throw error when trying to advance beyond final stage', async () => {
      const finalStagePipeline = {
        ...mockPipeline,
        currentStage: 'published' as PipelineStage
      };

      jest.spyOn(WorkflowPipelineService, 'getPipeline')
        .mockResolvedValueOnce(finalStagePipeline);

      await expect(
        WorkflowPipelineService.advanceToNextStage('test-pipeline', mockUserId)
      ).rejects.toThrow('Cannot advance beyond final stage');
    });
  });

  describe('checkpoint management', () => {
    it('should create checkpoint with correct data', async () => {
      const checkpointId = await WorkflowPipelineService.createCheckpoint(
        'test-pipeline',
        'idea_review',
        mockUserId,
        ['reviewer1', 'reviewer2'],
        2
      );

      expect(checkpointId).toBe('mock-doc-id');
      expect(require('firebase/firestore').addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          stage: 'idea_review',
          status: 'pending',
          assignedTo: ['reviewer1', 'reviewer2'],
          requiredApprovals: 2,
          currentApprovals: 0
        })
      );
    });

    it('should approve checkpoint and advance pipeline', async () => {
      const mockCheckpoint: PipelineCheckpoint = {
        id: 'test-checkpoint',
        stage: 'idea_review',
        status: 'pending',
        assignedTo: [mockUserId],
        submittedAt: new Date(),
        requiredApprovals: 1,
        currentApprovals: 0,
        approvals: []
      };

      require('firebase/firestore').getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockCheckpoint
      });

      await WorkflowPipelineService.approveCheckpoint('test-checkpoint', mockUserId, 'Looks good!');

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'approved',
          currentApprovals: 1,
          approvals: expect.arrayContaining([
            expect.objectContaining({
              userId: mockUserId,
              status: 'approved',
              feedback: 'Looks good!'
            })
          ])
        })
      );
    });

    it('should reject checkpoint with feedback', async () => {
      const mockCheckpoint: PipelineCheckpoint = {
        id: 'test-checkpoint',
        stage: 'script_approval',
        status: 'pending',
        assignedTo: [mockUserId],
        submittedAt: new Date(),
        requiredApprovals: 1,
        currentApprovals: 0,
        approvals: []
      };

      require('firebase/firestore').getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockCheckpoint
      });

      await WorkflowPipelineService.rejectCheckpoint('test-checkpoint', mockUserId, 'Needs revision');

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'rejected',
          approvals: expect.arrayContaining([
            expect.objectContaining({
              userId: mockUserId,
              status: 'rejected',
              feedback: 'Needs revision'
            })
          ])
        })
      );
    });
  });

  describe('rollback functionality', () => {
    const mockAdvancedPipeline: WorkflowPipeline = {
      id: 'test-pipeline',
      projectId: mockProjectId,
      currentStage: 'storyboard',
      stages: [
        {
          stage: 'idea',
          status: 'completed',
          startedAt: new Date(Date.now() - 3000),
          completedAt: new Date(Date.now() - 2500),
          duration: 500,
          artifacts: []
        },
        {
          stage: 'idea_review',
          status: 'completed',
          startedAt: new Date(Date.now() - 2500),
          completedAt: new Date(Date.now() - 2000),
          duration: 500,
          artifacts: []
        },
        {
          stage: 'script',
          status: 'completed',
          startedAt: new Date(Date.now() - 2000),
          completedAt: new Date(Date.now() - 1500),
          duration: 500,
          artifacts: []
        },
        {
          stage: 'script_approval',
          status: 'completed',
          startedAt: new Date(Date.now() - 1500),
          completedAt: new Date(Date.now() - 1000),
          duration: 500,
          artifacts: []
        },
        {
          stage: 'storyboard',
          status: 'in_progress',
          startedAt: new Date(Date.now() - 1000),
          artifacts: []
        }
      ],
      metrics: { stageMetrics: {} },
      notifications: { email: true, push: true },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should rollback to previous stage successfully', async () => {
      jest.spyOn(WorkflowPipelineService, 'getPipeline')
        .mockResolvedValueOnce(mockAdvancedPipeline);

      await WorkflowPipelineService.rollbackToPreviousStage(
        'test-pipeline',
        'script',
        mockUserId,
        'Script needs major revisions'
      );

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentStage: 'script',
          stages: expect.arrayContaining([
            expect.objectContaining({
              stage: 'script',
              status: 'in_progress'
            }),
            expect.objectContaining({
              stage: 'storyboard',
              status: 'not_started'
            })
          ])
        })
      );
    });

    it('should throw error when trying to rollback to future stage', async () => {
      jest.spyOn(WorkflowPipelineService, 'getPipeline')
        .mockResolvedValueOnce(mockAdvancedPipeline);

      await expect(
        WorkflowPipelineService.rollbackToPreviousStage(
          'test-pipeline',
          'video' as PipelineStage,
          mockUserId,
          'Invalid rollback'
        )
      ).rejects.toThrow('Can only rollback to previous stages');
    });
  });

  describe('artifact management', () => {
    it('should add artifact to stage', async () => {
      const mockPipeline: WorkflowPipeline = {
        id: 'test-pipeline',
        projectId: mockProjectId,
        currentStage: 'script',
        stages: [
          {
            stage: 'script',
            status: 'in_progress',
            artifacts: []
          }
        ],
        metrics: { 
          stageMetrics: {
            idea: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            idea_review: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            script: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            script_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            storyboard: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            storyboard_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            video: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            video_qa: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            published: { averageDuration: 0, completionRate: 100, revisionRate: 0 }
          }
        },
        notifications: { email: true, push: true },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(WorkflowPipelineService, 'getPipeline')
        .mockResolvedValueOnce(mockPipeline);

      await WorkflowPipelineService.addArtifact(
        'test-pipeline',
        'script',
        {
          type: 'script',
          url: 'https://storage.example.com/script.json',
          data: { wordCount: 500 }
        }
      );

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          stages: expect.arrayContaining([
            expect.objectContaining({
              stage: 'script',
              artifacts: expect.arrayContaining([
                expect.objectContaining({
                  type: 'script',
                  url: 'https://storage.example.com/script.json',
                  data: { wordCount: 500 }
                })
              ])
            })
          ])
        })
      );
    });
  });
});

describe('PipelineManager', () => {
  describe('initializeProjectPipeline', () => {
    it('should initialize pipeline with custom configuration', async () => {
      const mockProject = {
        id: 'test-project',
        userId: 'test-user',
        title: 'Test Project',
        status: 'draft' as const
      };

      jest.spyOn(require('../db/projects').ProjectsDB, 'get')
        .mockResolvedValueOnce(mockProject);
      jest.spyOn(WorkflowPipelineService, 'createPipeline')
        .mockResolvedValueOnce('test-pipeline-id');
      jest.spyOn(require('../db/projects').ProjectsDB, 'updateStatus')
        .mockResolvedValueOnce(undefined);

      const pipelineId = await PipelineManager.initializeProjectPipeline(
        'test-project',
        'test-user',
        {
          skipStages: ['storyboard'],
          priority: 'high'
        }
      );

      expect(pipelineId).toBe('test-pipeline-id');
      expect(require('../db/projects').ProjectsDB.updateStatus)
        .toHaveBeenCalledWith('test-project', 'pending');
    });
  });

  describe('getProjectProgress', () => {
    it('should calculate progress correctly', async () => {
      const mockPipeline: WorkflowPipeline = {
        id: 'test-pipeline',
        projectId: 'test-project',
        currentStage: 'script_approval',
        stages: [
          { stage: 'idea', status: 'completed', artifacts: [] },
          { stage: 'idea_review', status: 'completed', artifacts: [] },
          { stage: 'script', status: 'completed', artifacts: [] },
          { stage: 'script_approval', status: 'in_progress', artifacts: [] }
        ],
        metrics: { 
          stageMetrics: {
            idea: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            idea_review: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            script: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            script_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            storyboard: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            storyboard_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            video: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            video_qa: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            published: { averageDuration: 0, completionRate: 100, revisionRate: 0 }
          }
        },
        notifications: { email: true, push: true },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(WorkflowPipelineService, 'getPipelineByProject')
        .mockResolvedValueOnce(mockPipeline);

      const progress = await PipelineManager.getProjectProgress('test-project');

      expect(progress).toMatchObject({
        currentStage: 'script_approval',
        completedStages: 3,
        totalStages: 9, // Default stage order length
        progressPercentage: 33 // 3/9 * 100
      });
    });
  });

  describe('bulk operations', () => {
    it('should handle bulk checkpoint approvals', async () => {
      jest.spyOn(WorkflowPipelineService, 'approveCheckpoint')
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Unauthorized'))
        .mockResolvedValueOnce(undefined);

      const results = await PipelineManager.bulkApproveCheckpoints(
        ['checkpoint1', 'checkpoint2', 'checkpoint3'],
        'test-user',
        'Bulk approval'
      );

      expect(results.successful).toEqual(['checkpoint1', 'checkpoint3']);
      expect(results.failed).toEqual([
        { id: 'checkpoint2', error: 'Unauthorized' }
      ]);
    });
  });
});

describe('PipelineTracker', () => {
  let tracker: PipelineTracker;

  beforeEach(() => {
    tracker = new PipelineTracker();
  });

  afterEach(() => {
    tracker.unsubscribeAll();
  });

  describe('real-time tracking', () => {
    it('should subscribe to project pipeline updates', () => {
      const mockCallback = jest.fn();
      
      // Mock Firebase snapshot
      require('firebase/firestore').onSnapshot.mockImplementationOnce((query: any, callback: any) => {
        // Simulate immediate callback with mock data
        const mockSnapshot = {
          empty: false,
          docs: [{
            id: 'test-pipeline',
            data: () => ({
              projectId: 'test-project',
              currentStage: 'script',
              stages: [],
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() }
            })
          }]
        };
        callback(mockSnapshot);
        
        return jest.fn(); // unsubscribe function
      });

      const unsubscribe = tracker.subscribeToProjectPipeline('test-project', mockCallback);

      expect(mockCallback).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle subscription errors gracefully', () => {
      const mockCallback = jest.fn();
      
      require('firebase/firestore').onSnapshot.mockImplementationOnce((query: any, callback: any, errorCallback: any) => {
        errorCallback(new Error('Connection failed'));
        return jest.fn();
      });

      const unsubscribe = tracker.subscribeToProjectPipeline('test-project', mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(null);
    });
  });

  describe('performance metrics', () => {
    it('should calculate stage performance metrics', async () => {
      const mockMetrics = [{
        stage: 'script' as PipelineStage,
        averageDuration: 2 * 60 * 60 * 1000, // 2 hours
        completionRate: 95,
        revisionRate: 15,
        averageApprovalTime: 30 * 60 * 1000, // 30 minutes
        commonIssues: ['quality', 'timing']
      }];

      jest.spyOn(PipelineManager, 'getStageMetrics')
        .mockResolvedValueOnce(mockMetrics);

      const metrics = await tracker.getStagePerformanceMetrics(
        'script',
        { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() }
      );

      expect(metrics).toMatchObject({
        averageDuration: 2 * 60 * 60 * 1000,
        successRate: 95,
        bottleneckIndicators: [],
        improvementSuggestions: []
      });
    });

    it('should identify bottlenecks and suggest improvements', async () => {
      const mockMetrics = [{
        stage: 'video_qa' as PipelineStage,
        averageDuration: 4 * 60 * 60 * 1000, // 4 hours
        completionRate: 70, // Low completion rate
        revisionRate: 40, // High revision rate
        averageApprovalTime: 48 * 60 * 60 * 1000, // 48 hours - very long
        commonIssues: ['quality', 'consistency']
      }];

      jest.spyOn(PipelineManager, 'getStageMetrics')
        .mockResolvedValueOnce(mockMetrics);

      const metrics = await tracker.getStagePerformanceMetrics(
        'video_qa',
        { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() }
      );

      expect(metrics.bottleneckIndicators).toContain('Long approval times');
      expect(metrics.bottleneckIndicators).toContain('High revision rate');
      expect(metrics.bottleneckIndicators).toContain('Low completion rate');
      expect(metrics.improvementSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe('project history', () => {
    it('should generate comprehensive project history', async () => {
      const mockPipeline: WorkflowPipeline = {
        id: 'test-pipeline',
        projectId: 'test-project',
        currentStage: 'published',
        stages: [
          {
            stage: 'idea',
            status: 'completed',
            startedAt: new Date(Date.now() - 10000),
            completedAt: new Date(Date.now() - 9000),
            duration: 1000,
            artifacts: [
              {
                type: 'feedback',
                data: { notes: 'Great concept' },
                createdAt: new Date(Date.now() - 9500)
              }
            ]
          },
          {
            stage: 'script',
            status: 'completed',
            startedAt: new Date(Date.now() - 8000),
            completedAt: new Date(Date.now() - 7000),
            duration: 1000,
            artifacts: [
              {
                type: 'script',
                url: 'https://storage.example.com/script.json',
                createdAt: new Date(Date.now() - 7500)
              }
            ]
          }
        ],
        metrics: { 
          stageMetrics: {
            idea: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            idea_review: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            script: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            script_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            storyboard: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            storyboard_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            video: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            video_qa: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            published: { averageDuration: 0, completionRate: 100, revisionRate: 0 }
          }
        },
        notifications: { email: true, push: true },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(WorkflowPipelineService, 'getPipelineByProject')
        .mockResolvedValueOnce(mockPipeline);

      const history = await tracker.getProjectHistory('test-project');

      expect(history.timeline).toHaveLength(4); // 2 started + 2 completed events
      expect(history.totalDuration).toBe(2000);
      expect(history.stageBreakdown).toMatchObject({
        idea: 1000,
        script: 1000
      });
    });
  });
});

describe('Integration Tests', () => {
  describe('End-to-End Pipeline Flow', () => {
    it('should complete full pipeline workflow', async () => {
      const projectId = 'integration-test-project';
      const userId = 'integration-test-user';

      // 1. Initialize pipeline
      jest.spyOn(require('../db/projects').ProjectsDB, 'get')
        .mockResolvedValue({ id: projectId, userId, status: 'draft' });
      jest.spyOn(WorkflowPipelineService, 'createPipeline')
        .mockResolvedValue('test-pipeline-id');

      const pipelineId = await PipelineManager.initializeProjectPipeline(projectId, userId);
      expect(pipelineId).toBe('test-pipeline-id');

      // 2. Advance through stages
      const mockPipeline: WorkflowPipeline = {
        id: pipelineId,
        projectId,
        currentStage: 'idea',
        stages: [
          { stage: 'idea', status: 'in_progress', artifacts: [] },
          { stage: 'idea_review', status: 'not_started', artifacts: [] }
        ],
        metrics: { 
          stageMetrics: {
            idea: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            idea_review: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            script: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            script_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            storyboard: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            storyboard_approval: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            video: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            video_qa: { averageDuration: 0, completionRate: 100, revisionRate: 0 },
            published: { averageDuration: 0, completionRate: 100, revisionRate: 0 }
          }
        },
        notifications: { email: true, push: true },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(WorkflowPipelineService, 'getPipeline')
        .mockResolvedValue(mockPipeline);

      await WorkflowPipelineService.advanceToNextStage(pipelineId, userId);

      // 3. Create and approve checkpoint
      const checkpointId = await WorkflowPipelineService.createCheckpoint(
        pipelineId,
        'idea_review',
        userId
      );

      expect(checkpointId).toBe('mock-doc-id');

      // 4. Verify progress tracking
      const progress = await PipelineManager.getProjectProgress(projectId);
      expect(progress).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database failures gracefully', async () => {
      require('firebase/firestore').addDoc.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        WorkflowPipelineService.createPipeline('test-project', 'test-user')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle invalid pipeline states', async () => {
      jest.spyOn(WorkflowPipelineService, 'getPipeline')
        .mockResolvedValueOnce(null);

      await expect(
        WorkflowPipelineService.advanceToNextStage('nonexistent-pipeline', 'test-user')
      ).rejects.toThrow('Pipeline not found');
    });
  });
});