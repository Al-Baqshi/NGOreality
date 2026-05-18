#!/usr/bin/env node
/**
 * Backfill tags on existing nz_charities_register imports from MainSectorId.
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

const ODATA_BASE = 'http://www.odata.charities.govt.nz';
const SOURCE = 'nz_charities_register';
const PAGE_SIZE = 1000;

function slugifyTag(label) {
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function loadSectorMap() {
  const res = await fetch(`${ODATA_BASE}/Sectors?$format=json`);
  const json = await res.json();
  const map = new Map();
  for (const row of json.d ?? []) {
    if (row.SectorId != null && row.Name) map.set(row.SectorId, row.Name);
  }
  return map;
}

async function fetchPage(skip, sectorMap) {
  const filter = encodeURIComponent("RegistrationStatus eq 'Registered'");
  const url =
    `${ODATA_BASE}/Organisations?$format=json&$filter=${filter}` +
    `&$select=CharityRegistrationNumber,OrganisationId,MainSectorId&$orderby=OrganisationId&$top=${PAGE_SIZE}&$skip=${skip}`;
  const res = await fetch(url);
  const json = await res.json();
  return (json.d ?? []).map((row) => {
    const externalId = (row.CharityRegistrationNumber?.trim() || '') || String(row.OrganisationId);
    const sectorName = sectorMap.get(row.MainSectorId);
    const tags = sectorName ? [slugifyTag(sectorName)].filter(Boolean) : [];
    return { externalId, tags };
  });
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) {
    console.error('Missing SUPABASE_URL');
    process.exit(1);
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const sectorMap = await loadSectorMap();
  const limit = process.env.IMPORT_LIMIT ? Number(process.env.IMPORT_LIMIT) : null;
  let skip = 0;
  let updated = 0;

  console.log('Backfilling tags from NZ Charities Register sectors…');

  while (true) {
    if (limit !== null && updated >= limit) break;
    const rows = await fetchPage(skip, sectorMap);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (limit !== null && updated >= limit) break;
      if (!row.tags.length) continue;

      const { error } = await supabase
        .from('organizations')
        .update({ tags: row.tags, updated_at: new Date().toISOString() })
        .eq('source_registry', SOURCE)
        .eq('external_id', row.externalId);

      if (!error) updated++;
    }

    console.log(`  … skip=${skip}, updated=${updated}`);
    skip += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`Done. Updated tags on ${updated} organizations.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
