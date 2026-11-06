'use strict';
const mapping = require('../../tests/fixtures/shopping-model-eval/compatibility-mapping.json');
const core = require('../../src/lib/pokemon/shopping/model/scoring.cjs');
const freeze = require('./freeze.json');
module.exports = { score: (state, baseline) => core.score(state, baseline, mapping, freeze) };
