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
 * This function performs a more robust keyword search on title and content.
 * A real implementation would perform a vector similarity search.
 */
export async function searchDocuments(query: string): Promise<Document[]> {
    console.log(`Searching for documents related to: "${query}"`);
    if (documents.length === 0) {
        return [];
    }

    const lowerCaseQuery = query.toLowerCase();
    const queryWordsArray = lowerCaseQuery.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
    const queryWords = new Set(queryWordsArray);

    if (queryWords.size === 0) {
        return [];
    }

    const scoredDocs = documents.map(doc => {
        const titleText = doc.title.toLowerCase();
        const contentText = doc.content.toLowerCase();
        
        let score = 0;

        // Exact phrase match in title (highest score)
        if (titleText.includes(lowerCaseQuery)) {
            score += 50;
        }
        
        // Exact phrase match in content
        if (contentText.includes(lowerCaseQuery)) {
            score += 20;
        }
        
        const titleWords = new Set(titleText.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/));
        const contentWords = new Set(contentText.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/));
        
        let wordsFoundInTitle = 0;
        let wordsFoundInContent = 0;
        
        for (const word of queryWords) {
            if (titleWords.has(word)) {
                score += 10; // High weight for title keyword matches
                wordsFoundInTitle++;
            }
            if (contentWords.has(word)) {
                score += 2; // Lower weight for content keyword matches
                wordsFoundInContent++;
            }
        }
        
        // Bonus if all query words are in the title or content
        if (wordsFoundInTitle === queryWords.size) {
            score += 30;
        }
        if (wordsFoundInContent === queryWords.size) {
            score += 10;
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
