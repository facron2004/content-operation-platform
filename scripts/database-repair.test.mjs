import assert from 'node:assert/strict';
import test from 'node:test';
import { decideDatabaseRepair } from './database-repair.mjs';

function comparison(overrides = {}) {
  return {
    ok: true,
    missing: [],
    extra: [],
    checksumMismatch: [],
    unfinished: [],
    rolledBack: [],
    acceptedCompatibility: [],
    ...overrides
  };
}

test('database repair decision keeps canonical and verified legacy histories read-only', () => {
  assert.equal(decideDatabaseRepair(comparison(), { matches: true }).action, 'no_action');
  assert.equal(
    decideDatabaseRepair(
      comparison({
        acceptedCompatibility: [
          { name: '0005', policyId: 'legacy-idempotency', kind: 'verified_legacy_baseline' }
        ]
      }),
      { matches: true }
    ).action,
    'verified_legacy_baseline'
  );
});

test('database repair decision separates forward upgrade from unsafe history repair', () => {
  assert.equal(
    decideDatabaseRepair(comparison({ ok: false, missing: ['0014'] }), { matches: false }).action,
    'isolated_upgrade_required'
  );
  assert.equal(
    decideDatabaseRepair(
      comparison({
        ok: false,
        checksumMismatch: [{ name: '0005', expected: 'expected', actual: 'unknown' }]
      }),
      { matches: true }
    ).action,
    'rebuild_import_required'
  );
  assert.equal(
    decideDatabaseRepair(comparison(), { matches: false }).action,
    'rebuild_import_required'
  );
});

test('database repair decisions never permit checksum rewriting', () => {
  for (const action of [
    decideDatabaseRepair(comparison(), { matches: true }),
    decideDatabaseRepair(comparison({ ok: false, missing: ['0014'] }), { matches: false }),
    decideDatabaseRepair(comparison({ ok: false, extra: ['unknown_migration'] }), { matches: true })
  ]) {
    assert.equal(action.checksumRewriteAllowed, false);
  }
});
