import { useState, useMemo, useRef, useEffect } from 'react';
import './ProductSelector.css';

export default function ProductSelector({
  chapters,
  hsDescriptions,
  onSelect,
  selected,
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState(null);
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

  const chapterList = useMemo(() => {
    if (!chapters) return [];
    return Object.entries(chapters)
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [chapters]);

  const hs6InChapter = useMemo(() => {
    if (!selectedChapter || !hsDescriptions) return [];
    return Object.entries(hsDescriptions)
      .filter(([code]) => code.startsWith(selectedChapter) && code.length === 6)
      .map(([code, desc]) => ({ code, desc }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [selectedChapter, hsDescriptions]);

  const searchResults = useMemo(() => {
    if (!search.trim() || !hsDescriptions) return null;
    const q = search.toLowerCase();
    return Object.entries(hsDescriptions)
      .filter(([code, desc]) =>
        code.length === 6 &&
        (code.includes(q) || desc.toLowerCase().includes(q))
      )
      .map(([code, desc]) => ({ code, desc }))
      .slice(0, 50);
  }, [search, hsDescriptions]);

  const handleSelect = (code) => {
    onSelect(code);
    setIsOpen(false);
    setSearch('');
    setSelectedChapter(null);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onSelect(null);
    setSearch('');
    setSelectedChapter(null);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const items = searchResults || (selectedChapter ? hs6InChapter : null);
  const showChapters = !search && !selectedChapter;

  return (
    <div className="product-selector" ref={containerRef}>
      <div className="ps-trigger" onClick={handleOpen}>
        {selected ? (
          <span className="ps-selected">
            <span className="ps-code">{selected}</span>
            <span className="ps-desc">
              {hsDescriptions?.[selected] || ''}
            </span>
            <button className="ps-clear" onClick={handleClear}>&times;</button>
          </span>
        ) : (
          <span className="ps-placeholder">
            Filtrar mapa por producto HS6...
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
          {selectedChapter && !search && (
            <button
              className="ps-back"
              onClick={() => setSelectedChapter(null)}
            >
              &larr; Volver a capítulos
            </button>
          )}
          <div className="ps-list">
            {showChapters ? (
              chapterList.map(ch => (
                <button
                  key={ch.code}
                  className="ps-item ps-chapter"
                  onClick={() => setSelectedChapter(ch.code)}
                >
                  <span className="ps-item-code">{ch.code}</span>
                  <span className="ps-item-desc">{ch.name}</span>
                  <span className="ps-arrow">&rsaquo;</span>
                </button>
              ))
            ) : items && items.length > 0 ? (
              items.map(item => (
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
              <div className="ps-empty">
                {search ? 'Sin resultados' : 'Sin productos en este capítulo'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
