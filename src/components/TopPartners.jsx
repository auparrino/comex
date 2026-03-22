import { useMemo, useState, useEffect } from 'react';
import { fmt } from '../utils/format';
import './TopPartners.css';

/* ── Country bloc definitions ─────────────────────────────── */
export const BLOCS = [
  {
    key: 'mercosur', label: 'Mercosur',
    members: ['Brasil', 'Uruguay', 'Paraguay', 'Bolivia'],
  },
  {
    key: 'ue', label: 'UE',
    members: [
      'Alemania', 'Francia', 'Italia', 'España', 'Países Bajos', 'Bélgica',
      'Austria', 'Polonia', 'Portugal', 'Irlanda', 'Grecia', 'Chequia',
      'Rumania', 'Hungría', 'Suecia', 'Dinamarca', 'Finlandia', 'Eslovaquia',
      'Bulgaria', 'Croacia', 'Lituania', 'Eslovenia', 'Letonia', 'Estonia',
      'Chipre', 'Luxemburgo', 'Malta',
    ],
  },
  {
    key: 'asean', label: 'ASEAN',
    members: [
      'Indonesia', 'Tailandia', 'Vietnam', 'Filipinas', 'Malasia',
      'Singapur', 'Myanmar', 'Camboya', 'Lao', 'Brunei Darussalam',
    ],
  },
  {
    key: 'brics', label: 'BRICS',
    members: [
      'Brasil', 'Rusia', 'India', 'China', 'Sudáfrica',
      'Egipto', 'Etiopía', 'Irán', 'Emiratos Árabes', 'Arabia Saudita',
    ],
  },
];

const CONCEPTS = [
  { key: 'total', label: 'Total' },
  { key: 'exp',   label: 'Exp' },
  { key: 'imp',   label: 'Imp' },
];

export default function TopPartners({
  countries, summary, selectedYears,
  selectedCountry, onSelect,
  productMapData, selectedProduct,
  onBlocHighlight,
  onSelectBloc,
  selectedBloc,
  comtradeValidation,
}) {
  const [search, setSearch] = useState('');
  const [concept, setConcept] = useState('total');
  const [activeBlocs, setActiveBlocs] = useState(new Set());
  const [expandedBloc, setExpandedBloc] = useState(null);

  // Notify parent of highlighted countries whenever active blocs change
  useEffect(() => {
    if (!onBlocHighlight) return;
    const names = new Set();
    for (const bloc of BLOCS) {
      if (activeBlocs.has(bloc.key)) {
        bloc.members.forEach(m => names.add(m));
      }
    }
    onBlocHighlight(names);
  }, [activeBlocs, onBlocHighlight]);

  const toggleBloc = (key) => {
    setActiveBlocs(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        if (expandedBloc === key) setExpandedBloc(null);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Base ranked list — uses productMapData when a product is selected
  const ranked = useMemo(() => {
    if (selectedProduct && productMapData) {
      return Object.entries(productMapData)
        .map(([name, vals]) => ({
          name,
          totalExports: vals.exp || 0,
          totalImports: vals.imp || 0,
          totalTrade: (vals.exp || 0) + (vals.imp || 0),
          balance: (vals.exp || 0) - (vals.imp || 0),
        }))
        .filter(c => c.totalTrade > 0);
    }

    return countries
      .map(c => {
        let totalExports = 0, totalImports = 0;
        for (const yr of selectedYears) {
          const yd = summary[c.name]?.years?.[yr];
          if (yd) { totalExports += yd.exp; totalImports += yd.imp; }
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
      .filter(Boolean);
  }, [countries, summary, selectedYears, productMapData, selectedProduct]);

  // Sort function based on concept
  const sortVal = (item) => {
    if (concept === 'exp') return item.totalExports;
    if (concept === 'imp') return item.totalImports;
    return item.totalTrade;
  };

  // Build display list with grouping
  const displayList = useMemo(() => {
    const sorted = [...ranked].sort((a, b) => sortVal(b) - sortVal(a));
    if (activeBlocs.size === 0) return sorted;

    // Collect which countries are grouped
    const groupedNames = new Set();
    const blocRows = [];

    for (const bloc of BLOCS) {
      if (!activeBlocs.has(bloc.key)) continue;

      let exp = 0, imp = 0;
      const memberData = [];

      for (const member of bloc.members) {
        const cd = sorted.find(c => c.name === member);
        if (cd) {
          exp += cd.totalExports;
          imp += cd.totalImports;
          groupedNames.add(member);
          memberData.push(cd);
        }
      }

      if (memberData.length > 0) {
        // Sort members by the concept
        memberData.sort((a, b) => sortVal(b) - sortVal(a));
        blocRows.push({
          name: bloc.label,
          isBloc: true,
          blocKey: bloc.key,
          memberCount: memberData.length,
          members: memberData,
          totalExports: exp,
          totalImports: imp,
          totalTrade: exp + imp,
          balance: exp - imp,
        });
      }
    }

    const individuals = sorted.filter(c => !groupedNames.has(c.name));
    const combined = [...blocRows, ...individuals];
    combined.sort((a, b) => sortVal(b) - sortVal(a));
    return combined;
  }, [ranked, activeBlocs, concept]);

  // Filtered by search
  const filtered = useMemo(() => {
    if (!search.trim()) return displayList;
    const q = search.toLowerCase();
    return displayList.filter(c => {
      if (c.isBloc) {
        return c.name.toLowerCase().includes(q) ||
          c.members.some(m => m.name.toLowerCase().includes(q));
      }
      return c.name.toLowerCase().includes(q);
    });
  }, [displayList, search]);

  // Max value for bar scaling (based on concept)
  const maxVal = useMemo(() => {
    if (!filtered.length) return 1;
    return Math.max(1, ...filtered.map(c => sortVal(c)));
  }, [filtered, concept]);

  const renderBar = (item) => {
    if (concept === 'exp') {
      return (
        <span className="trade-bar-container">
          <span className="trade-bar exp" style={{ width: `${(item.totalExports / maxVal) * 100}%` }} />
        </span>
      );
    }
    if (concept === 'imp') {
      return (
        <span className="trade-bar-container">
          <span className="trade-bar imp" style={{ width: `${(item.totalImports / maxVal) * 100}%` }} />
        </span>
      );
    }
    // total: show both bars
    return (
      <span className="trade-bar-container">
        <span className="trade-bar exp" style={{ width: `${(item.totalExports / maxVal) * 100}%` }} />
        <span className="trade-bar imp" style={{ width: `${(item.totalImports / maxVal) * 100}%` }} />
      </span>
    );
  };

  const renderValue = (item) => {
    if (concept === 'exp') return <span className="val-col surplus">{fmt(item.totalExports)}</span>;
    if (concept === 'imp') return <span className="val-col deficit">{fmt(item.totalImports)}</span>;
    return <span className={`val-col ${item.balance >= 0 ? 'surplus' : 'deficit'}`}>{fmt(item.balance)}</span>;
  };

  // Rank counter for non-bloc rows
  let rank = 0;

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

      {/* Concept toggle + bloc chips */}
      <div className="partners-toolbar">
        <div className="concept-tabs">
          {CONCEPTS.map(c => (
            <button
              key={c.key}
              className={`concept-tab ${concept === c.key ? 'active' : ''}`}
              onClick={() => setConcept(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="bloc-chips">
          {BLOCS.map(b => (
            <button
              key={b.key}
              className={`bloc-chip ${activeBlocs.has(b.key) ? 'active' : ''}`}
              onClick={() => toggleBloc(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="partners-list">
        {filtered.map((c) => {
          if (c.isBloc) {
            const isExpanded = expandedBloc === c.blocKey;
            const isBlocSelected = selectedBloc === c.blocKey;
            return (
              <div key={c.blocKey} className="bloc-group">
                <button
                  className={`partner-row bloc-row ${isBlocSelected ? 'selected' : ''}`}
                  onClick={() => {
                    if (onSelectBloc) onSelectBloc(c.blocKey);
                  }}
                >
                  <span
                    className="rank bloc-icon"
                    onClick={(e) => { e.stopPropagation(); setExpandedBloc(isExpanded ? null : c.blocKey); }}
                  >
                    {isExpanded ? '▾' : '▸'}
                  </span>
                  <span className="name bloc-name">{c.name} <span className="bloc-count">({c.memberCount})</span></span>
                  {renderBar(c)}
                  {renderValue(c)}
                </button>
                {isExpanded && c.members.map(m => (
                  <button
                    key={m.name}
                    className={`partner-row sub-row ${m.name === selectedCountry ? 'selected' : ''}`}
                    onClick={() => onSelect(m.name)}
                  >
                    <span className="rank"></span>
                    <span className="name">{m.name}</span>
                    {renderBar(m)}
                    {renderValue(m)}
                  </button>
                ))}
              </div>
            );
          }

          rank++;
          const cv = comtradeValidation?.[c.name];
          const isHighCh99 = cv?.ch99?.high;
          return (
            <button
              key={c.name}
              className={`partner-row ${c.name === selectedCountry ? 'selected' : ''}`}
              onClick={() => onSelect(c.name)}
            >
              <span className="rank">{rank}</span>
              <span className="name">
                {c.name}
                {isHighCh99 && (
                  <span
                    className="ch99-badge"
                    title={`Alto % confidencial: exp ${(cv.ch99.max_exp_pct * 100).toFixed(0)}%, imp ${(cv.ch99.max_imp_pct * 100).toFixed(0)}%`}
                  >
                    9999
                  </span>
                )}
              </span>
              {renderBar(c)}
              {renderValue(c)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
