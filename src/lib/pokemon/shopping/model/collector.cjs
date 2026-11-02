'use strict';
// Dependency-injected collector core. No sockets, credentials, token cache or
// cloud client. A future reviewed host supplies the guarded generateContent port.
const fs = require('node:fs'), path = require('node:path');
const { hash, copy } = require('../schema.cjs');
const { declarationSet } = require('./declarations.cjs');
const MODELS = Object.freeze({ L: 'gemini-3.5-flash-lite', P: 'gemini-3.1-pro-preview' });
const endpoint = arm => 'https://aiplatform.googleapis.com/v1/projects/pivota-prod/locations/global/publishers/google/models/' + MODELS[arm] + ':generateContent';
const BUDGETS = Object.freeze({ calls: 1500, calls_per_arm: 750, input_tokens: 15000000, usd: 25, usd_per_arm: Object.freeze({L:5,P:20}), concurrency: 2, minimum_launch_minutes: 45, refresh_minutes: 10, prompt_reservation_cap: 200000, output_reservation_cap: 2048 });
// Harness check only: L alone, never scored.
const SMOKE_BUDGETS = Object.freeze({ ...BUDGETS, calls: 80, calls_per_arm: 80, input_tokens: 2000000, usd: 1, usd_per_arm: Object.freeze({ L: 1, P: 0 }) });
const PLANS = Object.freeze({ reduced: BUDGETS, smoke: SMOKE_BUDGETS });
const STOP_RULES = Object.freeze({request_rejected:Object.freeze({consecutive_non_429_4xx:3,scope:'arm'}),access_denied:Object.freeze({statuses:Object.freeze([401,403]),scope:'global'})});
function price(freeze, arm, input, output, thoughts = 0) {
    if (![input, output, thoughts].every(n => Number.isSafeInteger(n) && n >= 0))
        throw Error('invalid_usage');
    const row = freeze.prices?.models?.[MODELS[arm]], rate = row?.[input > 200000 ? 'above_200k' : 'up_to_200k'];
    if (!rate || ![rate.input, rate.output_including_reasoning].every(n => typeof n === 'number' && n > 0))
        throw Error('no_price_no_run');
    return (input * rate.input + (output + thoughts) * rate.output_including_reasoning) / 1000000;
}
function validUsage(u) { return u && ['promptTokenCount', 'candidatesTokenCount'].every(k => Number.isSafeInteger(u[k]) && u[k] >= 0) && (u.thoughtsTokenCount === undefined || Number.isSafeInteger(u.thoughtsTokenCount) && u.thoughtsTokenCount >= 0); }
function validateFrozenRequest(freeze, request) {
    const { CONFIG, SYSTEM_INSTRUCTION } = require('./turn.cjs');
    if (!request || Object.keys(request).sort().join(',') !== 'contents,generationConfig,systemInstruction,toolConfig,tools' || hash(request.generationConfig) !== hash(CONFIG) || hash(request.generationConfig) !== hash(freeze.generationConfig) || hash(request.toolConfig) !== hash(freeze.toolConfig) || hash(request.systemInstruction) !== hash({ parts: [{ text: SYSTEM_INSTRUCTION }] }) || hash(SYSTEM_INSTRUCTION) !== freeze.system_instruction_sha256 || !Array.isArray(request.tools) || request.tools.length !== 1 || Object.keys(request.tools[0]).join(',') !== 'functionDeclarations' || hash(request.tools[0].functionDeclarations) !== freeze.declaration_set_sha256 || freeze.declaration_set_sha256 !== declarationSet().declaration_sha256 || !Array.isArray(request.contents))
        throw Error('outgoing_freeze_mismatch');
}
function atomic(file, value) { const temp = file + '.tmp'; const fd = fs.openSync(temp, 'w', 0o600); try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
    fs.fsyncSync(fd);
}
finally {
    fs.closeSync(fd);
} fs.renameSync(temp, file); const parent = fs.openSync(path.dirname(file), 'r'); try {
    fs.fsyncSync(parent);
}
finally {
    fs.closeSync(parent);
} }
function checkFreeze(freeze, artifactBytes) {
    if (freeze.stage !== '3a' || freeze.live_run_enabled !== false)
        throw Error('invalid_freeze');
    if (hash(freeze.stop_rules) !== hash(STOP_RULES)) throw Error('frozen_stop_rules_mismatch');
    if (hash(freeze.budgets) !== hash(BUDGETS) || hash(freeze.smoke_budgets) !== hash(SMOKE_BUDGETS) || hash(freeze.models) !== hash(MODELS))
        throw Error('frozen_limits_mismatch');
    for (const [arm, id] of Object.entries(MODELS)) {
        if (freeze.endpoints?.[arm] !== endpoint(arm))
            throw Error('endpoint_mismatch');
        price(freeze, arm, 1, 1);
        if (!id)
            throw Error('model_required');
    }
    for (const row of freeze.artifacts) {
        const bytes = artifactBytes(row.path);
        if (hash(bytes.toString('utf8')) !== row.sha256)
            throw Error('frozen_artifact_mismatch:' + row.path);
    }
    return hash(freeze);
}
function createCollector({ freeze, artifactBytes, checkpoint, transport, clock = Date.now, tokenExpiresAt, reviewGo = false, rehearsal = false, plan = 'reduced', timer = setTimeout, clearTimer = clearTimeout }) {
    if (typeof transport !== 'function')
        throw Error('transport_required');
    const freezeHash = checkFreeze(freeze, artifactBytes);
    const B = PLANS[plan];
    if (!Object.hasOwn(PLANS, plan))
        throw Error('unknown_plan');
    // Stage 3a cannot accidentally launch a live adapter, even if credentials exist.
    if (!rehearsal && !reviewGo)
        throw Error('claude_3a_review_required');
    let state = fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint, 'utf8')) : { schema: 'shopping.phase3.checkpoint.v1', freeze_sha256: freezeHash, records: [], outcomes: [], arms: Object.fromEntries(['L', 'P'].map(a => [a, { calls: 0, input_tokens: 0, output_tokens: 0, thought_tokens: 0, usd: 0, reserved_input: 0, reserved_usd: 0, without_tls: 0, tls_timeouts: 0, rate_limits: 0, request_rejections: 0, stop_reason: null, preflight: false }])), signals: [], stop_reason: null };
    if (state.freeze_sha256 !== freezeHash)
        throw Error('resume_freeze_mismatch');
    if(fs.existsSync(checkpoint)&&state.rehearsal!==rehearsal)throw Error('resume_mode_mismatch');
    if(fs.existsSync(checkpoint)&&(state.plan||'reduced')!==plan)throw Error('resume_plan_mismatch');
    state.plan=plan;
    state.rehearsal=rehearsal;
    state.sessions ||= {};
    if (state.records.some(r => r.status === 'reserved'))
        throw Error('uncertain_in_flight_requires_review');
    if (['received_SIGINT','received_SIGTERM','token_refresh_needed'].includes(state.stop_reason) && tokenExpiresAt-clock()>=45*60000) {
        state.resume_history ||= [];
        state.resume_history.push({previous_stop:state.stop_reason,signals:copy(state.signals)});
        state.stop_reason=null;
    }
    const save = () => atomic(checkpoint, state), active = new Set();
    let stopping = false;
    const totals = () => Object.values(state.arms).reduce((s, a) => ({ calls: s.calls + a.calls, input: s.input + a.input_tokens + a.reserved_input, usd: s.usd + a.usd + a.reserved_usd }), { calls: 0, input: 0, usd: 0 });
    function stop(reason, arm) { if (arm) {
        if (!state.arms[arm].stop_reason) {
            state.arms[arm].stop_reason = reason;
            state.arms[arm].stop_trigger = { reason, record_index: state.records.length, rate_limit_streak: state.arms[arm].rate_limits, request_rejection_streak: state.arms[arm].request_rejections, tls_timeout_streak: state.arms[arm].tls_timeouts };
        }
    }
    else {
        if (!state.stop_reason)
            state.stop_reason = reason;
        stopping = true;
        for(const controller of active)controller.abort();
    } save(); }
    function signal(name) { state.signals.push(name); stop('received_' + name); for (const controller of active)
        controller.abort(); }
    const onInt = () => signal('SIGINT'), onTerm = () => signal('SIGTERM');
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);
    function reserve(arm, job, attempt, request) {
        validateFrozenRequest(freeze, request);
        const a = state.arms[arm], t = totals(), input = B.prompt_reservation_cap, usd = price(freeze, arm, input, B.output_reservation_cap);
        if (stopping || state.stop_reason || a.stop_reason)
            throw Error('collector_stopped');
        if (tokenExpiresAt - clock() < 10 * 60000) {
            stop('token_refresh_needed');
            throw Error('token_refresh_needed');
        }
        if (t.calls + 1 > B.calls || a.calls + 1 > B.calls_per_arm || t.input + input > B.input_tokens || t.usd + usd > B.usd || a.usd + a.reserved_usd + usd > B.usd_per_arm[arm]) {
            stop('budget_exhausted', arm);
            throw Error('budget_exhausted');
        }
        // UTF-8 bytes are a conservative token bound; reject large requests outright.
        if (Buffer.byteLength(JSON.stringify(request)) > input)
            throw Error('prompt_cap_exceeded');
        const record = { id: job.id, arm, attempt, status: 'reserved', request_sha256: hash(request), reserved_input: input, reserved_usd: usd };
        state.records.push(record);
        a.calls++;
        a.reserved_input += input;
        a.reserved_usd += usd;
        save();
        return record;
    }
    async function invoke(arm, job, request, attempt, signal) {
        if (signal?.aborted)
            throw Error('request_cancelled');
        if (active.size >= 2)
            throw Error('concurrency_limit');
        const record = reserve(arm, job, attempt, request), a = state.arms[arm], controller = new AbortController();
        active.add(controller);
        const start = clock();
        let response;
        let timeout, abortListener, stageReader = () => ({tls_connected:false,stage_reached:'not_started'});
        abortListener = () => controller.abort();
        signal?.addEventListener('abort', abortListener, { once: true });
        try {
            response = await Promise.race([
                transport({ arm, endpoint: endpoint(arm), request: copy(request), signal: controller.signal, timeoutMs: 8000, onStageReader: reader => { if(typeof reader==='function')stageReader=reader; } }),
                new Promise((_, reject) => { timeout = timer(() => {
                    const reached=stageReader();
                    controller.abort();
                    reject(Object.assign(Error('timeout'),{code:'timeout',...reached}));
                },8000); })
            ]);
        }
        catch (e) {
            response = { status: e.http_status??null, tls_connected: e.tls_connected === true, stage_reached:e.stage_reached||'not_started', error: e.code === 'timeout' ? 'timeout' : 'transport_error' };
        }
        finally {
            clearTimer(timeout);
            signal?.removeEventListener('abort', abortListener);
            active.delete(controller);
        }
        const usage = response.body?.usageMetadata;
        const measured = validUsage(usage);
        const input = measured ? usage.promptTokenCount : record.reserved_input, output = measured ? usage.candidatesTokenCount : B.output_reservation_cap, thoughts = measured ? Math.max(usage.thoughtsTokenCount || 0, (usage.totalTokenCount || 0) - usage.promptTokenCount - usage.candidatesTokenCount) : 0;
        const overCap = measured && (input > B.prompt_reservation_cap || output + thoughts > B.output_reservation_cap);
        a.reserved_input -= record.reserved_input;
        a.reserved_usd -= record.reserved_usd;
        a.input_tokens += input;
        a.output_tokens += output;
        a.thought_tokens += thoughts;
        a.usd += price(freeze, arm, input, output, thoughts);
        Object.assign(record, { status: 'completed', http_status: response.status ?? null, tls_connected: response.tls_connected === true, stage_reached: response.stage_reached || (response.status ? 'http_status' : response.tls_connected ? 'tls_connected' : 'not_started'), latency_ms: clock() - start, input_tokens: input, output_tokens: output, thought_tokens: thoughts, usage_measured: measured, estimated_usd: price(freeze, arm, input, output, thoughts), response: copy(response.body || null), error: response.error || null });
        a.without_tls = record.tls_connected ? 0 : a.without_tls + 1;
        a.tls_timeouts = record.tls_connected && response.error === 'timeout' ? a.tls_timeouts + 1 : 0;
        a.rate_limits = response.status === 429 ? a.rate_limits + 1 : 0;
        // No-response attempts neither count nor interrupt consecutive HTTP responses.
        if (Number.isInteger(response.status)) a.request_rejections = response.status >= 400 && response.status < 500 && response.status !== 429 ? (a.request_rejections || 0) + 1 : 0;
        if ([401, 403].includes(response.status))
            stop('access_denied');
        else if (a.without_tls >= 3)
            stop('transport_unreachable');
        else if (a.tls_timeouts >= 10)
            stop('vertex_persistently_slow', arm);
        else if (a.rate_limits >= 3)
            stop('rate_limited', arm);
        else if (a.request_rejections >= 3)
            stop('request_rejected', arm);
        else if (response.status === 404 || response.model_unavailable || response.function_calling_unsupported)
            stop('model_unavailable', arm);
        else if (response.status === 200 && !response.error && (!measured || overCap))
            stop('invalid_or_over_cap_usage', arm);
        save();
        return { record, response };
    }
    async function request(arm, id, body, { signal, remainingCalls=2 } = {}) {
        if (!MODELS[arm])
            throw Error('unknown_arm');
        validateFrozenRequest(freeze, body);
        const a = state.arms[arm], completed = state.records.filter(r => r.id === id && r.arm === arm && r.status === 'completed');
        if (completed.some(r => r.request_sha256 !== hash(body)))
            throw Error('resume_request_mismatch');
        let response;
        if (completed.length) {
            const last = completed.at(-1);
            response = { status: last.http_status, body: copy(last.response), tls_connected: last.tls_connected, stage_reached: last.stage_reached, error: last.error };
        }
        else
            ({ response } = await invoke(arm, { id }, body, 1, signal));
        if (response.status === 429 && completed.at(-1)?.attempt !== 2 && remainingCalls>=2 && !a.stop_reason && !state.stop_reason && !signal?.aborted)
            ({ response } = await invoke(arm, { id }, body, 2, signal));
        if (!a.preflight && !a.stop_reason && !state.stop_reason) {
            try {
                require('./turn.cjs').parseResponse(response);
                if (!validUsage(response.body.usageMetadata))
                    throw Error('usage');
                a.preflight = true;
                save();
            }
            catch {
                stop('preflight_failed', arm);
            }
        }
        return {...copy(response),attempt_count:state.records.filter(r=>r.id===id&&r.arm===arm&&r.status==='completed').length};
    }
    function channel(arm, session) {
        let sequence = 0;
        const transport = async (body, options) => request(arm, session + '/call-' + (++sequence), body, options);
        Object.defineProperty(transport, 'elapsedMs', { value: () => state.records.filter(r => r.arm === arm && r.id.startsWith(session + '/call-') && Number(r.id.slice((session + '/call-').length)) <= sequence).reduce((n,r)=>n+(r.latency_ms||0),0) });
        return transport;
    }
    function session(arm,id) {
        if(!MODELS[arm])throw Error('unknown_arm');
        const key=arm+'/'+id;
        if(!state.sessions[key]) {
            state.sessions[key]={started_at:clock(),last_elapsed_ms:0,observations:{}};
            save();
        }
        const entry=state.sessions[key];
        function elapsed() { return Math.max(entry.last_elapsed_ms,0,clock()-entry.started_at); }
        function observe(kind,minimum=0) {
            if(!['first_useful','qualified_offer','complete_preview'].includes(kind))throw Error('unknown_timing_observation');
            if(!Object.hasOwn(entry.observations,kind)) {
                entry.last_elapsed_ms=Math.max(elapsed(),minimum);
                entry.observations[kind]=entry.last_elapsed_ms;
                save();
            }
            return entry.observations[kind];
        }
        return Object.freeze({elapsed,observe,snapshot:()=>copy(entry)});
    }
    function outcome(arm, id, result) { const prior = state.outcomes.find(r => r.arm === arm && r.id === id); if (prior) {
        if (hash(prior.result) !== hash(result))
            throw Error('resume_outcome_mismatch');
        return copy(prior.result);
    } state.outcomes.push({ arm, id, result: copy(result) }); save(); return copy(result); }
    function priorOutcome(arm, id) { return copy(state.outcomes.find(r => r.arm === arm && r.id === id)?.result || null); }
    async function run(arm, jobs) {
        if (!MODELS[arm])
            throw Error('unknown_arm');
        if (arm === 'P' && !state.arms.L.stop_reason && !state.records.some(r => r.arm === 'L'))
            throw Error('L_first');
        if (tokenExpiresAt - clock() < 45 * 60000)
            throw Error('launch_requires_45_minutes');
        if (state.stop_reason === 'token_refresh_needed') {
            state.stop_reason = null;
            stopping = false;
            save();
        }
        const ids = new Set();
        for (const j of jobs) {
            if (ids.has(j.id))
                throw Error('duplicate_job');
            ids.add(j.id);
        }
        let cursor = 0;
        const a = state.arms[arm];
        async function one(job) {
            const done = state.records.filter(r => r.id === job.id && r.arm === arm && r.status === 'completed');
            if (done.some(r => r.request_sha256 !== hash(job.request)))
                throw Error('resume_request_mismatch');
            if (done.length)
                return; // Never repeat a completed normal call or completed retry.
            await request(arm, job.id, job.request);
        }
        for (const j of jobs)
            if (state.records.some(r => r.arm === arm && r.id === j.id && r.status === 'completed' && r.request_sha256 !== hash(j.request)))
                throw Error('resume_request_mismatch');
        const pending = jobs.filter(j => !state.records.some(r => r.arm === arm && r.id === j.id && r.status === 'completed'));
        if (!a.preflight && pending.length) {
            try {
                await one(pending[cursor++]);
            }
            catch (e) {
                if (!a.stop_reason && !state.stop_reason)
                    stop(String(e.message).slice(0, 100), arm);
            }
        }
        async function worker() { while (cursor < pending.length && !a.stop_reason && !state.stop_reason && !stopping) {
            const j = pending[cursor++];
            try {
                await one(j);
            }
            catch (e) {
                if (!a.stop_reason && !state.stop_reason)
                    stop(String(e.message).slice(0, 100), arm);
            }
        } }
        await Promise.all([worker(), worker()]);
        save();
        return copy(state);
    }
    return Object.freeze({ run, request, channel, session, outcome, priorOutcome, state: () => copy(state), save, stop, close: () => { process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm); save(); } });
}
module.exports = { createCollector, checkFreeze, price, validUsage, atomic, MODELS, BUDGETS, SMOKE_BUDGETS, PLANS, STOP_RULES, endpoint, validateFrozenRequest };
