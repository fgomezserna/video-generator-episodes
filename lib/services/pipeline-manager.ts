import { WorkflowPipelineService } from './workflow-pipeline';
import { PipelineDB } from '../db/pipeline';
import { ProjectsDB } from '../db/projects';
import { queueService } from '../db/queue';
import { 
  WorkflowPipeline, 
  PipelineStage, 
  PipelineCheckpoint,
  CheckpointStatus,
  PipelineRule,
  Project,
  NotificationEvent,
  JobPriority 
} from '../types';

export interface PipelineProgress {
  currentStage: PipelineStage;
  completedStages: number;
  totalStages: number;
  progressPercentage: number;
  estimatedTimeRemaining?: number;
  blockedBy?: string;
  nextAction?: string;
}

export interface StageMetrics {
  stage: PipelineStage;
  averageDuration: number;
  completionRate: number;
  revisionRate: number;
  averageApprovalTime: number;
  commonIssues: string[];
}

export class PipelineManager {
  private static readonly STAGE_ORDER: PipelineStage[] = [
    'idea', 'idea_review', 'script', 'script_approval', 
    'storyboard', 'storyboard_approval', 'video', 'video_qa', 'published'
  ];

  // Project Pipeline Management
  static async initializeProjectPipeline(
    projectId: string, 
    userId: string,
    options: {
      skipStages?: PipelineStage[];
      customReviewers?: Record<PipelineStage, string[]>;
      priority?: JobPriority;
      dueDate?: Date;
    } = {}
  ): Promise<string> {
    const project = await ProjectsDB.get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Create pipeline through service
    const pipelineId = await WorkflowPipelineService.createPipeline(projectId, userId);
    
    // Apply custom configuration
    if (options.skipStages?.length) {
      await this.configureSkippedStages(pipelineId, options.skipStages);
    }

    if (options.customReviewers) {
      await this.assignCustomReviewers(pipelineId, options.customReviewers);
    }

    // Update project status to reflect pipeline start
    await ProjectsDB.updateStatus(projectId, 'pending');

    return pipelineId;
  }

  static async getProjectProgress(projectId: string): Promise<PipelineProgress | null> {
    const pipeline = await WorkflowPipelineService.getPipelineByProject(projectId);
    if (!pipeline) return null;

    const completedStages = pipeline.stages.filter(s => s.status === 'completed').length;
    const totalStages = this.STAGE_ORDER.length;
    const progressPercentage = Math.round((completedStages / totalStages) * 100);

    const currentStageData = pipeline.stages.find(s => s.stage === pipeline.currentStage);
    const blockedBy = currentStageData?.checkpoint?.status === 'pending' 
      ? 'Awaiting approval' 
      : undefined;

    let nextAction = '';
    if (currentStageData?.checkpoint?.status === 'pending') {
      nextAction = `Review required for ${this.formatStageName(pipeline.currentStage)}`;
    } else if (currentStageData?.status === 'in_progress') {
      nextAction = `Processing ${this.formatStageName(pipeline.currentStage)}`;
    }

    return {
      currentStage: pipeline.currentStage,
      completedStages,
      totalStages,
      progressPercentage,
      blockedBy,
      nextAction,
      estimatedTimeRemaining: this.calculateEstimatedTime(pipeline)
    };
  }

  // Checkpoint Management
  static async getPendingCheckpoints(userId: string): Promise<PipelineCheckpoint[]> {
    const result = await PipelineDB.getCheckpointsByUser(userId, 'pending');
    return result.checkpoints;
  }

  static async bulkApproveCheckpoints(
    checkpointIds: string[], 
    userId: string, 
    feedback?: string
  ): Promise<{ successful: string[]; failed: Array<{ id: string; error: string }> }> {
    const results = {
      successful: [] as string[],
      failed: [] as Array<{ id: string; error: string }>
    };

    for (const checkpointId of checkpointIds) {
      try {
        await WorkflowPipelineService.approveCheckpoint(checkpointId, userId, feedback);
        results.successful.push(checkpointId);
      } catch (error) {
        results.failed.push({
          id: checkpointId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  static async escalateCheckpoint(
    checkpointId: string, 
    userId: string, 
    escalationReason: string,
    escalateTo: string[]
  ): Promise<void> {
    const checkpoint = await PipelineDB.getCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }

    // Add escalation reviewers
    const combinedReviewers = [...checkpoint.assignedTo, ...escalateTo];
    const updatedAssignedTo = Array.from(new Set(combinedReviewers));
    
    await PipelineDB.updateCheckpoint(checkpointId, {
      assignedTo: updatedAssignedTo,
      metadata: {
        ...checkpoint.metadata,
        escalated: true,
        escalationReason,
        escalatedBy: userId,
        escalatedAt: new Date()
      }
    });

    // Notify escalation recipients
    for (const assigneeId of escalateTo) {
      await this.sendNotification(assigneeId, {
        type: 'system_alert',
        title: 'Checkpoint Escalated',
        message: `${this.formatStageName(checkpoint.stage)} has been escalated for review`,
        data: { checkpointId, escalationReason, stage: checkpoint.stage },
        channels: ['in_app', 'email', 'push']
      });
    }
  }

  // Analytics and Reporting
  static async getStageMetrics(
    stage?: PipelineStage, 
    timeframe: { start: Date; end: Date } = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: new Date()
    }
  ): Promise<StageMetrics[]> {
    const stages = stage ? [stage] : this.STAGE_ORDER;
    const metrics: StageMetrics[] = [];

    for (const stageType of stages) {
      const pipelines = await PipelineDB.getPipelinesByStage(stageType);
      
      const stageData = pipelines.pipelines.flatMap(p => 
        p.stages.filter(s => s.stage === stageType)
      );

      const completedStages = stageData.filter(s => s.status === 'completed');
      const averageDuration = completedStages.length > 0 
        ? completedStages.reduce((sum, s) => sum + (s.duration || 0), 0) / completedStages.length
        : 0;

      const totalStages = stageData.length;
      const completionRate = totalStages > 0 ? (completedStages.length / totalStages) * 100 : 0;

      const stagesWithCheckpoints = stageData.filter(s => s.checkpoint);
      const rejectedCheckpoints = stagesWithCheckpoints.filter(
        s => s.checkpoint?.status === 'rejected'
      );
      const revisionRate = stagesWithCheckpoints.length > 0 
        ? (rejectedCheckpoints.length / stagesWithCheckpoints.length) * 100 
        : 0;

      const approvedCheckpoints = stagesWithCheckpoints.filter(
        s => s.checkpoint?.status === 'approved' && s.checkpoint.reviewedAt
      );
      const averageApprovalTime = approvedCheckpoints.length > 0
        ? approvedCheckpoints.reduce((sum, s) => {
            const checkpoint = s.checkpoint!;
            const approvalTime = checkpoint.reviewedAt!.getTime() - checkpoint.submittedAt.getTime();
            return sum + approvalTime;
          }, 0) / approvedCheckpoints.length
        : 0;

      metrics.push({
        stage: stageType,
        averageDuration,
        completionRate,
        revisionRate,
        averageApprovalTime,
        commonIssues: this.extractCommonIssues(stagesWithCheckpoints)
      });
    }

    return metrics;
  }

  static async generatePipelineReport(
    projectId?: string,
    timeframe: { start: Date; end: Date } = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date()
    }
  ): Promise<{
    summary: {
      totalPipelines: number;
      completedPipelines: number;
      averageCompletionTime: number;
      bottleneckStages: PipelineStage[];
    };
    stageBreakdown: StageMetrics[];
    recommendations: string[];
  }> {
    const stageMetrics = await this.getStageMetrics(undefined, timeframe);
    
    const bottleneckStages = stageMetrics
      .filter(m => m.revisionRate > 20 || m.averageApprovalTime > 24 * 60 * 60 * 1000) // 24 hours
      .map(m => m.stage);

    const recommendations = this.generateRecommendations(stageMetrics, bottleneckStages);

    return {
      summary: {
        totalPipelines: 0, // Would need to implement counting logic
        completedPipelines: 0,
        averageCompletionTime: stageMetrics.reduce((sum, m) => sum + m.averageDuration, 0),
        bottleneckStages
      },
      stageBreakdown: stageMetrics,
      recommendations
    };
  }

  // Pipeline Rules and Automation
  static async createAutomationRule(
    stage: PipelineStage,
    rule: {
      name: string;
      description: string;
      conditions: Array<{
        field: string;
        operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
        value: any;
      }>;
      actions: Array<{
        type: 'require_approval' | 'auto_approve' | 'notify' | 'assign_reviewer' | 'set_due_date';
        config: Record<string, any>;
      }>;
      priority: number;
    },
    userId: string
  ): Promise<string> {
    return PipelineDB.createRule({
      ...rule,
      stage,
      isActive: true,
      createdBy: userId
    });
  }

  static async evaluateRules(
    pipelineId: string, 
    stage: PipelineStage, 
    context: Record<string, any>
  ): Promise<void> {
    const rules = await PipelineDB.getRulesByStage(stage);
    
    for (const rule of rules) {
      if (this.evaluateConditions(rule.conditions, context)) {
        await this.executeActions(pipelineId, stage, rule.actions, context);
      }
    }
  }

  // Helper Methods
  private static async configureSkippedStages(
    pipelineId: string, 
    skipStages: PipelineStage[]
  ): Promise<void> {
    const pipeline = await WorkflowPipelineService.getPipeline(pipelineId);
    if (!pipeline) return;

    const updatedStages = pipeline.stages.map(stage => {
      if (skipStages.includes(stage.stage)) {
        return {
          ...stage,
          status: 'skipped' as const
        };
      }
      return stage;
    });

    await PipelineDB.updatePipeline(pipelineId, { stages: updatedStages });
  }

  private static async assignCustomReviewers(
    pipelineId: string,
    customReviewers: Record<PipelineStage, string[]>
  ): Promise<void> {
    // This would require extending the pipeline structure to store custom reviewer assignments
    // For now, we'll store it in metadata
    const pipeline = await WorkflowPipelineService.getPipeline(pipelineId);
    if (!pipeline) return;

    // Store custom reviewers in pipeline metadata for later use
    await PipelineDB.updatePipeline(pipelineId, {
      stages: pipeline.stages.map(stage => ({
        ...stage,
        checkpoint: stage.checkpoint ? {
          ...stage.checkpoint,
          metadata: {
            ...stage.checkpoint.metadata,
            customReviewers: customReviewers[stage.stage] || []
          }
        } : undefined
      }))
    });
  }

  private static calculateEstimatedTime(pipeline: WorkflowPipeline): number {
    const remainingStages = this.STAGE_ORDER.filter(stage => {
      const stageData = pipeline.stages.find(s => s.stage === stage);
      return stageData?.status === 'not_started' || stageData?.status === 'in_progress';
    });

    // Use historical averages from metrics (simplified estimation)
    const averageStageTime = 2 * 60 * 60 * 1000; // 2 hours average per stage
    return remainingStages.length * averageStageTime;
  }

  private static extractCommonIssues(stages: any[]): string[] {
    const feedbacks = stages
      .filter(s => s.checkpoint?.feedback)
      .map(s => s.checkpoint.feedback);
    
    // Simple keyword extraction (would use NLP in production)
    const commonKeywords = ['quality', 'timing', 'content', 'style', 'consistency'];
    return commonKeywords.filter(keyword => 
      feedbacks.some(feedback => feedback.toLowerCase().includes(keyword))
    );
  }

  private static generateRecommendations(
    metrics: StageMetrics[], 
    bottlenecks: PipelineStage[]
  ): string[] {
    const recommendations: string[] = [];

    for (const bottleneck of bottlenecks) {
      const metric = metrics.find(m => m.stage === bottleneck);
      if (!metric) continue;

      if (metric.revisionRate > 30) {
        recommendations.push(
          `Consider improving guidelines for ${this.formatStageName(bottleneck)} stage (${metric.revisionRate.toFixed(1)}% revision rate)`
        );
      }

      if (metric.averageApprovalTime > 48 * 60 * 60 * 1000) { // 48 hours
        recommendations.push(
          `Consider adding more reviewers or setting shorter deadlines for ${this.formatStageName(bottleneck)} approvals`
        );
      }
    }

    return recommendations;
  }

  private static evaluateConditions(
    conditions: Array<{
      field: string;
      operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
      value: any;
    }>, 
    context: Record<string, any>
  ): boolean {
    return conditions.every(condition => {
      const fieldValue = context[condition.field];
      
      switch (condition.operator) {
        case 'equals':
          return fieldValue === condition.value;
        case 'not_equals':
          return fieldValue !== condition.value;
        case 'greater_than':
          return fieldValue > condition.value;
        case 'less_than':
          return fieldValue < condition.value;
        case 'contains':
          return String(fieldValue).includes(String(condition.value));
        default:
          return false;
      }
    });
  }

  private static async executeActions(
    pipelineId: string,
    stage: PipelineStage,
    actions: Array<{
      type: 'require_approval' | 'auto_approve' | 'notify' | 'assign_reviewer' | 'set_due_date';
      config: Record<string, any>;
    }>,
    context: Record<string, any>
  ): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case 'require_approval':
          await WorkflowPipelineService.createCheckpoint(
            pipelineId, 
            stage, 
            context.userId,
            action.config.reviewers || [],
            action.config.requiredApprovals || 1
          );
          break;
        
        case 'auto_approve':
          await WorkflowPipelineService.advanceToNextStage(pipelineId, context.userId);
          break;
        
        case 'notify':
          if (action.config.recipients) {
            for (const recipient of action.config.recipients) {
              await this.sendNotification(recipient, {
                type: 'system_alert',
                title: action.config.title || 'Pipeline Notification',
                message: action.config.message || 'Pipeline stage update',
                data: { pipelineId, stage, context },
                channels: action.config.channels || ['in_app']
              });
            }
          }
          break;
      }
    }
  }

  private static async sendNotification(
    userId: string, 
    notification: Omit<NotificationEvent, 'id' | 'userId' | 'status' | 'createdAt'>
  ): Promise<void> {
    // Implementation would use notification service
    console.log(`Notification sent to ${userId}:`, notification);
  }

  private static formatStageName(stage: PipelineStage): string {
    return stage.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
}

export const pipelineManager = PipelineManager;