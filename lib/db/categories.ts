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
import { Category } from '../types';

const COLLECTION_NAME = 'categories';

export class CategoriesDB {
  static async create(category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = new Date();
    const categoryData = {
      ...category,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), categoryData);
    return docRef.id;
  }

  static async get(id: string): Promise<Category | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return this.formatCategory(docSnap);
  }

  static async getAll(includeInactive = false): Promise<Category[]> {
    let q = query(
      collection(db, COLLECTION_NAME),
      orderBy('order', 'asc')
    );

    if (!includeInactive) {
      q = query(q, where('isActive', '==', true));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatCategory(doc));
  }

  static async getActive(): Promise<Category[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('isActive', '==', true),
      orderBy('order', 'asc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatCategory(doc));
  }

  static async update(id: string, updates: Partial<Category>): Promise<void> {
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

  static async reorder(categories: { id: string; order: number }[]): Promise<void> {
    const updatePromises = categories.map(({ id, order }) => 
      this.update(id, { order })
    );
    
    await Promise.all(updatePromises);
  }

  static async toggleActive(id: string): Promise<boolean> {
    const category = await this.get(id);
    if (!category) throw new Error('Category not found');

    const newActiveState = !category.isActive;
    await this.update(id, { isActive: newActiveState });
    return newActiveState;
  }

  static async addTemplate(categoryId: string, templateId: string): Promise<void> {
    const category = await this.get(categoryId);
    if (!category) throw new Error('Category not found');

    if (!category.templates.includes(templateId)) {
      const updatedTemplates = [...category.templates, templateId];
      await this.update(categoryId, { templates: updatedTemplates });
    }
  }

  static async removeTemplate(categoryId: string, templateId: string): Promise<void> {
    const category = await this.get(categoryId);
    if (!category) throw new Error('Category not found');

    const updatedTemplates = category.templates.filter(id => id !== templateId);
    await this.update(categoryId, { templates: updatedTemplates });
  }

  static async getByName(name: string): Promise<Category | null> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('name', '==', name),
      limit(1)
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;

    return this.formatCategory(querySnapshot.docs[0]);
  }

  private static formatCategory(doc: any): Category {
    const data = doc.data();
    if (!data) throw new Error('Category document has no data');

    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as Category;
  }
}