import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Connect to emulators in development
if (process.env.NODE_ENV === 'development' && 
    typeof window !== 'undefined' && 
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  const hostname = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || 'localhost';
  
  try {
    if (!(auth as any)._config?.emulator) {
      connectAuthEmulator(auth, `http://${hostname}:9099`, {
        disableWarnings: true
      });
    }
  } catch (e) {
    console.warn('Auth emulator connection failed:', e);
  }
  
  try {
    connectFirestoreEmulator(db, hostname, 8080);
  } catch (e) {
    console.warn('Firestore emulator connection failed:', e);
  }
  
  try {
    connectStorageEmulator(storage, hostname, 9199);
  } catch (e) {
    console.warn('Storage emulator connection failed:', e);
  }
  
  try {
    connectFunctionsEmulator(functions, hostname, 5001);
  } catch (e) {
    console.warn('Functions emulator connection failed:', e);
  }
}

export default app;