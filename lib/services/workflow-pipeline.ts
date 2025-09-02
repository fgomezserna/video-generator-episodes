import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  WorkflowPipeline, 
  PipelineStage, 
  PipelineCheckpoint, 
  CheckpointStatus,
  PipelineRule,
  Project,
  NotificationEvent 
} from '../types';
import { queueService } from '../db/queue';

const PIPELINES_COLLECTION = 'workflowPipelines';
const CHECKPOINTS_COLLECTION = 'pipelineCheckpoints';
const RULES_COLLECTION = 'pipelineRules';
const NOTIFICATIONS_COLLECTION = 'notifications';

export class WorkflowPipelineService {
  private static readonly DEFAULT_STAGE_ORDER: PipelineStage[] = [
    'idea',
    'idea_review',
    'script',
    'script_approval',
    'storyboard', 
    'storyboard_approval',
    'video',
    'video_qa',
    'published'
  ];

  static async createPipeline(projectId: string, userId: string): Promise<string> {
    const now = new Date();
    
    const initialStages = this.DEFAULT_STAGE_ORDER.map(stage => ({
      stage,
      status: (stage === 'idea' ? 'in_progress' : 'not_started') as 'in_progress' | 'not_started',
      startedAt: stage === 'idea' ? now : undefined,
      artifacts: [] as Array<{
        type: 'script' | 'storyboard' | 'video' | 'feedback';
        url?: string;
        data?: any;
        createdAt: Date;
      }>
    }));

    const pipeline: Omit<WorkflowPipeline, 'id'> = {
      projectId,
      currentStage: 'idea',
      stages: initialStages,
      metrics: {
        stageMetrics: this.initializeStageMetrics()
      },
      notifications: {
        email: true,
        push: true
      },
      createdAt: now,
      updatedAt: now
    };

    const docRef = await addDoc(collection(db, PIPELINES_COLLECTION), {
      ...pipeline,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      stages: pipeline.stages.map(stage => ({
        ...stage,
        startedAt: stage.startedAt ? Timestamp.fromDate(stage.startedAt) : null
      }))
    });

    await this.sendNotification(userId, {
      type: 'system_alert',
      title: 'Pipeline Created',
      message: 'Video generation pipeline has been initialized',
      data: { pipelineId: docRef.id, projectId, stage: 'idea' },
      channels: ['in_app', 'email']
    });

    return docRef.id;
  }

  static async getPipeline(pipelineId: string): Promise<WorkflowPipeline | null> {
    const docRef = doc(db, PIPELINES_COLLECTION, pipelineId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return this.formatPipeline(docSnap.id, docSnap.data());
  }

  static async getPipelineByProject(projectId: string): Promise<WorkflowPipeline | null> {
    const q = query(
      collection(db, PIPELINES_COLLECTION),
      where('projectId', '==', projectId),
      limit(1)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return this.formatPipeline(doc.id, doc.data());
  }

  static async advanceToNextStage(pipelineId: string, userId: string): Promise<void> {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) throw new Error('Pipeline not found');

    const currentStageIndex = this.DEFAULT_STAGE_ORDER.indexOf(pipeline.currentStage);
    if (currentStageIndex === -1 || currentStageIndex >= this.DEFAULT_STAGE_ORDER.length - 1) {
      throw new Error('Cannot advance beyond final stage');
    }

    const nextStage = this.DEFAULT_STAGE_ORDER[currentStageIndex + 1];
    const now = new Date();

    // Update current stage as completed
    const updatedStages = pipeline.stages.map(stage => {
      if (stage.stage === pipeline.currentStage) {
        return {
          ...stage,
          status: 'completed' as const,
          completedAt: now,
          duration: stage.startedAt ? now.getTime() - stage.startedAt.getTime() : 0
        };
      }
      if (stage.stage === nextStage) {
        return {
          ...stage,
          status: 'in_progress' as const,
          startedAt: now
        };
      }
      return stage;
    });

    await updateDoc(doc(db, PIPELINES_COLLECTION, pipelineId), {
      currentStage: nextStage,
      stages: updatedStages.map(stage => ({
        ...stage,
        startedAt: stage.startedAt ? Timestamp.fromDate(stage.startedAt) : null,
        completedAt: stage.completedAt ? Timestamp.fromDate(stage.completedAt) : null
      })),
      updatedAt: serverTimestamp()
    });

    // Check if next stage requires human checkpoint
    if (this.isCheckpointStage(nextStage)) {
      await this.createCheckpoint(pipelineId, nextStage, userId);
    } else {
      // Auto-process non-checkpoint stages
      await this.processAutomaticStage(pipelineId, nextStage, userId);
    }

    await this.sendNotification(userId, {
      type: 'system_alert',
      title: 'Stage Advanced',
      message: `Pipeline advanced to ${this.formatStageName(nextStage)}`,
      data: { pipelineId, projectId: pipeline.projectId, stage: nextStage },
      channels: ['in_app', 'push']
    });
  }

  static async createCheckpoint(
    pipelineId: string, 
    stage: PipelineStage, 
    submittedBy: string,
    assignedTo: string[] = [],
    requiredApprovals: number = 1
  ): Promise<string> {
    const checkpoint: Omit<PipelineCheckpoint, 'id'> = {
      stage,
      status: 'pending',
      assignedTo: assignedTo.length > 0 ? assignedTo : [submittedBy],
      submittedAt: new Date(),
      requiredApprovals,
      currentApprovals: 0,
      approvals: []
    };

    const docRef = await addDoc(collection(db, CHECKPOINTS_COLLECTION), {
      ...checkpoint,
      submittedAt: Timestamp.fromDate(checkpoint.submittedAt)
    });

    // Update pipeline with checkpoint reference
    const pipeline = await this.getPipeline(pipelineId);
    if (pipeline) {
      const updatedStages = pipeline.stages.map(stageData => {
        if (stageData.stage === stage) {
          return {
            ...stageData,
            checkpoint: { ...checkpoint, id: docRef.id }
          };
        }
        return stageData;
      });

      await updateDoc(doc(db, PIPELINES_COLLECTION, pipelineId), {
        stages: updatedStages.map(stage => ({
          ...stage,
          startedAt: stage.startedAt ? Timestamp.fromDate(stage.startedAt) : null,
          completedAt: stage.completedAt ? Timestamp.fromDate(stage.completedAt) : null,
          checkpoint: stage.checkpoint ? {
            ...stage.checkpoint,
            submittedAt: Timestamp.fromDate(stage.checkpoint.submittedAt),
            reviewedAt: stage.checkpoint.reviewedAt ? Timestamp.fromDate(stage.checkpoint.reviewedAt) : null,
            dueDate: stage.checkpoint.dueDate ? Timestamp.fromDate(stage.checkpoint.dueDate) : null
          } : null
        })),
        updatedAt: serverTimestamp()
      });
    }

    // Notify assigned reviewers
    for (const userId of checkpoint.assignedTo) {
      await this.sendNotification(userId, {
        type: 'system_alert',
        title: 'Review Required',
        message: `${this.formatStageName(stage)} is ready for review`,
        data: { pipelineId, checkpointId: docRef.id, stage },
        channels: ['in_app', 'email', 'push']
      });
    }

    return docRef.id;
  }

  static async approveCheckpoint(
    checkpointId: string, 
    userId: string, 
    feedback?: string
  ): Promise<void> {
    await this.processCheckpointDecision(checkpointId, userId, 'approved', feedback);
  }

  static async rejectCheckpoint(
    checkpointId: string, 
    userId: string, 
    feedback: string
  ): Promise<void> {
    await this.processCheckpointDecision(checkpointId, userId, 'rejected', feedback);
  }

  private static async processCheckpointDecision(
    checkpointId: string,
    userId: string,
    decision: 'approved' | 'rejected',
    feedback?: string
  ): Promise<void> {
    const checkpointDoc = await getDoc(doc(db, CHECKPOINTS_COLLECTION, checkpointId));
    if (!checkpointDoc.exists()) {
      throw new Error('Checkpoint not found');
    }

    const checkpoint = checkpointDoc.data() as PipelineCheckpoint;
    
    if (!checkpoint.assignedTo.includes(userId)) {
      throw new Error('User not authorized to review this checkpoint');
    }

    const existingApproval = checkpoint.approvals.find(a => a.userId === userId);
    if (existingApproval) {
      throw new Error('User has already reviewed this checkpoint');
    }

    const newApproval = {
      userId,
      status: decision,
      feedback,
      timestamp: new Date()
    };

    const updatedApprovals = [...checkpoint.approvals, newApproval];
    const currentApprovals = updatedApprovals.filter(a => a.status === 'approved').length;
    
    let newStatus: CheckpointStatus = checkpoint.status;
    if (decision === 'rejected') {
      newStatus = 'rejected';
    } else if (currentApprovals >= checkpoint.requiredApprovals) {
      newStatus = 'approved';
    }

    await updateDoc(doc(db, CHECKPOINTS_COLLECTION, checkpointId), {
      approvals: updatedApprovals.map(approval => ({
        ...approval,
        timestamp: Timestamp.fromDate(approval.timestamp)
      })),
      currentApprovals,
      status: newStatus,
      reviewedBy: userId,
      reviewedAt: serverTimestamp(),
      feedback: feedback || checkpoint.feedback
    });

    // Find pipeline and advance if approved
    if (newStatus === 'approved') {
      const pipelineQuery = query(
        collection(db, PIPELINES_COLLECTION),
        where('stages', 'array-contains-any', [{ checkpoint: { id: checkpointId } }])
      );
      
      // Note: This is a simplified query - in production, we'd need better querying
      // For now, we'll find the pipeline by iterating through user's pipelines
      // In a real implementation, we'd use a proper query structure
      const allPipelines = query(collection(db, PIPELINES_COLLECTION));
      const pipelines = await getDocs(allPipelines);
      
      for (const pipelineDoc of pipelines.docs) {
        const pipeline = this.formatPipeline(pipelineDoc.id, pipelineDoc.data());
        const hasCheckpoint = pipeline.stages.some(stage => 
          stage.checkpoint?.id === checkpointId
        );
        
        if (hasCheckpoint) {
          await this.advanceToNextStage(pipelineDoc.id, userId);
          break;
        }
      }
    }

    await this.sendNotification(userId, {
      type: 'system_alert',
      title: `Checkpoint ${decision}`,
      message: `${this.formatStageName(checkpoint.stage)} has been ${decision}`,
      data: { checkpointId, stage: checkpoint.stage, decision },
      channels: ['in_app']
    });
  }

  static async rollbackToPreviousStage(
    pipelineId: string, 
    targetStage: PipelineStage, 
    userId: string,
    reason: string
  ): Promise<void> {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) throw new Error('Pipeline not found');

    const targetIndex = this.DEFAULT_STAGE_ORDER.indexOf(targetStage);
    const currentIndex = this.DEFAULT_STAGE_ORDER.indexOf(pipeline.currentStage);

    if (targetIndex >= currentIndex) {
      throw new Error('Can only rollback to previous stages');
    }

    const now = new Date();
    
    // Reset stages from target onwards
    const updatedStages = pipeline.stages.map(stage => {
      const stageIndex = this.DEFAULT_STAGE_ORDER.indexOf(stage.stage);
      
      if (stageIndex >= targetIndex) {
        return {
          stage: stage.stage,
          status: stage.stage === targetStage ? 'in_progress' : 'not_started' as const,
          startedAt: stage.stage === targetStage ? now : undefined,
          artifacts: stage.artifacts // Preserve artifacts
        };
      }
      
      return stage;
    });

    await updateDoc(doc(db, PIPELINES_COLLECTION, pipelineId), {
      currentStage: targetStage,
      stages: updatedStages.map(stage => ({
        ...stage,
        startedAt: stage.startedAt ? Timestamp.fromDate(stage.startedAt) : null,
        completedAt: stage.completedAt ? Timestamp.fromDate(stage.completedAt) : null
      })),
      updatedAt: serverTimestamp()
    });

    await this.sendNotification(userId, {
      type: 'system_alert',
      title: 'Pipeline Rolled Back',
      message: `Pipeline rolled back to ${this.formatStageName(targetStage)}. Reason: ${reason}`,
      data: { pipelineId, targetStage, reason },
      channels: ['in_app', 'email']
    });
  }

  static async addArtifact(
    pipelineId: string,
    stage: PipelineStage,
    artifact: {
      type: 'script' | 'storyboard' | 'video' | 'feedback';
      url?: string;
      data?: any;
    }
  ): Promise<void> {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) throw new Error('Pipeline not found');

    const updatedStages = pipeline.stages.map(stageData => {
      if (stageData.stage === stage) {
        return {
          ...stageData,
          artifacts: [
            ...(stageData.artifacts || []),
            {
              ...artifact,
              createdAt: new Date()
            }
          ]
        };
      }
      return stageData;
    });

    await updateDoc(doc(db, PIPELINES_COLLECTION, pipelineId), {
      stages: updatedStages.map(stage => ({
        ...stage,
        startedAt: stage.startedAt ? Timestamp.fromDate(stage.startedAt) : null,
        completedAt: stage.completedAt ? Timestamp.fromDate(stage.completedAt) : null,
        artifacts: stage.artifacts?.map(art => ({
          ...art,
          createdAt: Timestamp.fromDate(art.createdAt)
        })) || []
      })),
      updatedAt: serverTimestamp()
    });
  }

  private static async processAutomaticStage(
    pipelineId: string, 
    stage: PipelineStage, 
    userId: string
  ): Promise<void> {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) return;

    switch (stage) {
      case 'script':
        await queueService.enqueueJob('script_generation', {
          projectId: pipeline.projectId,
          templateId: '',
          variables: {},
          quality: 'standard',
          aspectRatio: '16:9'
        }, { priority: 'high' });
        break;
        
      case 'storyboard':
        await queueService.enqueueJob('storyboard_generation', {
          projectId: pipeline.projectId,
          templateId: '',
          variables: {},
          quality: 'standard',
          aspectRatio: '16:9'
        }, { priority: 'high' });
        break;
        
      case 'video':
        await queueService.enqueueJob('video_generation', {
          projectId: pipeline.projectId,
          templateId: '',
          variables: {},
          quality: 'standard',
          aspectRatio: '16:9'
        }, { priority: 'high' });
        break;
    }
  }

  private static isCheckpointStage(stage: PipelineStage): boolean {
    return ['idea_review', 'script_approval', 'storyboard_approval', 'video_qa'].includes(stage);
  }

  private static formatStageName(stage: PipelineStage): string {
    return stage.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  private static initializeStageMetrics() {
    const metrics: Record<PipelineStage, { averageDuration: number; completionRate: number; revisionRate: number; }> = {} as any;
    
    this.DEFAULT_STAGE_ORDER.forEach(stage => {
      metrics[stage] = {
        averageDuration: 0,
        completionRate: 100,
        revisionRate: 0
      };
    });

    return metrics;
  }

  private static async sendNotification(userId: string, notification: Omit<NotificationEvent, 'id' | 'userId' | 'status' | 'createdAt'>): Promise<void> {
    const notificationData = {
      ...notification,
      userId,
      status: 'pending',
      createdAt: Timestamp.fromDate(new Date())
    };

    await addDoc(collection(db, NOTIFICATIONS_COLLECTION), notificationData);
  }

  private static formatPipeline(id: string, data: any): WorkflowPipeline {
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
          dueDate: stage.checkpoint.dueDate?.toDate()
        } : undefined,
        artifacts: stage.artifacts?.map((artifact: any) => ({
          ...artifact,
          createdAt: artifact.createdAt?.toDate() || new Date()
        })) || []
      })) || []
    };
  }
}

export const workflowPipelineService = WorkflowPipelineService;