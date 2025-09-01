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

export type JobType = 'video_generation' | 'audio_synthesis' | 'image_processing' | 'template_processing';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying' | 'dead_letter';

export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface JobData {
  projectId: string;
  userId: string;
  templateId: string;
  variables: Record<string, any>;
  quality: 'draft' | 'standard' | 'high' | 'premium';
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
  metadata?: Record<string, any>;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: JobPriority;
  data: JobData;
  progress: number;
  result?: any;
  error?: {
    message: string;
    code: string;
    details?: any;
    stack?: string;
  };
  retryCount: number;
  maxRetries: number;
  retryDelay: number;
  nextRetry?: Date;
  startedAt?: Date;
  completedAt?: Date;
  processingTime?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueMetrics {
  id: string;
  queueName: string;
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  throughput: number;
  timestamp: Date;
}

export interface NotificationEvent {
  id: string;
  userId: string;
  type: 'job_completed' | 'job_failed' | 'project_ready' | 'system_alert';
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: ('email' | 'push' | 'in_app')[];
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
  createdAt: Date;
}