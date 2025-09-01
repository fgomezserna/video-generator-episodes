// Mock Firebase modules before importing
jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn(),
    doc: jest.fn(),
  },
  functions: {},
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => jest.fn()),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
  getDocs: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
}));

import { QueueService } from '../db/queue';
import { Job, JobStatus, JobType } from '../types';

describe('QueueService', () => {
  let queueService: QueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    queueService = new QueueService();
  });

  describe('Job Processing', () => {
    test('should enqueue a video generation job', async () => {
      const mockJobData = {
        projectId: 'test-project-1',
        templateId: 'template-1',
        variables: { title: 'Test Video', description: 'Test Description' },
        quality: 'standard' as const,
        aspectRatio: '16:9' as const,
      };

      const mockEnqueueResult = { jobId: 'job-123', status: 'enqueued' };
      
      jest.spyOn(queueService as any, 'enqueueJobCallable').mockResolvedValue({
        data: mockEnqueueResult
      });

      const result = await queueService.enqueueJob('video_generation', mockJobData, {
        priority: 'normal',
        maxRetries: 3
      });

      expect(result).toEqual(mockEnqueueResult);
    });

    test('should handle job enqueue errors gracefully', async () => {
      const mockJobData = {
        projectId: 'test-project-1',
        templateId: 'template-1',
        variables: {},
        quality: 'standard' as const,
        aspectRatio: '16:9' as const,
      };

      jest.spyOn(queueService as any, 'enqueueJobCallable').mockRejectedValue(
        new Error('Network error')
      );

      await expect(
        queueService.enqueueJob('video_generation', mockJobData)
      ).rejects.toThrow('Network error');
    });
  });

  describe('Job Status Management', () => {
    test('should validate job status transitions', () => {
      const validTransitions: Record<JobStatus, JobStatus[]> = {
        'pending': ['processing', 'failed'],
        'processing': ['completed', 'failed', 'retrying'],
        'completed': [],
        'failed': ['retrying'],
        'retrying': ['processing', 'failed', 'dead_letter'],
        'dead_letter': []
      };

      Object.entries(validTransitions).forEach(([from, toStates]) => {
        toStates.forEach(to => {
          expect(isValidStatusTransition(from as JobStatus, to)).toBe(true);
        });

        const allStates: JobStatus[] = ['pending', 'processing', 'completed', 'failed', 'retrying', 'dead_letter'];
        const invalidStates = allStates.filter(state => !toStates.includes(state));
        
        invalidStates.forEach(to => {
          expect(isValidStatusTransition(from as JobStatus, to)).toBe(false);
        });
      });
    });

    test('should calculate retry delay with exponential backoff', () => {
      expect(calculateRetryDelay(1)).toBe(2000);
      expect(calculateRetryDelay(2)).toBe(4000);
      expect(calculateRetryDelay(3)).toBe(8000);
      expect(calculateRetryDelay(10)).toBe(300000);
    });
  });

  describe('Job Priority Handling', () => {
    test('should sort jobs by priority and creation time', () => {
      const now = new Date();
      const jobs: Partial<Job>[] = [
        { id: '1', priority: 'low', createdAt: new Date(now.getTime() - 1000) },
        { id: '2', priority: 'high', createdAt: now },
        { id: '3', priority: 'normal', createdAt: new Date(now.getTime() - 500) },
        { id: '4', priority: 'urgent', createdAt: new Date(now.getTime() - 2000) },
        { id: '5', priority: 'high', createdAt: new Date(now.getTime() - 1500) },
      ];

      const sorted = sortJobsByPriority(jobs as Job[]);
      const expectedOrder = ['4', '5', '2', '3', '1'];
      
      expect(sorted.map(job => job.id)).toEqual(expectedOrder);
    });
  });

  describe('Error Handling', () => {
    test('should handle different error types', () => {
      const networkError = new Error('Network timeout');
      const validationError = new Error('Invalid data');
      const processingError = new Error('Processing failed');

      expect(categorizeError(networkError)).toBe('network_error');
      expect(categorizeError(validationError)).toBe('validation_error');
      expect(categorizeError(processingError)).toBe('processing_error');
    });

    test('should determine if error is retryable', () => {
      const networkError = new Error('Network timeout');
      const validationError = new Error('Invalid template ID');
      const systemError = new Error('Out of memory');

      expect(isRetryableError(networkError)).toBe(true);
      expect(isRetryableError(validationError)).toBe(false);
      expect(isRetryableError(systemError)).toBe(true);
    });
  });
});

function isValidStatusTransition(from: JobStatus, to: JobStatus): boolean {
  const validTransitions: Record<JobStatus, JobStatus[]> = {
    'pending': ['processing', 'failed'],
    'processing': ['completed', 'failed', 'retrying'],
    'completed': [],
    'failed': ['retrying'],
    'retrying': ['processing', 'failed', 'dead_letter'],
    'dead_letter': []
  };

  return validTransitions[from]?.includes(to) || false;
}

function calculateRetryDelay(retryCount: number): number {
  return Math.min(1000 * Math.pow(2, retryCount), 300000);
}

function sortJobsByPriority(jobs: Job[]): Job[] {
  const priorityOrder = { 'urgent': 0, 'high': 1, 'normal': 2, 'low': 3 };
  
  return jobs.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function categorizeError(error: Error): string {
  if (error.message.includes('Network') || error.message.includes('timeout')) {
    return 'network_error';
  }
  if (error.message.includes('Invalid') || error.message.includes('validation')) {
    return 'validation_error';
  }
  return 'processing_error';
}

function isRetryableError(error: Error): boolean {
  const nonRetryableKeywords = ['Invalid', 'validation', 'not found', 'permission'];
  return !nonRetryableKeywords.some(keyword => 
    error.message.toLowerCase().includes(keyword.toLowerCase())
  );
}