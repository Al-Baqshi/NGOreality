import { supabase } from './supabase';

/**
 * Fuzzy check of a self-submitted organization name against the imported
 * registry rows, so staff can spot "they registered as new but are already on
 * the NZ Charities Register" before verifying anyone.
 */

export interface RegistryMatch {
  id: string;
  name: string;
  charity_registration_number: string;
  registry_url: string;
  status: string;
  location: string;
}

/** Words so common in charity names that a hit on them alone means nothing. */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'trust',
  'charitable',
  'charity',
  'foundation',
  'society',
  'incorporated',
  'inc',
  'limited',
  'ltd',
  'association',
  'group',
  'services',
  'service',
  'community',
  'new',
  'zealand',
  'aotearoa',
]);

export function registryMatchTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9āēīōū]+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
    .slice(0, 4);
}

export async function findRegistryMatches(
  name: string,
  excludeOrgId?: string,
): Promise<RegistryMatch[]> {
  const tokens = registryMatchTokens(name);
  // Names made entirely of stop words ("The Charitable Trust") would match
  // half the register — fall back to the full name instead of flooding staff.
  const patterns = tokens.length > 0 ? tokens : [name.trim().toLowerCase()];
  if (!patterns[0]) return [];

  // Commas separate or() clauses and % is the wildcard; strip both from input.
  const orFilter = patterns
    .map((t) => `name.ilike.%${t.replace(/[,%()]/g, '')}%`)
    .join(',');

  let query = supabase
    .from('organizations')
    .select('id, name, charity_registration_number, registry_url, status, location')
    .neq('source_registry', '')
    .or(orFilter)
    .limit(20);
  if (excludeOrgId) query = query.neq('id', excludeOrgId);

  const { data, error } = await query;
  if (error || !data) return [];

  const scored = data
    .map((row) => {
      const rowName = row.name.toLowerCase();
      const hits = tokens.filter((t) => rowName.includes(t)).length;
      const score = tokens.length > 0 ? hits / tokens.length : 1;
      return { row, score };
    })
    // A single shared token out of several is coincidence, not a duplicate.
    .filter(({ score }) => score >= 0.5)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map(({ row }) => row as RegistryMatch);
}
