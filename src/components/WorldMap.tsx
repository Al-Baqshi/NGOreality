import { useState, useRef } from 'react';
import worldMapPaths from '../data/world-map-paths.json';
import { COUNTRY_NAMES } from '../data/countryNames';

interface WorldMapProps {
  countryCounts: Record<string, number>;
  onCountryClick?: (code: string) => void;
}

export default function WorldMap({ countryCounts, onCountryClick }: WorldMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; code: string; count: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent, code: string) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const count = countryCounts[code] || 0;
    setTooltip({ x, y, code, count });
  };

  const handleMouseLeave = () => {
    setHovered(null);
    setTooltip(null);
  };

  const maxCount = Math.max(...Object.values(countryCounts), 1);

  const getCountryColor = (code: string) => {
    const count = countryCounts[code] || 0;
    if (count === 0) return hovered === code ? '#d4d4d4' : '#e5e5e5';
    const intensity = 0.3 + 0.7 * (count / maxCount);
    const r = Math.round(220 - intensity * 180);
    const g = Math.round(220 - intensity * 60);
    const b = Math.round(220 - intensity * 140);
    return `rgb(${r},${g},${b})`;
  };

  const getCountryStroke = (code: string) => {
    return hovered === code ? '#0a0a0a' : '#ffffff';
  };

  const getCountryStrokeWidth = (code: string) => {
    return hovered === code ? 1.5 : 0.5;
  };

  const countryName = (code: string) => COUNTRY_NAMES[code] || code;

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      <svg
        viewBox="0 0 2000 1001"
        className="w-full h-auto"
        style={{ maxHeight: '520px' }}
        role="img"
        aria-label="Interactive world map showing NGOreality verified organizations by country"
      >
        {/* Ocean background */}
        <rect x="0" y="0" width="2000" height="1001" fill="#f8fafc" />

        {/* Country paths */}
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
            onMouseMove={(e) => handleMouseMove(e, code)}
            onMouseLeave={handleMouseLeave}
            onClick={() => onCountryClick?.(code)}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
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
      </div>
    </div>
  );
}
