import { db, functions } from '../firebase';
import { collection, doc, query, where, orderBy, limit, onSnapshot, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Job, JobData, JobType, JobPriority, QueueMetrics, NotificationEvent } from '../types';

const QUEUE_COLLECTION = 'jobs';
const METRICS_COLLECTION = 'queueMetrics';
const NOTIFICATIONS_COLLECTION = 'notifications';

export class QueueService {
  private enqueueJobCallable = httpsCallable(functions, 'enqueueJob');

  async enqueueJob(
    type: JobType,
    data: Omit<JobData, 'userId'>,
    options: {
      priority?: JobPriority;
      maxRetries?: number;
    } = {}
  ): Promise<{ jobId: string; status: string }> {
    try {
      const result = await this.enqueueJobCallable({
        type,
        jobData: data,
        priority: options.priority || 'normal',
        maxRetries: options.maxRetries || 3,
      });

      return result.data as { jobId: string; status: string };
    } catch (error) {
      console.error('Error enqueuing job:', error);
      throw error;
    }
  }

  async getJob(jobId: string): Promise<Job | null> {
    try {
      const jobDoc = await getDocs(query(
        collection(db, QUEUE_COLLECTION),
        where('id', '==', jobId),
        limit(1)
      ));

      if (jobDoc.empty) {
        return null;
      }

      return jobDoc.docs[0].data() as Job;
    } catch (error) {
      console.error('Error getting job:', error);
      throw error;
    }
  }

  subscribeToJob(jobId: string, callback: (job: Job | null) => void): () => void {
    const jobQuery = query(
      collection(db, QUEUE_COLLECTION),
      where('id', '==', jobId),
      limit(1)
    );

    return onSnapshot(jobQuery, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }

      const job = snapshot.docs[0].data() as Job;
      callback(job);
    }, (error) => {
      console.error('Error subscribing to job:', error);
      callback(null);
    });
  }

  subscribeToUserJobs(userId: string, callback: (jobs: Job[]) => void): () => void {
    const jobsQuery = query(
      collection(db, QUEUE_COLLECTION),
      where('data.userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    return onSnapshot(jobsQuery, (snapshot) => {
      const jobs = snapshot.docs.map(doc => doc.data() as Job);
      callback(jobs);
    }, (error) => {
      console.error('Error subscribing to user jobs:', error);
      callback([]);
    });
  }

  async getUserJobs(userId: string, options: {
    status?: string;
    limit?: number;
  } = {}): Promise<Job[]> {
    try {
      let jobsQuery = query(
        collection(db, QUEUE_COLLECTION),
        where('data.userId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      if (options.status) {
        jobsQuery = query(jobsQuery, where('status', '==', options.status));
      }

      if (options.limit) {
        jobsQuery = query(jobsQuery, limit(options.limit));
      }

      const jobsSnapshot = await getDocs(jobsQuery);
      return jobsSnapshot.docs.map(doc => doc.data() as Job);
    } catch (error) {
      console.error('Error getting user jobs:', error);
      throw error;
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    try {
      const jobQuery = query(
        collection(db, QUEUE_COLLECTION),
        where('id', '==', jobId),
        limit(1)
      );

      const jobSnapshot = await getDocs(jobQuery);
      if (jobSnapshot.empty) {
        throw new Error('Job not found');
      }

      const jobDoc = jobSnapshot.docs[0];
      const job = jobDoc.data() as Job;

      if (job.status === 'processing') {
        throw new Error('Cannot cancel job that is already processing');
      }

      if (job.status === 'completed' || job.status === 'failed') {
        throw new Error('Cannot cancel job that is already finished');
      }

      await updateDoc(jobDoc.ref, {
        status: 'failed',
        error: {
          message: 'Job cancelled by user',
          code: 'user_cancelled',
        },
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error cancelling job:', error);
      throw error;
    }
  }

  async getQueueMetrics(): Promise<QueueMetrics[]> {
    try {
      const metricsQuery = query(
        collection(db, METRICS_COLLECTION),
        orderBy('timestamp', 'desc'),
        limit(24)
      );

      const metricsSnapshot = await getDocs(metricsQuery);
      return metricsSnapshot.docs.map(doc => doc.data() as QueueMetrics);
    } catch (error) {
      console.error('Error getting queue metrics:', error);
      throw error;
    }
  }

  subscribeToQueueMetrics(callback: (metrics: QueueMetrics[]) => void): () => void {
    const metricsQuery = query(
      collection(db, METRICS_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(24)
    );

    return onSnapshot(metricsQuery, (snapshot) => {
      const metrics = snapshot.docs.map(doc => doc.data() as QueueMetrics);
      callback(metrics);
    }, (error) => {
      console.error('Error subscribing to queue metrics:', error);
      callback([]);
    });
  }

  async getUserNotifications(userId: string): Promise<NotificationEvent[]> {
    try {
      const notificationsQuery = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const notificationsSnapshot = await getDocs(notificationsQuery);
      return notificationsSnapshot.docs.map(doc => doc.data() as NotificationEvent);
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw error;
    }
  }

  subscribeToUserNotifications(userId: string, callback: (notifications: NotificationEvent[]) => void): () => void {
    const notificationsQuery = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    return onSnapshot(notificationsQuery, (snapshot) => {
      const notifications = snapshot.docs.map(doc => doc.data() as NotificationEvent);
      callback(notifications);
    }, (error) => {
      console.error('Error subscribing to user notifications:', error);
      callback([]);
    });
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      const notificationQuery = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('id', '==', notificationId),
        limit(1)
      );

      const notificationSnapshot = await getDocs(notificationQuery);
      if (!notificationSnapshot.empty) {
        const notificationDoc = notificationSnapshot.docs[0];
        await updateDoc(notificationDoc.ref, {
          status: 'sent',
          sentAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }
}

export const queueService = new QueueService();

export const enqueueVideoGeneration = async (
  projectId: string,
  templateId: string,
  variables: Record<string, any>,
  quality: 'draft' | 'standard' | 'high' | 'premium' = 'standard',
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1' = '16:9'
) => {
  return queueService.enqueueJob('video_generation', {
    projectId,
    templateId,
    variables,
    quality,
    aspectRatio,
  }, {
    priority: quality === 'premium' ? 'high' : 'normal',
    maxRetries: 3,
  });
};

export const enqueueAudioSynthesis = async (
  projectId: string,
  templateId: string,
  variables: Record<string, any>
) => {
  return queueService.enqueueJob('audio_synthesis', {
    projectId,
    templateId,
    variables,
    quality: 'standard',
    aspectRatio: '16:9',
  }, {
    priority: 'normal',
    maxRetries: 2,
  });
};

export const enqueueImageProcessing = async (
  projectId: string,
  templateId: string,
  variables: Record<string, any>
) => {
  return queueService.enqueueJob('image_processing', {
    projectId,
    templateId,
    variables,
    quality: 'standard',
    aspectRatio: '16:9',
  }, {
    priority: 'low',
    maxRetries: 2,
  });
};

export const enqueueScriptGeneration = async (
  projectId: string,
  scriptOptions: {
    topic: string;
    contentType: 'kids' | 'marketing' | 'documentary' | 'educational';
    duration: number;
    targetAudience: string;
    tone: string;
    characters?: string[];
    additionalInstructions?: string;
  }
) => {
  // Note: userId is automatically added from authentication context in Firebase Functions
  return queueService.enqueueJob('script_generation', {
    projectId,
    templateId: '',
    variables: {},
    quality: 'standard',
    aspectRatio: '16:9',
    metadata: { scriptOptions },
  }, {
    priority: 'high',
    maxRetries: 2,
  });
};

export const enqueueStoryboardGeneration = async (
  projectId: string,
  storyboardOptions: {
    script: string;
    scriptId?: string;
    contentType: 'kids' | 'marketing' | 'documentary' | 'educational';
    style: string;
    aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
    additionalInstructions?: string;
  }
) => {
  return queueService.enqueueJob('storyboard_generation', {
    projectId,
    templateId: '',
    variables: {},
    quality: 'standard',
    aspectRatio: storyboardOptions.aspectRatio,
    metadata: { storyboardOptions },
  }, {
    priority: 'high',
    maxRetries: 2,
  });
};