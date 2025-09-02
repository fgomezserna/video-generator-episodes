import { 
  collection, 
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  Unsubscribe 
} from 'firebase/firestore';
import { db } from '../firebase';
import { WorkflowPipelineService } from './workflow-pipeline';
import { PipelineManager } from './pipeline-manager';
import { 
  WorkflowPipeline, 
  PipelineStage, 
  PipelineCheckpoint,
  NotificationEvent 
} from '../types';

export interface PipelineUpdate {
  pipelineId: string;
  projectId: string;
  previousStage: PipelineStage;
  currentStage: PipelineStage;
  progress: number;
  timestamp: Date;
  triggeredBy: string;
  metadata?: Record<string, any>;
}

export interface RealTimeProgress {
  pipeline: WorkflowPipeline;
  progress: {
    currentStage: PipelineStage;
    completedStages: number;
    totalStages: number;
    progressPercentage: number;
    estimatedCompletion?: Date;
  };
  activeCheckpoints: PipelineCheckpoint[];
  recentActivity: PipelineUpdate[];
}

export class PipelineTracker {
  private subscriptions: Map<string, Unsubscribe> = new Map();
  private progressCallbacks: Map<string, (progress: RealTimeProgress) => void> = new Map();
  private notificationCallbacks: Map<string, (notifications: NotificationEvent[]) => void> = new Map();

  // Real-time Pipeline Tracking
  subscribeToProjectPipeline(
    projectId: string,
    callback: (progress: RealTimeProgress | null) => void
  ): () => void {
    const subscriptionKey = `project_${projectId}`;
    
    // Cancel existing subscription if any
    this.unsubscribe(subscriptionKey);

    const pipelineQuery = query(
      collection(db, 'workflowPipelines'),
      where('projectId', '==', projectId)
    );

    const unsubscribe = onSnapshot(pipelineQuery, async (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }

      const pipelineDoc = snapshot.docs[0];
      const pipeline = this.formatPipeline(pipelineDoc.id, pipelineDoc.data());
      
      // Get additional progress data
      const progressData = await PipelineManager.getProjectProgress(projectId);
      const activeCheckpoints = await this.getActiveCheckpoints(pipeline.id);
      const recentActivity = await this.getRecentActivity(pipeline.id);

      const realTimeProgress: RealTimeProgress = {
        pipeline,
        progress: {
          currentStage: pipeline.currentStage,
          completedStages: pipeline.stages.filter(s => s.status === 'completed').length,
          totalStages: pipeline.stages.length,
          progressPercentage: progressData?.progressPercentage || 0,
          estimatedCompletion: this.calculateEstimatedCompletion(pipeline)
        },
        activeCheckpoints,
        recentActivity
      };

      callback(realTimeProgress);
    }, (error) => {
      console.error('Error subscribing to pipeline:', error);
      callback(null);
    });

    this.subscriptions.set(subscriptionKey, unsubscribe);
    return () => this.unsubscribe(subscriptionKey);
  }

  // Multi-project Dashboard Tracking
  subscribeToDashboard(
    userId: string,
    callback: (dashboardData: {
      activePipelines: WorkflowPipeline[];
      pendingApprovals: PipelineCheckpoint[];
      recentActivity: PipelineUpdate[];
      metrics: {
        totalActive: number;
        blockedCount: number;
        completedToday: number;
        averageCompletionTime: number;
      };
    }) => void
  ): () => void {
    const subscriptionKey = `dashboard_${userId}`;
    
    // Subscribe to user's pipelines
    const pipelinesQuery = query(
      collection(db, 'workflowPipelines'),
      where('stages.checkpoint.assignedTo', 'array-contains', userId),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(pipelinesQuery, async (snapshot) => {
      const pipelines = snapshot.docs.map(doc => 
        this.formatPipeline(doc.id, doc.data())
      );

      const activePipelines = pipelines.filter(p => 
        !['completed', 'archived', 'failed'].includes(p.currentStage)
      );

      const pendingApprovals = await this.getPendingApprovalsForUser(userId);
      const recentActivity = await this.getRecentActivityForUser(userId);

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const completedToday = pipelines.filter(p => {
        const lastStage = p.stages.find(s => s.stage === 'published');
        return lastStage?.completedAt && lastStage.completedAt >= today;
      }).length;

      const blockedCount = activePipelines.filter(p => {
        const currentStageData = p.stages.find(s => s.stage === p.currentStage);
        return currentStageData?.checkpoint?.status === 'pending';
      }).length;

      const completedPipelines = pipelines.filter(p => p.currentStage === 'published');
      const averageCompletionTime = this.calculateAverageCompletionTime(completedPipelines);

      callback({
        activePipelines,
        pendingApprovals,
        recentActivity,
        metrics: {
          totalActive: activePipelines.length,
          blockedCount,
          completedToday,
          averageCompletionTime
        }
      });
    }, (error) => {
      console.error('Error subscribing to dashboard:', error);
    });

    this.subscriptions.set(subscriptionKey, unsubscribe);
    return () => this.unsubscribe(subscriptionKey);
  }

  // Notification Tracking
  subscribeToNotifications(
    userId: string,
    callback: (notifications: NotificationEvent[]) => void
  ): () => void {
    const subscriptionKey = `notifications_${userId}`;
    
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        sentAt: doc.data().sentAt?.toDate()
      })) as NotificationEvent[];

      callback(notifications);
    }, (error) => {
      console.error('Error subscribing to notifications:', error);
      callback([]);
    });

    this.subscriptions.set(subscriptionKey, unsubscribe);
    return () => this.unsubscribe(subscriptionKey);
  }

  // Stage Performance Tracking
  async getStagePerformanceMetrics(
    stage: PipelineStage,
    timeframe: { start: Date; end: Date }
  ): Promise<{
    averageDuration: number;
    medianDuration: number;
    successRate: number;
    bottleneckIndicators: string[];
    improvementSuggestions: string[];
  }> {
    const stageMetrics = await PipelineManager.getStageMetrics(stage, timeframe);
    const metric = stageMetrics[0];

    if (!metric) {
      return {
        averageDuration: 0,
        medianDuration: 0,
        successRate: 0,
        bottleneckIndicators: [],
        improvementSuggestions: []
      };
    }

    const bottleneckIndicators: string[] = [];
    const improvementSuggestions: string[] = [];

    if (metric.averageApprovalTime > 24 * 60 * 60 * 1000) { // 24 hours
      bottleneckIndicators.push('Long approval times');
      improvementSuggestions.push('Consider adding more reviewers or setting shorter deadlines');
    }

    if (metric.revisionRate > 25) {
      bottleneckIndicators.push('High revision rate');
      improvementSuggestions.push('Improve stage guidelines and quality checkpoints');
    }

    if (metric.completionRate < 90) {
      bottleneckIndicators.push('Low completion rate');
      improvementSuggestions.push('Investigate common failure points and add preventive measures');
    }

    return {
      averageDuration: metric.averageDuration,
      medianDuration: metric.averageDuration, // Simplified - would calculate actual median
      successRate: metric.completionRate,
      bottleneckIndicators,
      improvementSuggestions
    };
  }

  // Historical Tracking
  async getProjectHistory(
    projectId: string,
    includeArtifacts: boolean = true
  ): Promise<{
    timeline: Array<{
      stage: PipelineStage;
      status: 'started' | 'completed' | 'skipped' | 'failed';
      timestamp: Date;
      duration?: number;
      artifacts?: any[];
      checkpoint?: {
        reviewers: string[];
        feedback?: string;
        approvalTime?: number;
      };
    }>;
    totalDuration: number;
    stageBreakdown: Record<PipelineStage, number>;
  }> {
    const pipeline = await WorkflowPipelineService.getPipelineByProject(projectId);
    if (!pipeline) {
      throw new Error('Pipeline not found');
    }

    const timeline = pipeline.stages
      .filter(stage => stage.startedAt || stage.completedAt)
      .flatMap(stage => {
        const events: any[] = [];
        
        if (stage.startedAt) {
          events.push({
            stage: stage.stage,
            status: 'started',
            timestamp: stage.startedAt,
            artifacts: includeArtifacts ? stage.artifacts : undefined
          });
        }

        if (stage.completedAt) {
          const event: any = {
            stage: stage.stage,
            status: stage.status === 'completed' ? 'completed' : stage.status,
            timestamp: stage.completedAt,
            duration: stage.duration
          };

          if (stage.checkpoint && includeArtifacts) {
            event.checkpoint = {
              reviewers: stage.checkpoint.assignedTo,
              feedback: stage.checkpoint.feedback,
              approvalTime: stage.checkpoint.reviewedAt && stage.checkpoint.submittedAt
                ? stage.checkpoint.reviewedAt.getTime() - stage.checkpoint.submittedAt.getTime()
                : undefined
            };
          }

          events.push(event);
        }

        return events;
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const stageBreakdown: Record<PipelineStage, number> = {} as any;
    pipeline.stages.forEach(stage => {
      if (stage.duration) {
        stageBreakdown[stage.stage] = stage.duration;
      }
    });

    const totalDuration = Object.values(stageBreakdown).reduce((sum, duration) => sum + duration, 0);

    return {
      timeline,
      totalDuration,
      stageBreakdown
    };
  }

  // Cleanup
  unsubscribeAll(): void {
    this.subscriptions.forEach((unsubscribe, key) => {
      unsubscribe();
    });
    this.subscriptions.clear();
    this.progressCallbacks.clear();
    this.notificationCallbacks.clear();
  }

  private unsubscribe(key: string): void {
    const unsubscribe = this.subscriptions.get(key);
    if (unsubscribe) {
      unsubscribe();
      this.subscriptions.delete(key);
    }
  }

  // Helper methods
  private async getActiveCheckpoints(pipelineId: string): Promise<PipelineCheckpoint[]> {
    // This would query checkpoints collection for active ones
    return [];
  }

  private async getRecentActivity(pipelineId: string): Promise<PipelineUpdate[]> {
    // This would query pipeline activity/audit log
    return [];
  }

  private async getPendingApprovalsForUser(userId: string): Promise<PipelineCheckpoint[]> {
    const result = await PipelineManager.getPendingCheckpoints(userId);
    return result;
  }

  private async getRecentActivityForUser(userId: string): Promise<PipelineUpdate[]> {
    // This would query user's recent pipeline activities
    return [];
  }

  private calculateEstimatedCompletion(pipeline: WorkflowPipeline): Date | undefined {
    const remainingStages = pipeline.stages.filter(s => 
      s.status === 'not_started' || s.status === 'in_progress'
    );

    if (remainingStages.length === 0) return undefined;

    // Simple estimation based on average stage duration
    const averageStageTime = 2 * 60 * 60 * 1000; // 2 hours
    const estimatedTime = remainingStages.length * averageStageTime;
    
    return new Date(Date.now() + estimatedTime);
  }

  private calculateAverageCompletionTime(pipelines: WorkflowPipeline[]): number {
    if (pipelines.length === 0) return 0;

    const completionTimes = pipelines
      .filter(p => p.metrics.totalDuration)
      .map(p => p.metrics.totalDuration!);

    return completionTimes.length > 0
      ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length
      : 0;
  }

  private formatPipeline(id: string, data: any): WorkflowPipeline {
    return {
      ...data,
      id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      stages: data.stages?.map((stage: any) => ({
        ...stage,
        startedAt: stage.startedAt?.toDate(),
        completedAt: stage.completedAt?.toDate(),
        checkpoint: stage.checkpoint ? {
          ...stage.checkpoint,
          submittedAt: stage.checkpoint.submittedAt?.toDate() || new Date(),
          reviewedAt: stage.checkpoint.reviewedAt?.toDate(),
          dueDate: stage.checkpoint.dueDate?.toDate(),
          approvals: stage.checkpoint.approvals?.map((approval: any) => ({
            ...approval,
            timestamp: approval.timestamp?.toDate() || new Date()
          })) || []
        } : undefined,
        artifacts: stage.artifacts?.map((artifact: any) => ({
          ...artifact,
          createdAt: artifact.createdAt?.toDate() || new Date()
        })) || []
      })) || []
    };
  }
}

export const pipelineTracker = new PipelineTracker();