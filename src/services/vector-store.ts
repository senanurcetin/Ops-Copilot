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
 * This function performs a basic case-insensitive text search on the title and content.
 * A real implementation would perform a vector similarity search.
 */
export async function searchDocuments(query: string): Promise<Document[]> {
    console.log(`Searching for documents related to: "${query}"`);
    if (documents.length === 0) {
        return [];
    }

    const lowerCaseQuery = query.toLowerCase();

    // Prioritize documents where the title is a close match
    const titleMatches = documents.filter(doc => 
        doc.title.toLowerCase().includes(lowerCaseQuery)
    );

    if (titleMatches.length > 0) {
        return titleMatches;
    }

    // If no title match, search the content
    const contentMatches = documents.filter(doc => 
        doc.content.toLowerCase().includes(lowerCaseQuery)
    );
    
    if (contentMatches.length > 0) {
        return contentMatches.slice(0, 5);
    }
    
    // A fallback keyword scoring mechanism
    const queryWords = new Set(lowerCaseQuery.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1));
    if (queryWords.size === 0) {
        return [];
    }

    const scoredDocs = documents.map(doc => {
        const titleWords = new Set(doc.title.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/));
        const contentWords = new Set(doc.content.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/));
        
        let score = 0;
        for (const word of queryWords) {
            if (titleWords.has(word)) {
                score += 5; // Higher weight for title matches
            }
            if (contentWords.has(word)) {
                score += 1;
            }
        }
        return { doc, score };
    });

    const sortedDocs = scoredDocs.filter(item => item.score > 0).sort((a, b) => b.score - a.score);

    // Return up to 5 most relevant documents
    return sortedDocs.slice(0, 5).map(item => item.doc);
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
