import { groupWarnings } from './csvWarnings';
import './CsvResultPanels.css';

// Warnings first on the result page: one line per type, details only on demand.
export function CsvWarningSummary({ reasons }: { reasons: string[] }) {
  const groups = groupWarnings(reasons);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  if (!total) {
    return <section className="csv-warning-summary csv-warning-summary--clear" aria-label="Cảnh báo dữ liệu">
      <p><strong>Không có cảnh báo dữ liệu</strong> cho tệp này.</p>
    </section>;
  }
  return <section className="csv-warning-summary" aria-label="Cảnh báo dữ liệu">
    <div className="csv-warning-summary__heading">
      <h4>Cần kiểm tra trước khi dùng số liệu</h4>
      <span>{total} cảnh báo · gom thành {groups.length} nhóm</span>
    </div>
    <ul className="csv-warning-summary__groups">
      {groups.map((group) => <li key={group.id}>
        <details>
          <summary><strong>{group.title}</strong><span>{group.count}</span></summary>
          <p>{group.help}</p>
          {group.rows.length > 0 && <p className="csv-warning-summary__rows">Dòng CSV bị ảnh hưởng: {group.rows.slice(0, 40).join(', ')}{group.rows.length > 40 ? ` … và ${group.rows.length - 40} dòng khác` : ''}</p>}
          <details className="csv-warning-summary__raw">
            <summary>Chi tiết kỹ thuật (bản gốc)</summary>
            <ul>{group.examples.map((example) => <li key={example}>{example}</li>)}</ul>
          </details>
        </details>
      </li>)}
    </ul>
  </section>;
}
