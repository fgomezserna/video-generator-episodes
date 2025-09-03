import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  DocumentSnapshot,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  WorkflowPipeline, 
  PipelineCheckpoint, 
  PipelineRule,
  PipelineStage,
  CheckpointStatus 
} from '../types';

const PIPELINES_COLLECTION = 'workflowPipelines';
const CHECKPOINTS_COLLECTION = 'pipelineCheckpoints';
const RULES_COLLECTION = 'pipelineRules';

export class PipelineDB {
  static async createPipeline(pipeline: Omit<WorkflowPipeline, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = new Date();
    const pipelineData = {
      ...pipeline,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      stages: pipeline.stages.map(stage => ({
        ...stage,
        startedAt: stage.startedAt ? Timestamp.fromDate(stage.startedAt) : null,
        completedAt: stage.completedAt ? Timestamp.fromDate(stage.completedAt) : null,
        checkpoint: stage.checkpoint ? {
          ...stage.checkpoint,
          submittedAt: Timestamp.fromDate(stage.checkpoint.submittedAt),
          reviewedAt: stage.checkpoint.reviewedAt ? Timestamp.fromDate(stage.checkpoint.reviewedAt) : null,
          dueDate: stage.checkpoint.dueDate ? Timestamp.fromDate(stage.checkpoint.dueDate) : null,
          approvals: stage.checkpoint.approvals.map(approval => ({
            ...approval,
            timestamp: Timestamp.fromDate(approval.timestamp)
          }))
        } : null,
        artifacts: stage.artifacts?.map(artifact => ({
          ...artifact,
          createdAt: Timestamp.fromDate(artifact.createdAt)
        })) || []
      }))
    };

    const docRef = await addDoc(collection(db, PIPELINES_COLLECTION), pipelineData);
    return docRef.id;
  }

  static async getPipeline(id: string): Promise<WorkflowPipeline | null> {
    const docRef = doc(db, PIPELINES_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return this.formatPipeline(docSnap);
  }

  static async getPipelineByProject(projectId: string): Promise<WorkflowPipeline | null> {
    const q = query(
      collection(db, PIPELINES_COLLECTION),
      where('projectId', '==', projectId),
      limit(1)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    return this.formatPipeline(snapshot.docs[0]);
  }

  static async getPipelinesByStage(
    stage: PipelineStage, 
    options: {
      limit?: number;
      startAfter?: DocumentSnapshot;
    } = {}
  ): Promise<{
    pipelines: WorkflowPipeline[];
    lastDoc?: DocumentSnapshot;
  }> {
    const { limit: limitCount = 20, startAfter: startAfterDoc } = options;

    let q = query(
      collection(db, PIPELINES_COLLECTION),
      where('currentStage', '==', stage),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );

    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }

    const querySnapshot = await getDocs(q);
    const pipelines = querySnapshot.docs.map(doc => this.formatPipeline(doc));
    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

    return { pipelines, lastDoc };
  }

  static async updatePipeline(id: string, updates: Partial<WorkflowPipeline>): Promise<void> {
    const docRef = doc(db, PIPELINES_COLLECTION, id);
    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.fromDate(new Date())
    };

    if (updates.stages) {
      updateData.stages = updates.stages.map(stage => ({
        ...stage,
        startedAt: stage.startedAt ? Timestamp.fromDate(stage.startedAt) : null,
        completedAt: stage.completedAt ? Timestamp.fromDate(stage.completedAt) : null,
        checkpoint: stage.checkpoint ? {
          ...stage.checkpoint,
          submittedAt: Timestamp.fromDate(stage.checkpoint.submittedAt),
          reviewedAt: stage.checkpoint.reviewedAt ? Timestamp.fromDate(stage.checkpoint.reviewedAt) : null,
          dueDate: stage.checkpoint.dueDate ? Timestamp.fromDate(stage.checkpoint.dueDate) : null,
          approvals: stage.checkpoint.approvals.map(approval => ({
            ...approval,
            timestamp: Timestamp.fromDate(approval.timestamp)
          }))
        } : null,
        artifacts: stage.artifacts?.map(artifact => ({
          ...artifact,
          createdAt: Timestamp.fromDate(artifact.createdAt)
        })) || []
      }));
    }

    await updateDoc(docRef, updateData);
  }

  static async deletePipeline(id: string): Promise<void> {
    const docRef = doc(db, PIPELINES_COLLECTION, id);
    await deleteDoc(docRef);
  }

  // Checkpoint operations
  static async createCheckpoint(checkpoint: Omit<PipelineCheckpoint, 'id'>): Promise<string> {
    const checkpointData = {
      ...checkpoint,
      submittedAt: Timestamp.fromDate(checkpoint.submittedAt),
      reviewedAt: checkpoint.reviewedAt ? Timestamp.fromDate(checkpoint.reviewedAt) : null,
      dueDate: checkpoint.dueDate ? Timestamp.fromDate(checkpoint.dueDate) : null,
      approvals: checkpoint.approvals.map(approval => ({
        ...approval,
        timestamp: Timestamp.fromDate(approval.timestamp)
      }))
    };

    const docRef = await addDoc(collection(db, CHECKPOINTS_COLLECTION), checkpointData);
    return docRef.id;
  }

  static async getCheckpoint(id: string): Promise<PipelineCheckpoint | null> {
    const docRef = doc(db, CHECKPOINTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return this.formatCheckpoint(docSnap);
  }

  static async getCheckpointsByUser(
    userId: string,
    status?: CheckpointStatus,
    options: {
      limit?: number;
      startAfter?: DocumentSnapshot;
    } = {}
  ): Promise<{
    checkpoints: PipelineCheckpoint[];
    lastDoc?: DocumentSnapshot;
  }> {
    const { limit: limitCount = 20, startAfter: startAfterDoc } = options;

    let q = query(
      collection(db, CHECKPOINTS_COLLECTION),
      where('assignedTo', 'array-contains', userId),
      orderBy('submittedAt', 'desc'),
      limit(limitCount)
    );

    if (status) {
      q = query(q, where('status', '==', status));
    }

    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }

    const querySnapshot = await getDocs(q);
    const checkpoints = querySnapshot.docs.map(doc => this.formatCheckpoint(doc));
    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

    return { checkpoints, lastDoc };
  }

  static async updateCheckpoint(id: string, updates: Partial<PipelineCheckpoint>): Promise<void> {
    const docRef = doc(db, CHECKPOINTS_COLLECTION, id);
    const updateData: any = { ...updates };

    if (updates.reviewedAt) {
      updateData.reviewedAt = Timestamp.fromDate(updates.reviewedAt);
    }
    if (updates.dueDate) {
      updateData.dueDate = Timestamp.fromDate(updates.dueDate);
    }
    if (updates.approvals) {
      updateData.approvals = updates.approvals.map(approval => ({
        ...approval,
        timestamp: Timestamp.fromDate(approval.timestamp)
      }));
    }

    await updateDoc(docRef, updateData);
  }

  // Pipeline Rules operations
  static async createRule(rule: Omit<PipelineRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = new Date();
    const ruleData = {
      ...rule,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    };

    const docRef = await addDoc(collection(db, RULES_COLLECTION), ruleData);
    return docRef.id;
  }

  static async getRule(id: string): Promise<PipelineRule | null> {
    const docRef = doc(db, RULES_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return this.formatRule(docSnap);
  }

  static async getRulesByStage(stage: PipelineStage): Promise<PipelineRule[]> {
    const q = query(
      collection(db, RULES_COLLECTION),
      where('stage', '==', stage),
      where('isActive', '==', true),
      orderBy('priority', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatRule(doc));
  }

  static async getAllActiveRules(): Promise<PipelineRule[]> {
    const q = query(
      collection(db, RULES_COLLECTION),
      where('isActive', '==', true),
      orderBy('priority', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatRule(doc));
  }

  static async updateRule(id: string, updates: Partial<PipelineRule>): Promise<void> {
    const docRef = doc(db, RULES_COLLECTION, id);
    const updateData = {
      ...updates,
      updatedAt: Timestamp.fromDate(new Date())
    };

    await updateDoc(docRef, updateData);
  }

  static async deleteRule(id: string): Promise<void> {
    const docRef = doc(db, RULES_COLLECTION, id);
    await deleteDoc(docRef);
  }

  // Private formatting methods
  private static formatPipeline(doc: DocumentSnapshot): WorkflowPipeline {
    const data = doc.data();
    if (!data) throw new Error('Pipeline document has no data');

    return {
      ...data,
      id: doc.id,
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
    } as WorkflowPipeline;
  }

  private static formatCheckpoint(doc: DocumentSnapshot): PipelineCheckpoint {
    const data = doc.data();
    if (!data) throw new Error('Checkpoint document has no data');

    return {
      ...data,
      id: doc.id,
      submittedAt: data.submittedAt?.toDate() || new Date(),
      reviewedAt: data.reviewedAt?.toDate(),
      dueDate: data.dueDate?.toDate(),
      approvals: data.approvals?.map((approval: any) => ({
        ...approval,
        timestamp: approval.timestamp?.toDate() || new Date()
      })) || []
    } as PipelineCheckpoint;
  }

  private static formatRule(doc: DocumentSnapshot): PipelineRule {
    const data = doc.data();
    if (!data) throw new Error('Rule document has no data');

    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as PipelineRule;
  }
}

export const pipelineDB = PipelineDB;