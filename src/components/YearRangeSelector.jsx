import { useCallback, useMemo } from 'react';
import './YearRangeSelector.css';

/**
 * Year range selector with dual-handle slider.
 * Props:
 *   years: string[] - available years
 *   from: string - start year of range
 *   to: string - end year of range
 *   onChange: (from, to) => void
 */
export default function YearRangeSelector({ years, from, to, onChange }) {
  const isAll = from === years[0] && to === years[years.length - 1];
  const fromIdx = years.indexOf(from);
  const toIdx = years.indexOf(to);
  const max = years.length - 1;

  // Percentage for track fill
  const fillLeft = useMemo(() => (fromIdx / max) * 100, [fromIdx, max]);
  const fillRight = useMemo(() => ((max - toIdx) / max) * 100, [toIdx, max]);

  const handleFromChange = useCallback((e) => {
    const idx = parseInt(e.target.value);
    const clampedIdx = Math.min(idx, toIdx);
    onChange(years[clampedIdx], years[toIdx]);
  }, [years, toIdx, onChange]);

  const handleToChange = useCallback((e) => {
    const idx = parseInt(e.target.value);
    const clampedIdx = Math.max(idx, fromIdx);
    onChange(years[fromIdx], years[clampedIdx]);
  }, [years, fromIdx, onChange]);

  const handleAllClick = useCallback(() => {
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
      <div className="yr-slider-wrap">
        <div className="yr-slider-track">
          <div
            className="yr-slider-fill"
            style={{ left: `${fillLeft}%`, right: `${fillRight}%` }}
          />
          <input
            type="range"
            className="yr-slider yr-slider-from"
            min={0}
            max={max}
            value={fromIdx}
            onChange={handleFromChange}
          />
          <input
            type="range"
            className="yr-slider yr-slider-to"
            min={0}
            max={max}
            value={toIdx}
            onChange={handleToChange}
          />
        </div>
        <div className="yr-ticks">
          {years.map((y, i) => (
            <span
              key={y}
              className={`yr-tick ${i >= fromIdx && i <= toIdx ? 'in-range' : ''}`}
            >
              {y.slice(-2)}
            </span>
          ))}
        </div>
      </div>
      {!isAll && (
        <span className="yr-range-label">
          {from === to ? from : `${from}-${to}`}
        </span>
      )}
    </div>
  );
}
