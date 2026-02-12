'use server';

/**
 * @fileOverview Implements the initial knowledge base setup flow for new users.
 *
 * - `ingestKnowledge`: Accepts a JSON array of documents, generates embeddings using Gemini Pro, and stores them in Firestore.
 * - `IngestKnowledgeInput`: The input type for the ingestKnowledge function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {storeDocument} from '@/services/vector-store';

const DocumentSchema = z.object({
  id: z.string().describe('The unique identifier of the document.'),
  title: z.string().describe('The title of the document.'),
  content: z.string().describe('The content of the document.'),
});

const IngestKnowledgeInputSchema = z.array(DocumentSchema).describe(
  'A JSON array of documents, each with an id, title, and content field.'
);
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
  async knowledgeBase => {
    for (const document of knowledgeBase) {
      await storeDocument(document);
    }
  }
);
