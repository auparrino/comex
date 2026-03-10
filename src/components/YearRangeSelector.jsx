import { useState, useCallback } from 'react';
import './YearRangeSelector.css';

/**
 * Year range selector with clickable bars.
 * - Click a year to select single year
 * - Click another year to set a range (from first click to second)
 * - Click "Todos" to reset to all years
 *
 * Props:
 *   years: string[] - available years
 *   from: string - start year of range
 *   to: string - end year of range
 *   onChange: (from, to) => void
 */
export default function YearRangeSelector({ years, from, to, onChange }) {
  const [pendingStart, setPendingStart] = useState(null);

  const isAll = from === years[0] && to === years[years.length - 1];

  const handleYearClick = useCallback((year) => {
    if (pendingStart === null) {
      // First click: set pending start
      setPendingStart(year);
      onChange(year, year); // Immediately select single year
    } else {
      // Second click: set range
      const start = year < pendingStart ? year : pendingStart;
      const end = year > pendingStart ? year : pendingStart;
      onChange(start, end);
      setPendingStart(null);
    }
  }, [pendingStart, onChange]);

  const handleAllClick = useCallback(() => {
    setPendingStart(null);
    onChange(years[0], years[years.length - 1]);
  }, [years, onChange]);

  return (
    <div className="year-range-selector">
      <button
        className={`yr-all ${isAll ? 'active' : ''}`}
        onClick={handleAllClick}
      >
        Todos
      </button>
      <div className="yr-bars">
        {years.map(y => {
          const inRange = y >= from && y <= to;
          const isEdge = y === from || y === to;
          const isPending = y === pendingStart;
          return (
            <button
              key={y}
              className={`yr-bar ${inRange ? 'in-range' : ''} ${isEdge ? 'edge' : ''} ${isPending ? 'pending' : ''}`}
              onClick={() => handleYearClick(y)}
              title={y}
            >
              <span className="yr-label">{y.slice(-2)}</span>
            </button>
          );
        })}
      </div>
      {!isAll && (
        <span className="yr-range-label">
          {from === to ? from : `${from}-${to}`}
        </span>
      )}
    </div>
  );
}
