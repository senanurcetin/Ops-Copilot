/** Split around the first literal case-insensitive quote without invoking RegExp. */
export type HighlightPart = { text: string; highlighted: boolean };

export function splitFirstLiteralHighlight(
  text: string,
  quote: string | null,
): HighlightPart[] {
  if (!quote) return [{ text, highlighted: false }];
  const lowerText = text.toLowerCase();
  const lowerQuote = quote.toLowerCase();
  let position = lowerText.indexOf(lowerQuote);
  // Unicode case folding can expand a character (e.g. Turkish capital İ).
  // In that case offsets into the lowercased string are NOT offsets into
  // the displayed source, so compare fixed-width original slices instead.
  if (lowerText.length !== text.length || lowerQuote.length !== quote.length) {
    position = -1;
    for (let i = 0; i <= text.length - quote.length; i++) {
      if (text.slice(i, i + quote.length).toLowerCase() === lowerQuote) {
        position = i;
        break;
      }
    }
  }
  if (position === -1) return [{ text, highlighted: false }];
  const end = position + quote.length;
  return [
    ...(position > 0 ? [{ text: text.slice(0, position), highlighted: false }] : []),
    { text: text.slice(position, end), highlighted: true },
    ...(end < text.length ? [{ text: text.slice(end), highlighted: false }] : []),
  ];
}
