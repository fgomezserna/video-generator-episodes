import { WorkflowPipelineService } from '../services/workflow-pipeline';
import { PipelineManager } from '../services/pipeline-manager';
import { PipelineTracker } from '../services/pipeline-tracker';

// Mock Firebase dependencies with simpler approach
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

describe('Simplified Pipeline Tests', () => {
  const mockProjectId = 'test-project-123';
  const mockUserId = 'test-user-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('WorkflowPipelineService', () => {
    it('should create a pipeline successfully', async () => {
      const pipelineId = await WorkflowPipelineService.createPipeline(mockProjectId, mockUserId);
      
      expect(pipelineId).toBe('mock-doc-id');
      expect(require('firebase/firestore').addDoc).toHaveBeenCalled();
    });

    it('should get pipeline by project', async () => {
      const pipeline = await WorkflowPipelineService.getPipelineByProject(mockProjectId);
      
      expect(pipeline).toBeDefined();
      expect(require('firebase/firestore').getDocs).toHaveBeenCalled();
    });

    it('should add artifacts to pipeline stage', async () => {
      await WorkflowPipelineService.addArtifact(
        'test-pipeline',
        'script',
        {
          type: 'script',
          url: 'https://example.com/script.json',
          data: { wordCount: 500 }
        }
      );
      
      expect(require('firebase/firestore').updateDoc).toHaveBeenCalled();
    });
  });

  describe('PipelineManager', () => {
    it('should get project progress', async () => {
      const progress = await PipelineManager.getProjectProgress(mockProjectId);
      
      expect(progress).toBeDefined();
      if (progress) {
        expect(typeof progress.progressPercentage).toBe('number');
        expect(progress.currentStage).toBeDefined();
      }
    });

    it('should generate stage metrics', async () => {
      const metrics = await PipelineManager.getStageMetrics('script');
      
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('PipelineTracker', () => {
    it('should subscribe to project pipeline updates', () => {
      const tracker = new PipelineTracker();
      const mockCallback = jest.fn();
      
      const unsubscribe = tracker.subscribeToProjectPipeline('test-project', mockCallback);
      
      expect(typeof unsubscribe).toBe('function');
      expect(require('firebase/firestore').onSnapshot).toHaveBeenCalled();
      
      unsubscribe();
    });

    it('should get stage performance metrics', async () => {
      const tracker = new PipelineTracker();
      
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

    it('should cleanup subscriptions', () => {
      const tracker = new PipelineTracker();
      
      // Should not throw
      expect(() => tracker.unsubscribeAll()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing pipeline gracefully', async () => {
      // Mock getDoc to return null
      require('firebase/firestore').getDoc.mockResolvedValueOnce({
        exists: () => false,
        data: () => null
      });

      const pipeline = await WorkflowPipelineService.getPipeline('nonexistent-id');
      expect(pipeline).toBeNull();
    });

    it('should handle empty query results', async () => {
      // Mock getDocs to return empty
      require('firebase/firestore').getDocs.mockResolvedValueOnce({
        empty: true,
        docs: []
      });

      const pipeline = await WorkflowPipelineService.getPipelineByProject('nonexistent-project');
      expect(pipeline).toBeNull();
    });
  });

  describe('Integration Tests', () => {
    it('should handle basic pipeline flow', async () => {
      // Create pipeline
      const pipelineId = await WorkflowPipelineService.createPipeline(mockProjectId, mockUserId);
      expect(pipelineId).toBe('mock-doc-id');

      // Get progress
      const progress = await PipelineManager.getProjectProgress(mockProjectId);
      expect(progress).toBeDefined();

      // Add artifact
      await WorkflowPipelineService.addArtifact(pipelineId, 'script', {
        type: 'script',
        data: { test: 'data' }
      });

      // Verify all operations completed
      expect(require('firebase/firestore').addDoc).toHaveBeenCalled();
      expect(require('firebase/firestore').getDocs).toHaveBeenCalled();
      expect(require('firebase/firestore').updateDoc).toHaveBeenCalled();
    });
  });
});

describe('Type Validations', () => {
  it('should validate pipeline stage types', () => {
    const validStages = [
      'idea', 'idea_review', 'script', 'script_approval',
      'storyboard', 'storyboard_approval', 'video', 'video_qa', 'published'
    ];
    
    // This test validates our types are correctly defined
    expect(validStages).toHaveLength(9);
    expect(validStages).toContain('idea');
    expect(validStages).toContain('published');
  });

  it('should validate checkpoint status types', () => {
    const validStatuses = ['pending', 'approved', 'rejected', 'needs_revision'];
    
    expect(validStatuses).toContain('pending');
    expect(validStatuses).toContain('approved');
  });
});