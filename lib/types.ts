export interface CharacterReferenceImage {
  id: string;
  url: string;
  type: 'reference' | 'generated' | 'variation';
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
    generatedWith?: 'stable-diffusion' | 'dalle-3' | 'manual';
    prompt?: string;
    seed?: number;
  };
  isActive: boolean;
  createdAt: Date;
}

export interface CharacterVersion {
  id: string;
  version: string;
  description?: string;
  referenceImages: CharacterReferenceImage[];
  appearance: {
    age: 'child' | 'teen' | 'adult' | 'elderly';
    gender: 'male' | 'female' | 'non-binary';
    style: string;
    colors: string[];
    physicalTraits: string[];
    clothingStyle: string;
  };
  personality: string[];
  voiceId?: string;
  prompts: {
    base: string;
    consistency: string;
    style: string;
  };
  metadata: {
    generationSettings: {
      model: 'stable-diffusion' | 'dalle-3';
      styleStrength: number;
      consistencyWeight: number;
      guidanceScale: number;
      steps: number;
    };
    performanceMetrics: {
      avgGenerationTime: number;
      consistencyScore: number;
      qualityScore: number;
    };
  };
  isActive: boolean;
  createdAt: Date;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  currentVersion: string;
  versions: CharacterVersion[];
  library: {
    isPublic: boolean;
    isReusable: boolean;
    usageCount: number;
    rating: number;
    reviews: number;
  };
  ownership: {
    createdBy: string;
    sharedWith: string[];
    permissions: Record<string, 'view' | 'edit' | 'admin'>;
  };
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

export type PipelineStage = 
  | 'idea'
  | 'idea_review'
  | 'script'
  | 'script_approval'
  | 'storyboard'
  | 'storyboard_approval'
  | 'video'
  | 'video_qa'
  | 'published';

export type CheckpointStatus = 'pending' | 'approved' | 'rejected' | 'needs_revision';

export interface PipelineCheckpoint {
  id: string;
  stage: PipelineStage;
  status: CheckpointStatus;
  assignedTo: string[];
  reviewedBy?: string;
  feedback?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  dueDate?: Date;
  requiredApprovals: number;
  currentApprovals: number;
  approvals: Array<{
    userId: string;
    status: 'approved' | 'rejected';
    feedback?: string;
    timestamp: Date;
  }>;
  metadata?: Record<string, any>;
}

export interface WorkflowPipeline {
  id: string;
  projectId: string;
  currentStage: PipelineStage;
  stages: Array<{
    stage: PipelineStage;
    status: 'not_started' | 'in_progress' | 'completed' | 'skipped' | 'failed';
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
    checkpoint?: PipelineCheckpoint;
    artifacts?: Array<{
      type: 'script' | 'storyboard' | 'video' | 'feedback';
      url?: string;
      data?: any;
      createdAt: Date;
    }>;
  }>;
  metrics: {
    totalDuration?: number;
    stageMetrics: Record<PipelineStage, {
      averageDuration: number;
      completionRate: number;
      revisionRate: number;
    }>;
  };
  notifications: {
    email: boolean;
    push: boolean;
    slack?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineRule {
  id: string;
  name: string;
  description: string;
  stage: PipelineStage;
  conditions: Array<{
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
    value: any;
  }>;
  actions: Array<{
    type: 'require_approval' | 'auto_approve' | 'notify' | 'assign_reviewer' | 'set_due_date';
    config: Record<string, any>;
  }>;
  isActive: boolean;
  priority: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

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

export type JobType = 'video_generation' | 'audio_synthesis' | 'image_processing' | 'template_processing' | 'script_generation' | 'storyboard_generation';

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

// AI Provider Types (shared across different AI services)
export type AIProvider = 'openai' | 'anthropic';

export type VideoProvider = 'runway' | 'pika' | 'kling' | 'luma';

export type ContentType = 'kids' | 'marketing' | 'documentary' | 'educational';

// AI Image Generation Services Types (Character Consistency System)
export interface AIImageGenerationRequest {
  prompt: string;
  model: 'stable-diffusion' | 'dalle-3';
  referenceImages?: string[];
  settings: {
    width: number;
    height: number;
    guidanceScale: number;
    steps: number;
    seed?: number;
    styleStrength?: number;
    consistencyWeight?: number;
  };
  metadata?: {
    characterId?: string;
    versionId?: string;
    type: 'reference' | 'generation' | 'variation';
  };
}

export interface AIImageGenerationResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: {
    imageUrl: string;
    metadata: {
      width: number;
      height: number;
      format: string;
      size: number;
      seed: number;
      generationTime: number;
      model: string;
    };
  };
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface PromptEngineering {
  id: string;
  characterId: string;
  type: 'base' | 'consistency' | 'style' | 'variation';
  template: string;
  variables: Record<string, string>;
  optimizations: {
    consistencyKeywords: string[];
    styleModifiers: string[];
    negativePrompts: string[];
  };
  metadata: {
    effectivenessScore: number;
    usageCount: number;
    avgConsistencyScore: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Script & Storyboard Generation Types
export interface PromptTemplate {
  id: string;
  name: string;
  contentType: ContentType;
  systemPrompt: string;
  userPromptTemplate: string;
  variables: string[];
  provider: AIProvider;
  model: string;
  maxTokens: number;
  temperature: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Script {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  contentType: ContentType;
  content: string;
  scenes: ScriptScene[];
  metadata: {
    duration: number;
    wordCount: number;
    characterCount: number;
    targetAudience: string;
    tone: string;
  };
  aiProvider: AIProvider;
  model: string;
  promptUsed: string;
  status: 'draft' | 'approved' | 'rejected';
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptScene {
  id: string;
  title: string;
  description: string;
  dialogue: string;
  visualElements: string[];
  duration: number;
  characters: string[];
  setting: string;
  mood: string;
}

export interface Storyboard {
  id: string;
  scriptId: string;
  projectId: string;
  userId: string;
  scenes: StoryboardScene[];
  style: string;
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
  aiProvider: AIProvider;
  model: string;
  promptUsed: string;
  status: 'draft' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

export interface StoryboardScene {
  id: string;
  sceneNumber: number;
  title: string;
  description: string;
  visualPrompt: string;
  characters: string[];
  setting: string;
  composition: string;
  lighting: string;
  cameraAngle: string;
  mood: string;
  duration: number;
}

export interface AIUsageMetrics {
  id: string;
  userId: string;
  projectId: string;
  provider: AIProvider;
  model: string;
  operation: 'script_generation' | 'storyboard_generation';
  tokensUsed: number;
  cost: number;
  responseTime: number;
  timestamp: Date;
}

export interface RateLimitConfig {
  provider: AIProvider;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  costPerRequest: number;
  maxCostPerUser: number;
}

// Video Generation API Types
export interface VideoGenerationRequest {
  prompt: string;
  provider?: VideoProvider;
  settings: {
    duration: number;
    aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
    quality: 'draft' | 'standard' | 'high' | 'premium';
    style?: string;
    seed?: number;
    motionIntensity?: number;
    cameraMovement?: 'static' | 'slow' | 'medium' | 'dynamic';
    frameRate?: 24 | 30 | 60;
  };
  referenceImages?: string[];
  metadata?: {
    projectId?: string;
    sceneId?: string;
    userId: string;
    priority: JobPriority;
  };
}

export interface VideoGenerationResponse {
  id: string;
  provider: VideoProvider;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: {
    videoUrl: string;
    thumbnailUrl?: string;
    metadata: {
      duration: number;
      resolution: string;
      fps: number;
      fileSize: number;
      format: string;
      generationTime: number;
      cost: number;
    };
  };
  error?: {
    message: string;
    code: string;
    retryable: boolean;
  };
  estimatedCompletionTime?: Date;
  createdAt: Date;
  completedAt?: Date;
}

export interface VideoProviderConfig {
  provider: VideoProvider;
  apiKey: string;
  baseUrl: string;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  pricing: {
    costPerSecond: number;
    qualityMultipliers: Record<string, number>;
  };
  capabilities: {
    maxDuration: number;
    supportedAspectRatios: string[];
    supportedQualities: string[];
    supportsReferenceImages: boolean;
    supportsStyleTransfer: boolean;
  };
  isEnabled: boolean;
}

export interface VideoProviderMetrics {
  id: string;
  provider: VideoProvider;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageGenerationTime: number;
  averageQueueTime: number;
  uptime: number;
  costPerRequest: number;
  qualityScore: number;
  timestamp: Date;
}

export interface VideoCacheEntry {
  id: string;
  promptHash: string;
  provider: VideoProvider;
  settings: VideoGenerationRequest['settings'];
  videoUrl: string;
  thumbnailUrl?: string;
  metadata: {
    duration: number;
    fileSize: number;
    quality: string;
  };
  usageCount: number;
  lastAccessed: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface VideoRateLimitConfig {
  provider: VideoProvider;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  costPerRequest: number;
  maxCostPerUser: number;
  maxConcurrentJobs: number;
}