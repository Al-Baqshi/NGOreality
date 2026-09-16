/**
 * City / town options for location dropdowns across the app.
 *
 * Registry imports store suburb-level locations ("Pipitea", "Epsom"), which
 * are too fine for a directory filter or map. Portal and CRM forms pick from
 * this list instead so new locations group cleanly. Anything not listed can
 * still be typed via "Other".
 */
export const CITIES_BY_COUNTRY: Record<string, readonly string[]> = {
  NZ: [
    'Auckland',
    'Wellington',
    'Christchurch',
    'Hamilton',
    'Tauranga',
    'Dunedin',
    'Palmerston North',
    'Napier',
    'Hastings',
    'Nelson',
    'Rotorua',
    'New Plymouth',
    'Whangārei',
    'Invercargill',
    'Whanganui',
    'Gisborne',
    'Lower Hutt',
    'Upper Hutt',
    'Porirua',
    'Kāpiti Coast',
    'Masterton',
    'Blenheim',
    'Timaru',
    'Oamaru',
    'Queenstown',
    'Wānaka',
    'Ashburton',
    'Rangiora',
    'Greymouth',
    'Westport',
    'Hokitika',
    'Motueka',
    'Richmond',
    'Taupō',
    'Tokoroa',
    'Te Awamutu',
    'Cambridge',
    'Matamata',
    'Morrinsville',
    'Thames',
    'Whitianga',
    'Waihi',
    'Whakatāne',
    'Ōpōtiki',
    'Kawerau',
    'Te Puke',
    'Katikati',
    'Pukekohe',
    'Waiuku',
    'Warkworth',
    'Ōrewa',
    'Waiheke Island',
    'Dargaville',
    'Kaitaia',
    'Kerikeri',
    'Kaikohe',
    'Paihia',
    'Hāwera',
    'Stratford',
    'Feilding',
    'Levin',
    'Dannevirke',
    'Waipukurau',
    'Wairoa',
    'Martinborough',
    'Featherston',
    'Kaikōura',
    'Gore',
    'Balclutha',
    'Alexandra',
    'Cromwell',
    'Te Anau',
    'Chatham Islands',
  ],
  AU: [
    'Sydney',
    'Melbourne',
    'Brisbane',
    'Perth',
    'Adelaide',
    'Gold Coast',
    'Canberra',
    'Newcastle',
    'Wollongong',
    'Hobart',
    'Geelong',
    'Townsville',
    'Cairns',
    'Darwin',
    'Toowoomba',
    'Ballarat',
    'Bendigo',
    'Launceston',
  ],
};

export function citiesForCountry(countryCode: string | null | undefined): readonly string[] {
  return CITIES_BY_COUNTRY[(countryCode ?? '').toUpperCase()] ?? [];
}

/** Case- and macron-insensitive match of a typed city to a listed one. */
export function matchListedCity(countryCode: string, raw: string): string | null {
  const fold = (s: string) =>
    s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  const target = fold(raw);
  if (!target) return null;
  return citiesForCountry(countryCode).find((c) => fold(c) === target) ?? null;
}
