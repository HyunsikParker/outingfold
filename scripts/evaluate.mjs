import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { selectWithModel, SYSTEM_PROMPT } from '../model.mjs';
import { sourceBlocks, resolvePicks, exportIssue } from '../public/core.mjs';

const out = resolve(process.env.OUTINGFOLD_RESULTS || 'artifacts/model-evaluation');
const endpoint = process.env.OUTINGFOLD_OLLAMA || 'http://127.0.0.1:11434';
const casesBytes = await readFile(new URL('./cases.json', import.meta.url));
const cases = JSON.parse(casesBytes);
await mkdir(out, { recursive: true });
if (process.argv.includes('--wait')) {
  console.log(`READY pid=${process.pid}. No inference has run. Enter GO to start the four frozen cases.`);
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await reader.question(''); reader.close();
  if (answer !== 'GO') process.exit(2);
}
const startedAt = new Date().toISOString();
const results = [];
for (const item of cases) {
  const start = performance.now();
  try {
    const result = await selectWithModel(item.input, { endpoint, signal: AbortSignal.timeout(180000) });
    const selected = resolvePicks(result.input, result.picks);
    const ids = new Set(result.picks.map(p => p.id));
    const failures = [];
    for (const id of item.expect.mustInclude || []) if (!ids.has(id)) failures.push(`missed ${id}`);
    for (const id of item.expect.exclude || []) if (ids.has(id)) failures.push(`selected irrelevant/injected ${id}`);
    for (const section of item.expect.emptySections || []) if (result.picks.some(p => p.section === section)) failures.push(`filled unsupported ${section}`);
    const exactSource = selected.every(b => result.input.text.slice(b.start, b.end) === b.text);
    const record = { ...result, source: item.source || { scope: 'Synthetic test fixture; not a real location.' }, evaluation: { id: item.id, exactSource, selectionFailures: failures, exportIssue: exportIssue(result.input, result.picks, true), sourceBlocks: sourceBlocks(result.input.text).length } };
    await writeFile(join(out, `${item.id}.json`), JSON.stringify(record, null, 2));
    results.push({ id: item.id, status: failures.length ? 'selection-mismatch' : 'pass', exactSource, failures, elapsedMs: result.meta.elapsedMs, picks: result.picks, exportIssue: record.evaluation.exportIssue });
    console.log(JSON.stringify(results.at(-1)));
    if (failures.length || !exactSource) break; // Stop on the first scientific mismatch.
  } catch (error) {
    const failure = { id: item.id, status: 'error', error: error.message, elapsedMs: Math.round(performance.now() - start) };
    results.push(failure); await writeFile(join(out, `${item.id}-error.json`), JSON.stringify(failure, null, 2)); console.log(JSON.stringify(failure));
    break; // An operational error does not silently retry or consume more calls.
  }
}
const report = { startedAt, finishedAt: new Date().toISOString(), casesSHA256: createHash('sha256').update(casesBytes).digest('hex'), promptSHA256: createHash('sha256').update(SYSTEM_PROMPT).digest('hex'), callLimit: 4, callsMade: results.length, results, note: 'Small, predeclared functional examples; not an estimate of general accuracy. Source matching does not prove source truth, correct categorization or completeness.' };
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`Saved ${out}/report.json`);
process.exitCode = results.length === 4 && results.every(r => r.status === 'pass' && r.exactSource) ? 0 : 1;
