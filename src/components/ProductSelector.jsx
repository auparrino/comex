import { useState, useMemo, useRef, useEffect } from 'react';
import './ProductSelector.css';

export default function ProductSelector({
  chapters,
  hsDescriptions,
  rubros,
  onSelect,
  selected,
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState(null);   // 2-digit drill
  const [selectedHeading, setSelectedHeading] = useState(null);   // 4-digit drill
  const [tab, setTab] = useState('capitulos'); // 'capitulos' | 'rubros'
  const containerRef = useRef();
  const inputRef = useRef();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Level 1: chapters (2-digit)
  const chapterList = useMemo(() => {
    if (!chapters) return [];
    return Object.entries(chapters)
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [chapters]);

  // Level 2: headings (4-digit) within selected chapter
  const hs4InChapter = useMemo(() => {
    if (!selectedChapter || !hsDescriptions) return [];
    return Object.entries(hsDescriptions)
      .filter(([code]) => code.startsWith(selectedChapter) && code.length === 4)
      .map(([code, desc]) => ({ code, desc }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [selectedChapter, hsDescriptions]);

  // Level 3: subheadings (6-digit) within selected heading
  const hs6InHeading = useMemo(() => {
    if (!selectedHeading || !hsDescriptions) return [];
    return Object.entries(hsDescriptions)
      .filter(([code]) => code.startsWith(selectedHeading) && code.length === 6)
      .map(([code, desc]) => ({ code, desc }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [selectedHeading, hsDescriptions]);

  // Rubros list (merge export & import rubros, deduplicate)
  const rubroList = useMemo(() => {
    if (!rubros) return [];
    const seen = new Set();
    const list = [];
    for (const r of [...(rubros.exp || []), ...(rubros.imp || [])]) {
      if (!seen.has(r.code)) {
        seen.add(r.code);
        list.push(r);
      }
    }
    return list;
  }, [rubros]);

  // Search across all levels (4-digit and 6-digit)
  const searchResults = useMemo(() => {
    if (!search.trim() || !hsDescriptions) return null;
    const q = search.toLowerCase();
    const results = Object.entries(hsDescriptions)
      .filter(([code, desc]) =>
        (code.length === 4 || code.length === 6) &&
        (code.includes(q) || desc.toLowerCase().includes(q))
      )
      .map(([code, desc]) => ({ code, desc }))
      .sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code))
      .slice(0, 50);
    // Also search chapters
    if (chapters) {
      const chMatches = Object.entries(chapters)
        .filter(([code, name]) => code.includes(q) || name.toLowerCase().includes(q))
        .map(([code, name]) => ({ code, desc: name }));
      return [...chMatches, ...results].slice(0, 50);
    }
    return results;
  }, [search, hsDescriptions, chapters]);

  // Get display label for the currently selected product
  const selectedLabel = useMemo(() => {
    if (!selected) return null;
    if (selected.startsWith('rubro:')) {
      const code = selected.slice(6);
      const rubro = rubroList.find(r => r.code === code);
      return { code, desc: rubro?.name || code, type: 'rubro' };
    }
    if (selected.length === 2) {
      return { code: selected, desc: chapters?.[selected] || '', type: 'capitulo' };
    }
    if (selected.length === 4) {
      return { code: selected, desc: hsDescriptions?.[selected] || '', type: 'partida' };
    }
    return { code: selected, desc: hsDescriptions?.[selected] || '', type: 'subpartida' };
  }, [selected, chapters, hsDescriptions, rubroList]);

  const handleSelect = (code) => {
    onSelect(code);
    setIsOpen(false);
    setSearch('');
    setSelectedChapter(null);
    setSelectedHeading(null);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onSelect(null);
    setSearch('');
    setSelectedChapter(null);
    setSelectedHeading(null);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleBack = () => {
    if (selectedHeading) {
      setSelectedHeading(null);
    } else if (selectedChapter) {
      setSelectedChapter(null);
    }
  };

  const handleDrillDown = (e, code) => {
    e.stopPropagation();
    if (code.length === 2) {
      setSelectedChapter(code);
    } else if (code.length === 4) {
      setSelectedChapter(code.slice(0, 2));
      setSelectedHeading(code);
    }
    setSearch('');
  };

  // Determine current navigation level
  const currentLevel = selectedHeading ? 3 : selectedChapter ? 2 : 1;
  const showChapters = !search && currentLevel === 1 && tab === 'capitulos';
  const showHeadings = !search && currentLevel === 2;
  const showSubheadings = !search && currentLevel === 3;
  const showRubros = !search && currentLevel === 1 && tab === 'rubros';

  // Breadcrumb text
  const breadcrumb = useMemo(() => {
    if (selectedHeading) {
      const chName = chapters?.[selectedChapter] || '';
      return `${selectedChapter} ${chName} › ${selectedHeading}`;
    }
    if (selectedChapter) {
      const chName = chapters?.[selectedChapter] || '';
      return `${selectedChapter} ${chName}`;
    }
    return null;
  }, [selectedChapter, selectedHeading, chapters]);

  return (
    <div className="product-selector" ref={containerRef}>
      <div className="ps-trigger" onClick={handleOpen}>
        {selected && selectedLabel ? (
          <span className="ps-selected">
            <span className="ps-badge">{selectedLabel.type === 'rubro' ? 'R' : selectedLabel.code.length === 2 ? 'Cap' : selectedLabel.code.length === 4 ? 'Part' : 'HS6'}</span>
            <span className="ps-code">{selectedLabel.code}</span>
            <span className="ps-desc">{selectedLabel.desc}</span>
            <button className="ps-clear" onClick={handleClear}>&times;</button>
          </span>
        ) : (
          <span className="ps-placeholder">
            Filtrar mapa por producto...
          </span>
        )}
      </div>

      {isOpen && (
        <div className="ps-dropdown">
          <input
            ref={inputRef}
            className="ps-search"
            placeholder="Buscar por codigo o descripcion..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {/* Tab toggle - only at top level with no search */}
          {!search && currentLevel === 1 && (
            <div className="ps-tabs">
              <button
                className={`ps-tab ${tab === 'capitulos' ? 'active' : ''}`}
                onClick={() => setTab('capitulos')}
              >
                Capítulos
              </button>
              <button
                className={`ps-tab ${tab === 'rubros' ? 'active' : ''}`}
                onClick={() => setTab('rubros')}
              >
                Rubros
              </button>
            </div>
          )}

          {/* Back navigation for drill-down levels */}
          {(selectedChapter || selectedHeading) && !search && (
            <div className="ps-nav-bar">
              <button className="ps-back" onClick={handleBack}>
                &larr; Volver
              </button>
              {breadcrumb && (
                <span className="ps-breadcrumb">{breadcrumb}</span>
              )}
            </div>
          )}

          <div className="ps-list">
            {search && searchResults ? (
              // Search results
              searchResults.length > 0 ? (
                searchResults.map(item => (
                  <div key={item.code} className="ps-row">
                    <button
                      className={`ps-item ${item.code.length <= 4 ? 'ps-heading' : ''}`}
                      onClick={() => handleSelect(item.code)}
                    >
                      <span className="ps-item-code">{item.code}</span>
                      <span className="ps-item-desc">{item.desc}</span>
                    </button>
                    {(item.code.length === 2 || item.code.length === 4) && (
                      <button
                        className="ps-drill"
                        onClick={(e) => handleDrillDown(e, item.code)}
                        title="Ver subitems"
                      >
                        &rsaquo;
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="ps-empty">Sin resultados</div>
              )
            ) : showRubros ? (
              // Rubros
              rubroList.map(r => (
                <button
                  key={r.code}
                  className="ps-item ps-rubro"
                  onClick={() => handleSelect(`rubro:${r.code}`)}
                >
                  <span className="ps-item-code">{r.code}</span>
                  <span className="ps-item-desc">{r.name}</span>
                  <span className="ps-rubro-count">{r.chapters.length} cap.</span>
                </button>
              ))
            ) : showChapters ? (
              // Level 1: chapters (2-digit) — click to select, arrow to drill
              chapterList.map(ch => (
                <div key={ch.code} className="ps-row">
                  <button
                    className="ps-item ps-chapter"
                    onClick={() => handleSelect(ch.code)}
                  >
                    <span className="ps-item-code">{ch.code}</span>
                    <span className="ps-item-desc">{ch.name}</span>
                  </button>
                  <button
                    className="ps-drill"
                    onClick={(e) => handleDrillDown(e, ch.code)}
                    title="Ver partidas"
                  >
                    &rsaquo;
                  </button>
                </div>
              ))
            ) : showHeadings ? (
              // Level 2: headings (4-digit) — click to select, arrow to drill
              hs4InChapter.length > 0 ? (
                hs4InChapter.map(item => (
                  <div key={item.code} className="ps-row">
                    <button
                      className="ps-item ps-heading"
                      onClick={() => handleSelect(item.code)}
                    >
                      <span className="ps-item-code">{item.code}</span>
                      <span className="ps-item-desc">{item.desc}</span>
                    </button>
                    <button
                      className="ps-drill"
                      onClick={(e) => handleDrillDown(e, item.code)}
                      title="Ver subpartidas"
                    >
                      &rsaquo;
                    </button>
                  </div>
                ))
              ) : (
                <div className="ps-empty">Sin partidas en este capítulo</div>
              )
            ) : showSubheadings ? (
              // Level 3: subheadings (6-digit) — click to select
              hs6InHeading.length > 0 ? (
                hs6InHeading.map(item => (
                  <button
                    key={item.code}
                    className="ps-item"
                    onClick={() => handleSelect(item.code)}
                  >
                    <span className="ps-item-code">{item.code}</span>
                    <span className="ps-item-desc">{item.desc}</span>
                  </button>
                ))
              ) : (
                <div className="ps-empty">Sin subpartidas en esta partida</div>
              )
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
