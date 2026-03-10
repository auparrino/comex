import './ReporterSelector.css';

const FLAGS = {
  arg: '\ud83c\udde6\ud83c\uddf7',
  ury: '\ud83c\uddfa\ud83c\uddfe',
  pry: '\ud83c\uddf5\ud83c\uddfe',
};

export default function ReporterSelector({ reporters, active, onChange }) {
  if (!reporters) return null;

  return (
    <div className="reporter-selector">
      {reporters.map(r => (
        <button
          key={r.key}
          className={`reporter-btn ${active === r.key ? 'active' : ''}`}
          onClick={() => onChange(r.key)}
          title={r.name}
        >
          <span className="reporter-flag">{FLAGS[r.key]}</span>
          <span className="reporter-name">{r.name}</span>
        </button>
      ))}
    </div>
  );
}
