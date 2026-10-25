import { describe, expect, it } from 'vitest';
import { canonicalCsvIdentityBytes } from './csvIdentity';

describe('canonicalCsvIdentityBytes', () => {
  it('matches the legacy UTF-8-SIG identity for byte-identical CSV text with or without one BOM', () => {
    const text = 'Tên ứng dụng;Downloads\r\nỨng dụng A;120\r\n';
    const withBom = `\uFEFF${text}`;

    expect(canonicalCsvIdentityBytes(withBom)).toEqual(canonicalCsvIdentityBytes(text));
    expect(Array.from(canonicalCsvIdentityBytes(withBom).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(Array.from(canonicalCsvIdentityBytes(withBom).slice(3, 6))).not.toEqual([0xef, 0xbb, 0xbf]);
  });

  it('keeps a second BOM, line-ending changes, and other content changes significant', () => {
    const text = 'Name;Metric\r\nApp;1\r\n';

    expect(canonicalCsvIdentityBytes(`\uFEFF\uFEFF${text}`)).not.toEqual(canonicalCsvIdentityBytes(`\uFEFF${text}`));
    expect(canonicalCsvIdentityBytes(text.replaceAll('\r\n', '\n'))).not.toEqual(canonicalCsvIdentityBytes(text));
    expect(canonicalCsvIdentityBytes(text.replace('App', 'Other'))).not.toEqual(canonicalCsvIdentityBytes(text));
  });
});
