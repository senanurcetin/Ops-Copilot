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
  // A one- or two-character substring is too weak to use as evidence for
  // industrial operator guidance (for example "a" found in any manual).
  if (Array.from(quote).length < 3 || quote.length > 500) return undefined;
  // Reject invisible/bidirectional format markers and control characters:
  // source text can be untrusted, and such "verbatim" quotes are not
  // reliably inspectable by operators or accessibility tools.
  const unsafeQuote = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
  if (unsafeQuote.test(quote)) return undefined;
  return documents.some(doc => doc.content.includes(quote) || doc.title.includes(quote))
    ? quote
    : undefined;
}
