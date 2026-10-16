/** Split around the first literal case-insensitive quote without invoking RegExp. */
export type HighlightPart = { text: string; highlighted: boolean };

export function splitFirstLiteralHighlight(
  text: string,
  quote: string | null,
): HighlightPart[] {
  if (!quote) return [{ text, highlighted: false }];
  const position = text.toLowerCase().indexOf(quote.toLowerCase());
  if (position === -1) return [{ text, highlighted: false }];
  const end = position + quote.length;
  return [
    ...(position > 0 ? [{ text: text.slice(0, position), highlighted: false }] : []),
    { text: text.slice(position, end), highlighted: true },
    ...(end < text.length ? [{ text: text.slice(end), highlighted: false }] : []),
  ];
}
