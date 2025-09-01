export interface Character {
  id: string;
  name: string;
  description: string;
  voiceId?: string;
  appearance: {
    age: 'child' | 'teen' | 'adult' | 'elderly';
    gender: 'male' | 'female' | 'non-binary';
    style: string;
    colors: string[];
  };
  personality: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Template {
  id: string;
  name: string;
  type: 'kids' | 'marketing' | 'documentary' | 'educational';
  description: string;
  structure: {
    scenes: TemplateScene[];
    duration: number;
    aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
  };
  characters?: Character[];
  variables: TemplateVariable[];
  isPublic: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateScene {
  id: string;
  title: string;
  description: string;
  duration: number;
  type: 'intro' | 'content' | 'transition' | 'outro';
  elements: SceneElement[];
}

export interface SceneElement {
  id: string;
  type: 'text' | 'character' | 'background' | 'music' | 'voice';
  content: any;
  position: { x: number; y: number };
  timing: { start: number; end: number };
}

export interface TemplateVariable {
  id: string;
  name: string;
  type: 'text' | 'number' | 'image' | 'character' | 'color';
  required: boolean;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
}

export type WorkflowState = 
  | 'draft' 
  | 'pending' 
  | 'in_review' 
  | 'approved' 
  | 'rejected' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'archived';

export interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string;
  templateId: string;
  template?: Template;
  characters: Character[];
  variables: Record<string, any>;
  status: WorkflowState;
  metadata: {
    duration?: number;
    aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
    quality: 'draft' | 'standard' | 'high' | 'premium';
    tags: string[];
  };
  timeline?: {
    created: Date;
    lastModified: Date;
    submitted?: Date;
    reviewed?: Date;
    approved?: Date;
    completed?: Date;
  };
  collaboration: {
    isPublic: boolean;
    sharedWith: string[];
    permissions: Record<string, 'view' | 'edit' | 'admin'>;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Video {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  url?: string;
  thumbnailUrl?: string;
  duration?: number;
  size?: number;
  quality: 'draft' | 'standard' | 'high' | 'premium';
  metadata: {
    resolution: string;
    fps: number;
    codec: string;
    bitrate: string;
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: 'user' | 'admin';
  subscription: {
    plan: 'free' | 'pro' | 'enterprise';
    status: 'active' | 'cancelled' | 'expired';
    startDate: Date;
    endDate?: Date;
  };
  usage: {
    videosGenerated: number;
    storageUsed: number;
    lastActivity: Date;
  };
  preferences: {
    defaultAspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
    defaultQuality: 'draft' | 'standard' | 'high' | 'premium';
    notifications: {
      email: boolean;
      browser: boolean;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  templates: string[];
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}