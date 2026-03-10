import './YearSelector.css';

export default function YearSelector({ years, selected, onChange }) {
  return (
    <div className="year-selector">
      <select value={selected} onChange={e => onChange(e.target.value)}>
        <option value="all">Todos los años</option>
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
