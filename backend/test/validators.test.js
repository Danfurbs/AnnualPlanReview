const test = require('node:test');
const assert = require('node:assert/strict');
const { isPlainObject, isValidJobNumber, isNonNegativeInteger } = require('../routes/validators');

test('plain object validation excludes arrays and null', () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
});

test('job numbers align with the 50 character database column', () => {
  assert.equal(isValidJobNumber('000123'), true);
  assert.equal(isValidJobNumber('1'.repeat(50)), true);
  assert.equal(isValidJobNumber('1'.repeat(51)), false);
  assert.equal(isValidJobNumber('12-A'), false);
});

test('revisions must be non-negative integers', () => {
  assert.equal(isNonNegativeInteger(0), true);
  assert.equal(isNonNegativeInteger(2), true);
  assert.equal(isNonNegativeInteger(-1), false);
  assert.equal(isNonNegativeInteger(1.5), false);
});
