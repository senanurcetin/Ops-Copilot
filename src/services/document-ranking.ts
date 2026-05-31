export interface RankedDocument {
  id: string;
  title: string;
  content: string;
}

export function rankDocuments(documents: RankedDocument[], query: string): RankedDocument[] {
  if (!documents.length) {
    return [];
  }

  const lowerCaseQuery = query.toLowerCase();
  const queryWordsArray = lowerCaseQuery
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 1);
  const queryWords = new Set(queryWordsArray);

  if (queryWords.size === 0) {
    return [];
  }

  const scoredDocs = documents.map((doc) => {
    const titleText = doc.title.toLowerCase();
    const contentText = doc.content.toLowerCase();

    let score = 0;

    if (titleText.includes(lowerCaseQuery)) {
      score += 50;
    }

    if (contentText.includes(lowerCaseQuery)) {
      score += 20;
    }

    const titleWords = new Set(titleText.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/));
    const contentWords = new Set(contentText.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/));

    let wordsFoundInTitle = 0;
    let wordsFoundInContent = 0;

    for (const word of queryWords) {
      if (titleWords.has(word)) {
        score += 10;
        wordsFoundInTitle++;
      }

      if (contentWords.has(word)) {
        score += 2;
        wordsFoundInContent++;
      }
    }

    if (wordsFoundInTitle === queryWords.size) {
      score += 30;
    }

    if (wordsFoundInContent === queryWords.size) {
      score += 10;
    }

    return { doc, score };
  });

  return scoredDocs
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.doc);
}
