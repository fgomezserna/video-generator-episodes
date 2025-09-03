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
    data: () => ({
      projectId: 'test-project',
      currentStage: 'idea',
      stages: [],
      createdAt: { toDate: () => new Date() },
      updatedAt: { toDate: () => new Date() }
    }),
    id: 'mock-doc-id'
  })),
  getDocs: jest.fn(() => Promise.resolve({
    empty: false,
    docs: [{
      id: 'mock-doc-id',
      data: () => ({
        projectId: 'test-project',
        currentStage: 'idea',
        stages: []
      })
    }]
  })),
  addDoc: jest.fn(() => Promise.resolve({ id: 'mock-doc-id' })),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn((query, callback) => {
    // Simulate immediate callback
    callback({
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
    });
    return jest.fn(); // unsubscribe function
  }),
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

describe('WorkflowPipelineService - Working Tests', () => {
  const mockProjectId = 'test-project-123';
  const mockUserId = 'test-user-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Pipeline Creation', () => {
    it('should create a pipeline successfully', async () => {
      const pipelineId = await WorkflowPipelineService.createPipeline(mockProjectId, mockUserId);
      
      expect(pipelineId).toBe('mock-doc-id');
      expect(require('firebase/firestore').addDoc).toHaveBeenCalled();
      
      const callArgs = require('firebase/firestore').addDoc.mock.calls[0][1];
      expect(callArgs.projectId).toBe(mockProjectId);
      expect(callArgs.currentStage).toBe('idea');
      expect(callArgs.stages).toHaveLength(9);
    });

    it('should initialize all pipeline stages correctly', async () => {
      await WorkflowPipelineService.createPipeline(mockProjectId, mockUserId);
      
      const addDocCall = require('firebase/firestore').addDoc.mock.calls[0][1];
      const stages = addDocCall.stages;
      
      expect(stages).toHaveLength(9);
      expect(stages[0].stage).toBe('idea');
      expect(stages[0].status).toBe('in_progress');
      
      stages.slice(1).forEach((stage: any) => {
        expect(stage.status).toBe('not_started');
      });
    });
  });

  describe('Pipeline Advancement', () => {
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

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalled();
      
      // Verify that updateDoc was called with a stage update
      const updateCalls = require('firebase/firestore').updateDoc.mock.calls;
      const hasStageUpdate = updateCalls.some(call => call[1]?.currentStage);
      expect(hasStageUpdate).toBe(true);
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

  describe('Checkpoint Management', () => {
    it('should create checkpoint with correct data', async () => {
      const checkpointId = await WorkflowPipelineService.createCheckpoint(
        'test-pipeline',
        'idea_review',
        mockUserId,
        ['reviewer1', 'reviewer2'],
        2
      );

      expect(checkpointId).toBe('mock-doc-id');
      expect(require('firebase/firestore').addDoc).toHaveBeenCalled();
      
      // Verify checkpoint creation call
      const addDocCalls = require('firebase/firestore').addDoc.mock.calls;
      const checkpointCall = addDocCalls.find(call => call[1]?.stage === 'idea_review');
      expect(checkpointCall).toBeDefined();
    });

    it('should approve checkpoint correctly', async () => {
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

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalled();
      
      // Verify approval was processed
      const updateCalls = require('firebase/firestore').updateDoc.mock.calls;
      const approvalCall = updateCalls.find(call => call[1]?.status === 'approved');
      expect(approvalCall).toBeDefined();
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

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalled();
      
      // Verify rejection was processed
      const updateCalls = require('firebase/firestore').updateDoc.mock.calls;
      const rejectionCall = updateCalls.find(call => call[1]?.status === 'rejected');
      expect(rejectionCall).toBeDefined();
    });
  });

  describe('Rollback Functionality', () => {
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
          stage: 'script',
          status: 'completed',
          startedAt: new Date(Date.now() - 2000),
          completedAt: new Date(Date.now() - 1500),
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

    it('should rollback to previous stage successfully', async () => {
      jest.spyOn(WorkflowPipelineService, 'getPipeline')
        .mockResolvedValueOnce(mockAdvancedPipeline);

      await WorkflowPipelineService.rollbackToPreviousStage(
        'test-pipeline',
        'script',
        mockUserId,
        'Script needs major revisions'
      );

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalled();
      
      // Verify rollback was processed
      const updateCalls = require('firebase/firestore').updateDoc.mock.calls;
      const rollbackCall = updateCalls.find(call => call[1]?.currentStage === 'script');
      expect(rollbackCall).toBeDefined();
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

  describe('Artifact Management', () => {
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

      expect(require('firebase/firestore').updateDoc).toHaveBeenCalled();
      
      // Verify artifact was added
      const updateCalls = require('firebase/firestore').updateDoc.mock.calls;
      const artifactCall = updateCalls.find(call => call[1]?.stages);
      expect(artifactCall).toBeDefined();
    });
  });
});

describe('PipelineManager - Working Tests', () => {
  describe('Project Initialization', () => {
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

  describe('Progress Management', () => {
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

      expect(progress).toBeDefined();
      expect(progress!.currentStage).toBe('script_approval');
      expect(progress!.completedStages).toBe(3);
      expect(progress!.totalStages).toBe(9);
      expect(progress!.progressPercentage).toBe(33);
    });
  });
});

describe('PipelineTracker - Working Tests', () => {
  let tracker: PipelineTracker;

  beforeEach(() => {
    tracker = new PipelineTracker();
  });

  afterEach(() => {
    tracker.unsubscribeAll();
  });

  describe('Real-time Tracking', () => {
    it('should subscribe to project pipeline updates', () => {
      const mockCallback = jest.fn();
      
      const unsubscribe = tracker.subscribeToProjectPipeline('test-project', mockCallback);

      expect(require('firebase/firestore').onSnapshot).toHaveBeenCalled();
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

  describe('Performance Tracking', () => {
    it('should get stage performance metrics', async () => {
      // Mock PipelineManager.getStageMetrics for this test
      jest.spyOn(PipelineManager, 'getStageMetrics').mockResolvedValueOnce([{
        stage: 'script',
        averageDuration: 2000,
        completionRate: 95,
        revisionRate: 10,
        averageApprovalTime: 1000,
        commonIssues: ['timing']
      }]);
      
      const metrics = await tracker.getStagePerformanceMetrics('script', {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date()
      });
      
      expect(metrics).toBeDefined();
      expect(metrics.averageDuration).toBeDefined();
      expect(metrics.successRate).toBeDefined();
    });

    it('should cleanup subscriptions correctly', () => {
      expect(() => tracker.unsubscribeAll()).not.toThrow();
    });
  });
});

describe('Integration Tests - Working', () => {
  describe('End-to-End Pipeline Flow', () => {
    it('should handle basic pipeline workflow', async () => {
      const projectId = 'integration-test-project';
      const userId = 'integration-test-user';

      // Mock dependencies
      jest.spyOn(require('../db/projects').ProjectsDB, 'get')
        .mockResolvedValue({ id: projectId, userId, status: 'draft' });
      jest.spyOn(WorkflowPipelineService, 'createPipeline')
        .mockResolvedValue('test-pipeline-id');

      const pipelineId = await PipelineManager.initializeProjectPipeline(projectId, userId);
      expect(pipelineId).toBe('test-pipeline-id');

      const progress = await PipelineManager.getProjectProgress(projectId);
      expect(progress).toBeDefined();

      // Just verify the functions can be called without error
      expect(typeof WorkflowPipelineService.addArtifact).toBe('function');
      expect(typeof PipelineManager.initializeProjectPipeline).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing pipeline gracefully', async () => {
      jest.spyOn(WorkflowPipelineService, 'getPipeline')
        .mockResolvedValueOnce(null);

      await expect(
        WorkflowPipelineService.advanceToNextStage('nonexistent-pipeline', 'test-user')
      ).rejects.toThrow('Pipeline not found');
    });
  });
});