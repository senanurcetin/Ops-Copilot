/**
 * Allow source highlighting only when the quoted text is actually present
 * verbatim in one of the authenticated user's retrieved documents.
 *
 * A generative model can invent plausible quotations even if it receives
 * real context. Reject those rather than presenting fabricated evidence.
 */
export function verifiedKeyQuote(
  documents: ReadonlyArray<{ title: string; content: string }>,
  proposed: unknown,
): string | undefined {
  if (typeof proposed !== 'string') return undefined;
  const quote = proposed.trim();
  // Do not send arbitrary long snippets into the UI as trusted highlights.
  if (!quote || quote.length > 500) return undefined;
  return documents.some(doc => doc.content.includes(quote) || doc.title.includes(quote))
    ? quote
    : undefined;
}
