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
    
    // Ensure character has at least one version if versions array is provided
    if (character.versions && character.versions.length > 0) {
      // Convert version dates to Firestore timestamps
      character.versions = character.versions.map(version => ({
        ...version,
        createdAt: Timestamp.fromDate(version.createdAt),
        referenceImages: version.referenceImages.map(img => ({
          ...img,
          createdAt: Timestamp.fromDate(img.createdAt)
        }))
      })) as any; // Type assertion to handle Timestamp vs Date
    }
    
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
    
    // Handle versions array with nested timestamps
    if (updates.versions) {
      updates.versions = updates.versions.map(version => ({
        ...version,
        createdAt: version.createdAt instanceof Date ? Timestamp.fromDate(version.createdAt) : version.createdAt,
        referenceImages: version.referenceImages.map(img => ({
          ...img,
          createdAt: img.createdAt instanceof Date ? Timestamp.fromDate(img.createdAt) : img.createdAt
        }))
      })) as any; // Type assertion to handle Timestamp vs Date
    }
    
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
      age?: string;
      gender?: string;
      style?: string;
    },
    limitCount = 20
  ): Promise<Character[]> {
    let q = query(
      collection(db, COLLECTION_NAME),
      orderBy('name'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    let characters = querySnapshot.docs.map(doc => this.formatCharacter(doc));

    // Filter by current version appearance since the new structure stores appearance in versions
    characters = characters.filter(character => {
      const currentVersion = character.versions.find(v => v.id === character.currentVersion);
      if (!currentVersion) return false;

      if (filters.age && currentVersion.appearance.age !== filters.age) return false;
      if (filters.gender && currentVersion.appearance.gender !== filters.gender) return false;
      if (filters.style && !currentVersion.appearance.style.toLowerCase().includes(filters.style.toLowerCase())) return false;
      
      return true;
    });

    return characters.slice(0, limitCount);
  }

  static async getPublicCharacters(limitCount = 50): Promise<Character[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('library.isPublic', '==', true),
      orderBy('library.rating', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatCharacter(doc));
  }

  static async getCharactersByCreator(creatorId: string, limitCount = 20): Promise<Character[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('ownership.createdBy', '==', creatorId),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatCharacter(doc));
  }

  static async getSharedCharacters(userId: string, limitCount = 20): Promise<Character[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('ownership.sharedWith', 'array-contains', userId),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatCharacter(doc));
  }

  static async searchByCategory(category: string, limitCount = 20): Promise<Character[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('category', '==', category),
      orderBy('library.rating', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatCharacter(doc));
  }

  static async searchByTags(tags: string[], limitCount = 20): Promise<Character[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('tags', 'array-contains-any', tags),
      orderBy('library.usageCount', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.formatCharacter(doc));
  }

  static async updateCharacterRating(characterId: string, newRating: number, reviewCount: number): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, characterId);
    await updateDoc(docRef, {
      'library.rating': newRating,
      'library.reviews': reviewCount,
      updatedAt: Timestamp.fromDate(new Date())
    });
  }

  static async incrementUsageCount(characterId: string): Promise<void> {
    const character = await this.get(characterId);
    if (!character) return;

    const newUsageCount = (character.library.usageCount || 0) + 1;
    const docRef = doc(db, COLLECTION_NAME, characterId);
    await updateDoc(docRef, {
      'library.usageCount': newUsageCount,
      updatedAt: Timestamp.fromDate(new Date())
    });
  }

  private static formatCharacter(doc: any): Character {
    const data = doc.data();
    if (!data) throw new Error('Character document has no data');

    // Format versions array with nested timestamps
    const versions = data.versions ? data.versions.map((version: any) => ({
      ...version,
      createdAt: version.createdAt?.toDate() || new Date(),
      referenceImages: version.referenceImages ? version.referenceImages.map((img: any) => ({
        ...img,
        createdAt: img.createdAt?.toDate() || new Date()
      })) : []
    })) : [];

    return {
      ...data,
      id: doc.id,
      versions,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as Character;
  }
}