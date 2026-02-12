import { config } from 'dotenv';
config();

import '@/ai/flows/initial-knowledge-base-setup.ts';
import '@/ai/flows/receive-concise-answers.ts';
import '@/ai/flows/obtain-answers-from-documents.ts';