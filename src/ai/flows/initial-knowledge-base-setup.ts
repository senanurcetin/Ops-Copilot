// Internal server module only. Do not use a file-level 'use server' directive:
// that turns exported helpers accepting caller-supplied context/user IDs into
// directly invocable Next.js Server Actions. Only src/app/actions.ts exposes
// authenticated public actions.

/**
 * @fileOverview Implements the initial knowledge base setup flow for new users.
 *
 * - `ingestKnowledge`: Accepts a JSON array of documents, generates embeddings using Gemini Pro, and stores them in Firestore.
 * - `IngestKnowledgeInput`: The input type for the ingestKnowledge function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {storeDocuments} from '@/services/vector-store';

const DocumentSchema = z.object({
  id: z.string().describe('The unique identifier of the document.'),
  title: z.string().describe('The title of the document.'),
  content: z.string().describe('The content of the document.'),
});

const IngestKnowledgeInputSchema = z.object({
  userId: z.string().describe('The authenticated user that owns this knowledge base.'),
  documents: z.array(DocumentSchema).describe(
    'A JSON array of documents, each with an id, title, and content field.'
  ),
});
export type IngestKnowledgeInput = z.infer<typeof IngestKnowledgeInputSchema>;

export async function ingestKnowledge(knowledgeBase: IngestKnowledgeInput): Promise<void> {
  await ingestKnowledgeFlow(knowledgeBase);
}

const ingestKnowledgeFlow = ai.defineFlow(
  {
    name: 'ingestKnowledgeFlow',
    inputSchema: IngestKnowledgeInputSchema,
    outputSchema: z.void(),
  },
  async input => {
    await storeDocuments(input.userId, input.documents);
  }
);
