#!/usr/bin/env node
/**
 * Import registered NZ charities from Charities Services OData into Supabase.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: IMPORT_LIMIT (default: all registered orgs), IMPORT_SKIP (pagination offset)
 *
 * Usage:
 *   IMPORT_LIMIT=500 node scripts/import-nz-charities.mjs
 *   node scripts/import-nz-charities.mjs
 *
 * Records are upserted by (source_registry, external_id) with status `listed`.
 * Emails are stored for staff outreach only — do not use for bulk email campaigns (UEMA 2007).
 */

import { createClient } from '@supabase/supabase-js';

const ODATA_BASE = 'http://www.odata.charities.govt.nz';
const SOURCE = 'nz_charities_register';
const PAGE_SIZE = 1000;
const SELECT_FIELDS = [
  'OrganisationId',
  'Name',
  'CharityRegistrationNumber',
  'RegistrationStatus',
  'CharitablePurpose',
  'WebSiteURL',
  'EMailAddress1',
  'Telephone1',
  'PostalAddressCity',
  'PostalAddressSuburb',
  'PostalAddressPostcode',
  'NZBNNumber',
  'MainSectorId',
  'ModifiedOn',
].join(',');

function slugifyTag(label) {
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function loadSectorMap() {
  const res = await fetch(`${ODATA_BASE}/Sectors?$format=json`);
  if (!res.ok) throw new Error(`Sectors OData ${res.status}`);
  const json = await res.json();
  const map = new Map();
  for (const row of json.d ?? []) {
    if (row.SectorId != null && row.Name) map.set(row.SectorId, row.Name);
  }
  return map;
}

function tagsFromRow(row, sectorMap) {
  const tags = [];
  const sectorName = sectorMap.get(row.MainSectorId);
  if (sectorName) {
    const slug = slugifyTag(sectorName);
    if (slug) tags.push(slug);
  }
  return tags;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return v;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeWebsite(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function registryProfileUrl(ccNumber) {
  if (!ccNumber) return 'https://register.charities.govt.nz/CharitiesRegister/Search';
  return `https://register.charities.govt.nz/Charity/${ccNumber}`;
}

function locationFrom(row) {
  const parts = [row.PostalAddressSuburb, row.PostalAddressCity, row.PostalAddressPostcode].filter(Boolean);
  return parts.join(', ');
}

async function fetchPage(skip) {
  const filter = encodeURIComponent("RegistrationStatus eq 'Registered'");
  const url =
    `${ODATA_BASE}/Organisations?$format=json&$filter=${filter}` +
    `&$select=${SELECT_FIELDS}&$orderby=OrganisationId&$top=${PAGE_SIZE}&$skip=${skip}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OData ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.d ?? [];
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) {
    console.error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
    process.exit(1);
  }
  const supabase = createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const importLimit = process.env.IMPORT_LIMIT ? Number(process.env.IMPORT_LIMIT) : null;
  let skip = process.env.IMPORT_SKIP ? Number(process.env.IMPORT_SKIP) : 0;
  let totalUpserted = 0;
  let totalSkipped = 0;

  console.log('Importing NZ registered charities → organizations (status: listed)…');
  const sectorMap = await loadSectorMap();
  console.log(`Loaded ${sectorMap.size} sector tags from Charities Register`);

  while (true) {
    if (importLimit !== null && totalUpserted >= importLimit) break;

    const rows = await fetchPage(skip);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (importLimit !== null && totalUpserted >= importLimit) break;

      const cc = row.CharityRegistrationNumber?.trim() || '';
      const externalId = cc || String(row.OrganisationId);
      if (!row.Name?.trim()) {
        totalSkipped++;
        continue;
      }

      const baseSlug = slugify(row.Name) || 'organization';
      const slug = cc ? `${baseSlug}-${cc.toLowerCase()}` : `${baseSlug}-${row.OrganisationId}`;

      const record = {
        name: row.Name.trim(),
        slug,
        description: (row.CharitablePurpose || '').slice(0, 2000),
        mission_statement: (row.CharitablePurpose || '').slice(0, 4000),
        category: '',
        tags: tagsFromRow(row, sectorMap),
        location: locationFrom(row),
        country: 'NZ',
        website_url: normalizeWebsite(row.WebSiteURL),
        email: (row.EMailAddress1 || '').trim(),
        phone: (row.Telephone1 || '').trim(),
        status: 'listed',
        verification_level: 'none',
        onboarding_stage: '',
        source_registry: SOURCE,
        external_id: externalId,
        charity_registration_number: cc,
        nzbn: (row.NZBNNumber || '').trim(),
        registry_url: registryProfileUrl(cc),
        imported_at: new Date().toISOString(),
        outreach_status: 'not_contacted',
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('source_registry', SOURCE)
        .eq('external_id', externalId)
        .maybeSingle();

      const saveRecord = async (payload) => {
        if (existing?.id) {
          return supabase.from('organizations').update(payload).eq('id', existing.id);
        }
        return supabase.from('organizations').insert(payload);
      };

      let { error } = await saveRecord(record);

      if (error?.code === '23505' && error.message?.includes('slug')) {
        const retry = { ...record, slug: `${slug}-${row.OrganisationId}` };
        ({ error } = await saveRecord(retry));
      }

      if (error) {
        console.error(`Failed ${row.Name}:`, error.message);
        totalSkipped++;
        continue;
      }

      totalUpserted++;
    }

    console.log(`  … processed skip=${skip}, batch=${rows.length}, upserted=${totalUpserted}`);
    skip += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`Done. Upserted ${totalUpserted}, skipped ${totalSkipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
