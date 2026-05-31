'use client';

import { useState, useEffect } from 'react';
import { onSnapshot, type DocumentData, type Query, type DocumentSnapshot } from 'firebase/firestore';
import { useFirestore } from '../provider';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError } from '../errors';

export const useCollection = <T extends DocumentData>(q: Query<T> | null) => {
  const [data, setData] = useState<DocumentSnapshot<T>[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore || !q) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        setData(querySnapshot.docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('onSnapshot error:', err);
        const permissionError = new FirestorePermissionError({
            path: 'unknown',
            operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setError(permissionError);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [firestore, q]);

  return { data, loading, error };
};
