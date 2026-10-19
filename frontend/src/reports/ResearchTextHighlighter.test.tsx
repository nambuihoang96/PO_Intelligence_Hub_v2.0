// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResearchTextHighlighter } from './ResearchTextHighlighter';
import { findingIcon } from '../ui/ResultsIcon';

describe('ResearchTextHighlighter', () => {
  it('highlights rank positions and report-supplied ranking category phrases', () => {
    const text = 'Surprise Dumpling đạt #5 Top Free Casual và #28 Top Free Games.';
    const { container } = render(<ResearchTextHighlighter text={text} />);
    expect(container.textContent).toBe(text);
    expect([...container.querySelectorAll('[data-highlight-kind="rank"]')].map((node) => node.textContent)).toEqual(['#5', '#28']);
    expect([...container.querySelectorAll('[data-highlight-kind="category"]')].map((node) => node.textContent)).toEqual(['Top Free Casual', 'Top Free Games']);
  });

  it('highlights arbitrary Top N category names without a fixed category taxonomy', () => {
    const { container } = render(<ResearchTextHighlighter text="#47 Top 50 Casual US." />);
    expect(container.querySelector('[data-highlight-kind="category"]')?.textContent).toBe('Top 50 Casual');
  });

  it('highlights compact metric comparisons and only marks an explicitly stated decline', () => {
    const text = 'Weekly downloads giảm từ 23.7K xuống 11K.';
    const { container } = render(<ResearchTextHighlighter text={text} />);
    expect(container.textContent).toBe(text);
    const values = [...container.querySelectorAll('[data-highlight-kind="metric"]')];
    expect(values.map((node) => node.textContent)).toEqual(['23.7K', '11K']);
    expect(values.every((node) => node.classList.contains('is-decrease'))).toBe(true);
  });

  it('supports percentage changes while leaving unsupported units and unrelated numbers plain', () => {
    const text = 'Growth +18.2%; report ID 4821, source reference #123, 2026-10-19 and 42 users.';
    const { container } = render(<ResearchTextHighlighter text={text} />);
    expect(container.querySelector('[data-highlight-kind="metric"]')?.textContent).toBe('+18.2%');
    expect(container.textContent).toBe(text);
    expect(container.querySelectorAll('[data-highlight-kind="rank"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-highlight-kind="period"]')).toHaveLength(0);
  });

  it('highlights research periods but not calendar dates', () => {
    const text = 'Observed in Q2/2025 and 8/2026; imported 19/10/2026.';
    const { container } = render(<ResearchTextHighlighter text={text} />);
    expect([...container.querySelectorAll('[data-highlight-kind="period"]')].map((node) => node.textContent)).toEqual(['Q2/2025', '8/2026']);
    expect(container.textContent).toBe(text);
  });

  it('renders HTML-like report text as escaped React text', () => {
    const text = '<script>alert(1)</script> achieved #5.';
    const { container } = render(<ResearchTextHighlighter text={text} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toBe(text);
  });

  it('keeps long Vietnamese text intact and defaults unknown finding types to a neutral icon', () => {
    const text = 'Người chơi lựa chọn nhiều cách sáng tạo khác nhau. '.repeat(80);
    const { container } = render(<ResearchTextHighlighter text={text} />);
    expect(container.textContent).toBe(text);
    expect(container.firstElementChild?.classList.contains('research-text')).toBe(true);
    expect(findingIcon('unrecognized report type')).toBe('findings');
  });
});
