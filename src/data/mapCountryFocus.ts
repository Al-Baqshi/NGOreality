/** SVG viewBox presets (world map coordinate space 2000×1001) for country focus zoom */
export const COUNTRY_MAP_FOCUS: Record<
  string,
  { viewBox: string; zoom: number }
> = {
  NZ: { viewBox: '1755 755 260 220', zoom: 4.2 },
  AU: { viewBox: '1680 620 420 380', zoom: 2.8 },
};

export function getCountryFocus(code: string) {
  return COUNTRY_MAP_FOCUS[code] ?? null;
}
