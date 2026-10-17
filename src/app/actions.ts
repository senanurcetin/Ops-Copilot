'use server';

import { obtainAnswersFromDocuments } from '@/ai/flows/obtain-answers-from-documents';
import { searchDocuments, replaceSampleDocuments, getKnowledgeBaseStats, type Document } from '@/services/vector-store';
import { selectVerifiedSources } from '@/services/source-evidence';
import { parseSampleKnowledgeBase } from '@/server/sample-knowledge-base';
import { assertChecklistMatchesSource, parseChecklistProgress } from '@/server/checklist-progress';
import { ChatInputError, validateChatInput, type ChatHistoryItem } from '@/server/chat-input';
import { SessionAuthError, requireCurrentSessionUser } from '@/server/auth-session';
import { getAdminDb } from '@/server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { promises as fs } from 'fs';
import path from 'path';

export async function handleUserMessage(question: string, chatHistory: ChatHistoryItem[]): Promise<{ answer: string; sources: Document[]; keyQuote?: string; evidenceStatus?: 'verified-quote' | 'no-verified-quote' }> {
  try {
    const input = validateChatInput(question, chatHistory);
    const sessionUser = await requireCurrentSessionUser();
    const relevantDocs = await searchDocuments(sessionUser.uid, input.question);

    if (relevantDocs.length === 0) {
      const { documentCount } = await getKnowledgeBaseStats(sessionUser.uid);

      if (documentCount === 0) {
        return {
          answer:
            'No knowledge base is loaded for this workspace yet. Use "Load Sample KB" before asking diagnostics questions.',
          sources: [],
        };
      }

      return {
        answer:
          'I could not find a relevant procedure in the current knowledge base. Try a more specific equipment, alarm, or fault-code query.',
        sources: [],
      };
    }

    const context = relevantDocs
      .map(doc => `Title: ${doc.title}\nContent: ${doc.content}`)
      .join('\n\n---\n\n');

    const result = await obtainAnswersFromDocuments({ question: input.question, context, chatHistory: input.chatHistory });
    const evidence = selectVerifiedSources(relevantDocs, result.keyQuote);
    return {
      answer: result.answer,
      sources: evidence.sources,
      keyQuote: evidence.keyQuote,
      evidenceStatus: evidence.keyQuote ? 'verified-quote' : 'no-verified-quote',
    };
  } catch (error) {
    if (error instanceof ChatInputError) {
      return { answer: error.message, sources: [] };
    }
    if (error instanceof SessionAuthError) {
      return {
        answer: 'Your session has expired. Please sign in again to continue.',
        sources: [],
      };
    }

    console.error('Error handling user message:', error);
    return { answer: 'Sorry, something went wrong while processing your request.', sources: [] };
  }
}

export async function handleUploadManual(): Promise<{ success: boolean; message: string }> {
  try {
    const sessionUser = await requireCurrentSessionUser();
    // Read and validate the entire fixture before any Firestore mutation.
    const filePath = path.join(process.cwd(), 'public', 'knowledge_base.json');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const knowledgeBase = parseSampleKnowledgeBase(fileContent);

    // One Firestore batch replaces the sample set atomically. On failure the
    // previous documents remain untouched; the response reports failure.
    await replaceSampleDocuments(sessionUser.uid, knowledgeBase);
    
    return { success: true, message: 'Knowledge base ingested successfully!' };
  } catch (error) {
    if (error instanceof SessionAuthError) {
      return { success: false, message: 'Your session has expired. Please sign in again.' };
    }

    console.error('Error ingesting manual knowledge base:', error);
    return { success: false, message: 'Failed to ingest knowledge base.' };
  }
}

export async function logChecklistProgress(input: {
  documentId: string;
  documentTitle: string;
  completedSteps: string[];
}) {
  try {
    const sessionUser = await requireCurrentSessionUser();
    const progress = parseChecklistProgress(input);
    const db = getAdminDb();
    const userDoc = db.collection('users').doc(sessionUser.uid);
    const sourceRef = userDoc.collection('knowledgeDocuments').doc(progress.documentId);
    const logRef = userDoc.collection('checklistLogs').doc();

    // Read the current procedure and create its evidence record in the same
    // optimistic transaction. A concurrent source change forces a retry,
    // rather than creating a log against stale/deleted checklist content.
    await db.runTransaction(async transaction => {
      const sourceSnapshot = await transaction.get(sourceRef);
      const sourceSha256 = assertChecklistMatchesSource(
        progress,
        sourceSnapshot.exists ? sourceSnapshot.data() ?? null : null,
      );
      transaction.create(logRef, {
        documentId: progress.documentId,
        documentTitle: progress.documentTitle,
        completedSteps: progress.completedSteps,
        completedStepCount: progress.completedSteps.length,
        sourceSha256,
        sourceHashAlgorithm: 'sha256:ops-checklist-source-v1',
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error) {
    if (error instanceof SessionAuthError) {
      return { success: false, message: 'Your session has expired. Please sign in again.' };
    }

    console.error('Error logging checklist progress:', error);
    return { success: false, message: 'Could not log checklist progress.' };
  }
}
