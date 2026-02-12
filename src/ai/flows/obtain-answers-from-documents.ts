'use server';

/**
 * @fileOverview A flow that accepts user questions, generates embeddings, queries Firestore for the most similar documents,
 * constructs a prompt with retrieved context, and sends it to Gemini Pro for an answer.
 *
 * - obtainAnswersFromDocuments - A function that handles the question answering process.
 * - ObtainAnswersFromDocumentsInput - The input type for the obtainAnswersFromDocuments function.
 * - ObtainAnswersFromDocumentsOutput - The return type for the obtainAnswersFromDocuments function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ObtainAnswersFromDocumentsInputSchema = z.object({
  question: z.string().describe('The user question.'),
  context: z.string().describe('The context documents uploaded by the user.'),
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
  prompt: `You are a helpful assistant that answers questions based on the given context.\n\nContext:\n{{context}}\n\nQuestion: {{question}}\n\nAnswer: `,
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
