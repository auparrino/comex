import { useMemo, useState } from 'react';
import { fmt, fmtPct } from '../utils/format';
import { COLORS, RUBRO_COLORS } from '../utils/colors';
import './ProductChart.css';

const ITEMS_PER_PAGE = 7;

export default function ProductChart({ data, flowFilter, total, digitLevel = 2, viewMode = 'chapters' }) {
  const showExp = flowFilter === 'both' || flowFilter === 'exp';
  const showImp = flowFilter === 'both' || flowFilter === 'imp';

  const [expPage, setExpPage] = useState(1);
  const [impPage, setImpPage] = useState(1);

  if (!data) return null;

  const isRubros = viewMode === 'rubros';

  const expItems = isRubros ? (data.exp || []) : data.exp.slice(0, expPage * ITEMS_PER_PAGE);
  const impItems = isRubros ? (data.imp || []) : data.imp.slice(0, impPage * ITEMS_PER_PAGE);

  const maxVal = useMemo(() => {
    if (!data.exp || !data.imp) return 0;
    let max = 0;
    if (isRubros) {
      if (showExp) data.exp.forEach(r => { if (r.value > max) max = r.value; });
      if (showImp) data.imp.forEach(r => { if (r.value > max) max = r.value; });
    } else {
      if (showExp && data.exp[0]) max = Math.max(max, data.exp[0].value);
      if (showImp && data.imp[0]) max = Math.max(max, data.imp[0].value);
    }
    return max;
  }, [data, showExp, showImp, isRubros]);

  const truncateName = (name) => {
    const maxLen = digitLevel <= 2 ? 50 : 40;
    if (name.length > maxLen) return name.slice(0, maxLen - 3) + '...';
    return name;
  };

  const levelLabel = digitLevel === 2
    ? 'capitulo HS'
    : digitLevel === 4
    ? 'partida (4 dig.)'
    : digitLevel === 6
    ? 'subpartida (6 dig.)'
    : 'NCM (8 dig.)';

  const renderRubroSection = (items, flow) => {
    const isExp = flow === 'exp';
    const totalVal = isExp ? total.exp : total.imp;
    const label = isExp ? 'Exportaciones FOB' : 'Importaciones CIF';
    const rubroType = isExp ? 'Grandes Rubros' : 'Uso economico';

    return (
      <div className="product-section">
        <h4 className={`product-section-title ${isExp ? 'exp-title' : 'imp-title'}`}>
          {label} por {rubroType}
        </h4>
        {items.length === 0 ? (
          <p className="no-data">Sin datos</p>
        ) : (
          items.map(r => (
            <div key={r.code} className="product-row rubro-product-row">
              <div className="product-info">
                <span className="rubro-code-badge" style={{ background: RUBRO_COLORS[r.code] }}>{r.code}</span>
                <span className="chapter-name" title={r.name}>{r.name}</span>
              </div>
              <div className="product-bar-container rubro-bar-tall">
                <div
                  className="product-bar"
                  style={{
                    width: `${totalVal > 0 ? (r.value / totalVal) * 100 : 0}%`,
                    backgroundColor: RUBRO_COLORS[r.code],
                    opacity: 0.8,
                  }}
                />
              </div>
              <div className="product-values">
                <span className="product-amount">{fmt(r.value)}</span>
                <span className="product-pct">
                  {totalVal > 0 ? fmtPct(r.value / totalVal) : '0%'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderSection = (items, allItems, flow, page, setPage) => {
    const isExp = flow === 'exp';
    const totalVal = isExp ? total.exp : total.imp;
    const color = isExp ? COLORS.exports : COLORS.imports;
    const label = isExp ? 'Exportaciones FOB' : 'Importaciones CIF';

    return (
      <div className="product-section">
        <h4 className={`product-section-title ${isExp ? 'exp-title' : 'imp-title'}`}>
          {label} por {levelLabel}
          <span className="product-count">({allItems.length} items)</span>
        </h4>
        {items.length === 0 ? (
          <p className="no-data">Sin datos</p>
        ) : (
          <>
            {items.map((p, i) => (
              <div key={p.chapter} className="product-row">
                <div className="product-info">
                  <span className="chapter-code">{p.chapter}</span>
                  <span className="chapter-name" title={p.name}>
                    {truncateName(p.name)}
                  </span>
                </div>
                <div className="product-bar-container">
                  <div
                    className="product-bar"
                    style={{
                      width: `${totalVal > 0 ? (p.value / totalVal) * 100 : 0}%`,
                      backgroundColor: color,
                      opacity: 0.7,
                    }}
                  />
                </div>
                <div className="product-values">
                  <span className="product-amount">{fmt(p.value)}</span>
                  <span className="product-pct">
                    {totalVal > 0 ? fmtPct(p.value / totalVal) : '0%'}
                  </span>
                </div>
              </div>
            ))}
            {items.length < allItems.length && (
              <button
                className="load-more-btn"
                onClick={() => setPage(p => p + 1)}
              >
                Ver mas ({allItems.length - items.length} restantes)
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  if (isRubros) {
    return (
      <div className="product-chart">
        {showExp && renderRubroSection(expItems, 'exp')}
        {showImp && renderRubroSection(impItems, 'imp')}
      </div>
    );
  }

  return (
    <div className="product-chart">
      {showExp && renderSection(expItems, data.exp, 'exp', expPage, setExpPage)}
      {showImp && renderSection(impItems, data.imp, 'imp', impPage, setImpPage)}
    </div>
  );
}
