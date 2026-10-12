/** Validate untrusted server-action payloads before any Firestore write. */
export interface ChecklistProgress {
  documentId: string;
  documentTitle: string;
  completedSteps: string[];
}

const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_TITLE_LENGTH = 200;
const MAX_COMPLETED_STEPS = 200;
const MAX_STEP_LENGTH = 1000;

export function parseChecklistProgress(input: unknown): ChecklistProgress {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid checklist progress payload.');
  }
  const entry = input as Record<string, unknown>;
  if (typeof entry.documentId !== 'string' || !DOCUMENT_ID.test(entry.documentId)) {
    throw new Error('Invalid checklist document ID.');
  }
  if (typeof entry.documentTitle !== 'string') {
    throw new Error('Invalid checklist title.');
  }
  const documentTitle = entry.documentTitle.trim();
  if (!documentTitle || documentTitle.length > MAX_TITLE_LENGTH) {
    throw new Error('Invalid checklist title.');
  }
  if (!Array.isArray(entry.completedSteps) ||
      entry.completedSteps.length > MAX_COMPLETED_STEPS) {
    throw new Error('Invalid checklist steps.');
  }
  const completedSteps: string[] = [];
  const seen = new Set<string>();
  for (const raw of entry.completedSteps) {
    if (typeof raw !== 'string' || !raw.trim() ||
        raw.trim().length > MAX_STEP_LENGTH) {
      throw new Error('Invalid checklist step.');
    }
    const step = raw.trim();
    if (seen.has(step)) {
      throw new Error('Duplicate checklist step.');
    }
    seen.add(step);
    completedSteps.push(step);
  }

  return { documentId: entry.documentId, documentTitle, completedSteps };
}
