import type { QuantitativeDataset, QuantitativeObservation } from '../reports/api';

// Layer 1 of the top 10 insight: deterministic arithmetic on the saved CSV only.
// No AI call. The % cell is used only to cross-check digits, because the source
// file has lost its decimal position in those cells.
// The filter (Lượt tải / Doanh thu / Tăng trưởng / Kết hợp) only chooses which
// arithmetic ranking is shown. No composite score is created.

export type NewGameStatus = 'has_prior' | 'new' | 'release_conflict' | 'release_unknown';

export type Top10Row = {
  rank: number;
  name: string;
  sourceRow: number | null;
  publisher: string | null;
  releaseDate: string | null;
  downloads: number;
  growthAbsolute: number | null;
  priorDownloads: number | null;
  growthRatio: number | null;
  growthCheck: 'matched' | 'mismatch' | 'no_cell' | 'no_prior';
  newStatus: NewGameStatus;
  revenue: number | null;
  dau: number | null;
  zeroRevenue: boolean;
  growthExceedsAbsolute: boolean;
  // True when the % comes from a tiny prior-year base (growth ≥ 10× prior, i.e. ≥ +1.000%). The raw % is still shown.
  smallBaseGrowth: boolean;
};

// Threshold: a prior-year base at most one-eleventh of current downloads. Above it, a small change in the base
// dominates the percentage, so the % is shown with a warning and never capped or hidden.
export const GROWTH_SMALL_BASE_RATIO = 10;

export type RepeatedPublisher = { publisher: string; count: number; games: string[] };

export type Top10Insight = {
  rows: Top10Row[];
  rankableCount: number;
  noPriorCount: number;
  newCount: number;
  checkCount: number;
  repeatedPublishers: RepeatedPublisher[];
  allNoPriorCount: number;
  allNewCount: number;
  allCheckCount: number;
  unreadableDownloads: number;
  growthExceedsAbsoluteCount: number;
  referenceDate: string | null;
  referenceSource: 'period_end' | 'snapshot' | null;
  snapshotDate: string | null;
  invalidSnapshotText: string | null;
  periodConfirmed: { start: string; end: string } | null;
  geoConfirmed: string | null;
  platformInFile: string | null;
  filenamePeriodEnd: string | null;
  warnings: string[];
};

const NUMERIC_TEXT = /non-numeric value '([^']+)'/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_FIRST_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function numberOf(row?: QuantitativeObservation | null): number | null {
  if (!row || row.value === null || row.value === undefined) return null;
  const value = Number(row.value);
  return Number.isFinite(value) ? value : null;
}

// The raw % text is kept in the import reason, e.g. "... non-numeric value '15.048.858'".
function percentCellText(row?: QuantitativeObservation | null): string | null {
  if (!row || numberOf(row) !== null) return null;
  for (const reason of row.validation_reasons ?? []) {
    const match = NUMERIC_TEXT.exec(reason);
    if (match) return match[1];
  }
  return null;
}

// Compare significant digits only: the cell's decimal point is unreliable.
export function percentCellMatches(cellText: string, ratio: number): boolean {
  const cell = cellText.replace(/[^0-9]/g, '').replace(/^0+/, '').replace(/0+$/, '');
  const expected = String(Math.round(Math.abs(ratio) * 1_000_000)).replace(/0+$/, '');
  return cell.length > 0 && cell === expected;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function top10TodayIso() {
  return isoDate(new Date());
}

// Accepts YYYY-MM-DD or the CSV's day-first DD/MM/YYYY. Returns ISO or null; never guesses.
export function parseCalendarDate(text: string | null | undefined): string | null {
  const value = (text ?? '').trim();
  let year: number, month: number, day: number;
  const iso = ISO_DATE.exec(value);
  const dayFirst = DAY_FIRST_DATE.exec(value);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dayFirst) [day, month, year] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])];
  else return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatIsoAsVi(iso: string | null): string | null {
  const valid = parseCalendarDate(iso);
  if (!valid) return null;
  const [y, m, d] = valid.split('-');
  return `${d}/${m}/${y}`;
}

// Same date one year earlier, used as the prior-year reference point.
function priorYearOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(y - 1).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "(Oct 14, 2026 - Nov 13, 2026" -> "2026-11-13". Only used for the warning, never as the period.
const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
export function filenamePeriodEnd(filename: string): string | null {
  const match = /\(([A-Za-z]{3}) (\d{1,2}), (\d{4}) - ([A-Za-z]{3}) (\d{1,2}), (\d{4})/.exec(filename);
  if (!match || !MONTHS[match[4]]) return null;
  return parseCalendarDate(`${match[6]}-${MONTHS[match[4]]}-${match[5].padStart(2, '0')}`);
}

function isUnknownScope(value: string | null | undefined) {
  return !value || ['unknown', 'unspecified', 'global / not specified', 'not specified', 'n/a'].includes(value.trim().toLocaleLowerCase());
}

function confirmedBy(rows: QuantitativeObservation[], field: string) {
  return rows.some((row) => row.metadata_provenance?.[field]?.basis === 'po_confirmed');
}

// A game is "new" only when there is no prior-year downloads AND its release date fits the
// prior-year gap: released after the prior-year reference point and not after the reference.
function classifyNew(hasPrior: boolean, releaseDate: string | null, reference: string | null): NewGameStatus {
  if (hasPrior) return 'has_prior';
  if (!releaseDate || !reference) return 'release_unknown';
  if (releaseDate > reference) return 'release_conflict';
  if (releaseDate > priorYearOf(reference)) return 'new';
  return 'release_conflict';
}

type Product = {
  name: string;
  sourceRow: number | null;
  publisher: string | null;
  releaseDate: string | null;
  downloadsRow?: QuantitativeObservation;
  growthRow?: QuantitativeObservation;
  percentRow?: QuantitativeObservation;
  revenueRow?: QuantitativeObservation;
  revenue: number | null;
  dau: number | null;
  downloads: number | null;
};

// One CSV row = one product. Only the metrics the ranking needs are read here.
function buildProducts(dataset: QuantitativeDataset): Product[] {
  const byRow = new Map<number, QuantitativeObservation[]>();
  for (const row of dataset.observations) {
    const key = row.source_row_number ?? -1;
    byRow.set(key, [...(byRow.get(key) ?? []), row]);
  }
  return [...byRow.entries()].filter(([key]) => key >= 0).map(([, rows]): Product => {
    const by = (metric: string) => rows.find((row) => row.metric_id === metric);
    const downloads = by('downloads_absolute');
    const revenueRow = by('revenue_absolute');
    return {
      name: downloads?.source_entity_name ?? downloads?.entity_name ?? rows[0]?.source_entity_name ?? 'Chưa rõ tên',
      sourceRow: downloads?.source_row_number ?? rows[0]?.source_row_number ?? null,
      publisher: (downloads?.source_publisher_name ?? rows[0]?.source_publisher_name ?? '').trim() || null,
      releaseDate: parseCalendarDate(downloads?.source_release_date ?? rows[0]?.source_release_date ?? null),
      downloadsRow: downloads,
      growthRow: by('downloads_yoy_growth_absolute'),
      percentRow: by('downloads_yoy_growth_percent'),
      revenueRow,
      revenue: numberOf(revenueRow),
      dau: numberOf(by('dau_absolute')),
      downloads: numberOf(downloads),
    };
  });
}

type RowMetrics = Omit<Top10Row, 'rank'> & { hasNewShape: boolean };

// Growth fields for one product. Prior-year downloads = downloads − growth (absolute).
function metricsFor(product: Product, referenceDate: string | null): RowMetrics | null {
  if (product.downloads === null) return null;
  const growth = numberOf(product.growthRow);
  const prior = growth === null ? null : product.downloads - growth;
  const ratio = prior !== null && prior > 0 && growth !== null ? growth / prior : null;
  let growthCheck: Top10Row['growthCheck'] = 'no_prior';
  if (ratio !== null) {
    const cell = percentCellText(product.percentRow);
    growthCheck = cell === null ? 'no_cell' : percentCellMatches(cell, ratio) ? 'matched' : 'mismatch';
  }
  const hasPrior = prior !== null && prior > 0;
  return {
    name: product.name,
    sourceRow: product.sourceRow,
    publisher: product.publisher,
    releaseDate: product.releaseDate,
    downloads: product.downloads,
    growthAbsolute: growth,
    priorDownloads: hasPrior ? prior : null,
    growthRatio: ratio,
    growthCheck,
    newStatus: classifyNew(hasPrior, product.releaseDate, referenceDate),
    revenue: product.revenue,
    dau: product.dau,
    zeroRevenue: product.revenue === 0,
    growthExceedsAbsolute: growth !== null && growth > product.downloads,
    smallBaseGrowth: ratio !== null && ratio >= GROWTH_SMALL_BASE_RATIO,
    // Exactly no prior year (growth equals downloads). A negative prior is a data error, not "new".
    hasNewShape: growth !== null && product.downloads - growth === 0,
  };
}

export function computeTop10Insight(dataset: QuantitativeDataset, today: string = top10TodayIso()): Top10Insight {
  // Reference date: the period end if a period is confirmed, otherwise the snapshot date in the CSV.
  const periodEnds = dataset.observations.map((row) => parseCalendarDate(row.period_end)).filter((value): value is string => Boolean(value));
  const snapshots = dataset.observations.map((row) => row.snapshot_date).filter((value): value is string => Boolean(value));
  const validSnapshots = [...new Set(snapshots.map((value) => parseCalendarDate(value)).filter((value): value is string => Boolean(value)))];
  const referenceFromPeriod = periodEnds.length ? [...periodEnds].sort().at(-1) ?? null : null;
  const referenceDate = referenceFromPeriod ?? (validSnapshots.length === 1 ? validSnapshots[0] : null);
  const referenceSource = referenceFromPeriod ? 'period_end' : referenceDate ? 'snapshot' : null;

  const products = buildProducts(dataset);
  const ranked = products
    .filter((product): product is Product & { downloads: number } => product.downloads !== null)
    .sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name));

  const top = ranked.slice(0, 10).map((product, index): Top10Row => {
    const { hasNewShape: _unused, ...row } = metricsFor(product, referenceDate)!;
    void _unused;
    return { rank: index + 1, ...row };
  });

  // Repeated publishers within the top 10, grouped case-insensitively, shown with the first spelling seen.
  const publisherGroups = new Map<string, { publisher: string; games: string[] }>();
  for (const row of top) {
    if (!row.publisher) continue;
    const key = row.publisher.toLocaleLowerCase();
    const group = publisherGroups.get(key) ?? { publisher: row.publisher, games: [] };
    group.games.push(row.name);
    publisherGroups.set(key, group);
  }
  const repeatedPublishers = [...publisherGroups.values()]
    .filter((group) => group.games.length >= 2)
    .map((group) => ({ publisher: group.publisher, count: group.games.length, games: group.games }))
    .sort((a, b) => b.count - a.count || a.publisher.localeCompare(b.publisher));

  const allClassified = products
    .map((product) => {
      const growth = numberOf(product.growthRow);
      const downloads = numberOf(product.downloadsRow);
      if (growth === null || downloads === null) return null;
      return classifyNew(downloads - growth > 0, product.releaseDate, referenceDate);
    })
    .filter((status): status is NewGameStatus => status !== null && status !== 'has_prior');

  const allGrowthExceeds = products.filter((product) => {
    const growth = numberOf(product.growthRow);
    const downloads = numberOf(product.downloadsRow);
    return growth !== null && downloads !== null && growth > downloads;
  }).length;

  const noPriorTop = top.filter((row) => row.newStatus !== 'has_prior');
  const geoValues = [...new Set(dataset.observations.map((row) => row.geo).filter((value): value is string => !isUnknownScope(value)))];
  const platforms = [...new Set(dataset.observations.map((row) => row.platform).filter((value): value is string => !isUnknownScope(value)))];
  const filenameEnd = filenamePeriodEnd(dataset.filename);
  const periodRows = dataset.observations.filter((row) => row.period_start && row.period_end);
  const periodStarts = [...new Set(periodRows.map((row) => parseCalendarDate(row.period_start)).filter((value): value is string => Boolean(value)))];
  const periodEndsValid = [...new Set(periodRows.map((row) => parseCalendarDate(row.period_end)).filter((value): value is string => Boolean(value)))];
  const periodConfirmed = confirmedBy(dataset.observations, 'period_start') && periodStarts.length === 1 && periodEndsValid.length === 1
    ? { start: periodStarts[0], end: periodEndsValid[0] } : null;
  const geoConfirmed = confirmedBy(dataset.observations, 'geo') && geoValues.length === 1 ? geoValues[0] : null;

  const snapshotDate = validSnapshots.length === 1 ? validSnapshots[0] : null;
  const invalidSnapshotText = snapshots.length > 0 && validSnapshots.length === 0
    ? 'Ngày trong CSV không đọc được (cột Date chưa đúng định dạng)'
    : snapshots.length > 0 && validSnapshots.length > 1 ? 'Các dòng CSV ghi nhiều ngày khác nhau' : null;

  const warnings: string[] = [];
  if (filenameEnd && filenameEnd > today) warnings.push(`Tên tệp ghi kỳ kết thúc ${formatIsoAsVi(filenameEnd)}, sau ngày hôm nay (${formatIsoAsVi(today)}). Kiểm tra lại tệp trước khi dùng số liệu.`);
  if (snapshotDate && snapshotDate > today) warnings.push(`Ngày trong CSV (${formatIsoAsVi(snapshotDate)}) sau ngày hôm nay (${formatIsoAsVi(today)}).`);
  if (invalidSnapshotText) warnings.push(`${invalidSnapshotText}. Số liệu vẫn xem được, nhưng không xác định được kỳ.`);
  if (allGrowthExceeds > 0) warnings.push(`${allGrowthExceeds} sản phẩm có tăng trưởng lớn hơn lượt tải tuyệt đối. Số này không đáng tin nếu chưa kiểm tra.`);

  return {
    rows: top,
    rankableCount: ranked.length,
    noPriorCount: noPriorTop.length,
    newCount: top.filter((row) => row.newStatus === 'new').length,
    checkCount: top.filter((row) => row.newStatus === 'release_conflict' || row.newStatus === 'release_unknown').length,
    repeatedPublishers,
    allNoPriorCount: allClassified.length,
    allNewCount: allClassified.filter((status) => status === 'new').length,
    allCheckCount: allClassified.filter((status) => status !== 'new').length,
    unreadableDownloads: products.length - ranked.length,
    growthExceedsAbsoluteCount: allGrowthExceeds,
    referenceDate,
    referenceSource,
    snapshotDate,
    invalidSnapshotText,
    periodConfirmed,
    geoConfirmed,
    platformInFile: platforms.length === 1 ? platforms[0] : null,
    filenamePeriodEnd: filenameEnd,
    warnings,
  };
}

// ---- Filter lenses -------------------------------------------------------------------------

export type Top10Lens = 'downloads' | 'revenue' | 'growth' | 'combined';

export const TOP10_LENS_LABELS: Record<Top10Lens, string> = {
  downloads: 'Lượt tải',
  revenue: 'Doanh thu',
  growth: 'Tăng trưởng',
  combined: 'Kết hợp',
};

export type Top10Rankings = {
  productCount: number;
  // Each list is at most 10 rows, ranked by its own arithmetic.
  downloads: Top10Row[];
  revenue: Top10Row[];
  growth: Top10Row[];
  // Games with no prior-year downloads. Listed separately; never mixed into the % ranking.
  newGames: Top10Row[];
  revenueAvailable: boolean;
  growthAvailable: boolean;
  growthEligibleCount: number;
  revenueCurrencyConfirmed: boolean;
  revenueUnit: string | null;
  // Games in more than one of the three top 10 lists (for Kết hợp).
  overlap: Array<{ key: string; name: string; lists: Array<'downloads' | 'revenue' | 'growth'> }>;
};

function withRank(rows: RowMetrics[]): Top10Row[] {
  return rows.slice(0, 10).map((row, index) => {
    const { hasNewShape: _unused, ...rest } = row;
    void _unused;
    return { rank: index + 1, ...rest };
  });
}

export function computeTop10Rankings(dataset: QuantitativeDataset, today: string = top10TodayIso()): Top10Rankings {
  const insight = computeTop10Insight(dataset, today);
  const referenceDate = insight.referenceDate;
  const products = buildProducts(dataset);
  const metrics = products.map((product) => metricsFor(product, referenceDate)).filter((row): row is RowMetrics => row !== null);

  const downloadsRanked = [...metrics].sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name));
  const revenueRanked = metrics.filter((row) => row.revenue !== null)
    .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0) || b.downloads - a.downloads || a.name.localeCompare(b.name));
  const growthRanked = metrics.filter((row) => row.growthRatio !== null)
    .sort((a, b) => (b.growthRatio ?? 0) - (a.growthRatio ?? 0) || a.name.localeCompare(b.name));
  const newRanked = metrics.filter((row) => row.hasNewShape)
    .sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name));

  const downloadsTop = withRank(downloadsRanked);
  const revenueTop = withRank(revenueRanked);
  const growthTop = withRank(growthRanked);

  const listsByKey = new Map<string, { name: string; lists: Array<'downloads' | 'revenue' | 'growth'> }>();
  const addTo = (list: Top10Row[], label: 'downloads' | 'revenue' | 'growth') => {
    for (const row of list) {
      const key = String(row.sourceRow ?? row.name);
      const entry = listsByKey.get(key) ?? { name: row.name, lists: [] };
      entry.lists.push(label);
      listsByKey.set(key, entry);
    }
  };
  addTo(downloadsTop, 'downloads');
  addTo(revenueTop, 'revenue');
  addTo(growthTop, 'growth');
  const overlap = [...listsByKey.entries()]
    .filter(([, entry]) => entry.lists.length >= 2)
    .map(([key, entry]) => ({ key, name: entry.name, lists: entry.lists }));

  const revenueRows = dataset.observations.filter((row) => row.metric_id === 'revenue_absolute');
  return {
    productCount: products.length,
    downloads: downloadsTop,
    revenue: revenueTop,
    growth: growthTop,
    newGames: newRanked.map((row, index) => ({ rank: index + 1, ...withoutShape(row) })),
    revenueAvailable: revenueRanked.length > 0,
    growthAvailable: growthRanked.length > 0,
    growthEligibleCount: growthRanked.length,
    // Currency is unconfirmed until the PO confirms the unit for the revenue metric.
    revenueCurrencyConfirmed: revenueRows.some((row) => row.metadata_provenance?.unit?.basis === 'po_confirmed'),
    revenueUnit: revenueRows.find((row) => row.unit)?.unit ?? null,
    overlap,
  };
}

function withoutShape(row: RowMetrics): Omit<Top10Row, 'rank'> {
  const { hasNewShape: _unused, ...rest } = row;
  void _unused;
  return rest;
}

// Table rows for one lens. Kết hợp has no single top 10, so it returns an empty list here.
export function rowsForLens(rankings: Top10Rankings, lens: Top10Lens): Top10Row[] {
  if (lens === 'revenue') return rankings.revenue;
  if (lens === 'growth') return rankings.growth;
  if (lens === 'combined') return [];
  return rankings.downloads;
}

// Lenses the file can actually support. Hidden lenses are explained, not shown empty.
export function availableLenses(rankings: Top10Rankings): Top10Lens[] {
  const lenses: Top10Lens[] = ['downloads'];
  if (rankings.revenueAvailable) lenses.push('revenue');
  if (rankings.growthAvailable) lenses.push('growth');
  if (lenses.length >= 2) lenses.push('combined');
  return lenses;
}

// Highlight cards for a lens. Every value comes from the rankings; a card is omitted when its data is missing.
export type Top10Highlight = { id: string; label: string; value: string; detail: string };

const HL_NUMBER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const HL_PERCENT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

function repeatedPublisherCard(rows: Top10Row[]): Top10Highlight | null {
  const groups = new Map<string, { publisher: string; games: string[] }>();
  for (const row of rows) {
    if (!row.publisher) continue;
    const key = row.publisher.toLocaleLowerCase();
    const group = groups.get(key) ?? { publisher: row.publisher, games: [] };
    group.games.push(row.name);
    groups.set(key, group);
  }
  const repeated = [...groups.values()].filter((group) => group.games.length >= 2);
  if (!repeated.length) return null;
  return { id: 'publisher', label: 'Nhà phát hành xuất hiện nhiều lần', value: repeated.map((group) => group.publisher).join(', '), detail: repeated.map((group) => `${group.publisher}: ${group.games.length} game`).join(' · ') };
}

export function top10Highlights(insight: Top10Insight): Top10Highlight[] {
  const out: Top10Highlight[] = [];
  const leader = insight.rows[0];
  if (leader) {
    out.push({ id: 'leader', label: 'Dẫn đầu theo lượt tải', value: leader.name, detail: `${HL_NUMBER.format(leader.downloads)} lượt tải · ${leader.publisher ?? 'chưa rõ nhà phát hành'}` });
  }
  const newGames = insight.rows.filter((row) => row.newStatus === 'new');
  if (newGames.length > 0) {
    out.push({ id: 'new', label: 'Game mới trong top 10', value: `${newGames.length} game`, detail: newGames.map((row) => row.name).join(', ') });
  }
  const withRevenue = insight.rows.filter((row) => row.revenue !== null && row.revenue > 0);
  if (withRevenue.length > 0) {
    const top = withRevenue.reduce((best, row) => (row.revenue! > best.revenue! ? row : best));
    out.push({ id: 'revenue', label: 'Doanh thu cao nhất trong top 10', value: HL_NUMBER.format(top.revenue!), detail: `${top.name} · đơn vị doanh thu: xem phần xác nhận` });
  }
  if (insight.repeatedPublishers.length > 0) {
    const pubs = insight.repeatedPublishers;
    out.push({ id: 'publisher', label: 'Nhà phát hành xuất hiện nhiều lần', value: pubs.map((pub) => pub.publisher).join(', '), detail: pubs.map((pub) => `${pub.publisher}: ${pub.count} game`).join(' · ') });
  }
  const zeroRevenue = insight.rows.filter((row) => row.revenue === 0);
  if (zeroRevenue.length > 0) {
    const biggest = zeroRevenue.reduce((best, row) => (row.downloads > best.downloads ? row : best));
    out.push({ id: 'gap', label: 'Lượt tải cao nhất nhưng doanh thu 0 trong CSV', value: `${HL_NUMBER.format(biggest.downloads)} lượt tải`, detail: `${biggest.name} · doanh thu 0 không có nghĩa là game không kiếm tiền` });
  }
  return out.slice(0, 5);
}

export function top10HighlightsForLens(lens: Top10Lens, insight: Top10Insight, rankings: Top10Rankings): Top10Highlight[] {
  if (lens === 'downloads') return top10Highlights(insight);
  if (lens === 'revenue') {
    const rows = rankings.revenue;
    const out: Top10Highlight[] = [];
    const leader = rows[0];
    if (leader) out.push({ id: 'leader', label: 'Dẫn đầu theo doanh thu', value: leader.name, detail: `${HL_NUMBER.format(leader.revenue ?? 0)} · đơn vị: ${rankings.revenueCurrencyConfirmed ? (rankings.revenueUnit ?? '') : 'chưa xác nhận'}` });
    const sum = rows.reduce((total, row) => total + (row.revenue ?? 0), 0);
    if (rows.length) out.push({ id: 'revenue', label: 'Tổng doanh thu 10 game đầu trong tệp', value: HL_NUMBER.format(sum), detail: `Chỉ tính các game trong tệp này · đơn vị: ${rankings.revenueCurrencyConfirmed ? (rankings.revenueUnit ?? '') : 'chưa xác nhận'}` });
    const publisher = repeatedPublisherCard(rows);
    if (publisher) out.push(publisher);
    return out.slice(0, 5);
  }
  if (lens === 'growth') {
    const rows = rankings.growth;
    const out: Top10Highlight[] = [];
    const leader = rows[0];
    if (leader && leader.growthRatio !== null) out.push({ id: 'leader', label: 'Tăng trưởng cao nhất (có năm trước)', value: `+${HL_PERCENT.format(leader.growthRatio * 100)}%`, detail: leader.smallBaseGrowth ? `${leader.name} · ${HL_NUMBER.format(leader.downloads)} lượt tải · CẦN KIỂM TRA: năm trước rất nhỏ, % không đáng tin` : `${leader.name} · ${HL_NUMBER.format(leader.downloads)} lượt tải` });
    if (rankings.newGames.length) out.push({ id: 'new', label: 'Game mới (không có năm trước, không xếp %)', value: `${rankings.newGames.length} game`, detail: rankings.newGames.map((row) => row.name).join(', ') });
    out.push({ id: 'gap', label: 'Game có thể xếp % tăng trưởng', value: `${rankings.growthEligibleCount}/${rankings.productCount}`, detail: 'Các game còn lại không có số năm trước trong tệp nên không xếp % được' });
    const publisher = repeatedPublisherCard(rows);
    if (publisher) out.push(publisher);
    return out.slice(0, 5);
  }
  const out: Top10Highlight[] = [];
  const first = (list: Top10Row[]) => list[0];
  const d = first(rankings.downloads), r = first(rankings.revenue), g = first(rankings.growth);
  if (d) out.push({ id: 'leader', label: 'Đứng đầu lượt tải', value: d.name, detail: `${HL_NUMBER.format(d.downloads)} lượt tải` });
  if (r) out.push({ id: 'revenue', label: 'Đứng đầu doanh thu', value: r.name, detail: `${HL_NUMBER.format(r.revenue ?? 0)} · đơn vị: ${rankings.revenueCurrencyConfirmed ? (rankings.revenueUnit ?? '') : 'chưa xác nhận'}` });
  if (g && g.growthRatio !== null) out.push({ id: 'growth', label: 'Đứng đầu tăng trưởng', value: g.name, detail: `+${HL_PERCENT.format(g.growthRatio * 100)}%` });
  if (rankings.overlap.length) out.push({ id: 'new', label: 'Xuất hiện ở nhiều bảng xếp hạng', value: `${rankings.overlap.length} game`, detail: rankings.overlap.map((item) => item.name).join(', ') });
  return out.slice(0, 5);
}

// Every game in a saved dataset, keyed by its CSV source row, with the same arithmetic as the rankings.
// Used by the report's number block to read the games it was linked to; rank is 0 because no ranking applies.
export function top10RowsBySourceRow(dataset: QuantitativeDataset, today: string = top10TodayIso()): Map<number, Top10Row> {
  const referenceDate = computeTop10Insight(dataset, today).referenceDate;
  const rows = new Map<number, Top10Row>();
  for (const product of buildProducts(dataset)) {
    if (product.sourceRow === null) continue;
    const metrics = metricsFor(product, referenceDate);
    if (metrics) rows.set(product.sourceRow, { rank: 0, ...withoutShape(metrics) });
  }
  return rows;
}
