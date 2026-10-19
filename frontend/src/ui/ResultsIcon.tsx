import type { SVGProps } from 'react';

export type ResultsIconName =
  | 'home' | 'search' | 'compass' | 'sources' | 'reports' | 'runs'
  | 'conclusion' | 'takeaways' | 'findings' | 'evidence' | 'snapshot'
  | 'gaps' | 'map' | 'decision' | 'entity' | 'observation' | 'feature'
  | 'comparison' | 'metric' | 'risk' | 'arrow' | 'external';

type IconShape = { paths: string[]; circles?: [number, number, number][]; rects?: [number, number, number, number, number][] };

const shapes: Record<ResultsIconName, IconShape> = {
  home: { paths: ['M3 10.5 12 3l9 7.5', 'M5.5 9.5V21h13V9.5', 'M9 21v-7h6v7'] },
  search: { paths: ['M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z', 'm16 16 5 5'] },
  compass: { paths: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'm15.5 8.5-2.3 4.7-4.7 2.3 2.3-4.7 4.7-2.3Z'] },
  sources: { paths: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z', 'M4 17.5A2.5 2.5 0 0 1 6.5 15H20', 'M8 7h8', 'M8 10h6'] },
  reports: { paths: ['M6 3h9l4 4v14H6z', 'M15 3v5h5', 'M9 12h7', 'M9 16h7'] },
  runs: { paths: ['M12 8v4l3 2', 'M21 12a9 9 0 1 1-2.64-6.36', 'M21 4v5h-5'] },
  conclusion: { paths: ['M6 3h9l4 4v14H6z', 'M15 3v5h5', 'M9 12h7', 'M9 16h5'] },
  takeaways: { paths: ['M9 18h6', 'M10 22h4', 'M8.5 14.5A7 7 0 1 1 15.5 14.5c-.8.7-1.2 1.4-1.3 2.5h-4.4c-.1-1.1-.5-1.8-1.3-2.5Z'] },
  findings: { paths: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'm5.64 5.64 2.83 2.83', 'm15.53 15.53 2.83 2.83', 'm18.36 5.64-2.83 2.83', 'm8.47 15.53-2.83 2.83'], circles: [[12, 12, 3]] },
  evidence: { paths: ['M10 13a5 5 0 0 0 7.07 0l3-3A5 5 0 0 0 13 2.93l-1.72 1.72', 'M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.72-1.72'] },
  snapshot: { paths: ['M4 19V5', 'M4 19h17', 'M8 16v-4', 'M13 16V7', 'M18 16v-7'] },
  gaps: { paths: ['M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 5', 'M12 18h.01'], circles: [[12, 12, 10]] },
  map: { paths: ['M7 7h10', 'M7 17h10', 'm14 4 3 3-3 3', 'm10 14-3 3 3 3'], circles: [[5, 7, 2], [19, 7, 2], [5, 17, 2], [19, 17, 2]] },
  decision: { paths: ['m8 12 2.5 2.5L16 9', 'M21 12a9 9 0 1 1-2.64-6.36'] },
  entity: { paths: ['M4 6.5 12 3l8 3.5v11L12 21l-8-3.5z', 'm4 6.5 8 3.5 8-3.5', 'M12 10v11'] },
  observation: { paths: ['M4 5h16v12H8l-4 4z', 'M8 9h8', 'M8 13h5'] },
  feature: { paths: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z'] },
  comparison: { paths: ['M8 4v16', 'M16 4v16', 'M4 8h8', 'M12 16h8'] },
  metric: { paths: ['M4 19h16', 'M6 16v-5', 'M11 16V6', 'M16 16v-8'] },
  risk: { paths: ['M12 3 2.8 19h18.4L12 3Z', 'M12 9v4', 'M12 16h.01'] },
  arrow: { paths: ['M5 12h14', 'm13 6 6 6-6 6'] },
  external: { paths: ['M14 4h6v6', 'M20 4 11 13', 'M18 13v6H5V6h6'] },
};

export function ResultsIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: ResultsIconName }) {
  const shape = shapes[name];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    {shape.paths.map((d, index) => <path d={d} key={index} />)}
    {shape.circles?.map(([cx, cy, r], index) => <circle cx={cx} cy={cy} r={r} key={`c${index}`} />)}
    {shape.rects?.map(([x, y, width, height, rx], index) => <rect x={x} y={y} width={width} height={height} rx={rx} key={`r${index}`} />)}
  </svg>;
}

export function findingIcon(type: string): ResultsIconName {
  switch (type.trim().toLocaleLowerCase().replace(/[\s-]+/g, '_')) {
    case 'feature': case 'features': return 'feature';
    case 'comparison': case 'comparative': return 'comparison';
    case 'metric': case 'metrics': return 'metric';
    case 'risk': case 'limitation': return 'risk';
    case 'observation': case 'finding': return 'observation';
    default: return 'findings';
  }
}
