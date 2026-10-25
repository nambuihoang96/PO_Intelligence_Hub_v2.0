/**
 * Historical dataset identity is SHA-256 over UTF-8-SIG encoded text.
 * Normalize only the optional physical leading BOM before encoding, so BOM and
 * non-BOM copies share the established dataset identity without changing the
 * original CSV string stored by the importer. Line endings and all other text
 * remain significant. This is not a raw-file checksum.
 */
export function canonicalCsvIdentityBytes(csvContent: string): Uint8Array {
  const contentWithoutOptionalBom = csvContent.startsWith('\uFEFF')
    ? csvContent.slice(1)
    : csvContent;
  return new TextEncoder().encode(`\uFEFF${contentWithoutOptionalBom}`);
}
