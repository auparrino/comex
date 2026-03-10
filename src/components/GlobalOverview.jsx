import { useMemo, useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { fmt, fmtFull, fmtPct, MONTHS } from '../utils/format';
import { COLORS, RUBRO_COLORS } from '../utils/colors';
import { aggregateByRubro } from '../hooks/useTradeData';
import './GlobalOverview.css';

export default function GlobalOverview({ data, selectedYear, selectedYears }) {
  const timelineRef = useRef();
  const monthlyRef = useRef();
  const [productView, setProductView] = useState('chapters');

  // Check if monthly data is available
  const hasMonthlyData = useMemo(() => {
    if (!data.globals?.monthly) return false;
    return selectedYears.some(yr => {
      const m = data.globals.monthly[yr];
      return m && (m.exp.some(v => v > 0) || m.imp.some(v => v > 0));
    });
  }, [data.globals, selectedYears]);

  // Global KPIs — use products data when monthly is empty (Comtrade annual)
  const kpis = useMemo(() => {
    if (!data.globals) return null;
    let totalExp = 0, totalImp = 0;

    if (hasMonthlyData) {
      selectedYears.forEach(yr => {
        const m = data.globals.monthly[yr];
        if (m) {
          totalExp += m.exp.reduce((s, v) => s + v, 0);
          totalImp += m.imp.reduce((s, v) => s + v, 0);
        }
      });
    } else {
      // Fall back to products data for totals
      selectedYears.forEach(yr => {
        const p = data.globals.products[yr];
        if (p) {
          totalExp += Object.values(p.exp || {}).reduce((s, v) => s + v, 0);
          totalImp += Object.values(p.imp || {}).reduce((s, v) => s + v, 0);
        }
      });
    }

    const partners = data.countries.filter(c => {
      let trade = 0;
      for (const yr of selectedYears) {
        const yd = data.summary[c.name]?.years?.[yr];
        if (yd) trade += yd.exp + yd.imp;
      }
      return trade > 0;
    }).length;

    return { totalExp, totalImp, balance: totalExp - totalImp, partners };
  }, [data, selectedYears]);

  // Rubros aggregation
  const rubrosData = useMemo(() => {
    if (!data.globals || !data.rubros || productView !== 'rubros') return null;

    const expByChapter = {};
    const impByChapter = {};

    selectedYears.forEach(yr => {
      const p = data.globals.products[yr];
      if (!p) return;
      for (const [ch, val] of Object.entries(p.exp || {})) {
        expByChapter[ch] = (expByChapter[ch] || 0) + val;
      }
      for (const [ch, val] of Object.entries(p.imp || {})) {
        impByChapter[ch] = (impByChapter[ch] || 0) + val;
      }
    });

    const expItems = Object.entries(expByChapter).map(([ch, val]) => ({
      chapter: ch, value: val, name: data.chapters[ch] || `Cap ${ch}`,
    }));
    const impItems = Object.entries(impByChapter).map(([ch, val]) => ({
      chapter: ch, value: val, name: data.chapters[ch] || `Cap ${ch}`,
    }));

    return {
      exp: aggregateByRubro(expItems, data.rubros.exp),
      imp: aggregateByRubro(impItems, data.rubros.imp),
    };
  }, [data.globals, data.chapters, data.rubros, selectedYears, productView]);

  // Timeline chart
  useEffect(() => {
    if (!timelineRef.current || !data.globals) return;

    const container = timelineRef.current.parentElement;
    const width = container.clientWidth;
    const height = 220;
    const margin = { top: 15, right: 15, bottom: 30, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(timelineRef.current).attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const years = Object.keys(data.globals.products || data.globals.monthly).sort();
    const yearData = years.map(yr => {
      if (hasMonthlyData) {
        const m = data.globals.monthly[yr];
        return {
          year: yr,
          exp: m ? m.exp.reduce((s, v) => s + v, 0) : 0,
          imp: m ? m.imp.reduce((s, v) => s + v, 0) : 0,
        };
      } else {
        const p = data.globals.products[yr];
        return {
          year: yr,
          exp: p ? Object.values(p.exp || {}).reduce((s, v) => s + v, 0) : 0,
          imp: p ? Object.values(p.imp || {}).reduce((s, v) => s + v, 0) : 0,
        };
      }
    });

    const x = d3.scaleBand().domain(years).range([0, innerW]).padding(0.3);
    const maxVal = d3.max(yearData, d => Math.max(d.exp, d.imp));
    const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([innerH, 0]);

    // Grid
    g.selectAll('.grid')
      .data(y.ticks(5))
      .join('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#d4c4a0').attr('stroke-dasharray', '2,3');

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => fmt(d)))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').remove())
      .call(g => g.selectAll('text').attr('fill', '#4a6a7a').attr('font-size', '11px'));

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').attr('fill', '#003049').attr('font-size', '11px'));

    const halfBar = x.bandwidth() / 2;

    // Export bars
    g.selectAll('.bar-exp')
      .data(yearData)
      .join('rect')
      .attr('x', d => x(d.year))
      .attr('y', d => y(d.exp))
      .attr('width', halfBar)
      .attr('height', d => innerH - y(d.exp))
      .attr('fill', COLORS.exports)
      .attr('opacity', d => selectedYears.includes(d.year) ? 0.85 : 0.3)
      .attr('rx', 3);

    // Import bars
    g.selectAll('.bar-imp')
      .data(yearData)
      .join('rect')
      .attr('x', d => x(d.year) + halfBar)
      .attr('y', d => y(d.imp))
      .attr('width', halfBar)
      .attr('height', d => innerH - y(d.imp))
      .attr('fill', COLORS.imports)
      .attr('opacity', d => selectedYears.includes(d.year) ? 0.85 : 0.3)
      .attr('rx', 3);

    // Balance dots
    g.selectAll('.bal-dot')
      .data(yearData)
      .join('circle')
      .attr('cx', d => x(d.year) + x.bandwidth() / 2)
      .attr('cy', d => y((d.exp + d.imp) / 2))
      .attr('r', 0);

  }, [data.globals, selectedYears, hasMonthlyData]);

  // Top 10 chapters data (HTML-based, not D3)
  const top10Chapters = useMemo(() => {
    if (!data.globals) return [];
    const productTotals = {};
    selectedYears.forEach(yr => {
      const p = data.globals.products[yr];
      if (!p) return;
      for (const [ch, val] of Object.entries(p.exp || {})) {
        if (!productTotals[ch]) productTotals[ch] = { exp: 0, imp: 0, chapter: ch };
        productTotals[ch].exp += val;
      }
      for (const [ch, val] of Object.entries(p.imp || {})) {
        if (!productTotals[ch]) productTotals[ch] = { exp: 0, imp: 0, chapter: ch };
        productTotals[ch].imp += val;
      }
    });
    return Object.values(productTotals)
      .map(p => ({ ...p, total: p.exp + p.imp, name: data.chapters[p.chapter] || `Cap ${p.chapter}` }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [data.globals, data.chapters, selectedYears]);

  // Global monthly seasonality
  useEffect(() => {
    if (!monthlyRef.current || !data.globals) return;

    const container = monthlyRef.current.parentElement;
    const width = container.clientWidth;
    const height = 200;
    const margin = { top: 10, right: 10, bottom: 28, left: 55 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(monthlyRef.current).attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Aggregate monthly
    let expM = new Array(12).fill(0);
    let impM = new Array(12).fill(0);
    let count = 0;

    selectedYears.forEach(yr => {
      const m = data.globals.monthly[yr];
      if (!m) return;
      count++;
      m.exp.forEach((v, i) => expM[i] += v);
      m.imp.forEach((v, i) => impM[i] += v);
    });

    if (count > 1) {
      expM = expM.map(v => v / count);
      impM = impM.map(v => v / count);
    }

    const x = d3.scaleBand().domain(MONTHS).range([0, innerW]).padding(0.15);
    const maxVal = Math.max(...expM, ...impM);
    const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([innerH, 0]);

    g.selectAll('.grid')
      .data(y.ticks(4))
      .join('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#d4c4a0').attr('stroke-dasharray', '2,3');

    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => fmt(d)))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').remove())
      .call(g => g.selectAll('text').attr('fill', '#4a6a7a').attr('font-size', '10px'));

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').attr('fill', '#003049').attr('font-size', '10px'));

    const halfBar = x.bandwidth() / 2;

    g.selectAll('.bar-exp')
      .data(expM)
      .join('rect')
      .attr('x', (_, i) => x(MONTHS[i]))
      .attr('y', d => y(d))
      .attr('width', halfBar)
      .attr('height', d => innerH - y(d))
      .attr('fill', COLORS.exports).attr('opacity', 0.8).attr('rx', 2);

    g.selectAll('.bar-imp')
      .data(impM)
      .join('rect')
      .attr('x', (_, i) => x(MONTHS[i]) + halfBar)
      .attr('y', d => y(d))
      .attr('width', halfBar)
      .attr('height', d => innerH - y(d))
      .attr('fill', COLORS.imports).attr('opacity', 0.8).attr('rx', 2);

  }, [data.globals, selectedYears]);

  if (!kpis) return null;

  return (
    <div className="global-overview">
      {/* KPIs */}
      <div className="kpi-row">
        <div className="kpi-card">
          <span className="label">Total exportaciones FOB</span>
          <span className="value exports">{fmt(kpis.totalExp)}</span>
        </div>
        <div className="kpi-card">
          <span className="label">Total importaciones CIF</span>
          <span className="value imports">{fmt(kpis.totalImp)}</span>
        </div>
        <div className="kpi-card">
          <span className="label">Balance comercial</span>
          <span className={`value ${kpis.balance >= 0 ? 'surplus' : 'deficit'}`}>
            {kpis.balance >= 0 ? '+' : ''}{fmt(kpis.balance)}
          </span>
        </div>
        <div className="kpi-card">
          <span className="label">Socios comerciales</span>
          <span className="value" style={{ color: 'var(--text)' }}>{kpis.partners}</span>
        </div>
      </div>

      <div className="overview-grid">
        {/* Timeline */}
        <div className="overview-card wide">
          <h3 className="section-title">Evolución anual del comercio</h3>
          <div className="chart-container">
            <svg ref={timelineRef} />
          </div>
          <div className="legend-row">
            <span className="legend-item"><span className="dot" style={{ background: COLORS.exports }} />Exportaciones FOB</span>
            <span className="legend-item"><span className="dot" style={{ background: COLORS.imports }} />Importaciones CIF</span>
          </div>
        </div>

        {/* Products */}
        <div className="overview-card wide">
          <div className="section-title-row">
            <h3 className="section-title">
              {productView === 'chapters' ? 'Top 10 capitulos del SA' : 'Grandes Rubros'}
            </h3>
            <div className="view-toggle">
              <button
                className={productView === 'chapters' ? 'active' : ''}
                onClick={() => setProductView('chapters')}
              >
                Capitulos
              </button>
              <button
                className={productView === 'rubros' ? 'active' : ''}
                onClick={() => setProductView('rubros')}
              >
                Rubros
              </button>
            </div>
          </div>
          {productView === 'chapters' ? (
            <div className="chapters-chart">
              {top10Chapters.map(d => {
                const maxTotal = top10Chapters[0]?.total || 1;
                return (
                  <div key={d.chapter} className="chapter-row">
                    <div className="chapter-header">
                      <span className="chapter-code">{d.chapter}</span>
                      <span className="chapter-name">{d.name}</span>
                      <span className="chapter-total">{fmt(d.total)}</span>
                    </div>
                    <div className="chapter-bar-container">
                      <div className="chapter-bar exp" style={{ width: `${(d.exp / maxTotal) * 100}%` }} />
                      <div className="chapter-bar imp" style={{ width: `${(d.imp / maxTotal) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : rubrosData ? (
            <div className="rubros-chart">
              <div className="rubros-section">
                <h4 className="rubros-flow-title exp-title">Exportaciones FOB</h4>
                {rubrosData.exp.map(r => {
                  const totalExp = rubrosData.exp.reduce((s, x) => s + x.value, 0);
                  return (
                    <div key={r.code} className="rubro-row">
                      <div className="rubro-header">
                        <span className="rubro-code" style={{ background: RUBRO_COLORS[r.code] }}>{r.code}</span>
                        <span className="rubro-name">{r.name}</span>
                      </div>
                      <div className="rubro-bar-container">
                        <div
                          className="rubro-bar"
                          style={{
                            width: `${totalExp > 0 ? (r.value / totalExp) * 100 : 0}%`,
                            backgroundColor: RUBRO_COLORS[r.code],
                          }}
                        />
                      </div>
                      <div className="rubro-values">
                        <span className="rubro-amount">{fmt(r.value)}</span>
                        <span className="rubro-pct">{totalExp > 0 ? fmtPct(r.value / totalExp) : '0%'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rubros-section">
                <h4 className="rubros-flow-title imp-title">Importaciones CIF</h4>
                {rubrosData.imp.map(r => {
                  const totalImp = rubrosData.imp.reduce((s, x) => s + x.value, 0);
                  return (
                    <div key={r.code} className="rubro-row">
                      <div className="rubro-header">
                        <span className="rubro-code" style={{ background: RUBRO_COLORS[r.code] }}>{r.code}</span>
                        <span className="rubro-name">{r.name}</span>
                      </div>
                      <div className="rubro-bar-container">
                        <div
                          className="rubro-bar"
                          style={{
                            width: `${totalImp > 0 ? (r.value / totalImp) * 100 : 0}%`,
                            backgroundColor: RUBRO_COLORS[r.code],
                          }}
                        />
                      </div>
                      <div className="rubro-values">
                        <span className="rubro-amount">{fmt(r.value)}</span>
                        <span className="rubro-pct">{totalImp > 0 ? fmtPct(r.value / totalImp) : '0%'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Monthly (only if data available) */}
        {hasMonthlyData && (
          <div className="overview-card wide">
            <h3 className="section-title">
              Estacionalidad {selectedYears.length > 1 ? '(promedio)' : selectedYears[0]}
            </h3>
            <div className="chart-container">
              <svg ref={monthlyRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
