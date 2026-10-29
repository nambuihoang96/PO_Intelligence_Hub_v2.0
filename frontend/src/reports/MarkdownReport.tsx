import { Fragment, createElement, type ReactNode } from 'react';

type Heading = { level: number; text: string; id: string };

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase();
    if (host === 'invalid' || host.endsWith('.invalid')) return null;
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function inline(text: string): ReactNode[] {
  const matcher = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|(https?:\/\/[^\s<>]+)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      const href = safeHref(match[2]);
      nodes.push(href ? <a href={href} target="_blank" rel="noopener noreferrer" key={match.index}>{match[1]}</a> : match[1]);
    } else if (match[3] !== undefined) nodes.push(<code key={match.index}>{match[3]}</code>);
    else if (match[4] !== undefined || match[5] !== undefined) nodes.push(<strong key={match.index}>{match[4] ?? match[5]}</strong>);
    else if (match[6] !== undefined || match[7] !== undefined) nodes.push(<em key={match.index}>{match[6] ?? match[7]}</em>);
    else {
      const url = match[8].replace(/[.,;:!?]+$/, '');
      const trailing = match[8].slice(url.length);
      const href = safeHref(url);
      nodes.push(<Fragment key={match.index}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{url}</a> : url}{trailing}</Fragment>);
    }
    last = matcher.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}

function slug(text: string): string {
  return text.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

function plainHeading(text: string): string {
  return text.replace(/!?(\[([^\]]+)\])\([^)]+\)/g, '$2').replace(/[`*_~]/g, '').trim();
}

function headingId(text: string, counts: Map<string, number>): string {
  const base = slug(plainHeading(text));
  const count = (counts.get(base) ?? 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

export function extractHeadings(markdown: string): Heading[] {
  const counts = new Map<string, number>();
  let inFence = false;
  return markdown.split(/\r?\n/).flatMap((line) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return []; }
    if (inFence) return [];
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) return [];
    const text = plainHeading(match[2]);
    return [{ level: match[1].length, text, id: headingId(match[2], counts) }];
  });
}

export function MarkdownReport({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  const headingCounts = new Map<string, number>();
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^\s*```\s*([\w-]*)/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      blocks.push(createElement(`h${level}`, { id: headingId(text, headingCounts), key: `heading-${index}` }, inline(text)));
      index += 1;
      continue;
    }
    if (index + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(splitTableRow(lines[index++]));
      blocks.push(<div className="report-table-wrap" key={`table-${index}`}><table><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] ?? '')}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const listMatch = line.match(/^\s*([-*+] |\d+\. )/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:[-*+] |\d+\. )(.*)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</Tag>);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={`quote-${index}`}>{quote.map((item, itemIndex) => <p key={itemIndex}>{inline(item)}</p>)}</blockquote>);
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { blocks.push(<hr key={`hr-${index}`} />); index += 1; continue; }
    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^\s{0,3}#{1,6}\s/.test(lines[index]) && !/^\s*```/.test(lines[index]) && !/^\s*>/.test(lines[index]) && !/^\s*(?:[-*+] |\d+\. )/.test(lines[index])) paragraph.push(lines[index++].trim());
    blocks.push(<p key={`paragraph-${index}`}>{inline(paragraph.join(' '))}</p>);
  }
  return <div className="markdown-report">{blocks.length ? blocks : <p>{markdown}</p>}</div>;
}
