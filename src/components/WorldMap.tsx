import { useState, useRef, useCallback, useEffect } from 'react';
import worldMapPaths from '../data/world-map-paths.json';
import { COUNTRY_NAMES } from '../data/countryNames';
import { ZoomIn, ZoomOut, Maximize, ChevronDown, Search, X } from 'lucide-react';

interface WorldMapProps {
  countryCounts: Record<string, number>;
  onCountryClick?: (code: string) => void;
  selectedCountry?: string;
}

const COUNTRY_LIST = Object.entries(COUNTRY_NAMES)
  .filter(([code]) => code in worldMapPaths)
  .sort(([, a], [, b]) => a.localeCompare(b));

export default function WorldMap({ countryCounts, onCountryClick, selectedCountry }: WorldMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; code: string; count: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panStartOffset, setPanStartOffset] = useState({ x: 0, y: 0 });

  // Country dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 8;

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.4, MAX_ZOOM));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.4, MIN_ZOOM));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    setZoom(z => Math.min(Math.max(z * delta, MIN_ZOOM), MAX_ZOOM));
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (zoom <= 1) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    setPanStartOffset({ x: pan.x, y: pan.y });
  }, [zoom, pan]);

  const handleMouseMovePan = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    setPan({ x: panStartOffset.x + dx, y: panStartOffset.y + dy });
  }, [isPanning, panStart, panStartOffset]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Tooltip
  const handleCountryMouseMove = (e: React.MouseEvent, code: string) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const count = countryCounts[code] || 0;
    setTooltip({ x, y, code, count });
  };

  const handleCountryMouseLeave = () => {
    setHovered(null);
    setTooltip(null);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const maxCount = Math.max(...Object.values(countryCounts), 1);

  const getCountryColor = (code: string) => {
    const count = countryCounts[code] || 0;
    if (selectedCountry === code) return '#0d9488';
    if (count === 0) return hovered === code ? '#d4d4d4' : '#e5e5e5';
    const intensity = 0.3 + 0.7 * (count / maxCount);
    const r = Math.round(220 - intensity * 180);
    const g = Math.round(220 - intensity * 60);
    const b = Math.round(220 - intensity * 140);
    return `rgb(${r},${g},${b})`;
  };

  const getCountryStroke = (code: string) => {
    if (selectedCountry === code) return '#0a0a0a';
    return hovered === code ? '#0a0a0a' : '#ffffff';
  };

  const getCountryStrokeWidth = (code: string) => {
    if (selectedCountry === code) return 2;
    return hovered === code ? 1.5 : 0.5;
  };

  const countryName = (code: string) => COUNTRY_NAMES[code] || code;

  const filteredCountries = COUNTRY_LIST.filter(([, name]) =>
    name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const viewBox = `0 0 2000 1001`;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Map container with zoom/pan */}
      <div
        className="relative overflow-hidden border-2 border-ink-950 bg-[#f8fafc]"
        style={{ cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMovePan}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="w-full h-auto"
          style={{
            maxHeight: '520px',
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.2s ease',
          }}
          role="img"
          aria-label="Interactive world map showing NGOreality verified organizations by country"
        >
          <rect x="0" y="0" width="2000" height="1001" fill="#f8fafc" />

          {Object.entries(worldMapPaths).map(([code, d]) => (
            <path
              key={code}
              d={d as string}
              id={code}
              fill={getCountryColor(code)}
              stroke={getCountryStroke(code)}
              strokeWidth={getCountryStrokeWidth(code)}
              style={{ cursor: 'pointer', transition: 'fill 0.15s ease, stroke 0.15s ease' }}
              onMouseEnter={() => setHovered(code)}
              onMouseMove={(e) => handleCountryMouseMove(e, code)}
              onMouseLeave={handleCountryMouseLeave}
              onClick={() => onCountryClick?.(code)}
            />
          ))}
        </svg>

        {/* Zoom controls - top right */}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          <button
            onClick={handleZoomIn}
            className="h-8 w-8 flex items-center justify-center bg-white border-2 border-ink-950 shadow-brutal-sm hover:bg-ink-50 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={handleZoomOut}
            className="h-8 w-8 flex items-center justify-center bg-white border-2 border-ink-950 shadow-brutal-sm hover:bg-ink-50 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={handleReset}
            className="h-8 w-8 flex items-center justify-center bg-white border-2 border-ink-950 shadow-brutal-sm hover:bg-ink-50 transition-colors"
            title="Reset view"
          >
            <Maximize size={16} />
          </button>
        </div>

        {/* Zoom level indicator */}
        {zoom > 1 && (
          <div className="absolute top-3 left-3 font-mono text-2xs uppercase tracking-wider bg-white border-2 border-ink-950 px-2 py-1 shadow-brutal-sm">
            {Math.round(zoom * 100)}%
          </div>
        )}

        {/* Country dropdown - top left */}
        <div ref={dropdownRef} className="absolute top-3 left-3" style={{ marginLeft: zoom > 1 ? '80px' : '0' }}>
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 bg-white border-2 border-ink-950 px-3 py-1.5 shadow-brutal-sm hover:bg-ink-50 transition-colors font-mono text-2xs uppercase tracking-wider"
            >
              {selectedCountry ? (
                <>
                  <span className="truncate max-w-[120px]">{countryName(selectedCountry)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCountryClick?.(''); setDropdownOpen(false); }}
                    className="ml-1 hover:text-red-600"
                  >
                    <X size={12} />
                  </button>
                </>
              ) : (
                <>
                  <Search size={12} />
                  <span>Select country</span>
                </>
              )}
              <ChevronDown size={12} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border-2 border-ink-950 shadow-brutal z-50 max-h-72 flex flex-col">
                <div className="p-2 border-b-2 border-ink-100">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                    <input
                      type="text"
                      placeholder="Search countries..."
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 text-xs border border-ink-200 focus:outline-none focus:border-ink-950 font-mono"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="overflow-y-auto flex-1">
                  {filteredCountries.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-ink-400 font-mono">No countries found</div>
                  ) : (
                    filteredCountries.map(([code, name]) => {
                      const count = countryCounts[code] || 0;
                      return (
                        <button
                          key={code}
                          onClick={() => {
                            onCountryClick?.(code);
                            setDropdownOpen(false);
                            setCountrySearch('');
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-ink-50 transition-colors flex items-center justify-between ${
                            selectedCountry === code ? 'bg-teal-light font-bold' : ''
                          }`}
                        >
                          <span>{name}</span>
                          {count > 0 && (
                            <span className="font-mono text-2xs text-teal ml-2">{count}</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && !isPanning && (
          <div
            className="pointer-events-none absolute z-50 bg-ink-950 text-white px-3 py-2 border-2 border-ink-950 shadow-brutal"
            style={{
              left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth || 800) - 200),
              top: Math.max(tooltip.y - 40, 4),
            }}
          >
            <div className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-300 mb-0.5">
              {countryName(tooltip.code)}
            </div>
            <div className="text-sm font-black">
              {tooltip.count > 0 ? (
                <>{tooltip.count} {tooltip.count === 1 ? 'organization' : 'organizations'}</>
              ) : (
                <span className="text-ink-400">No verified organizations</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 font-mono text-2xs uppercase tracking-wider text-ink-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-[#e5e5e5] border border-ink-200" />
          <span>No organizations</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-[#b8d4b8] border border-ink-200" />
          <span>1+ verified</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-[#4a8c4a] border border-ink-200" />
          <span>High concentration</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-[#0d9488] border border-ink-200" />
          <span>Selected</span>
        </div>
      </div>
    </div>
  );
}
