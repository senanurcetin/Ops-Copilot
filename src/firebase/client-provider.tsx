'use client';

import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './config';
import { FirebaseProvider } from './provider';
import { ReactNode, useState } from 'react';

type FirebaseInstances = {
  app: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
};

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

function createFirebaseInstances(): FirebaseInstances {
  if (!hasFirebaseConfig()) {
    console.warn('Firebase public configuration is incomplete. Firebase features are disabled.');
    return { app: null, auth: null, firestore: null };
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  return { app, auth, firestore };
}

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [instances] = useState<FirebaseInstances>(() => createFirebaseInstances());

  return (
    <FirebaseProvider
      app={instances.app}
      auth={instances.auth}
      firestore={instances.firestore}
    >
      {children}
    </FirebaseProvider>
  );
}
