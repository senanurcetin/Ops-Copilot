export interface RankedDocument {
  id: string;
  title: string;
  content: string;
}

/**
 * Normalize industrial-manual terms consistently in questions and sources.
 * Unicode accents, dotless i and punctuation should not silently destroy
 * meaningful terms such as Turkish "ısı", "ışık", or hyphenated fault codes.
 */
function searchable(value: string): string {
  return value.toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function rankDocuments(documents: RankedDocument[], query: string): RankedDocument[] {
  if (!documents.length) {
    return [];
  }

  const normalizedQuery = searchable(query);
  const queryWordsArray = normalizedQuery
    .split(' ')
    .filter((word) => word.length > 1);
  const queryWords = new Set(queryWordsArray);

  if (queryWords.size === 0) {
    return [];
  }

  const scoredDocs = documents.map((doc) => {
    const titleText = searchable(doc.title);
    const contentText = searchable(doc.content);

    let score = 0;

    if (titleText.includes(normalizedQuery)) {
      score += 50;
    }

    if (contentText.includes(normalizedQuery)) {
      score += 20;
    }

    const titleWords = new Set(titleText.split(' '));
    const contentWords = new Set(contentText.split(' '));

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
