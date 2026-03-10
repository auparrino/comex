import { useState, useEffect, useMemo } from 'react';
import { fmt } from '../utils/format';
import './BilateralAnalysis.css';

const TREND_LABELS = {
  up: { symbol: '\u2191', label: 'Creciente', cls: 'trend-up' },
  down: { symbol: '\u2193', label: 'Decreciente', cls: 'trend-down' },
  stable: { symbol: '\u2194', label: 'Estable', cls: 'trend-stable' },
  new: { symbol: '+', label: 'Nuevo', cls: 'trend-new' },
  lost: { symbol: '\u2717', label: 'Perdido', cls: 'trend-lost' },
  none: { symbol: '', label: '', cls: '' },
};

// Recompute trend from yearly values within selected range
function computeTrend(yearly, selectedYears) {
  if (!yearly || selectedYears.length < 2) return 'stable';
  const first = yearly[selectedYears[0]] || 0;
  const last = yearly[selectedYears[selectedYears.length - 1]] || 0;
  if (first === 0 && last > 0) return 'new';
  if (first > 0 && last === 0) return 'lost';
  if (first === 0 && last === 0) return 'none';
  const change = (last - first) / first;
  if (change > 0.15) return 'up';
  if (change < -0.15) return 'down';
  return 'stable';
}

// Filter items by selectedYears: recompute total, share, trend
function filterByYears(items, selectedYears, allYears) {
  const isAllYears = selectedYears.length === allYears.length;
  if (isAllYears) return items;

  return items
    .map(item => {
      const total = selectedYears.reduce((s, yr) => s + (item.y?.[yr] || 0), 0);
      if (total === 0) return null;
      return {
        ...item,
        t: total,
        tr: computeTrend(item.y, selectedYears),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.t - a.t);
}

function MiniSparkline({ yearly, years, color }) {
  if (!yearly || Object.keys(yearly).length < 2) return null;

  const vals = years.map(y => yearly[y] || 0);
  const max = Math.max(...vals);
  if (max === 0) return null;

  const w = 70;
  const h = 18;
  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y2 = h - (v / max) * (h - 2) - 1;
    return `${x},${y2}`;
  });

  return (
    <svg className="mini-sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendBadge({ trend }) {
  const t = TREND_LABELS[trend] || TREND_LABELS.none;
  if (!t.symbol) return null;
  return (
    <span className={`trend-badge ${t.cls}`} title={t.label}>
      {t.symbol}
    </span>
  );
}

function ProductRow({ item, years, color }) {
  return (
    <div className="bilateral-row">
      <div className="bilateral-row-top">
        <span className="bilateral-code">{item.p}</span>
        <span className="bilateral-desc" title={item.d}>{item.d}</span>
      </div>
      <div className="bilateral-row-bottom">
        <span className="bilateral-value" style={{ color }}>{fmt(item.t)}</span>
        <TrendBadge trend={item.tr} />
        <span className="bilateral-share">{item.sh}%</span>
        <MiniSparkline yearly={item.y} years={years} color={color} />
      </div>
    </div>
  );
}

function OpportunityRow({ item }) {
  return (
    <div className="bilateral-row opp-row">
      <div className="bilateral-row-top">
        <span className="bilateral-code">{item.p}</span>
        <span className="bilateral-desc" title={item.d}>{item.d}</span>
      </div>
      <div className="opp-bar-row">
        <div className="opp-bar-track">
          <div className="opp-bar-fill" style={{ width: `${Math.min(item.gap, 100)}%` }} />
        </div>
        <span className="opp-bar-pct">{item.gap}%</span>
      </div>
      <div className="opp-stats-row">
        <span className="opp-stat-item">
          Mundo: <strong>{fmt(item.ar_global)}</strong>
        </span>
        <span className="opp-stat-item">
          Bilateral: <strong>{fmt(item.bilateral)}</strong>
        </span>
      </div>
    </div>
  );
}

function DependencyRow({ item }) {
  const barWidth = Math.min(item.sh, 100);
  return (
    <div className="bilateral-row dep-row">
      <div className="bilateral-row-top">
        <span className="bilateral-code">{item.p}</span>
        <span className="bilateral-desc" title={item.d}>{item.d}</span>
      </div>
      <div className="dep-bar-row">
        <div className="dep-bar-track">
          <div className="dep-bar-fill" style={{ width: `${barWidth}%` }} />
        </div>
        <span className="dep-bar-pct">{item.sh}%</span>
      </div>
      <div className="dep-stats-row">
        <span className="opp-stat-item">
          De este socio: <strong>{fmt(item.bilateral)}</strong>
        </span>
        <span className="opp-stat-item">
          Total AR: <strong>{fmt(item.ar_total)}</strong>
        </span>
      </div>
    </div>
  );
}

export default function BilateralAnalysis({ country, data, years, selectedYears }) {
  const [bilateralData, setBilateralData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState('trade');
  const yrs = selectedYears || years;

  useEffect(() => {
    if (!country) return;
    setLoading(true);
    data.loadBilateralData(country).then(d => {
      setBilateralData(d);
      setLoading(false);
    });
  }, [country, data.loadBilateralData]);

  // Filter bilateral data by selected year range
  const filtered = useMemo(() => {
    if (!bilateralData) return null;
    return {
      top_exp: filterByYears(bilateralData.top_exp, yrs, years),
      top_imp: filterByYears(bilateralData.top_imp, yrs, years),
      opp_exp: bilateralData.opp_exp,
      dep_imp: bilateralData.dep_imp,
    };
  }, [bilateralData, yrs, years]);

  if (loading) {
    return <div className="bilateral-loading">Cargando datos bilaterales...</div>;
  }

  if (!filtered) {
    return <div className="bilateral-empty">Sin datos bilaterales disponibles.</div>;
  }

  const { top_exp, top_imp, opp_exp, dep_imp } = filtered;

  return (
    <div className="bilateral-analysis">
      <div className="bilateral-section-tabs">
        <button
          className={section === 'trade' ? 'active' : ''}
          onClick={() => setSection('trade')}
        >
          Comercio
        </button>
        <button
          className={section === 'opportunities' ? 'active' : ''}
          onClick={() => setSection('opportunities')}
        >
          Oportunidades
        </button>
      </div>

      {section === 'trade' ? (
        <>
          <div className="bilateral-section">
            <h4 className="bilateral-section-title exp-title">
              AR exporta a {country}
              <span className="bilateral-count">{top_exp.length}</span>
            </h4>
            {top_exp.length === 0 ? (
              <p className="no-data">Sin datos de exportaciones</p>
            ) : (
              top_exp.map(item => (
                <ProductRow key={item.p} item={item} years={yrs} color="var(--blue)" />
              ))
            )}
          </div>

          <div className="bilateral-section">
            <h4 className="bilateral-section-title imp-title">
              AR importa de {country}
              <span className="bilateral-count">{top_imp.length}</span>
            </h4>
            {top_imp.length === 0 ? (
              <p className="no-data">Sin datos de importaciones</p>
            ) : (
              top_imp.map(item => (
                <ProductRow key={item.p} item={item} years={yrs} color="var(--red)" />
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div className="bilateral-section">
            <h4 className="bilateral-section-title opp-title">
              Oportunidades de exportaci&oacute;n
            </h4>
            <p className="bilateral-section-desc">
              Productos que AR exporta al mundo pero poco a {country}. La barra muestra el % del mercado sin explotar.
            </p>
            {opp_exp.length === 0 ? (
              <p className="no-data">No se identificaron oportunidades</p>
            ) : (
              opp_exp.map(item => (
                <OpportunityRow key={item.p} item={item} />
              ))
            )}
          </div>

          <div className="bilateral-section">
            <h4 className="bilateral-section-title dep-title">
              Dependencias de importaci&oacute;n
            </h4>
            <p className="bilateral-section-desc">
              Productos donde {country} concentra &gt;25% de lo que AR importa. La barra muestra la participaci&oacute;n.
            </p>
            {dep_imp.length === 0 ? (
              <p className="no-data">No se identificaron dependencias</p>
            ) : (
              dep_imp.map(item => (
                <DependencyRow key={item.p} item={item} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
