import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { COLORS } from '../utils/colors';
import { fmt } from '../utils/format';
import './TradeTimeline.css';

export default function TradeTimeline({ data, selectedYear, selectedYears }) {
  const svgRef = useRef();

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    const container = svgRef.current.parentElement;
    const width = container.clientWidth;
    const height = 120;
    const margin = { top: 8, right: 10, bottom: 22, left: 45 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scalePoint()
      .domain(data.map(d => d.year))
      .range([0, innerW])
      .padding(0.1);

    const maxVal = d3.max(data, d => Math.max(d.exp, d.imp));
    const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([innerH, 0]);

    // Grid
    g.selectAll('.grid')
      .data(y.ticks(3))
      .join('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#d4c4a0')
      .attr('stroke-dasharray', '2,3');

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => fmt(d)))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').remove())
      .call(g => g.selectAll('text').attr('fill', '#4a6a7a').attr('font-size', '9px'));

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').attr('fill', '#003049').attr('font-size', '9px'));

    // Export line
    const lineExp = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.exp))
      .curve(d3.curveMonotoneX);

    const lineImp = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.imp))
      .curve(d3.curveMonotoneX);

    // Export area
    const areaExp = d3.area()
      .x(d => x(d.year))
      .y0(innerH)
      .y1(d => y(d.exp))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('d', areaExp)
      .attr('fill', COLORS.exports)
      .attr('opacity', 0.1);

    g.append('path')
      .datum(data)
      .attr('d', lineExp)
      .attr('fill', 'none')
      .attr('stroke', COLORS.exports)
      .attr('stroke-width', 2);

    // Import area
    const areaImp = d3.area()
      .x(d => x(d.year))
      .y0(innerH)
      .y1(d => y(d.imp))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('d', areaImp)
      .attr('fill', COLORS.imports)
      .attr('opacity', 0.1);

    g.append('path')
      .datum(data)
      .attr('d', lineImp)
      .attr('fill', 'none')
      .attr('stroke', COLORS.imports)
      .attr('stroke-width', 2);

    // Dots
    g.selectAll('.dot-exp')
      .data(data)
      .join('circle')
      .attr('cx', d => x(d.year))
      .attr('cy', d => y(d.exp))
      .attr('r', d => selectedYears?.includes(d.year) ? 5 : 3)
      .attr('fill', COLORS.exports)
      .attr('stroke', '#FDF0D5')
      .attr('stroke-width', 1);

    g.selectAll('.dot-imp')
      .data(data)
      .join('circle')
      .attr('cx', d => x(d.year))
      .attr('cy', d => y(d.imp))
      .attr('r', d => selectedYears?.includes(d.year) ? 5 : 3)
      .attr('fill', COLORS.imports)
      .attr('stroke', '#FDF0D5')
      .attr('stroke-width', 1);

  }, [data, selectedYears]);

  return (
    <div className="trade-timeline">
      <svg ref={svgRef} />
    </div>
  );
}
