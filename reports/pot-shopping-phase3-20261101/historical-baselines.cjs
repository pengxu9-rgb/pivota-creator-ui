'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');

// Exact inputs extracted from 12dc3a1 and d0e951a. Keeping them here makes
// qualification independent of PR ancestry and shallow checkout depth.
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(__dirname + '/historical-baselines.json');
assert.equal(sha256(bytes), '50621cc91372cded2fa0619d6b48e0cb8423e6a0cb0052d9c07732c28a94b820',
    'historical comparison inputs changed');
module.exports = { baselines: JSON.parse(bytes), sha256 };
