import { useMemo, useState } from 'react';
import { fmt } from '../utils/format';
import './TopPartners.css';

export default function TopPartners({ countries, summary, selectedYear, selectedYears, selectedCountry, onSelect }) {
  const [search, setSearch] = useState('');

  const ranked = useMemo(() => {
    return countries
      .map(c => {
        let totalExports = 0, totalImports = 0;
        for (const yr of selectedYears) {
          const yd = summary[c.name]?.years?.[yr];
          if (yd) {
            totalExports += yd.exp;
            totalImports += yd.imp;
          }
        }
        if (totalExports === 0 && totalImports === 0) return null;
        return {
          ...c,
          totalExports,
          totalImports,
          totalTrade: totalExports + totalImports,
          balance: totalExports - totalImports,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.totalTrade - a.totalTrade);
  }, [countries, summary, selectedYears]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ranked;
    const q = search.toLowerCase();
    return ranked.filter(c => c.name.toLowerCase().includes(q));
  }, [ranked, search]);

  const maxTrade = ranked[0]?.totalTrade || 1;

  return (
    <div className="top-partners">
      <div className="partners-header">
        <h3 className="section-title">Socios comerciales ({ranked.length})</h3>
        <input
          type="text"
          className="partner-search"
          placeholder="Buscar país..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="partners-list">
        {filtered.map((c, i) => {
          const globalRank = ranked.indexOf(c) + 1;
          return (
            <button
              key={c.name}
              className={`partner-row ${c.name === selectedCountry ? 'selected' : ''}`}
              onClick={() => onSelect(c.name)}
            >
              <span className="rank">{globalRank}</span>
              <span className="name">{c.name}</span>
              <span className="trade-bar-container">
                <span
                  className="trade-bar exp"
                  style={{ width: `${(c.totalExports / maxTrade) * 100}%` }}
                />
                <span
                  className="trade-bar imp"
                  style={{ width: `${(c.totalImports / maxTrade) * 100}%` }}
                />
              </span>
              <span className={`balance ${c.balance >= 0 ? 'surplus' : 'deficit'}`}>
                {fmt(c.balance)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
