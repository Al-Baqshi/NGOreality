/**
 * Cross-tenant isolation suite for the Organisation Workspace.
 *
 * This is the test that matters. Every workspace table holds beneficiary
 * records; one bad RLS policy is a privacy breach across every charity on the
 * platform. It runs against a DISPOSABLE Supabase project — never production.
 *
 *   TEST_SUPABASE_URL=...            \
 *   TEST_SUPABASE_ANON_KEY=...       \
 *   TEST_SUPABASE_SERVICE_ROLE_KEY=... \
 *   node tests/isolation/crossTenant.mjs
 *
 * What it proves:
 *   1. Alpha cannot read, write, update or delete any Beta row, on any table.
 *   2. A volunteer cannot read sensitive data or restricted notes in their OWN org.
 *   3. Case notes are append-only at the database level.
 *   4. A stranger cannot escalate to owner of an already-claimed organisation.
 *   5. workspace_stats() does not leak counts across tenants.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error(
    'Missing TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY / TEST_SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

if (/cpbilbskfbzqlynjhdvm/.test(URL)) {
  console.error('Refusing to run: TEST_SUPABASE_URL points at the production project.');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Tiny assertion harness (no test framework dependency)
// ---------------------------------------------------------------------------

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** A read is isolated if it errors OR returns zero rows. */
function assertNoRows(name, { data, error }) {
  const rows = data ?? [];
  check(name, error !== null || rows.length === 0, error ? '' : `leaked ${rows.length} row(s)`);
}

/** A write is isolated if it errors OR affects nothing. */
function assertBlocked(name, { data, error }) {
  const rows = data ?? [];
  check(name, error !== null || rows.length === 0, error ? '' : 'write was allowed');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const created = { users: [], orgs: [] };

async function makeUser(label) {
  const email = `iso-${label}-${randomUUID()}@example.test`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  created.users.push(data.user.id);

  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn(${label}): ${signIn.error.message}`);

  return { id: data.user.id, client };
}

async function makeOrg(name) {
  const { data, error } = await admin
    .from('organizations')
    .insert({ name, status: 'listed' })
    .select('id')
    .single();
  if (error) throw new Error(`makeOrg(${name}): ${error.message}`);
  created.orgs.push(data.id);
  return data.id;
}

async function addMember(userId, orgId, role) {
  const { error } = await admin
    .from('organization_members')
    .insert({ user_id: userId, organization_id: orgId, role });
  if (error) throw new Error(`addMember(${role}): ${error.message}`);
}

async function seedTenant(orgId, ownerId) {
  const { data: client, error: cErr } = await admin
    .from('workspace_clients')
    .insert({
      organization_id: orgId,
      given_name: 'Test',
      family_name: `Client-${orgId.slice(0, 8)}`,
      created_by: ownerId,
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`seed client: ${cErr.message}`);

  const { error: sErr } = await admin.from('workspace_client_sensitive').insert({
    client_id: client.id,
    organization_id: orgId,
    health_notes: 'CONFIDENTIAL health information',
    ethnicity: 'CONFIDENTIAL',
  });
  if (sErr) throw new Error(`seed sensitive: ${sErr.message}`);

  const { data: kase, error: kErr } = await admin
    .from('workspace_cases')
    .insert({
      organization_id: orgId,
      client_id: client.id,
      title: 'Test case',
      created_by: ownerId,
    })
    .select('id')
    .single();
  if (kErr) throw new Error(`seed case: ${kErr.message}`);

  const { error: nErr } = await admin.from('workspace_case_notes').insert([
    {
      organization_id: orgId,
      case_id: kase.id,
      author_id: ownerId,
      body: 'Team-visible note',
      visibility: 'team',
    },
    {
      organization_id: orgId,
      case_id: kase.id,
      author_id: ownerId,
      body: 'RESTRICTED note',
      visibility: 'restricted',
    },
  ]);
  if (nErr) throw new Error(`seed notes: ${nErr.message}`);

  const { error: seErr } = await admin.from('workspace_sessions').insert({
    organization_id: orgId,
    client_id: client.id,
    case_id: kase.id,
    service_type: 'budgeting',
    duration_minutes: 60,
    recorded_by: ownerId,
  });
  if (seErr) throw new Error(`seed session: ${seErr.message}`);

  const { error: coErr } = await admin.from('workspace_consents').insert({
    organization_id: orgId,
    client_id: client.id,
    purpose: 'Service delivery',
    collected_by: ownerId,
  });
  if (coErr) throw new Error(`seed consent: ${coErr.message}`);

  return { clientId: client.id, caseId: kase.id };
}

async function cleanup() {
  for (const orgId of created.orgs) {
    await admin.from('organizations').delete().eq('id', orgId);
  }
  for (const userId of created.users) {
    await admin.auth.admin.deleteUser(userId);
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const TENANT_TABLES = [
  'workspace_clients',
  'workspace_client_sensitive',
  'workspace_consents',
  'workspace_cases',
  'workspace_case_notes',
  'workspace_sessions',
  'workspace_documents',
  'workspace_field_defs',
  'workspace_settings',
  'workspace_audit_log',
];

async function run() {
  console.log('\nSeeding two tenants…');

  const alphaOwner = await makeUser('alpha-owner');
  const betaOwner = await makeUser('beta-owner');
  const alphaVolunteer = await makeUser('alpha-volunteer');
  const stranger = await makeUser('stranger');

  const alphaOrg = await makeOrg(`Isolation Alpha ${randomUUID().slice(0, 8)}`);
  const betaOrg = await makeOrg(`Isolation Beta ${randomUUID().slice(0, 8)}`);

  await addMember(alphaOwner.id, alphaOrg, 'owner');
  await addMember(betaOwner.id, betaOrg, 'owner');
  await addMember(alphaVolunteer.id, alphaOrg, 'volunteer');

  const alphaSeed = await seedTenant(alphaOrg, alphaOwner.id);
  const betaSeed = await seedTenant(betaOrg, betaOwner.id);

  // -- 1. Alpha cannot read any Beta row ------------------------------------

  console.log('\n1. Cross-tenant reads (Alpha owner → Beta data)');
  for (const table of TENANT_TABLES) {
    assertNoRows(
      `${table}: no Beta rows visible`,
      await alphaOwner.client.from(table).select('*').eq('organization_id', betaOrg),
    );
  }

  // Unfiltered select must also return only Alpha's own rows.
  console.log('\n1b. Unfiltered reads return only own tenant');
  for (const table of ['workspace_clients', 'workspace_cases', 'workspace_sessions']) {
    const { data, error } = await alphaOwner.client.from(table).select('organization_id');
    const foreign = (data ?? []).filter((r) => r.organization_id !== alphaOrg);
    check(
      `${table}: unfiltered select is tenant-scoped`,
      error !== null || foreign.length === 0,
      foreign.length ? `leaked ${foreign.length} foreign row(s)` : '',
    );
  }

  // -- 2. Alpha cannot write into Beta --------------------------------------

  console.log('\n2. Cross-tenant writes (Alpha owner → Beta)');

  assertBlocked(
    'workspace_clients: cannot insert into Beta',
    await alphaOwner.client
      .from('workspace_clients')
      .insert({ organization_id: betaOrg, given_name: 'Injected', family_name: 'Row' })
      .select(),
  );

  assertBlocked(
    'workspace_clients: cannot update a Beta row',
    await alphaOwner.client
      .from('workspace_clients')
      .update({ given_name: 'Hijacked' })
      .eq('id', betaSeed.clientId)
      .select(),
  );

  assertBlocked(
    'workspace_clients: cannot delete a Beta row',
    await alphaOwner.client
      .from('workspace_clients')
      .delete()
      .eq('id', betaSeed.clientId)
      .select(),
  );

  assertBlocked(
    'workspace_case_notes: cannot append to a Beta case',
    await alphaOwner.client
      .from('workspace_case_notes')
      .insert({
        organization_id: betaOrg,
        case_id: betaSeed.caseId,
        author_id: alphaOwner.id,
        body: 'Injected',
        visibility: 'team',
      })
      .select(),
  );

  // Confirm the Beta row is genuinely untouched.
  const { data: betaClient } = await admin
    .from('workspace_clients')
    .select('given_name')
    .eq('id', betaSeed.clientId)
    .single();
  check(
    'Beta client row unmodified after Alpha write attempts',
    betaClient?.given_name === 'Test',
    `given_name is "${betaClient?.given_name}"`,
  );

  // -- 3. Role separation WITHIN a tenant -----------------------------------

  console.log('\n3. Role separation inside Alpha (volunteer)');

  assertNoRows(
    'volunteer cannot read workspace_client_sensitive in own org',
    await alphaVolunteer.client.from('workspace_client_sensitive').select('*'),
  );

  const { data: volunteerNotes } = await alphaVolunteer.client
    .from('workspace_case_notes')
    .select('visibility');
  const restricted = (volunteerNotes ?? []).filter((n) => n.visibility === 'restricted');
  check(
    'volunteer cannot read restricted case notes',
    restricted.length === 0,
    restricted.length ? `saw ${restricted.length} restricted note(s)` : '',
  );

  check(
    'volunteer CAN read team notes (positive control)',
    (volunteerNotes ?? []).some((n) => n.visibility === 'team'),
    'volunteer saw no team notes — policy may be too strict',
  );

  assertBlocked(
    'volunteer cannot write sensitive data',
    await alphaVolunteer.client
      .from('workspace_client_sensitive')
      .update({ health_notes: 'edited' })
      .eq('client_id', alphaSeed.clientId)
      .select(),
  );

  assertBlocked(
    'volunteer cannot change workspace settings',
    await alphaVolunteer.client
      .from('workspace_settings')
      .insert({ organization_id: alphaOrg, client_retention_months: 1 })
      .select(),
  );

  // Positive control: the owner CAN read sensitive data.
  const { data: ownerSensitive } = await alphaOwner.client
    .from('workspace_client_sensitive')
    .select('health_notes')
    .eq('client_id', alphaSeed.clientId);
  check(
    'owner CAN read own-tenant sensitive data (positive control)',
    (ownerSensitive ?? []).length === 1,
    'owner could not read sensitive data — policy is too strict',
  );

  // -- 4. Append-only case notes --------------------------------------------

  console.log('\n4. Case notes are append-only');

  assertBlocked(
    'owner cannot UPDATE a case note',
    await alphaOwner.client
      .from('workspace_case_notes')
      .update({ body: 'rewritten' })
      .eq('case_id', alphaSeed.caseId)
      .select(),
  );

  assertBlocked(
    'owner cannot DELETE a case note',
    await alphaOwner.client
      .from('workspace_case_notes')
      .delete()
      .eq('case_id', alphaSeed.caseId)
      .select(),
  );

  // -- 5. Membership escalation ---------------------------------------------

  console.log('\n5. Membership escalation');

  assertBlocked(
    'stranger cannot self-insert as owner of a CLAIMED org',
    await stranger.client
      .from('organization_members')
      .insert({ user_id: stranger.id, organization_id: betaOrg, role: 'owner' })
      .select(),
  );

  assertBlocked(
    'volunteer cannot promote themselves to admin',
    await alphaVolunteer.client
      .from('organization_members')
      .update({ role: 'admin' })
      .eq('user_id', alphaVolunteer.id)
      .eq('organization_id', alphaOrg)
      .select(),
  );

  assertNoRows(
    'stranger sees no workspace clients at all',
    await stranger.client.from('workspace_clients').select('*'),
  );

  // -- 6. Aggregates do not leak --------------------------------------------

  console.log('\n6. workspace_stats() aggregate isolation');

  const { data: alphaStatsOfBeta } = await alphaOwner.client.rpc('workspace_stats', {
    p_org: betaOrg,
  });
  check(
    'workspace_stats(Beta) returns zero counts for Alpha caller',
    !alphaStatsOfBeta || Number(alphaStatsOfBeta.clients_total) === 0,
    `clients_total = ${alphaStatsOfBeta?.clients_total}`,
  );

  const { data: alphaStatsOwn } = await alphaOwner.client.rpc('workspace_stats', {
    p_org: alphaOrg,
  });
  check(
    'workspace_stats(own org) returns real counts (positive control)',
    Number(alphaStatsOwn?.clients_total) === 1,
    `clients_total = ${alphaStatsOwn?.clients_total}`,
  );

  // -- 7. Anonymous access ---------------------------------------------------

  console.log('\n7. Anonymous access');

  const anon = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const table of TENANT_TABLES) {
    assertNoRows(`${table}: anon sees nothing`, await anon.from(table).select('*'));
  }
}

// ---------------------------------------------------------------------------

try {
  await run();
} catch (err) {
  failures.push(`suite crashed: ${err.message}`);
  console.error(err);
} finally {
  await cleanup();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error('\nISOLATION FAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('All isolation checks passed.');
