import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTradeData } from './hooks/useTradeData';
import WorldMap from './components/WorldMap';
import CountryPanel from './components/CountryPanel';
import GlobalOverview from './components/GlobalOverview';
import YearRangeSelector from './components/YearRangeSelector';
import TopPartners from './components/TopPartners';
import ReporterSelector from './components/ReporterSelector';
import ProductSelector from './components/ProductSelector';
import BlocPanel from './components/BlocPanel';
import './App.css';

export default function App() {
  const data = useTradeData();
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [yearFrom, setYearFrom] = useState(null);
  const [yearTo, setYearTo] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productMapData, setProductMapData] = useState(null);
  const [blocHighlight, setBlocHighlight] = useState(new Set());
  const [selectedBloc, setSelectedBloc] = useState(null);

  // Get active reporter config
  const activeReporterConfig = useMemo(() => {
    if (!data.reporters) return null;
    return data.reporters.find(r => r.key === data.activeReporter);
  }, [data.reporters, data.activeReporter]);

  // Reset state when reporter changes
  useEffect(() => {
    setSelectedCountry(null);
    setShowAnalysis(false);
    setSelectedProduct(null);
    setProductMapData(null);
    setYearFrom(null);
    setYearTo(null);
  }, [data.activeReporter]);

  // Load product map when product selected (supports 2/4/6-digit and rubros)
  useEffect(() => {
    if (!selectedProduct) {
      setProductMapData(null);
      return;
    }

    // Helper: aggregate multiple hs6 entries into {partner: {exp, imp}}
    const aggregate = (chapterData, filterFn) => {
      const result = {};
      for (const [hs6, partners] of Object.entries(chapterData)) {
        if (filterFn && !filterFn(hs6)) continue;
        for (const [partner, vals] of Object.entries(partners)) {
          if (!result[partner]) result[partner] = { exp: 0, imp: 0 };
          result[partner].exp += vals.exp || 0;
          result[partner].imp += vals.imp || 0;
        }
      }
      return Object.keys(result).length > 0 ? result : null;
    };

    if (selectedProduct.startsWith('rubro:')) {
      // Rubro: load multiple chapters and aggregate
      const rubroCode = selectedProduct.slice(6);
      const allRubros = [...(data.rubros?.exp || []), ...(data.rubros?.imp || [])];
      const rubro = allRubros.find(r => r.code === rubroCode);
      if (!rubro) { setProductMapData(null); return; }

      Promise.all(rubro.chapters.map(ch => data.loadProductMap(ch)))
        .then(results => {
          const merged = {};
          for (const chData of results) {
            if (!chData) continue;
            const agg = aggregate(chData, null);
            if (agg) {
              for (const [partner, vals] of Object.entries(agg)) {
                if (!merged[partner]) merged[partner] = { exp: 0, imp: 0 };
                merged[partner].exp += vals.exp;
                merged[partner].imp += vals.imp;
              }
            }
          }
          setProductMapData(Object.keys(merged).length > 0 ? merged : null);
        });
    } else if (selectedProduct.length === 2) {
      // Chapter (2-digit): load single chapter, aggregate all HS6
      data.loadProductMap(selectedProduct).then(chapterData => {
        if (!chapterData) { setProductMapData(null); return; }
        setProductMapData(aggregate(chapterData, null));
      });
    } else if (selectedProduct.length === 4) {
      // Heading (4-digit): load chapter, aggregate HS6 starting with this heading
      const chapter = selectedProduct.slice(0, 2);
      data.loadProductMap(chapter).then(chapterData => {
        if (!chapterData) { setProductMapData(null); return; }
        setProductMapData(aggregate(chapterData, hs6 => hs6.startsWith(selectedProduct)));
      });
    } else {
      // HS6 (6-digit): load chapter, get specific code
      const chapter = selectedProduct.slice(0, 2);
      data.loadProductMap(chapter).then(chapterData => {
        if (chapterData && chapterData[selectedProduct]) {
          setProductMapData(chapterData[selectedProduct]);
        } else {
          setProductMapData(null);
        }
      });
    }
  }, [selectedProduct, data.loadProductMap, data.rubros]);

  // Initialize year range once data loads
  const from = yearFrom || data.years[0];
  const to = yearTo || data.years[data.years.length - 1];

  const selectedYear = useMemo(() => {
    if (!data.years.length) return 'all';
    if (from === data.years[0] && to === data.years[data.years.length - 1]) return 'all';
    if (from === to) return from;
    return from;
  }, [from, to, data.years]);

  const selectedYears = useMemo(() => {
    return data.years.filter(y => y >= from && y <= to);
  }, [data.years, from, to]);

  const handleYearChange = useCallback((newFrom, newTo) => {
    setYearFrom(newFrom);
    setYearTo(newTo);
  }, []);

  const handleSelectCountry = useCallback((name) => {
    setSelectedCountry(prev => prev === name ? null : name);
    setSelectedBloc(null);
    setShowAnalysis(false);
  }, []);

  const handleSelectBloc = useCallback((key) => {
    setSelectedBloc(prev => prev === key ? null : key);
    setSelectedCountry(null);
    setShowAnalysis(false);
  }, []);

  const handleToggleAnalysis = useCallback(() => {
    setShowAnalysis(prev => !prev);
    if (!showAnalysis) setSelectedCountry(null);
  }, [showAnalysis]);

  if (data.loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Cargando datos de comercio exterior...</p>
      </div>
    );
  }

  if (data.error) {
    return <div className="error-screen">Error: {data.error}</div>;
  }

  const hasPanel = selectedCountry || selectedBloc || showAnalysis;
  const reporterName = activeReporterConfig?.name || 'Argentina';
  const yearRange = data.years.length
    ? `${data.years[0]}-${data.years[data.years.length - 1]}`
    : '';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>Comercio Exterior - {reporterName}</h1>
          <p className="subtitle">{yearRange} · Datos {data.activeReporter === 'arg' ? 'INDEC' : 'Comtrade'}</p>
        </div>
        <div className="header-right">
          <ReporterSelector
            reporters={data.reporters}
            active={data.activeReporter}
            onChange={data.setActiveReporter}
          />
          <button
            className={`analysis-toggle ${showAnalysis ? 'active' : ''}`}
            onClick={handleToggleAnalysis}
          >
            Resumen
          </button>
          <YearRangeSelector
            years={data.years}
            from={from}
            to={to}
            onChange={handleYearChange}
          />
        </div>
      </header>

      <main className="app-main">
        <div className={`map-layout ${hasPanel ? 'with-panel' : ''}`}>
          <div className="map-section">
            <ProductSelector
              chapters={data.chapters}
              hsDescriptions={data.ncmDescriptions}
              rubros={data.rubros}
              selected={selectedProduct}
              onSelect={setSelectedProduct}
            />
            <WorldMap
              data={data}
              selectedYear={selectedYear}
              selectedYears={selectedYears}
              selectedCountry={selectedCountry}
              onSelectCountry={handleSelectCountry}
              reporterCoords={activeReporterConfig?.coords || [-34.6, -58.4]}
              selectedProduct={selectedProduct}
              productMapData={productMapData}
              blocHighlight={blocHighlight}
            />
            <TopPartners
              countries={data.countries}
              summary={data.summary}
              selectedYears={selectedYears}
              selectedCountry={selectedCountry}
              onSelect={handleSelectCountry}
              selectedProduct={selectedProduct}
              productMapData={productMapData}
              onBlocHighlight={setBlocHighlight}
              onSelectBloc={handleSelectBloc}
              selectedBloc={selectedBloc}
              comtradeValidation={data.comtradeValidation}
            />
          </div>
          {selectedCountry && (
            <CountryPanel
              country={selectedCountry}
              data={data}
              selectedYear={selectedYear}
              selectedYears={selectedYears}
              onClose={() => setSelectedCountry(null)}
            />
          )}
          {selectedBloc && !selectedCountry && (
            <BlocPanel
              blocKey={selectedBloc}
              data={data}
              selectedYears={selectedYears}
              onClose={() => setSelectedBloc(null)}
              onSelectCountry={handleSelectCountry}
            />
          )}
          {showAnalysis && !selectedCountry && !selectedBloc && (
            <div className="analysis-panel">
              <div className="panel-header">
                <h2>Resumen Global - {reporterName}</h2>
                <button className="close-btn" onClick={() => setShowAnalysis(false)}>&times;</button>
              </div>
              <div className="analysis-panel-content">
                <GlobalOverview data={data} selectedYear={selectedYear} selectedYears={selectedYears} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
