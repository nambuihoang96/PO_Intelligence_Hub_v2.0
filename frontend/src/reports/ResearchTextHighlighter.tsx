import type { ReactNode } from 'react';

type HighlightKind = 'rank' | 'category' | 'metric' | 'period';
type HighlightToken = { start: number; end: number; kind: HighlightKind; direction?: 'increase' | 'decrease' };

// Presentation-only recognition: these patterns never create or alter research data.
const highlightPattern = /\btop\s+(?:(?:\d{1,3}|free|grossing|downloads?)(?:\s+(?!at\b|in\b|for\b|tại\b|ngày\b|on\b)[\p{L}\p{N}&'’–-]+){0,2})|#\d{1,3}\b|[$€£¥₫]\s?[+-]?\d[\d,.]*(?:\s?[KMB])?|[+-]?\d[\d,.]*\s?(?:K|M|B|%)(?!\p{L})|\bQ[1-4]\s?\/\s?\d{4}\b|\b(?:0?[1-9]|1[0-2])\/\d{4}\b|\b\d{4}\s*[–—-]\s*\d{4}\b/giu;
const nonCategoryWords = new Set(['at', 'in', 'for', 'to', 'on', 'and', 'và', 'from', 'with', 'by', 'tại', 'ngày', 'đạt', 'reached', 'ranked', 'giảm', 'tăng', 'us', 'vn', 'jp', 'kr', 'eu', 'worldwide', 'global', 'android', 'ios', 'web', 'desktop']);

function tokensFor(text: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  highlightPattern.lastIndex = 0;
  for (const match of text.matchAll(highlightPattern)) {
    const value = match[0];
    const start = match.index ?? 0;
    let kind: HighlightKind;
    if (/^top\s/i.test(value)) {
      kind = 'category';
      // Ranking categories are a phrase, not the following geography/platform/period.
      const words = value.split(/\s+/);
      while (words.length > 1 && nonCategoryWords.has(words.at(-1)!.toLocaleLowerCase())) words.pop();
      const normalized = words.join(' ');
      if (normalized !== value) {
        const end = start + normalized.length;
        tokens.push({ start, end, kind });
        continue;
      }
    } else if (/^#\d/.test(value)) {
      const before = text.slice(Math.max(0, start - 16), start);
      if (/(?:source|reference|ref|id)\s*$/i.test(before)) continue;
      kind = 'rank';
    } else if (/^Q[1-4]\s*\/|^(?:0?[1-9]|1[0-2])\/\d{4}$|^\d{4}\s*[–—-]\s*\d{4}$/i.test(value)) {
      if (/(?:^|\D)\d{1,2}\/$/.test(text.slice(0, start))) continue;
      kind = 'period';
    } else {
      kind = 'metric';
    }
    tokens.push({ start, end: start + value.length, kind });
  }

  // Color a metric only when nearby report wording explicitly states direction.
  for (const token of tokens.filter((item) => item.kind === 'metric')) {
    const before = text.slice(Math.max(0, token.start - 42), token.start);
    const betweenAndAfter = text.slice(token.end, Math.min(text.length, token.end + 34));
    if (/(?:declin\w*|decreas\w*|drop\w*|fell|fall\w*|reduc\w*|giảm|sụt|xuống|lower|down)\b/i.test(before)) token.direction = 'decrease';
    else if (/(?:increas\w*|grew|grow\w*|ris\w*|gain\w*|tăng|tăng trưởng|lên|higher|up)\b/i.test(before)) token.direction = 'increase';
    else if (/(?:declin\w*|decreas\w*|drop\w*|fell|fall\w*|reduc\w*|giảm|sụt|xuống|lower|down)\b/i.test(betweenAndAfter)) token.direction = 'decrease';
    else if (/(?:increas\w*|grew|grow\w*|ris\w*|gain\w*|tăng|tăng trưởng|lên|higher|up)\b/i.test(betweenAndAfter)) token.direction = 'increase';
  }
  return tokens;
}

/** Safe inline highlighting that leaves the source string intact and creates no research facts. */
export function ResearchTextHighlighter({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const tokens = tokensFor(text);
  if (!tokens.length) return <span className={className ? `research-text ${className}` : 'research-text'}>{text}</span>;
  const children: ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, index) => {
    if (token.start < cursor) return;
    if (token.start > cursor) children.push(text.slice(cursor, token.start));
    const value = text.slice(token.start, token.end);
    const direction = token.direction ? ` is-${token.direction}` : '';
    children.push(<span className={`research-highlight is-${token.kind}${direction}`} data-highlight-kind={token.kind} key={`${token.start}-${index}`}>{value}</span>);
    cursor = token.end;
  });
  if (cursor < text.length) children.push(text.slice(cursor));
  return <span className={className ? `research-text ${className}` : 'research-text'}>{children}</span>;
}
