import { SECTIONS, MODEL, PAPER_CSS, checkInput, sourceBlocks, validateSelection, resolvePicks, exportIssue, paperMarkup, offlineDocument } from './core.mjs';

const $ = id => document.getElementById(id);
const style = document.createElement('style');
style.textContent = PAPER_CSS;
document.head.append(style);
let current = null;
let picks = [];
let meta = {};
let local = false;
let request = null;
let revision = 0;
let disposed = false;

const input = () => checkInput({ title: $('place').value, url: $('source-url').value, text: $('notes').value });
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
async function hashText(text) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join(''); }

function renderPaper() {
  if (!current) {
    $('paper').innerHTML = paperMarkup({ title: 'Your next time outside', text: 'Add notes to begin.', url: '' }, [], {});
    $('card-count').textContent = 'Nothing selected yet';
  } else {
    $('paper').innerHTML = paperMarkup(current, picks, meta);
    const count = resolvePicks(current, picks).reduce((n, b) => n + b.text.length, 0);
    $('card-count').textContent = `${picks.length} excerpts · ${count.toLocaleString('en-US')} characters`;
  }
  refreshExports();
}

function refreshExports() {
  const issue = current ? exportIssue(current, picks, $('reviewed').checked) : 'Select excerpts to begin.';
  for (const id of ['download-button', 'print-button', 'json-button']) $(id).disabled = Boolean(issue);
  $('export-hint').textContent = issue || 'Ready to save. Your offline page includes the full notes; the printout contains only the selected excerpts.';
}

function renderReview() {
  $('source-review').replaceChildren();
  $('review-section').hidden = !current;
  if (!current) return;
  const blocks = sourceBlocks(current.text);
  $('review-count').textContent = `${blocks.length - picks.length} of ${blocks.length} lines left out`;
  for (const block of blocks) {
    const selected = picks.find(p => p.id === block.id);
    const row = document.createElement('div');
    row.className = `source-row${selected ? '' : ' excluded'}`;
    const head = document.createElement('div'); head.className = 'source-row-head';
    const label = document.createElement('label');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(selected); checkbox.id = `pick-${block.id}`; checkbox.setAttribute('aria-label', `Include source ${block.id}`);
    const name = document.createElement('span'); name.textContent = block.id;
    label.append(checkbox, name);
    const lineState = document.createElement('span'); lineState.className = 'line-state'; lineState.textContent = selected ? 'On the card' : 'Left out';
    const select = document.createElement('select'); select.setAttribute('aria-label', `Section for ${block.id}`);
    for (const [key, title] of Object.entries(SECTIONS)) { const option = document.createElement('option'); option.value = key; option.textContent = title; select.append(option); }
    select.value = selected?.section || 'plan';
    select.disabled = !selected;
    head.append(label, lineState, select);
    const text = document.createElement('p'); text.textContent = block.text;
    row.append(head, text); $('source-review').append(row);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked && picks.length >= 12) { checkbox.checked = false; status('Keep at most 12 excerpts. Remove one before adding another.', true); return; }
      picks = picks.filter(p => p.id !== block.id);
      if (checkbox.checked) picks.push({ id: block.id, section: select.value });
      select.disabled = !checkbox.checked; lineState.textContent = checkbox.checked ? 'On the card' : 'Left out'; row.classList.toggle('excluded', !checkbox.checked);
      $('review-count').textContent = `${blocks.length - picks.length} of ${blocks.length} lines left out`;
      changedSelection();
    });
    select.addEventListener('change', () => { const pick = picks.find(p => p.id === block.id); if (pick) pick.section = select.value; changedSelection(); });
  }
}

function changedSelection() {
  $('reviewed').checked = false;
  if (!meta.mode.includes('edited')) meta.mode += ' · edited by reader';
  status('Selection updated. Check the full source before saving.');
  renderPaper();
}

function invalidate() {
  revision += 1;
  request?.abort(); request = null;
  current = null; picks = []; meta = {};
  $('reviewed').checked = false;
  $('source-count').textContent = $('notes').value ? `${$('notes').value.length.toLocaleString('en-US')} / 16,000 characters` : 'No notes added';
  $('select-button').disabled = !local;
  $('select-button').textContent = 'Select with local Gemma';
  renderReview(); renderPaper();
  status('Notes changed. Select again or arrange the current excerpts manually.');
}

for (const id of ['place', 'source-url', 'notes']) $(id).addEventListener('input', invalidate);
$('reviewed').addEventListener('change', refreshExports);
$('manual-button').addEventListener('click', async () => {
  try {
    const captured = input(); const runRevision = ++revision;
    request?.abort(); request = null;
    $('select-button').disabled = !local; $('select-button').textContent = 'Select with local Gemma';
    const sourceHash = await hashText(captured.text);
    if (runRevision !== revision) return;
    current = captured; picks = []; meta = { mode: 'Manual selection', model: 'No model', sourceHash };
    $('reviewed').checked = false;
    renderReview(); renderPaper(); status('Choose excerpts below. No AI selection was run.');
    $('review-section').scrollIntoView({ behavior: 'instant', block: 'start' });
  } catch (err) { status(err.message, true); }
});

$('notes-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!local || request) return;
  const runRevision = ++revision;
  try {
    const captured = input(); sourceBlocks(captured.text);
    current = null; picks = []; $('reviewed').checked = false; renderReview(); renderPaper();
    request = new AbortController();
    $('select-button').disabled = true; $('select-button').textContent = 'Reading the notes…';
    status('Gemma is selecting excerpts on this computer. You can edit the notes to cancel.');
    const response = await fetch('./api/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(captured), signal: request.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Local selection failed.');
    if (runRevision !== revision) return;
    if (result.input.text !== captured.text || result.meta.sourceHash !== await hashText(captured.text)) throw new Error('The returned selection does not match these notes.');
    if (runRevision !== revision) return;
    picks = validateSelection({ picks: result.picks }, sourceBlocks(captured.text));
    current = captured; meta = result.meta;
    renderReview(); renderPaper();
    status(picks.length ? `Local ${MODEL} selected ${picks.length} excerpts in ${(meta.elapsedMs / 1000).toFixed(1)} seconds. Review every source line below.` : 'Gemma selected no excerpts. Your notes are still here: use the checkboxes below to make a card manually.');
  } catch (err) { if (runRevision === revision) status(err.name === 'AbortError' ? 'Selection cancelled.' : err.message, err.name !== 'AbortError'); }
  finally { if (runRevision === revision) { request = null; $('select-button').disabled = !local; $('select-button').textContent = 'Select with local Gemma'; } }
});

$('example-button').addEventListener('click', async () => {
  const runRevision = ++revision; request?.abort(); request = null;
  $('example-button').disabled = true;
  try {
    const response = await fetch('./example.json');
    if (!response.ok) throw new Error('The recorded example could not be loaded. Try again, or arrange your own notes manually.');
    const saved = await response.json(); const checked = checkInput(saved.input);
    const computed = await hashText(checked.text);
    if (computed !== saved.meta.sourceHash) throw new Error('The example source hash does not match its record.');
    if (runRevision !== revision) return;
    const selection = validateSelection({ picks: saved.picks }, sourceBlocks(checked.text));
    $('place').value = checked.title; $('source-url').value = checked.url; $('notes').value = checked.text;
    current = checked; picks = selection; meta = { ...saved.meta, mode: 'Recorded Gemma example' };
    $('reviewed').checked = false; $('source-count').textContent = `${checked.text.length.toLocaleString('en-US')} / 16,000 characters`;
    renderReview(); renderPaper();
    status(`Recorded example · ${saved.meta.model} ran on ${saved.meta.generatedAt.slice(0, 10)}. No model is running now. Source excerpts are from NPS; this is not a live conditions report.`);
  } catch (err) { if (runRevision === revision) status(err.message, true); }
  finally { $('example-button').disabled = false; if (runRevision === revision) { $('select-button').disabled = !local; $('select-button').textContent = 'Select with local Gemma'; } }
});

function saveFile(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function checkedExport() {
  const issue = exportIssue(current, picks, $('reviewed').checked);
  if (issue) throw new Error(issue);
  return { ...meta, savedAt: new Date().toISOString() };
}
$('download-button').addEventListener('click', () => {
  try { const savedMeta = checkedExport(); saveFile(offlineDocument(current, picks, savedMeta, true), 'text/html;charset=utf-8', 'outingfold.html'); status('Offline page prepared for download. Open the saved file before leaving to check it is on your device.'); }
  catch (err) { status(err.message, true); }
});
$('json-button').addEventListener('click', () => {
  try { saveFile(JSON.stringify({ version: 1, input: current, picks, meta: checkedExport(), reviewed: true }, null, 2), 'application/json', 'outingfold-source.json'); status('Source record prepared for download. It includes the full input, selected IDs and source hash.'); }
  catch (err) { status(err.message, true); }
});
$('print-button').addEventListener('click', () => {
  try { meta = checkedExport(); renderPaper(); window.print(); }
  catch (err) { status(err.message, true); }
});

renderPaper();
fetch('./api/status').then(r => r.ok ? r.json() : null).then(data => {
  local = data?.local === true;
}).catch(() => {}).finally(() => {
  if (disposed) return;
  $('select-button').disabled = !local;
  $('connection-note').textContent = local ? 'Local mode. Your notes go only to this computer’s server and Ollama. No model call runs until you press Select.' : 'Public demo. Try the saved example or arrange your own excerpts manually. Fresh AI selection is available when you run the app locally.';
});
window.addEventListener('pagehide', () => { disposed = true; request?.abort(); });
