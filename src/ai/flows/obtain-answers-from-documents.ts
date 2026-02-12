'use server';

/**
 * @fileOverview A flow that accepts user questions, generates embeddings, queries Firestore for the most similar documents,
 * constructs a prompt with retrieved context and chat history, and sends it to Gemini Pro for an answer.
 *
 * - obtainAnswersFromDocuments - A function that handles the question answering process.
 * - ObtainAnswersFromDocumentsInput - The input type for the obtainAnswersFromDocuments function.
 * - ObtainAnswersFromDocumentsOutput - The return type for the obtainAnswersFromDocuments function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ChatHistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const ObtainAnswersFromDocumentsInputSchema = z.object({
  question: z.string().describe('The current user question.'),
  context: z.string().describe('The context documents retrieved from the knowledge base.'),
  chatHistory: z.array(ChatHistoryItemSchema).optional().describe('The history of the conversation so far.'),
});

export type ObtainAnswersFromDocumentsInput = z.infer<typeof ObtainAnswersFromDocumentsInputSchema>;

const ObtainAnswersFromDocumentsOutputSchema = z.object({
  answer: z.string().describe('The answer to the user question.'),
});

export type ObtainAnswersFromDocumentsOutput = z.infer<typeof ObtainAnswersFromDocumentsOutputSchema>;

export async function obtainAnswersFromDocuments(input: ObtainAnswersFromDocumentsInput): Promise<ObtainAnswersFromDocumentsOutput> {
  return obtainAnswersFromDocumentsFlow(input);
}

const obtainAnswersFromDocumentsPrompt = ai.definePrompt({
  name: 'obtainAnswersFromDocumentsPrompt',
  input: {schema: ObtainAnswersFromDocumentsInputSchema},
  output: {schema: ObtainAnswersFromDocumentsOutputSchema},
  prompt: `You are a helpful industrial operations assistant named Ops-Copilot. Your goal is to answer the user's questions based on the provided context documents. Use the conversation history to understand follow-up questions and provide coherent answers.

If the user's question is not related to the provided context or history, state that you don't have enough information. Always be concise and professional.

{{#if chatHistory}}
Conversation History:
{{#each chatHistory}}
{{this.role}}: {{{this.content}}}
{{/each}}
{{/if}}

Context Documents:
---
{{context}}
---

Current User Question: {{question}}

Answer:`,
});

const obtainAnswersFromDocumentsFlow = ai.defineFlow(
  {
    name: 'obtainAnswersFromDocumentsFlow',
    inputSchema: ObtainAnswersFromDocumentsInputSchema,
    outputSchema: ObtainAnswersFromDocumentsOutputSchema,
  },
  async input => {
    const {output} = await obtainAnswersFromDocumentsPrompt(input);
    return output!;
  }
);
