'use server';

export interface Document {
  id: string;
  title: string;
  content: string;
}

// In-memory store for documents. In a real application, this would be a connection to a vector database like Firestore.
let documents: Document[] = [];

// A map to quickly check for existing document IDs.
const documentIndex = new Map<string, Document>();

/**
 * Stores a document in the simulated vector store.
 * For simulation, we just add it to an in-memory array.
 * We also don't generate real embeddings here, as the Genkit flow handles that part before storage conceptually.
 * The search function will just use the text content.
 */
export async function storeDocument(doc: Document): Promise<void> {
  if (!documentIndex.has(doc.id)) {
    console.log(`Storing document: ${doc.id}`);
    documents.push(doc);
    documentIndex.set(doc.id, doc);
  } else {
    console.log(`Document ${doc.id} already exists. Updating.`);
    const existingDocIndex = documents.findIndex(d => d.id === doc.id);
    if (existingDocIndex > -1) {
      documents[existingDocIndex] = doc;
    }
    documentIndex.set(doc.id, doc);
  }
}

/**
 * Searches for documents in the simulated vector store.
 * In this simulation, it returns all stored documents as context,
 * as we are not performing a real vector similarity search.
 */
export async function searchDocuments(query: string): Promise<Document[]> {
  console.log(`Searching for documents related to: "${query}"`);
  // Simulate returning all documents as context. A real implementation would perform a vector search.
  return documents;
}

/**
 * Clears all documents from the in-memory store.
 * Useful for resetting state during development or testing.
 */
export async function clearDocuments(): Promise<void> {
  console.log('Clearing all documents from the store.');
  documents = [];
  documentIndex.clear();
}
