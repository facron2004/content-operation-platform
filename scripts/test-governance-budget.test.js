const assert = require('node:assert/strict');
const test = require('node:test');

test('static pin governance enforces the PRD target as a hard ceiling', async () => {
  const { getStaticPinBudgetError } = await import('./check-test-governance.mjs');

  assert.equal(getStaticPinBudgetError(188), null);
  assert.equal(getStaticPinBudgetError(189), 'static pin count exceeds target 188: 189');
});
