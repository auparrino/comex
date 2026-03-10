import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { getCountryCoords } from '../utils/countryCoords';
import { COLORS } from '../utils/colors';
import { fmt } from '../utils/format';
import './WorldMap.css';

function getCountryTotals(summary, selectedYears) {
  const result = {};
  for (const [name, data] of Object.entries(summary)) {
    if (name === 'Confidencial' || name === 'Indeterminado (continente)') continue;
    let exp = 0, imp = 0;
    for (const yr of selectedYears) {
      exp += data.years[yr]?.exp || 0;
      imp += data.years[yr]?.imp || 0;
    }
    if (exp > 0 || imp > 0) {
      result[name] = { exp, imp, total: exp + imp, balance: exp - imp, iso2: data.iso2 };
    }
  }
  return result;
}

export default function WorldMap({
  data,
  selectedYear,
  selectedYears,
  selectedCountry,
  onSelectCountry,
  reporterCoords,
  selectedProduct,
  productMapData,
}) {
  const svgRef = useRef();
  const tooltipRef = useRef();
  const [worldData, setWorldData] = useState(null);
  const [hoveredCountry, setHoveredCountry] = useState(null);

  const countryTotals = useMemo(
    () => getCountryTotals(data.summary, selectedYears),
    [data.summary, selectedYears]
  );

  // When a product is selected, use product map data for coloring
  const effectiveTotals = useMemo(() => {
    if (selectedProduct && productMapData) {
      const result = {};
      for (const [name, vals] of Object.entries(productMapData)) {
        const exp = vals.exp || 0;
        const imp = vals.imp || 0;
        if (exp > 0 || imp > 0) {
          result[name] = {
            exp, imp,
            total: exp + imp,
            balance: exp - imp,
            iso2: data.summary?.[name]?.iso2 || '',
          };
        }
      }
      return result;
    }
    return countryTotals;
  }, [countryTotals, selectedProduct, productMapData, data.summary]);

  // Build ISO2 -> country name mapping
  const isoToName = useMemo(() => {
    const map = {};
    const source = selectedProduct && productMapData ? { ...data.summary } : data.summary;
    for (const [name, d] of Object.entries(source)) {
      if (!d.iso2) continue;
      if (name.includes('(') && map[d.iso2]) continue;
      map[d.iso2] = name;
    }
    return map;
  }, [data.summary, selectedProduct, productMapData]);

  // Hub coordinates (reporter's position)
  const hubCoords = reporterCoords || [-34.6, -58.4];

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/world-110m.json`)
      .then(r => r.json())
      .then(setWorldData);
  }, []);

  useEffect(() => {
    if (!worldData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const container = svgRef.current.parentElement;
    const width = container.clientWidth;
    const height = Math.min(width * 0.55, window.innerHeight - 200);

    svg.attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');

    const expGrad = defs.append('linearGradient').attr('id', 'exp-grad');
    expGrad.append('stop').attr('offset', '0%').attr('stop-color', COLORS.exports).attr('stop-opacity', 0.8);
    expGrad.append('stop').attr('offset', '100%').attr('stop-color', COLORS.exports).attr('stop-opacity', 0.2);

    const impGrad = defs.append('linearGradient').attr('id', 'imp-grad');
    impGrad.append('stop').attr('offset', '0%').attr('stop-color', COLORS.imports).attr('stop-opacity', 0.2);
    impGrad.append('stop').attr('offset', '100%').attr('stop-color', COLORS.imports).attr('stop-opacity', 0.8);

    const projection = d3.geoNaturalEarth1()
      .center([-20, -5])
      .scale(width / 5.5)
      .translate([width / 2, height / 2]);

    const path = d3.geoPath(projection);
    const countries = topojson.feature(worldData, worldData.objects.countries);

    const totals = effectiveTotals;
    const maxTrade = Math.max(1, ...Object.values(totals).map(c => c.total));
    const colorScale = d3.scaleSqrt().domain([0, maxTrade]).range([0, 1]);

    const zoomG = svg.append('g');
    const g = zoomG;

    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        zoomG.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Draw countries
    g.selectAll('path.country')
      .data(countries.features)
      .join('path')
      .attr('class', 'country')
      .attr('d', path)
      .attr('fill', d => {
        const name = findCountryName(d.id, isoToName);

        if (name && totals[name]) {
          const t = totals[name];
          const intensity = colorScale(t.total);
          if (t.balance >= 0) {
            return d3.interpolate('#e8dcc0', COLORS.exports)(intensity);
          } else {
            return d3.interpolate('#e8dcc0', COLORS.imports)(intensity);
          }
        }
        return '#e8dcc0';
      })
      .attr('stroke', d => {
        let name = findCountryName(d.id, isoToName);
        return name === selectedCountry ? COLORS.highlight : '#d4c4a0';
      })
      .attr('stroke-width', d => {
        let name = findCountryName(d.id, isoToName);
        return name === selectedCountry ? 2 : 0.5;
      })
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        const name = findCountryName(d.id, isoToName);
        if (name && totals[name]) {
          onSelectCountry(name);
        }
      })
      .on('mouseenter', (event, d) => {
        const name = findCountryName(d.id, isoToName);
        if (name && totals[name]) {
          setHoveredCountry(name);
          const tooltip = tooltipRef.current;
          if (tooltip) {
            const t = totals[name];
            const productLabel = selectedProduct ? ` (${selectedProduct})` : '';
            tooltip.style.display = 'block';
            tooltip.innerHTML = `
              <strong>${name}${productLabel}</strong>
              <div class="tt-row"><span class="tt-exp">Exp FOB:</span> ${fmt(t.exp)}</div>
              <div class="tt-row"><span class="tt-imp">Imp CIF:</span> ${fmt(t.imp)}</div>
              <div class="tt-row"><span class="tt-bal">Balance:</span> ${fmt(t.balance)}</div>
            `;
          }
        }
      })
      .on('mousemove', (event) => {
        const tooltip = tooltipRef.current;
        if (tooltip) {
          const rect = container.getBoundingClientRect();
          tooltip.style.left = (event.clientX - rect.left + 12) + 'px';
          tooltip.style.top = (event.clientY - rect.top - 10) + 'px';
        }
      })
      .on('mouseleave', () => {
        setHoveredCountry(null);
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      });

    // Draw trade arcs
    const arcCountries = selectedCountry
      ? [selectedCountry]
      : Object.entries(totals)
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, 8)
          .map(([n]) => n);

    // Use dynamic reporter coordinates
    const hubProj = projection([hubCoords[1], hubCoords[0]]);

    const arcsGroup = zoomG.append('g').attr('class', 'arcs');

    for (const name of arcCountries) {
      const coords = getCountryCoords(name);
      if (!coords) continue;
      const t = totals[name];
      if (!t) continue;

      const targetProj = projection([coords[1], coords[0]]);
      if (!targetProj || !hubProj) continue;

      const dx = targetProj[0] - hubProj[0];
      const dy = targetProj[1] - hubProj[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const curvature = dist * 0.3;

      const midX = (hubProj[0] + targetProj[0]) / 2;
      const midY = (hubProj[1] + targetProj[1]) / 2;
      const perpX = -dy / dist * curvature;
      const perpY = dx / dist * curvature;

      const arcWidth = selectedCountry
        ? d3.scaleSqrt().domain([0, Math.max(t.exp, t.imp)]).range([1, 5])
        : d3.scaleSqrt().domain([0, maxTrade]).range([0.5, 3]);

      if (t.exp > 0) {
        arcsGroup.append('path')
          .attr('d', `M ${hubProj[0]},${hubProj[1]} Q ${midX + perpX},${midY + perpY} ${targetProj[0]},${targetProj[1]}`)
          .attr('fill', 'none')
          .attr('stroke', COLORS.exports)
          .attr('stroke-width', selectedCountry ? arcWidth(t.exp) : arcWidth(t.total))
          .attr('stroke-opacity', selectedCountry ? 0.7 : 0.35)
          .attr('stroke-linecap', 'round');
      }

      if (t.imp > 0) {
        arcsGroup.append('path')
          .attr('d', `M ${targetProj[0]},${targetProj[1]} Q ${midX - perpX},${midY - perpY} ${hubProj[0]},${hubProj[1]}`)
          .attr('fill', 'none')
          .attr('stroke', COLORS.imports)
          .attr('stroke-width', selectedCountry ? arcWidth(t.imp) : arcWidth(t.total))
          .attr('stroke-opacity', selectedCountry ? 0.7 : 0.25)
          .attr('stroke-linecap', 'round');
      }

      arcsGroup.append('circle')
        .attr('cx', targetProj[0])
        .attr('cy', targetProj[1])
        .attr('r', selectedCountry ? 4 : 2.5)
        .attr('fill', t.balance >= 0 ? COLORS.exports : COLORS.imports)
        .attr('stroke', '#FDF0D5')
        .attr('stroke-width', 1);
    }

    // Reporter hub dot
    if (hubProj) {
      arcsGroup.append('circle')
        .attr('cx', hubProj[0])
        .attr('cy', hubProj[1])
        .attr('r', 5)
        .attr('fill', COLORS.highlight)
        .attr('stroke', '#FDF0D5')
        .attr('stroke-width', 1.5);
    }

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 160}, ${height - 60})`);

    legend.append('rect').attr('x', 0).attr('y', 0).attr('width', 12).attr('height', 12).attr('fill', COLORS.exports).attr('rx', 2);
    legend.append('text').attr('x', 18).attr('y', 10).text('Exportaciones FOB').attr('fill', COLORS.text).attr('font-size', '11px');
    legend.append('rect').attr('x', 0).attr('y', 18).attr('width', 12).attr('height', 12).attr('fill', COLORS.imports).attr('rx', 2);
    legend.append('text').attr('x', 18).attr('y', 28).text('Importaciones CIF').attr('fill', COLORS.text).attr('font-size', '11px');

  }, [worldData, effectiveTotals, selectedCountry, isoToName, onSelectCountry, hubCoords, selectedProduct]);

  return (
    <div className="world-map-container">
      <svg ref={svgRef} className="world-map-svg" />
      <div ref={tooltipRef} className="map-tooltip" style={{ display: 'none' }} />
    </div>
  );
}

function findCountryName(numericId, isoToName) {
  const numId = parseInt(numericId, 10);
  for (const [iso2, name] of Object.entries(isoToName)) {
    if (parseInt(ISO_NUM_MAP[iso2], 10) === numId) return name;
  }
  return null;
}

// ISO 3166-1 numeric -> ISO2 mapping (common countries)
const ISO_NUM_MAP = {
  'AF': '4', 'AL': '8', 'DZ': '12', 'AS': '16', 'AD': '20', 'AO': '24',
  'AG': '28', 'AR': '32', 'AM': '51', 'AU': '36', 'AT': '40', 'AZ': '31',
  'BS': '44', 'BH': '48', 'BD': '50', 'BB': '52', 'BY': '112', 'BE': '56',
  'BZ': '84', 'BJ': '204', 'BT': '64', 'BO': '68', 'BA': '70', 'BW': '72',
  'BR': '76', 'BN': '96', 'BG': '100', 'BF': '854', 'BI': '108',
  'KH': '116', 'CM': '120', 'CA': '124', 'CV': '132', 'CF': '140',
  'TD': '148', 'CL': '152', 'CN': '156', 'CO': '170', 'KM': '174',
  'CG': '178', 'CD': '180', 'CR': '188', 'CI': '384', 'HR': '191',
  'CU': '192', 'CY': '196', 'CZ': '203', 'DK': '208', 'DJ': '262',
  'DM': '212', 'DO': '214', 'EC': '218', 'EG': '818', 'SV': '222',
  'GQ': '226', 'ER': '232', 'EE': '233', 'ET': '231', 'FJ': '242',
  'FI': '246', 'FR': '250', 'GA': '266', 'GM': '270', 'GE': '268',
  'DE': '276', 'GH': '288', 'GR': '300', 'GD': '308', 'GT': '320',
  'GN': '324', 'GW': '624', 'GY': '328', 'HT': '332', 'HN': '340',
  'HU': '348', 'IS': '352', 'IN': '356', 'ID': '360', 'IR': '364',
  'IQ': '368', 'IE': '372', 'IL': '376', 'IT': '380', 'JM': '388',
  'JP': '392', 'JO': '400', 'KZ': '398', 'KE': '404', 'KI': '296',
  'KP': '408', 'KR': '410', 'KW': '414', 'KG': '417', 'LA': '418',
  'LV': '428', 'LB': '422', 'LS': '426', 'LR': '430', 'LY': '434',
  'LI': '438', 'LT': '440', 'LU': '442', 'MK': '807', 'MG': '450',
  'MW': '454', 'MY': '458', 'MV': '462', 'ML': '466', 'MT': '470',
  'MR': '478', 'MU': '480', 'MX': '484', 'MD': '498', 'MC': '492',
  'MN': '496', 'ME': '499', 'MA': '504', 'MZ': '508', 'MM': '104',
  'NA': '516', 'NP': '524', 'NL': '528', 'NZ': '554', 'NI': '558',
  'NE': '562', 'NG': '566', 'NO': '578', 'OM': '512', 'PK': '586',
  'PA': '591', 'PG': '598', 'PY': '600', 'PE': '604', 'PH': '608',
  'PL': '616', 'PT': '620', 'QA': '634', 'RO': '642', 'RU': '643',
  'RW': '646', 'SA': '682', 'SN': '686', 'RS': '688', 'SL': '694',
  'SG': '702', 'SK': '703', 'SI': '705', 'SB': '90', 'SO': '706',
  'ZA': '710', 'SS': '728', 'ES': '724', 'LK': '144', 'SD': '729',
  'SR': '740', 'SZ': '748', 'SE': '752', 'CH': '756', 'SY': '760',
  'TW': '158', 'TJ': '762', 'TZ': '834', 'TH': '764', 'TL': '626',
  'TG': '768', 'TT': '780', 'TN': '788', 'TR': '792', 'TM': '795',
  'UG': '800', 'UA': '804', 'AE': '784', 'GB': '826', 'US': '840',
  'UY': '858', 'UZ': '860', 'VU': '548', 'VE': '862', 'VN': '704',
  'YE': '887', 'ZM': '894', 'ZW': '716',
  'XK': '-99', 'PS': '275', 'EH': '732',
};
