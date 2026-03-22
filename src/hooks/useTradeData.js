import { useState, useEffect, useMemo, useCallback } from 'react';

const BASE = import.meta.env.BASE_URL;

export function useTradeData() {
  // Shared data (loaded once)
  const [reporters, setReporters] = useState(null);
  const [chapters, setChapters] = useState(null);
  const [rubros, setRubros] = useState(null);

  // Reporter-specific data
  const [activeReporter, setActiveReporter] = useState('arg');
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState(null);
  const [globals, setGlobals] = useState(null);
  const [ncmDescriptions, setNcmDescriptions] = useState(null);
  const [countrySlugs, setCountrySlugs] = useState(null);
  const [monthly, setMonthly] = useState(null);

  const [comtradeValidation, setComtradeValidation] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cache for loaded country detail files (cleared on reporter change)
  const [detailCache, setDetailCache] = useState({});
  // Cache for product map files
  const [productMapCache, setProductMapCache] = useState({});

  // Load shared data once on mount
  useEffect(() => {
    Promise.all([
      fetch(`${BASE}data/reporters.json`).then(r => r.json()),
      fetch(`${BASE}data/chapters.json`).then(r => r.json()),
      fetch(`${BASE}data/rubros.json`).then(r => r.json()),
    ])
      .then(([reps, ch, rub]) => {
        setReporters(reps);
        setChapters(ch);
        setRubros(rub);
      })
      .catch(err => {
        setError(err.message);
      });
  }, []);

  // Load reporter-specific data when activeReporter changes
  useEffect(() => {
    if (!reporters) return; // Wait for shared data
    setLoading(true);
    setDetailCache({});
    setProductMapCache({});

    const base = `${BASE}data/reporters/${activeReporter}`;
    Promise.all([
      fetch(`${base}/summary.json`).then(r => r.json()),
      fetch(`${base}/products.json`).then(r => r.json()),
      fetch(`${base}/globals.json`).then(r => r.json()),
      fetch(`${base}/hs_descriptions.json`).then(r => r.json()),
      fetch(`${base}/country_slugs.json`).then(r => r.json()),
      fetch(`${base}/monthly.json`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${base}/comtrade_validation.json`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([s, p, g, desc, slugs, m, cv]) => {
        setSummary(s);
        setProducts(p);
        setGlobals(g);
        setNcmDescriptions(desc);
        setCountrySlugs(slugs);
        setMonthly(m);
        setComtradeValidation(cv?.countries || null);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [activeReporter, reporters]);

  // Load detail file for a specific country
  const loadCountryDetail = useCallback(async (countryName) => {
    if (detailCache[countryName]) return detailCache[countryName];
    if (!countrySlugs || !countrySlugs[countryName]) return null;

    const slug = countrySlugs[countryName];
    try {
      const resp = await fetch(`${BASE}data/reporters/${activeReporter}/details/${slug}.json`);
      if (!resp.ok) return null;
      const data = await resp.json();
      setDetailCache(prev => ({ ...prev, [countryName]: data }));
      return data;
    } catch {
      return null;
    }
  }, [countrySlugs, detailCache, activeReporter]);

  // Load product map for choropleth (by chapter)
  const loadProductMap = useCallback(async (chapter) => {
    const cacheKey = `${activeReporter}_${chapter}`;
    if (productMapCache[cacheKey]) return productMapCache[cacheKey];

    try {
      const resp = await fetch(`${BASE}data/reporters/${activeReporter}/product_map/ch${chapter}.json`);
      if (!resp.ok) return null;
      const data = await resp.json();
      setProductMapCache(prev => ({ ...prev, [cacheKey]: data }));
      return data;
    } catch {
      return null;
    }
  }, [activeReporter, productMapCache]);

  const years = useMemo(() => {
    if (!summary) return [];
    const allYears = new Set();
    Object.values(summary).forEach(c => {
      Object.keys(c.years).forEach(y => allYears.add(y));
    });
    return [...allYears].sort();
  }, [summary]);

  const countries = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary)
      .filter(([name]) => name !== 'Confidencial' && name !== 'Indeterminado (continente)')
      .map(([name, data]) => {
        const totalExp = Object.values(data.years).reduce((s, y) => s + y.exp, 0);
        const totalImp = Object.values(data.years).reduce((s, y) => s + y.imp, 0);
        return {
          name,
          iso2: data.iso2,
          totalExports: totalExp,
          totalImports: totalImp,
          totalTrade: totalExp + totalImp,
          balance: totalExp - totalImp,
        };
      })
      .sort((a, b) => b.totalTrade - a.totalTrade);
  }, [summary]);

  return {
    summary, products, chapters, globals, monthly,
    ncmDescriptions, countrySlugs, rubros,
    comtradeValidation,
    years, countries, loading, error,
    loadCountryDetail, detailCache,
    loadProductMap,
    activeReporter, setActiveReporter, reporters,
  };
}

export function getCountryYearData(summary, country, years) {
  if (!summary || !summary[country]) return [];
  const data = summary[country].years;
  return years.map(y => ({
    year: y,
    exp: data[y]?.exp || 0,
    imp: data[y]?.imp || 0,
    balance: (data[y]?.exp || 0) - (data[y]?.imp || 0),
  }));
}

export function getCountryProducts(products, chapters, country, year) {
  if (!products || !products[country] || !products[country][year]) return { exp: [], imp: [] };
  const data = products[country][year];

  const makeList = (obj) =>
    Object.entries(obj || {})
      .map(([ch, val]) => ({
        chapter: ch,
        value: val,
        name: chapters?.[ch] || `Cap. ${ch}`,
      }))
      .sort((a, b) => b.value - a.value);

  return {
    exp: makeList(data.exp),
    imp: makeList(data.imp),
  };
}

/**
 * Get products at a specific digit level from detail data.
 * @param {object} detailData - country detail data (loaded from details/{slug}.json)
 * @param {object} descriptions - HS descriptions at all levels
 * @param {string} year - year string or 'all'
 * @param {number} digits - 2, 4, or 6
 * @param {string[]} allYears - list of all years
 */
export function getDetailProducts(detailData, descriptions, year, digits, allYears) {
  if (!detailData) return { exp: [], imp: [] };

  const expAgg = {};
  const impAgg = {};
  const yearsToUse = year === 'all' ? allYears : [year];
  const dKey = String(digits);

  for (const yr of yearsToUse) {
    const yrData = detailData[yr]?.[dKey];
    if (!yrData) continue;
    for (const [code, val] of Object.entries(yrData.exp || {})) {
      expAgg[code] = (expAgg[code] || 0) + val;
    }
    for (const [code, val] of Object.entries(yrData.imp || {})) {
      impAgg[code] = (impAgg[code] || 0) + val;
    }
  }

  // Check if a description is a generic catch-all ("Los demás", etc.)
  const isGeneric = (desc) => {
    if (!desc) return true;
    const d = desc.replace(/^-+\s*/, '').trim().toLowerCase();
    return d.startsWith('los dem') || d.startsWith('las dem') || d === 'otros' || d === 'otras'
      || d.startsWith('other') || d === 'others';
  };

  // Truncate to max length
  const truncate = (s, max) => s && s.length > max ? s.slice(0, max - 3) + '...' : s;

  // Lookup description with parent-code fallback (6→4→2 digits)
  const descLookup = (code) => {
    const ownDesc = descriptions?.[code];

    const findMeaningfulParent = () => {
      for (const len of [4, 2]) {
        if (code.length > len) {
          const parentDesc = descriptions?.[code.slice(0, len)];
          if (parentDesc && !isGeneric(parentDesc)) return parentDesc;
        }
      }
      return null;
    };

    if (!ownDesc) {
      const parent = findMeaningfulParent();
      return parent || null;
    }

    if (isGeneric(ownDesc)) {
      const parent = findMeaningfulParent();
      if (parent) return `${truncate(parent, 60)}: Los Demás`;
      return ownDesc;
    }

    return ownDesc;
  };

  const makeList = (obj) =>
    Object.entries(obj)
      .map(([code, value]) => ({
        chapter: code,
        value,
        name: descLookup(code) || `HS ${code}`,
      }))
      .sort((a, b) => b.value - a.value);

  return {
    exp: makeList(expAgg),
    imp: makeList(impAgg),
  };
}

export function getCountryMonthly(monthly, country, year) {
  if (!monthly || !monthly[country] || !monthly[country][year]) {
    return { exp: new Array(12).fill(0), imp: new Array(12).fill(0) };
  }
  return monthly[country][year];
}

/**
 * Aggregate chapter-level product data into Grandes Rubros.
 * @param {Array} chapterItems - [{chapter, value, name}]
 * @param {Array} rubroDefs - rubros definition array (exp or imp from rubros.json)
 * @returns {Array} [{code, name, value, chapters: [{chapter, value, name}]}]
 */
export function aggregateByRubro(chapterItems, rubroDefs) {
  if (!chapterItems || !rubroDefs) return [];

  const chToRubro = {};
  for (const r of rubroDefs) {
    for (const ch of r.chapters) {
      chToRubro[ch] = r.code;
    }
  }

  const groups = {};
  for (const r of rubroDefs) {
    groups[r.code] = { code: r.code, name: r.name, value: 0, chapters: [] };
  }

  for (const item of chapterItems) {
    const rubroCode = chToRubro[item.chapter];
    if (rubroCode && groups[rubroCode]) {
      groups[rubroCode].value += item.value;
      groups[rubroCode].chapters.push(item);
    }
  }

  return rubroDefs
    .map(r => groups[r.code])
    .filter(g => g.value > 0);
}

export function calcConcentration(monthlyValues) {
  const total = monthlyValues.reduce((s, v) => s + v, 0);
  if (total === 0) return { hhi: 0, gini: 0 };

  const shares = monthlyValues.map(v => v / total);
  const hhi = shares.reduce((s, sh) => s + sh * sh, 0);
  const hhiNorm = (hhi - 1 / 12) / (1 - 1 / 12);

  const mean = total / 12;
  const variance = monthlyValues.reduce((s, v) => s + (v - mean) ** 2, 0) / 12;
  const cv = Math.sqrt(variance) / mean;

  return { hhi: hhiNorm, cv };
}
