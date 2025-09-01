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
import { Project, WorkflowState } from '../types';

const COLLECTION_NAME = 'projects';

export class ProjectsDB {
  static async create(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = new Date();
    const projectData = {
      ...project,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      timeline: {
        ...project.timeline,
        created: Timestamp.fromDate(now),
        lastModified: Timestamp.fromDate(now)
      }
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), projectData);
    return docRef.id;
  }

  static async get(id: string): Promise<Project | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return this.formatProject(docSnap);
  }

  static async getByUser(
    userId: string, 
    options: {
      limit?: number;
      startAfter?: DocumentSnapshot;
      status?: WorkflowState;
      orderBy?: 'createdAt' | 'updatedAt' | 'title';
      direction?: 'asc' | 'desc';
    } = {}
  ): Promise<{
    projects: Project[];
    lastDoc?: DocumentSnapshot;
  }> {
    const {
      limit: limitCount = 20,
      startAfter: startAfterDoc,
      status,
      orderBy: orderByField = 'createdAt',
      direction = 'desc'
    } = options;

    let q = query(
      collection(db, COLLECTION_NAME),
      where('userId', '==', userId),
      orderBy(orderByField, direction),
      limit(limitCount)
    );

    if (status) {
      q = query(q, where('status', '==', status));
    }

    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }

    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(doc => this.formatProject(doc));
    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

    return { projects, lastDoc };
  }

  static async update(id: string, updates: Partial<Project>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const updateData = {
      ...updates,
      updatedAt: Timestamp.fromDate(new Date()),
      'timeline.lastModified': Timestamp.fromDate(new Date())
    };

    if (updates.status) {
      const statusTimestamp = Timestamp.fromDate(new Date());
      switch (updates.status) {
        case 'pending':
          (updateData as any)['timeline.submitted'] = statusTimestamp;
          break;
        case 'in_review':
          (updateData as any)['timeline.reviewed'] = statusTimestamp;
          break;
        case 'approved':
          (updateData as any)['timeline.approved'] = statusTimestamp;
          break;
        case 'completed':
          (updateData as any)['timeline.completed'] = statusTimestamp;
          break;
      }
    }

    await updateDoc(docRef, updateData);
  }

  static async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }

  static async updateStatus(id: string, status: WorkflowState): Promise<void> {
    await this.update(id, { status });
  }

  static async getByStatus(
    status: WorkflowState,
    options: {
      limit?: number;
      startAfter?: DocumentSnapshot;
    } = {}
  ): Promise<{
    projects: Project[];
    lastDoc?: DocumentSnapshot;
  }> {
    const { limit: limitCount = 20, startAfter: startAfterDoc } = options;

    let q = query(
      collection(db, COLLECTION_NAME),
      where('status', '==', status),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }

    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(doc => this.formatProject(doc));
    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

    return { projects, lastDoc };
  }

  static async addCollaborator(
    projectId: string, 
    userId: string, 
    permission: 'view' | 'edit' | 'admin'
  ): Promise<void> {
    const project = await this.get(projectId);
    if (!project) throw new Error('Project not found');

    const updatedPermissions = {
      ...project.collaboration.permissions,
      [userId]: permission
    };

    const updatedSharedWith = project.collaboration.sharedWith.includes(userId) 
      ? project.collaboration.sharedWith 
      : [...project.collaboration.sharedWith, userId];

    await this.update(projectId, {
      collaboration: {
        ...project.collaboration,
        sharedWith: updatedSharedWith,
        permissions: updatedPermissions
      }
    });
  }

  static async removeCollaborator(projectId: string, userId: string): Promise<void> {
    const project = await this.get(projectId);
    if (!project) throw new Error('Project not found');

    const updatedSharedWith = project.collaboration.sharedWith.filter(id => id !== userId);
    const updatedPermissions = { ...project.collaboration.permissions };
    delete updatedPermissions[userId];

    await this.update(projectId, {
      collaboration: {
        ...project.collaboration,
        sharedWith: updatedSharedWith,
        permissions: updatedPermissions
      }
    });
  }

  private static formatProject(doc: DocumentSnapshot): Project {
    const data = doc.data();
    if (!data) throw new Error('Project document has no data');

    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      timeline: data.timeline ? {
        created: data.timeline.created?.toDate() || new Date(),
        lastModified: data.timeline.lastModified?.toDate() || new Date(),
        submitted: data.timeline.submitted?.toDate(),
        reviewed: data.timeline.reviewed?.toDate(),
        approved: data.timeline.approved?.toDate(),
        completed: data.timeline.completed?.toDate(),
      } : undefined
    } as Project;
  }
}