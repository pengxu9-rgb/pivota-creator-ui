'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { baselines: { phase4, reduced }, sha256 } = require('./historical-baselines.cjs');
const ROOT = path.resolve(__dirname, '../..');
const TURN = 'src/lib/pokemon/shopping/model/turn.cjs';
function qualify() {
    const rows = Object.entries(phase4.frozenFiles).filter(([file]) => file !== TURN).map(([file, expected]) => {
        const digest = sha256(fs.readFileSync(path.join(ROOT, file)));
        assert.equal(digest, expected, 'frozen model file changed: ' + file);
        return { file, sha256: digest };
    });
    const { CONFIG, SYSTEM_INSTRUCTION, LIMITS } = require(path.join(ROOT, TURN));
    assert.equal(sha256(SYSTEM_INSTRUCTION), phase4.systemInstructionSha256);
    assert.deepEqual(CONFIG, phase4.generationConfig);
    assert.deepEqual(require('./freeze.json').generationConfig, phase4.generationConfig);
    assert.deepEqual(LIMITS, JSON.parse(reduced.freeze).turn_limits);
    const turnSha = sha256(fs.readFileSync(path.join(ROOT, TURN)));
    return { passed: true, base: phase4.commit, byte_identical: rows, generation_config_identical: true,
        instruction_identical: true, limits_identical: true,
        turn: { historical_sha256: phase4.frozenFiles[TURN], sha256: turnSha,
            byte_identical: turnSha === phase4.frozenFiles[TURN] } };
}
if (require.main === module) {
    const result = qualify();
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(JSON.stringify(result) + '\n');
}
module.exports = { qualify };
