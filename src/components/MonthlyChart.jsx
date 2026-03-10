import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { MONTHS } from '../utils/format';
import { COLORS } from '../utils/colors';
import { fmt } from '../utils/format';
import './MonthlyChart.css';

export default function MonthlyChart({ data, flowFilter }) {
  const svgRef = useRef();
  const showExp = flowFilter === 'both' || flowFilter === 'exp';
  const showImp = flowFilter === 'both' || flowFilter === 'imp';

  useEffect(() => {
    if (!svgRef.current) return;

    const container = svgRef.current.parentElement;
    const width = container.clientWidth;
    const height = 200;
    const margin = { top: 10, right: 10, bottom: 28, left: 50 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('viewBox', `0 0 ${width} ${height}`);

    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X scale
    const x = d3.scaleBand()
      .domain(MONTHS)
      .range([0, innerW])
      .padding(0.15);

    // Y scale
    let maxVal = 0;
    if (showExp) maxVal = Math.max(maxVal, ...data.exp);
    if (showImp) maxVal = Math.max(maxVal, ...data.imp);
    if (maxVal === 0) maxVal = 1;

    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.1])
      .range([innerH, 0]);

    // Grid lines
    g.selectAll('.grid-line')
      .data(y.ticks(4))
      .join('line')
      .attr('class', 'grid-line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#d4c4a0')
      .attr('stroke-dasharray', '2,3');

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => fmt(d)))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').remove())
      .call(g => g.selectAll('text').attr('fill', '#4a6a7a').attr('font-size', '10px'));

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').attr('fill', '#003049').attr('font-size', '10px'));

    const barWidth = showExp && showImp ? x.bandwidth() / 2 : x.bandwidth();

    // Export bars
    if (showExp) {
      g.selectAll('.bar-exp')
        .data(data.exp)
        .join('rect')
        .attr('class', 'bar-exp')
        .attr('x', (_, i) => x(MONTHS[i]) + (showImp ? 0 : 0))
        .attr('y', d => y(d))
        .attr('width', barWidth)
        .attr('height', d => innerH - y(d))
        .attr('fill', COLORS.exports)
        .attr('opacity', 0.8)
        .attr('rx', 2);
    }

    // Import bars
    if (showImp) {
      g.selectAll('.bar-imp')
        .data(data.imp)
        .join('rect')
        .attr('class', 'bar-imp')
        .attr('x', (_, i) => x(MONTHS[i]) + (showExp ? barWidth : 0))
        .attr('y', d => y(d))
        .attr('width', barWidth)
        .attr('height', d => innerH - y(d))
        .attr('fill', COLORS.imports)
        .attr('opacity', 0.8)
        .attr('rx', 2);
    }

  }, [data, showExp, showImp]);

  return (
    <div className="monthly-chart">
      <h4 className="monthly-title">Distribución mensual</h4>
      <div className="monthly-svg-container">
        <svg ref={svgRef} className="monthly-svg" />
      </div>
    </div>
  );
}
