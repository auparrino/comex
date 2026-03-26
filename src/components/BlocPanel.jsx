import { useMemo, useState, useEffect } from 'react';
import { BLOCS } from './TopPartners';
import { fmt } from '../utils/format';
import { getDetailProducts, aggregateByRubro } from '../hooks/useTradeData';
import TradeTimeline from './TradeTimeline';
import ProductChart from './ProductChart';
import AiBlocAnalysis from './AiBlocAnalysis';
import './CountryPanel.css';

export default function BlocPanel({ blocKey, data, selectedYears, onClose, onSelectCountry }) {
  const bloc = BLOCS.find(b => b.key === blocKey);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [flowFilter, setFlowFilter] = useState('both');
  const [productView, setProductView] = useState('chapters');
  const [activeTab, setActiveTab] = useState('paises');

  const yearRange = selectedYears.length > 1
    ? `${selectedYears[0]}-${selectedYears[selectedYears.length - 1]}`
    : selectedYears[0];

  const blocMembers = bloc?.members || [];

  const yearlyData = useMemo(() => {
    if (!bloc) return [];
    return data.years.map(yr => {
      let exp = 0, imp = 0;
      for (const member of blocMembers) {
        const yd = data.summary[member]?.years?.[yr];
        if (yd) { exp += yd.exp; imp += yd.imp; }
      }
      return { year: yr, exp, imp };
    });
  }, [data.years, data.summary, blocMembers]);

  const totals = useMemo(() => {
    let exp = 0, imp = 0;
    for (const yr of selectedYears) {
      const yd = yearlyData.find(d => d.year === yr);
      if (yd) { exp += yd.exp; imp += yd.imp; }
    }
    return { exp, imp, balance: exp - imp };
  }, [yearlyData, selectedYears]);

  const members = useMemo(() => {
    return blocMembers
      .map(name => {
        let exp = 0, imp = 0;
        for (const yr of selectedYears) {
          const yd = data.summary[name]?.years?.[yr];
          if (yd) { exp += yd.exp; imp += yd.imp; }
        }
        return { name, exp, imp, total: exp + imp, balance: exp - imp };
      })
      .filter(m => m.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [data.summary, blocMembers, selectedYears]);

  const maxMemberTrade = members[0]?.total || 1;

  // Load and merge detail data preserving digit-level nesting:
  // {year: {digitLevel: {exp: {code: val}, imp: {code: val}}}}
  useEffect(() => {
    if (!bloc || !data.loadCountryDetail) return;
    setDetailLoading(true);
    const activeMembers = members.map(m => m.name);
    Promise.all(activeMembers.map(name => data.loadCountryDetail(name)))
      .then(results => {
        const merged = {};
        for (const detail of results) {
          if (!detail) continue;
          for (const [yr, digitLevels] of Object.entries(detail)) {
            if (!merged[yr]) merged[yr] = {};
            for (const [digits, flows] of Object.entries(digitLevels)) {
              if (!merged[yr][digits]) merged[yr][digits] = { exp: {}, imp: {} };
              for (const [code, val] of Object.entries(flows.exp || {})) {
                merged[yr][digits].exp[code] = (merged[yr][digits].exp[code] || 0) + val;
              }
              for (const [code, val] of Object.entries(flows.imp || {})) {
                merged[yr][digits].imp[code] = (merged[yr][digits].imp[code] || 0) + val;
              }
            }
          }
        }
        setDetailData(merged);
        setDetailLoading(false);
      })
      .catch(() => setDetailLoading(false));
  }, [blocKey, data.loadCountryDetail]);

  const productData = useMemo(() => {
    if (!detailData) return { exp: [], imp: [] };
    const yearArg = selectedYears.length === 1 ? selectedYears[0] : 'all';
    return getDetailProducts(detailData, data.ncmDescriptions, yearArg, 2, selectedYears);
  }, [detailData, data.ncmDescriptions, selectedYears]);

  const rubrosData = useMemo(() => {
    if (!data.rubros || productView !== 'rubros' || !detailData) return null;
    const yearArg = selectedYears.length === 1 ? selectedYears[0] : 'all';
    const chapterData = getDetailProducts(detailData, data.ncmDescriptions, yearArg, 2, selectedYears);
    return {
      exp: aggregateByRubro(chapterData.exp, data.rubros.exp),
      imp: aggregateByRubro(chapterData.imp, data.rubros.imp),
    };
  }, [detailData, data.ncmDescriptions, data.rubros, selectedYears, productView]);

  if (!bloc) return null;

  return (
    <div className="country-panel">
      <div className="panel-header">
        <div>
          <h2>{bloc.label}</h2>
          <p className="panel-subtitle">{members.length} socios · {yearRange}</p>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Cerrar panel">&times;</button>
      </div>

      <div className="panel-kpis">
        <div className="panel-kpi">
          <span className="label">Exportaciones FOB</span>
          <span className="value exports">{fmt(totals.exp)}</span>
        </div>
        <div className="panel-kpi">
          <span className="label">Importaciones CIF</span>
          <span className="value imports">{fmt(totals.imp)}</span>
        </div>
        <div className="panel-kpi">
          <span className="label">Balance</span>
          <span className={`value ${totals.balance >= 0 ? 'surplus' : 'deficit'}`}>
            {totals.balance >= 0 ? '+' : ''}{fmt(totals.balance)}
          </span>
        </div>
      </div>

      <div className="panel-section">
        <TradeTimeline data={yearlyData} selectedYears={selectedYears} />
      </div>

      {/* Tabs */}
      <div className="panel-tabs">
        <button className={activeTab === 'paises' ? 'active' : ''} onClick={() => setActiveTab('paises')}>Países</button>
        <button className={activeTab === 'productos' ? 'active' : ''} onClick={() => setActiveTab('productos')}>Productos</button>
        <button className={activeTab === 'ai' ? 'active' : ''} onClick={() => setActiveTab('ai')}>Analisis IA</button>
      </div>

      {activeTab === 'productos' && (
        <div className="panel-controls">
          <div className="flow-filter">
            <button className={flowFilter === 'both' ? 'active' : ''} onClick={() => setFlowFilter('both')}>Ambos</button>
            <button className={`exp ${flowFilter === 'exp' ? 'active' : ''}`} onClick={() => setFlowFilter('exp')}>Exp</button>
            <button className={`imp ${flowFilter === 'imp' ? 'active' : ''}`} onClick={() => setFlowFilter('imp')}>Imp</button>
          </div>
          <div className="digit-selector">
            <div className="view-toggle-panel">
              <button className={productView === 'chapters' ? 'active' : ''} onClick={() => setProductView('chapters')}>Cap.</button>
              <button className={productView === 'rubros' ? 'active' : ''} onClick={() => setProductView('rubros')}>Rubros</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-content">
        {activeTab === 'ai' ? (
          <AiBlocAnalysis
            bloc={bloc}
            members={members}
            totals={totals}
            data={data}
            selectedYears={selectedYears}
          />
        ) : activeTab === 'paises' ? (
          <div className="bloc-members-list">
            {members.map(m => (
              <button
                key={m.name}
                className="bloc-member-row"
                onClick={() => { onClose(); onSelectCountry(m.name); }}
              >
                <span className="bloc-member-name">{m.name}</span>
                <span className="bloc-member-bars">
                  <span className="exp" style={{ width: `${(m.exp / maxMemberTrade) * 100}%` }} />
                  <span className="imp" style={{ width: `${(m.imp / maxMemberTrade) * 100}%` }} />
                </span>
                <span className={`bloc-member-val ${m.balance >= 0 ? 'surplus' : 'deficit'}`}>
                  {fmt(m.balance)}
                </span>
              </button>
            ))}
          </div>
        ) : detailLoading ? (
          <div className="loading-detail">Cargando productos del bloque...</div>
        ) : (
          <ProductChart
            data={productView === 'rubros' ? rubrosData : productData}
            flowFilter={flowFilter}
            total={{ exp: totals.exp, imp: totals.imp }}
            digitLevel={2}
            viewMode={productView}
          />
        )}
      </div>
    </div>
  );
}
