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
import { Character } from '../types';

const COLLECTION_NAME = 'characters';

export class CharactersDB {
  static async create(character: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = new Date();
    const characterData = {
      ...character,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), characterData);
    return docRef.id;
  }

  static async get(id: string): Promise<Character | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return this.formatCharacter(docSnap);
  }

  static async getAll(options: {
    limit?: number;
    orderBy?: 'name' | 'createdAt';
    direction?: 'asc' | 'desc';
  } = {}): Promise<Character[]> {
    const {
      limit: limitCount = 50,
      orderBy: orderByField = 'name',
      direction = 'asc'
    } = options;

    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy(orderByField, direction),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatCharacter(doc));
  }

  static async getByIds(ids: string[]): Promise<Character[]> {
    if (ids.length === 0) return [];
    
    const characters: Character[] = [];
    
    for (const id of ids) {
      const character = await this.get(id);
      if (character) {
        characters.push(character);
      }
    }
    
    return characters;
  }

  static async update(id: string, updates: Partial<Character>): Promise<void> {
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

  static async searchByName(searchTerm: string, limitCount = 10): Promise<Character[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('name'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const allCharacters = querySnapshot.docs.map(doc => this.formatCharacter(doc));
    
    return allCharacters.filter(character => 
      character.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  static async getByAppearance(
    filters: {
      age?: Character['appearance']['age'];
      gender?: Character['appearance']['gender'];
      style?: string;
    },
    limitCount = 20
  ): Promise<Character[]> {
    let q = query(
      collection(db, COLLECTION_NAME),
      orderBy('name'),
      limit(limitCount)
    );

    if (filters.age) {
      q = query(q, where('appearance.age', '==', filters.age));
    }
    
    if (filters.gender) {
      q = query(q, where('appearance.gender', '==', filters.gender));
    }

    const querySnapshot = await getDocs(q);
    let characters = querySnapshot.docs.map(doc => this.formatCharacter(doc));

    if (filters.style) {
      characters = characters.filter(character => 
        character.appearance.style.toLowerCase().includes(filters.style!.toLowerCase())
      );
    }

    return characters;
  }

  private static formatCharacter(doc: any): Character {
    const data = doc.data();
    if (!data) throw new Error('Character document has no data');

    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as Character;
  }
}