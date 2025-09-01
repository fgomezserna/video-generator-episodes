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
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Template } from '../types';

const COLLECTION_NAME = 'templates';

export class TemplatesDB {
  static async create(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = new Date();
    const templateData = {
      ...template,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), templateData);
    return docRef.id;
  }

  static async get(id: string): Promise<Template | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return this.formatTemplate(docSnap);
  }

  static async getPublic(options: {
    type?: Template['type'];
    limit?: number;
    orderBy?: 'name' | 'createdAt';
    direction?: 'asc' | 'desc';
  } = {}): Promise<Template[]> {
    const {
      type,
      limit: limitCount = 20,
      orderBy: orderByField = 'name',
      direction = 'asc'
    } = options;

    let q = query(
      collection(db, COLLECTION_NAME),
      where('isPublic', '==', true),
      orderBy(orderByField, direction),
      limit(limitCount)
    );

    if (type) {
      q = query(q, where('type', '==', type));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatTemplate(doc));
  }

  static async getByCreator(
    creatorId: string,
    options: {
      includePrivate?: boolean;
      type?: Template['type'];
      limit?: number;
    } = {}
  ): Promise<Template[]> {
    const {
      includePrivate = true,
      type,
      limit: limitCount = 20
    } = options;

    let q = query(
      collection(db, COLLECTION_NAME),
      where('createdBy', '==', creatorId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (!includePrivate) {
      q = query(q, where('isPublic', '==', true));
    }

    if (type) {
      q = query(q, where('type', '==', type));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatTemplate(doc));
  }

  static async getByType(
    type: Template['type'],
    options: {
      publicOnly?: boolean;
      limit?: number;
    } = {}
  ): Promise<Template[]> {
    const {
      publicOnly = true,
      limit: limitCount = 20
    } = options;

    let q = query(
      collection(db, COLLECTION_NAME),
      where('type', '==', type),
      orderBy('name', 'asc'),
      limit(limitCount)
    );

    if (publicOnly) {
      q = query(q, where('isPublic', '==', true));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatTemplate(doc));
  }

  static async update(id: string, updates: Partial<Template>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const updateData = {
      ...updates,
      updatedAt: Timestamp.fromDate(new Date())
    };

    await updateDoc(docRef, updateData);
  }

  static async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }

  static async togglePublic(id: string): Promise<boolean> {
    const template = await this.get(id);
    if (!template) throw new Error('Template not found');

    const newPublicState = !template.isPublic;
    await this.update(id, { isPublic: newPublicState });
    return newPublicState;
  }

  static async search(
    searchTerm: string,
    options: {
      type?: Template['type'];
      publicOnly?: boolean;
      limit?: number;
    } = {}
  ): Promise<Template[]> {
    const {
      type,
      publicOnly = true,
      limit: limitCount = 20
    } = options;

    let q = query(
      collection(db, COLLECTION_NAME),
      orderBy('name'),
      limit(limitCount)
    );

    if (publicOnly) {
      q = query(q, where('isPublic', '==', true));
    }

    if (type) {
      q = query(q, where('type', '==', type));
    }

    const querySnapshot = await getDocs(q);
    const allTemplates = querySnapshot.docs.map(doc => this.formatTemplate(doc));
    
    return allTemplates.filter(template => 
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  static async duplicate(id: string, createdBy?: string): Promise<string> {
    const originalTemplate = await this.get(id);
    if (!originalTemplate) throw new Error('Template not found');

    const duplicatedTemplate = {
      ...originalTemplate,
      name: `${originalTemplate.name} (Copy)`,
      isPublic: false,
      createdBy: createdBy || originalTemplate.createdBy
    };

    delete (duplicatedTemplate as any).id;
    delete (duplicatedTemplate as any).createdAt;
    delete (duplicatedTemplate as any).updatedAt;

    return await this.create(duplicatedTemplate);
  }

  private static formatTemplate(doc: any): Template {
    const data = doc.data();
    if (!data) throw new Error('Template document has no data');

    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as Template;
  }
}