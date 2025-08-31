# Video Generator Episodes

Firebase-based platform for generating video episodes with AI.

## Setup Instructions

### 1. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project with the name matching your `.firebaserc` configuration
3. Enable the following services:
   - Authentication (Email/Password and Google providers)
   - Firestore Database
   - Storage
   - Functions
   - Hosting

### 2. Firebase CLI Setup

```bash
npm install -g firebase-tools
firebase login
firebase use --add  # Select your project and assign an alias
```

### 3. Environment Variables

1. Copy `.env.example` to `.env.local`
2. Replace the placeholder values with your actual Firebase config values
3. Get your Firebase config from Project Settings > General > Your apps > Web app config

### 4. Install Dependencies

```bash
# Root dependencies
npm install

# Functions dependencies
cd functions && npm install && cd ..
```

### 5. Development

```bash
# Start Firebase emulators
firebase emulators:start

# In another terminal, start Next.js dev server
npm run dev
```

### 6. Deployment

```bash
# Build and deploy everything
npm run build
npm run deploy

# Deploy specific services
npm run deploy:functions
npm run deploy:hosting
npm run deploy:firestore
npm run deploy:storage
```

## Project Structure

```
├── functions/          # Cloud Functions
├── lib/               # Firebase client configuration
├── pages/             # Next.js pages
├── public/            # Static assets
├── firebase.json      # Firebase configuration
├── firestore.rules    # Firestore security rules
├── firestore.indexes.json # Firestore indexes
├── storage.rules      # Storage security rules
└── .firebaserc        # Firebase project aliases
```

## Features Configured

- ✅ Firebase Authentication (Email/Password + Google)
- ✅ Firestore Database with security rules
- ✅ Cloud Storage with security rules
- ✅ Cloud Functions (Node.js 18+)
- ✅ Firebase Hosting
- ✅ Development emulators
- ✅ TypeScript support
- ✅ Next.js static export configuration

## Collections Structure

### Users
```typescript
{
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  subscription: {
    plan: 'free' | 'pro' | 'enterprise';
    status: 'active' | 'cancelled' | 'past_due';
    startDate: Timestamp;
  };
  usage: {
    videosGenerated: number;
    storageUsed: number;
    lastActivity: Timestamp;
  };
}
```

### Projects
```typescript
{
  id: string;
  userId: string;
  title: string;
  description?: string;
  settings: object;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Videos
```typescript
{
  id: string;
  userId: string;
  projectId: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata: object;
  urls: {
    video?: string;
    thumbnail?: string;
  };
  createdAt: Timestamp;
  completedAt?: Timestamp;
}
```