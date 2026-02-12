'use server';

import { obtainAnswersFromDocuments } from '@/ai/flows/obtain-answers-from-documents';
import { ingestKnowledge, type IngestKnowledgeInput } from '@/ai/flows/initial-knowledge-base-setup';
import { searchDocuments, clearDocuments, type Document } from '@/services/vector-store';
import { promises as fs } from 'fs';
import path from 'path';

export async function handleUserMessage(question: string): Promise<{ answer: string; sources: Document[] }> {
  if (!question.trim()) {
    return { answer: "Please ask a question.", sources: [] };
  }

  try {
    const relevantDocs = await searchDocuments(question);

    if (relevantDocs.length === 0) {
      return { answer: "I don't have enough information to answer that. Please upload a knowledge base first.", sources: [] };
    }

    const context = relevantDocs
      .map(doc => `Title: ${doc.title}\nContent: ${doc.content}`)
      .join('\n\n---\n\n');

    const result = await obtainAnswersFromDocuments({ question, context });
    return { answer: result.answer, sources: relevantDocs };
  } catch (error) {
    console.error('Error handling user message:', error);
    return { answer: 'Sorry, something went wrong while processing your request.', sources: [] };
  }
}

export async function handleUploadManual(): Promise<{ success: boolean; message: string }> {
  try {
    // Clear existing documents to simulate a fresh upload.
    await clearDocuments();

    const filePath = path.join(process.cwd(), 'public', 'knowledge_base.json');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const knowledgeBase = JSON.parse(fileContent) as IngestKnowledgeInput;
    
    await ingestKnowledge(knowledgeBase);
    
    return { success: true, message: 'Knowledge base ingested successfully!' };
  } catch (error) {
    console.error('Error ingesting manual knowledge base:', error);
    return { success: false, message: 'Failed to ingest knowledge base.' };
  }
}
