// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownReport } from './MarkdownReport';

describe('MarkdownReport tables', () => {
  afterEach(cleanup);

  it('makes wide report tables keyboard-scrollable and identifies column headings', () => {
    render(<MarkdownReport markdown={'| Product | Completion rate |\n| --- | ---: |\n| Puzzle Quest | 62 percent |'} />);

    const tableRegion = screen.getByRole('region', { name: 'Bảng trong báo cáo · cuộn ngang để xem thêm cột' });
    expect(tableRegion.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('columnheader', { name: 'Product' }).getAttribute('scope')).toBe('col');
    expect(screen.getByRole('columnheader', { name: 'Completion rate' })).toBeDefined();
  });
});
