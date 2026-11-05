import { useMemo, useState } from 'react';
import type { NewGameStatus, Top10Insight, Top10Lens, Top10Rankings, Top10Row } from './top10Insight';
import './CsvTop10Insight.css';

// Compact, sortable top 10 table: rank, game, publisher, downloads, revenue, DAU, tag.
// Values are shown as they appear in the CSV; no calculation is added here.
// Under the growth filter, the DAU column is replaced by the recalculated growth %.

const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const pct1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

type SortKey = 'rank' | 'name' | 'publisher' | 'downloads' | 'revenue' | 'dau' | 'growth' | 'tag';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean }> = [
  { key: 'rank', label: 'Hạng', numeric: true },
  { key: 'name', label: 'Game', numeric: false },
  { key: 'publisher', label: 'Nhà phát hành', numeric: false },
  { key: 'downloads', label: 'Lượt tải', numeric: true },
  { key: 'revenue', label: 'Doanh thu', numeric: true },
  { key: 'dau', label: 'DAU', numeric: true },
  { key: 'tag', label: 'Trạng thái', numeric: false },
];

const GROWTH_COLUMNS: typeof COLUMNS = COLUMNS.map((column) => column.key === 'dau'
  ? { key: 'growth', label: 'Tăng trưởng', numeric: true } : column);

export function tagLabel(status: NewGameStatus): { text: string; kind: 'new' | 'check' | 'none' } {
  if (status === 'new') return { text: 'Game mới', kind: 'new' };
  if (status === 'release_conflict' || status === 'release_unknown') return { text: 'Cần kiểm tra', kind: 'check' };
  return { text: '—', kind: 'none' };
}

function sortValue(row: Top10Row, key: SortKey): number | string | null {
  switch (key) {
    case 'rank': return row.rank;
    case 'name': return row.name;
    case 'publisher': return row.publisher;
    case 'downloads': return row.downloads;
    case 'revenue': return row.revenue;
    case 'dau': return row.dau;
    case 'growth': return row.growthRatio;
    case 'tag': return tagLabel(row.newStatus).text;
  }
}

function compareRows(a: Top10Row, b: Top10Row, sort: NonNullable<SortState>) {
  const va = sortValue(a, sort.key), vb = sortValue(b, sort.key);
  // Missing values always sit at the bottom, whatever the direction.
  if (va === null && vb === null) return a.rank - b.rank;
  if (va === null) return 1;
  if (vb === null) return -1;
  const result = typeof va === 'number' && typeof vb === 'number'
    ? va - vb
    : String(va).localeCompare(String(vb), 'vi');
  return sort.dir === 'asc' ? result : -result;
}

export function CsvTop10Insight({ insight, rows: rowsProp, lens = 'downloads' }: { insight: Top10Insight; rows?: Top10Row[]; lens?: Top10Lens }) {
  const [sort, setSort] = useState<SortState>(null);
  const source = rowsProp ?? insight.rows;
  const columns = lens === 'growth' ? GROWTH_COLUMNS : COLUMNS;
  const rows = useMemo(() => (sort ? [...source].sort((a, b) => compareRows(a, b, sort)) : source), [source, sort]);

  function toggle(column: (typeof COLUMNS)[number]) {
    setSort((current) => {
      if (!current || current.key !== column.key) return { key: column.key, dir: column.numeric ? 'desc' : 'asc' };
      if (current.dir === (column.numeric ? 'desc' : 'asc')) return { key: column.key, dir: column.numeric ? 'asc' : 'desc' };
      return null;
    });
  }

  return (
    <div className="csv-top10-table-scroll" role="region" aria-label="Top 10 game theo bộ lọc đang chọn" tabIndex={0}>
      <table className="csv-top10-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const indicator = active ? (sort?.dir === 'asc' ? '↑' : '↓') : '↕';
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={column.key === 'name' ? 'csv-top10-col-name' : undefined}
                  aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" className="csv-top10-sort" onClick={() => toggle(column)}>
                    {column.label} <span aria-hidden="true">{indicator}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tag = tagLabel(row.newStatus);
            return (
              <tr key={`${row.rank}-${row.name}`}>
                <td className="csv-top10-num">{row.rank}</td>
                <th scope="row" className="csv-top10-col-name">{row.name}</th>
                <td>{row.publisher ?? <span className="csv-top10-missing">Chưa rõ</span>}</td>
                <td className="csv-top10-num">{nf0.format(row.downloads)}</td>
                <td className="csv-top10-num">
                  {row.revenue === null ? <span className="csv-top10-missing">Chưa có</span> : nf2.format(row.revenue)}
                  {row.zeroRevenue && <small> (0)</small>}
                </td>
                {lens === 'growth'
                  ? <td className="csv-top10-num">{row.growthRatio === null
                    ? <span className="csv-top10-missing">Không có năm trước</span>
                    : <>{`+${pct1.format(row.growthRatio * 100)}%`}{row.smallBaseGrowth && <small className="csv-top10-warning"> · CẦN KIỂM TRA: năm trước rất nhỏ</small>}</>}</td>
                  : <td className="csv-top10-num">{row.dau === null ? <span className="csv-top10-missing">Chưa có</span> : nf0.format(row.dau)}</td>}
                <td>{tag.kind === 'none' ? <span className="csv-top10-missing">—</span> : <span className={`csv-top10-tag csv-top10-tag--${tag.kind}`}>{tag.text}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Kết hợp: the three rankings side by side per game, with the games that appear in more than one.
// It shows ranks only. No composite score is calculated.
export function CsvCombinedTop10({ rankings }: { rankings: Top10Rankings }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; downloads?: number; revenue?: number; growth?: number; lists: number }>();
    const add = (list: Top10Row[], field: 'downloads' | 'revenue' | 'growth') => {
      for (const row of list) {
        const key = String(row.sourceRow ?? row.name);
        const entry = map.get(key) ?? { name: row.name, lists: 0 };
        entry[field] = row.rank;
        entry.lists += 1;
        map.set(key, entry);
      }
    };
    add(rankings.downloads, 'downloads');
    add(rankings.revenue, 'revenue');
    add(rankings.growth, 'growth');
    return [...map.values()].sort((a, b) => b.lists - a.lists || (a.downloads ?? 99) - (b.downloads ?? 99) || a.name.localeCompare(b.name, 'vi'));
  }, [rankings]);
  const overlapNames = rankings.overlap.map((item) => item.name);
  return (
    <div className="csv-top10-combined">
      <p className="csv-top10-combined__note">
        Ba bảng xếp hạng riêng: lượt tải, doanh thu, tăng trưởng. Số trong ô là thứ hạng trong bảng đó.
        {overlapNames.length ? ` Xuất hiện ở nhiều bảng: ${overlapNames.join(', ')}.` : ' Không có game nào xuất hiện ở nhiều bảng.'}
      </p>
      <div className="csv-top10-table-scroll" role="region" aria-label="Kết hợp ba bảng xếp hạng" tabIndex={0}>
        <table className="csv-top10-table">
          <thead><tr>
            <th scope="col">Game</th>
            <th scope="col">Hạng lượt tải</th>
            <th scope="col">Hạng doanh thu</th>
            <th scope="col">Hạng tăng trưởng</th>
            <th scope="col">Số bảng</th>
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={row.name + (row.downloads ?? '') + (row.revenue ?? '') + (row.growth ?? '')}>
            <th scope="row" className="csv-top10-col-name">{row.name}</th>
            <td className="csv-top10-num">{row.downloads ?? <span className="csv-top10-missing">—</span>}</td>
            <td className="csv-top10-num">{row.revenue ?? <span className="csv-top10-missing">—</span>}</td>
            <td className="csv-top10-num">{row.growth ?? <span className="csv-top10-missing">—</span>}</td>
            <td className="csv-top10-num">{row.lists >= 2 ? <span className="csv-top10-tag csv-top10-tag--new">{row.lists} bảng</span> : '1 bảng'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {rankings.newGames.length > 0 && <p className="csv-top10-combined__note">Game mới (không có năm trước, không xếp %): {rankings.newGames.map((row) => row.name).join(', ')}.</p>}
    </div>
  );
}
