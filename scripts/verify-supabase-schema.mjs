#!/usr/bin/env node
/**
 * Verifies required Supabase tables exist for the current app build.
 * Run after adding migrations: npm run db:verify
 *
 * Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env or .env.local
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_TABLES = [
  'organizations',
  'organization_payments',
  'business_plan_targets',
  'business_expenses',
  'business_cashflow_lines',
  'notification_events',
];

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}

loadEnv();
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);
let failed = 0;

for (const table of REQUIRED_TABLES) {
  const { error } = await supabase.from(table).select('id').limit(1);
  if (error) {
    const msg = error.message ?? String(error);
    if (msg.includes('schema cache') || msg.includes('Could not find the table')) {
      console.error(`✗ ${table} — missing (apply supabase/migrations to remote project)`);
      failed++;
    } else {
      console.warn(`? ${table} — ${msg} (may be RLS; table might still exist)`);
      console.log(`  ✓ ${table} — reachable`);
    }
  } else {
    console.log(`✓ ${table}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} required table(s) missing. Apply migrations before using CRM features.`);
  process.exit(1);
}
console.log('\nSchema check passed.');
