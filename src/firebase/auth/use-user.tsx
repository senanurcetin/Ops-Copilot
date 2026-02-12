'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useAuth } from '../provider';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useFirestore } from '../provider';

export const useUser = () => {
  const auth = useAuth();
  const firestore = useFirestore();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (userAuth) => {
      if (userAuth) {
        if (firestore) {
            const userRef = doc(firestore, `users/${userAuth.uid}`);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
              // Create user profile if it doesn't exist
              const { uid, email, displayName, photoURL } = userAuth;
              await setDoc(userRef, { uid, email, displayName, photoURL }, { merge: true });
            }
        }
        setUser(userAuth);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, firestore]);

  return { user, loading };
};
