// Internal server module only. Do not use a file-level 'use server' directive:
// that turns exported helpers accepting caller-supplied context/user IDs into
// directly invocable Next.js Server Actions. Only src/app/actions.ts exposes
// authenticated public actions.

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/server/firebase-admin';
import { rankDocuments } from './document-ranking';
import { applyKnowledgeBaseReplacement, type KnowledgeDocument } from '@/server/sample-knowledge-base';

export interface Document {
  id: string;
  title: string;
  content: string;
}

function getKnowledgeCollection(userId: string) {
  return getAdminDb().collection('users').doc(userId).collection('knowledgeDocuments');
}

async function getAllDocuments(userId: string): Promise<Document[]> {
  const snapshot = await getKnowledgeCollection(userId).get();

  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();

    return {
      id: docSnapshot.id,
      title: String(data.title ?? ''),
      content: String(data.content ?? ''),
    };
  });
}

/**
 * Stores documents in a per-user Firestore-backed knowledge collection.
 */
export async function storeDocuments(userId: string, docs: Document[]): Promise<void> {
  const batch = getAdminDb().batch();
  const knowledgeCollection = getKnowledgeCollection(userId);

  for (const doc of docs) {
    const documentRef = knowledgeCollection.doc(doc.id);
    batch.set(
      documentRef,
      {
        ...doc,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
}

/**
 * Replace the demo knowledge base using a Firestore transaction.
 *
 * The existing-document query and all mutations run in the same transaction,
 * so an optimistic retry can detect changes to documents read during planning.
 * All reads happen before writes. Input parsing takes place in the caller.
 * This does not coordinate with other write paths that do not use this query.
 */
export async function replaceSampleDocuments(
  userId: string,
  documents: KnowledgeDocument[],
): Promise<void> {
  const db = getAdminDb();
  const collection = db.collection('users').doc(userId).collection('knowledgeDocuments');

  await db.runTransaction(async transaction => {
    const existing = await transaction.get(collection);
    applyKnowledgeBaseReplacement(
      existing.docs.map(doc => doc.id),
      documents,
      {
        deleteById: id => { transaction.delete(collection.doc(id)); },
        setDocument: doc => {
          transaction.set(collection.doc(doc.id), {
            id: doc.id,
            title: doc.title,
            content: doc.content,
            updatedAt: FieldValue.serverTimestamp(),
          });
        },
      },
    );
  });
}

/**
 * Searches for documents in the Firestore-backed knowledge store using lexical ranking.
 */
export async function searchDocuments(userId: string, query: string): Promise<Document[]> {
  const documents = await getAllDocuments(userId);
  return rankDocuments(documents, query);
}

export async function getKnowledgeBaseStats(userId: string) {
  const snapshot = await getKnowledgeCollection(userId).get();
  return {
    documentCount: snapshot.size,
  };
}

/**
 * Clears all documents from the Firestore-backed knowledge store.
 */
export async function clearDocuments(userId: string): Promise<void> {
  const snapshot = await getKnowledgeCollection(userId).get();

  if (snapshot.empty) {
    return;
  }

  const batch = getAdminDb().batch();
  snapshot.docs.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });

  await batch.commit();
}
