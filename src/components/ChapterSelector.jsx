import { useMemo } from 'react';
import './ChapterSelector.css';

export default function ChapterSelector({ chapters, selected, onChange }) {
  const sortedChapters = useMemo(() => {
    if (!chapters) return [];
    return Object.entries(chapters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, name]) => {
        // Truncate long names for dropdown
        const short = name.length > 40 ? name.slice(0, 37) + '...' : name;
        return { code, name: short };
      });
  }, [chapters]);

  return (
    <div className="chapter-selector">
      <select value={selected} onChange={e => onChange(e.target.value)}>
        <option value="all">Todos los productos</option>
        {sortedChapters.map(ch => (
          <option key={ch.code} value={ch.code}>
            {ch.code} · {ch.name}
          </option>
        ))}
      </select>
    </div>
  );
}
