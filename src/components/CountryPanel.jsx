import { useMemo, useState, useEffect } from 'react';
import {
  getCountryYearData,
  getCountryMonthly,
  getDetailProducts,
  calcConcentration,
  aggregateByRubro,
} from '../hooks/useTradeData';
import { fmt, MONTHS } from '../utils/format';
import ProductChart from './ProductChart';
import MonthlyChart from './MonthlyChart';
import TradeTimeline from './TradeTimeline';
import BilateralAnalysis from './BilateralAnalysis';
import './CountryPanel.css';

const DIGIT_OPTIONS = [
  { value: 2, label: '2 díg.' },
  { value: 4, label: '4 díg.' },
  { value: 6, label: '6 díg.' },
];

export default function CountryPanel({ country, data, selectedYear, selectedYears, onClose }) {
  const [activeTab, setActiveTab] = useState('products');
  const [flowFilter, setFlowFilter] = useState('both');
  const [digitLevel, setDigitLevel] = useState(2);
  const [productView, setProductView] = useState('chapters');
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Load detail data when country changes or digit level > 2
  useEffect(() => {
    if (!country) return;
    setDetailLoading(true);
    data.loadCountryDetail(country).then(d => {
      setDetailData(d);
      setDetailLoading(false);
    });
  }, [country, data.loadCountryDetail]);

  const yearlyData = useMemo(
    () => getCountryYearData(data.summary, country, data.years),
    [data.summary, country, data.years]
  );

  const totalExp = useMemo(() => {
    return yearlyData
      .filter(y => selectedYears.includes(y.year))
      .reduce((s, y) => s + y.exp, 0);
  }, [yearlyData, selectedYears]);

  const totalImp = useMemo(() => {
    return yearlyData
      .filter(y => selectedYears.includes(y.year))
      .reduce((s, y) => s + y.imp, 0);
  }, [yearlyData, selectedYears]);

  const balance = totalExp - totalImp;

  // Products at the selected digit level
  const productData = useMemo(() => {
    if (!detailData) return { exp: [], imp: [] };
    // Pass 'all' when multiple years, single year otherwise
    const yearArg = selectedYears.length === 1 ? selectedYears[0] : 'all';
    return getDetailProducts(
      detailData,
      data.ncmDescriptions,
      yearArg,
      digitLevel,
      selectedYears
    );
  }, [detailData, data.ncmDescriptions, selectedYears, digitLevel]);

  // Rubros aggregation (only at 2-digit level)
  const rubrosData = useMemo(() => {
    if (!data.rubros || productView !== 'rubros') return null;
    // Use 2-digit chapter data for rubros
    const chapterData = (() => {
      if (!detailData) return { exp: [], imp: [] };
      const yearArg = selectedYears.length === 1 ? selectedYears[0] : 'all';
      return getDetailProducts(detailData, data.ncmDescriptions, yearArg, 2, selectedYears);
    })();
    return {
      exp: aggregateByRubro(chapterData.exp, data.rubros.exp),
      imp: aggregateByRubro(chapterData.imp, data.rubros.imp),
    };
  }, [detailData, data.ncmDescriptions, data.rubros, selectedYears, productView]);

  // Monthly data (may not be available for Comtrade annual data)
  const monthlyData = useMemo(() => {
    if (!data.monthly) return { exp: new Array(12).fill(0), imp: new Array(12).fill(0) };
    if (selectedYears.length === 1) {
      return getCountryMonthly(data.monthly, country, selectedYears[0]);
    }
    const expAvg = new Array(12).fill(0);
    const impAvg = new Array(12).fill(0);
    let count = 0;
    for (const yr of selectedYears) {
      const md = getCountryMonthly(data.monthly, country, yr);
      const hasData = md.exp.some(v => v > 0) || md.imp.some(v => v > 0);
      if (hasData) {
        count++;
        md.exp.forEach((v, i) => expAvg[i] += v);
        md.imp.forEach((v, i) => impAvg[i] += v);
      }
    }
    if (count > 0) {
      expAvg.forEach((_, i) => expAvg[i] /= count);
      impAvg.forEach((_, i) => impAvg[i] /= count);
    }
    return { exp: expAvg, imp: impAvg };
  }, [data.monthly, country, selectedYears]);

  const hasMonthlyData = monthlyData.exp.some(v => v > 0) || monthlyData.imp.some(v => v > 0);
  const expConcentration = calcConcentration(monthlyData.exp);
  const impConcentration = calcConcentration(monthlyData.imp);

  return (
    <div className="country-panel">
      <div className="panel-header">
        <div>
          <h2>{country}</h2>
          <p className="panel-subtitle">
            {data.summary[country]?.iso2} · {selectedYears.length > 1
              ? `${selectedYears[0]}-${selectedYears[selectedYears.length - 1]}`
              : selectedYears[0]}
          </p>
        </div>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>

      {/* KPIs */}
      <div className="panel-kpis">
        <div className="panel-kpi">
          <span className="label">Exportaciones FOB</span>
          <span className="value exports">{fmt(totalExp)}</span>
        </div>
        <div className="panel-kpi">
          <span className="label">Importaciones CIF</span>
          <span className="value imports">{fmt(totalImp)}</span>
        </div>
        <div className="panel-kpi">
          <span className="label">Balance</span>
          <span className={`value ${balance >= 0 ? 'surplus' : 'deficit'}`}>
            {balance >= 0 ? '+' : ''}{fmt(balance)}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="panel-section">
        <TradeTimeline data={yearlyData} selectedYear={selectedYear} selectedYears={selectedYears} />
      </div>

      {/* Tabs */}
      <div className="panel-tabs">
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
        >
          Productos
        </button>
        {data.loadBilateralData && (
          <button
            className={activeTab === 'bilateral' ? 'active' : ''}
            onClick={() => setActiveTab('bilateral')}
          >
            Bilateral
          </button>
        )}
      </div>

      {/* Flow filter + digit selector (only on products tab) */}
      {activeTab === 'products' && (
        <div className="panel-controls">
          <div className="flow-filter">
            <button
              className={flowFilter === 'both' ? 'active' : ''}
              onClick={() => setFlowFilter('both')}
            >
              Ambos
            </button>
            <button
              className={`exp ${flowFilter === 'exp' ? 'active' : ''}`}
              onClick={() => setFlowFilter('exp')}
            >
              Exp
            </button>
            <button
              className={`imp ${flowFilter === 'imp' ? 'active' : ''}`}
              onClick={() => setFlowFilter('imp')}
            >
              Imp
            </button>
          </div>

          {activeTab === 'products' && (
            <div className="digit-selector">
              <div className="view-toggle-panel">
                <button
                  className={productView === 'chapters' ? 'active' : ''}
                  onClick={() => setProductView('chapters')}
                >
                  Cap.
                </button>
                <button
                  className={productView === 'rubros' ? 'active' : ''}
                  onClick={() => setProductView('rubros')}
                >
                  Rubros
                </button>
              </div>
              {productView === 'chapters' && DIGIT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={digitLevel === opt.value ? 'active' : ''}
                  onClick={() => setDigitLevel(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="panel-content">
        {activeTab === 'bilateral' ? (
          <BilateralAnalysis
            country={country}
            data={data}
            years={data.years}
            selectedYears={selectedYears}
          />
        ) : (
          <>
            {detailLoading ? (
              <div className="loading-detail">Cargando detalle...</div>
            ) : (
              <ProductChart
                data={productView === 'rubros' ? rubrosData : productData}
                flowFilter={flowFilter}
                total={{ exp: totalExp, imp: totalImp }}
                digitLevel={digitLevel}
                viewMode={productView}
              />
            )}
            {hasMonthlyData && (
              <div className="panel-seasonality">
                <h4 className="seasonality-title">
                  Estacionalidad {selectedYears.length > 1 ? '(promedio)' : selectedYears[0]}
                </h4>
                <MonthlyChart
                  data={monthlyData}
                  flowFilter={flowFilter}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
