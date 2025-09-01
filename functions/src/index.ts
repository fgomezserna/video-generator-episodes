import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Job, JobData, NotificationEvent, QueueMetrics } from "../../lib/types";

admin.initializeApp();

const db = admin.firestore();
const QUEUE_COLLECTION = "jobs";
const METRICS_COLLECTION = "queueMetrics";
const NOTIFICATIONS_COLLECTION = "notifications";
const DEAD_LETTER_COLLECTION = "deadLetterJobs";

export const helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

export const createUserProfile = functions.auth.user().onCreate(async (user) => {
  const userProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    subscription: {
      plan: "free",
      status: "active",
      startDate: admin.firestore.FieldValue.serverTimestamp(),
    },
    usage: {
      videosGenerated: 0,
      storageUsed: 0,
      lastActivity: admin.firestore.FieldValue.serverTimestamp(),
    },
  };

  try {
    await admin.firestore().collection("users").doc(user.uid).set(userProfile);
    functions.logger.info(`User profile created for ${user.uid}`);
  } catch (error) {
    functions.logger.error("Error creating user profile:", error);
  }
});

export const deleteUserData = functions.auth.user().onDelete(async (user) => {
  const batch = admin.firestore().batch();
  
  try {
    const userDoc = admin.firestore().collection("users").doc(user.uid);
    batch.delete(userDoc);

    const projectsSnapshot = await admin.firestore()
      .collection("projects")
      .where("userId", "==", user.uid)
      .get();

    projectsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    const videosSnapshot = await admin.firestore()
      .collection("videos")
      .where("userId", "==", user.uid)
      .get();

    videosSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    functions.logger.info(`User data deleted for ${user.uid}`);
  } catch (error) {
    functions.logger.error("Error deleting user data:", error);
  }
});

export const enqueueJob = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { type, jobData, priority = 'normal', maxRetries = 3 } = data;
  
  if (!type || !jobData) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: type, jobData');
  }

  try {
    const jobId = db.collection(QUEUE_COLLECTION).doc().id;
    const job: Partial<Job> = {
      id: jobId,
      type,
      status: 'pending',
      priority,
      data: {
        ...jobData,
        userId: context.auth.uid
      },
      progress: 0,
      retryCount: 0,
      maxRetries,
      retryDelay: 1000,
      createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
    };

    await db.collection(QUEUE_COLLECTION).doc(jobId).set(job);
    
    functions.logger.info(`Job enqueued: ${jobId}`, { jobId, type, userId: context.auth.uid });
    
    return { jobId, status: 'enqueued' };
  } catch (error) {
    functions.logger.error('Error enqueuing job:', error);
    throw new functions.https.HttpsError('internal', 'Failed to enqueue job');
  }
});

export const processJobQueue = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
  try {
    const pendingJobsQuery = await db
      .collection(QUEUE_COLLECTION)
      .where('status', '==', 'pending')
      .orderBy('priority')
      .orderBy('createdAt')
      .limit(10)
      .get();

    const promises = pendingJobsQuery.docs.map(doc => processJob(doc.id, doc.data() as Job));
    await Promise.allSettled(promises);

    functions.logger.info(`Processed ${pendingJobsQuery.size} pending jobs`);
  } catch (error) {
    functions.logger.error('Error processing job queue:', error);
  }
});

export const retryFailedJobs = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
  try {
    const now = new Date();
    const retryJobsQuery = await db
      .collection(QUEUE_COLLECTION)
      .where('status', '==', 'retrying')
      .where('nextRetry', '<=', now)
      .limit(5)
      .get();

    const promises = retryJobsQuery.docs.map(doc => processJob(doc.id, doc.data() as Job));
    await Promise.allSettled(promises);

    functions.logger.info(`Retried ${retryJobsQuery.size} failed jobs`);
  } catch (error) {
    functions.logger.error('Error retrying failed jobs:', error);
  }
});

async function processJob(jobId: string, job: Job): Promise<void> {
  const jobRef = db.collection(QUEUE_COLLECTION).doc(jobId);
  
  try {
    await jobRef.update({
      status: 'processing',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let result;
    const startTime = Date.now();

    switch (job.type) {
      case 'video_generation':
        result = await processVideoGeneration(job.data);
        break;
      case 'audio_synthesis':
        result = await processAudioSynthesis(job.data);
        break;
      case 'image_processing':
        result = await processImageProcessing(job.data);
        break;
      case 'template_processing':
        result = await processTemplateProcessing(job.data);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    const processingTime = Date.now() - startTime;

    await jobRef.update({
      status: 'completed',
      result,
      progress: 100,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      processingTime,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await sendNotification({
      userId: job.data.userId,
      type: 'job_completed',
      title: 'Job Completed Successfully',
      message: `Your ${job.type.replace('_', ' ')} job has been completed.`,
      data: { jobId, result },
      channels: ['push', 'in_app'],
    });

    functions.logger.info(`Job completed successfully: ${jobId}`, { jobId, processingTime });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    functions.logger.error(`Job failed: ${jobId}`, { jobId, error: errorMessage });
    await handleJobFailure(jobId, job, error as Error);
  }
}

async function handleJobFailure(jobId: string, job: Job, error: Error): Promise<void> {
  const jobRef = db.collection(QUEUE_COLLECTION).doc(jobId);
  const retryCount = (job.retryCount || 0) + 1;
  const maxRetries = job.maxRetries || 3;

  if (retryCount <= maxRetries) {
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 300000);
    const nextRetry = new Date(Date.now() + retryDelay);

    await jobRef.update({
      status: 'retrying',
      retryCount,
      retryDelay,
      nextRetry,
      error: {
        message: error.message,
        code: 'processing_error',
        stack: error.stack,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info(`Job scheduled for retry: ${jobId}`, { 
      jobId, 
      retryCount, 
      nextRetry: nextRetry.toISOString() 
    });
  } else {
    await jobRef.update({
      status: 'failed',
      error: {
        message: error.message,
        code: 'max_retries_exceeded',
        stack: error.stack,
      },
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection(DEAD_LETTER_COLLECTION).doc(jobId).set({
      ...job,
      originalJobId: jobId,
      finalError: {
        message: error.message,
        code: 'max_retries_exceeded',
        stack: error.stack,
      },
      movedToDeadLetterAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await sendNotification({
      userId: job.data.userId,
      type: 'job_failed',
      title: 'Job Failed',
      message: `Your ${job.type.replace('_', ' ')} job has failed after ${maxRetries} attempts.`,
      data: { jobId, error: error.message },
      channels: ['email', 'push', 'in_app'],
    });

    functions.logger.error(`Job moved to dead letter queue: ${jobId}`, { jobId, error: error.message });
  }
}

async function processVideoGeneration(data: JobData): Promise<any> {
  functions.logger.info('Starting video generation', { projectId: data.projectId });
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const videoUrl = `https://storage.googleapis.com/videos/${data.projectId}_${Date.now()}.mp4`;
  const thumbnailUrl = `https://storage.googleapis.com/thumbnails/${data.projectId}_${Date.now()}.jpg`;
  
  return {
    videoUrl,
    thumbnailUrl,
    duration: 30,
    size: 1024 * 1024 * 15,
    resolution: '1920x1080',
    fps: 30,
  };
}

async function processAudioSynthesis(data: JobData): Promise<any> {
  functions.logger.info('Starting audio synthesis', { projectId: data.projectId });
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  return {
    audioUrl: `https://storage.googleapis.com/audio/${data.projectId}_${Date.now()}.mp3`,
    duration: 30,
    format: 'mp3',
  };
}

async function processImageProcessing(data: JobData): Promise<any> {
  functions.logger.info('Starting image processing', { projectId: data.projectId });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return {
    imageUrl: `https://storage.googleapis.com/images/${data.projectId}_${Date.now()}.jpg`,
    width: 1920,
    height: 1080,
    format: 'jpg',
  };
}

async function processTemplateProcessing(data: JobData): Promise<any> {
  functions.logger.info('Starting template processing', { projectId: data.projectId });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    processedTemplate: {
      ...data.variables,
      processed: true,
      processedAt: new Date().toISOString(),
    },
  };
}

async function sendNotification(notification: Omit<NotificationEvent, 'id' | 'status' | 'createdAt'>): Promise<void> {
  try {
    const notificationId = db.collection(NOTIFICATIONS_COLLECTION).doc().id;
    const notificationData: Partial<NotificationEvent> = {
      ...notification,
      id: notificationId,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
    };

    await db.collection(NOTIFICATIONS_COLLECTION).doc(notificationId).set(notificationData);
    
    functions.logger.info(`Notification created: ${notificationId}`, { 
      notificationId, 
      userId: notification.userId, 
      type: notification.type 
    });
  } catch (error) {
    functions.logger.error('Error sending notification:', error);
  }
}

export const generateQueueMetrics = functions.pubsub.schedule('every 10 minutes').onRun(async (context) => {
  try {
    const jobsSnapshot = await db.collection(QUEUE_COLLECTION).get();
    const jobs = jobsSnapshot.docs.map(doc => doc.data() as Job);

    const metrics: Partial<QueueMetrics> = {
      id: `metrics_${Date.now()}`,
      queueName: 'main_queue',
      totalJobs: jobs.length,
      pendingJobs: jobs.filter(j => j.status === 'pending').length,
      processingJobs: jobs.filter(j => j.status === 'processing').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      averageProcessingTime: calculateAverageProcessingTime(jobs),
      throughput: calculateThroughput(jobs),
      timestamp: admin.firestore.FieldValue.serverTimestamp() as any,
    };

    await db.collection(METRICS_COLLECTION).add(metrics);
    functions.logger.info('Queue metrics generated', metrics);
  } catch (error) {
    functions.logger.error('Error generating queue metrics:', error);
  }
});

function calculateAverageProcessingTime(jobs: Job[]): number {
  const completedJobs = jobs.filter(j => j.status === 'completed' && j.processingTime);
  if (completedJobs.length === 0) return 0;
  
  const totalTime = completedJobs.reduce((sum, job) => sum + (job.processingTime || 0), 0);
  return Math.round(totalTime / completedJobs.length);
}

function calculateThroughput(jobs: Job[]): number {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCompletedJobs = jobs.filter(j => 
    j.status === 'completed' && 
    j.completedAt && 
    new Date(j.completedAt as any) > oneHourAgo
  );
  
  return recentCompletedJobs.length;
}

export const cleanupOldJobs = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const oldJobsQuery = await db
      .collection(QUEUE_COLLECTION)
      .where('status', 'in', ['completed', 'failed'])
      .where('updatedAt', '<', sevenDaysAgo)
      .limit(100)
      .get();

    const batch = db.batch();
    oldJobsQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    functions.logger.info(`Cleaned up ${oldJobsQuery.size} old jobs`);
  } catch (error) {
    functions.logger.error('Error cleaning up old jobs:', error);
  }
});