export const SECTIONS = Object.freeze({
  plan: 'Plan the visit',
  notice: 'Look and listen',
  care: 'Care and cautions',
});
export const MAX_SOURCE = 16000;
export const MAX_CARD = 1800;
export const MODEL = 'gemma4:12b-it-q4_K_M';

export function safeURL(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}

export function checkInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Add a place and its source notes.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100) throw new Error('Use a place name of 1–100 characters.');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > MAX_SOURCE) throw new Error(`Add source notes of 1–${MAX_SOURCE.toLocaleString('en-US')} characters.`);
  if (input.url !== undefined && (typeof input.url !== 'string' || input.url.length > 1500 || (input.url && !safeURL(input.url)))) throw new Error('Use an http or https source link without a username or password, or leave it blank.');
  return { title: input.title.trim(), text: input.text, url: input.url || '' };
}

// Each nonempty line is one indivisible excerpt. Trimming only changes the
// offsets at the edges; the stored text must equal source.slice(start, end).
export function sourceBlocks(text) {
  if (typeof text !== 'string' || text.length > MAX_SOURCE) throw new Error('The source is too long.');
  const blocks = [];
  for (const match of text.matchAll(/[^\r\n]+/g)) {
    const quote = match[0].trim();
    if (!quote) continue;
    const start = match.index + match[0].indexOf(quote);
    blocks.push({ id: `S${blocks.length + 1}`, text: quote, start, end: start + quote.length });
  }
  if (blocks.length > 120) throw new Error('Use at most 120 nonempty lines of notes.');
  if (!blocks.length) throw new Error('Add at least one line of source notes.');
  return blocks;
}

export function selectionSchema(blocks) {
  return {
    type: 'object', additionalProperties: false, required: ['picks'],
    properties: { picks: { type: 'array', maxItems: 12, items: {
      type: 'object', additionalProperties: false, required: ['id', 'section'],
      properties: { id: { type: 'string', enum: blocks.map(b => b.id) }, section: { type: 'string', enum: Object.keys(SECTIONS) } },
    } } },
  };
}

export function validateSelection(value, blocks) {
  if (!value || Array.isArray(value) || Object.keys(value).some(k => k !== 'picks') || !Array.isArray(value.picks) || value.picks.length > 12) throw new Error('The model returned an invalid selection. Nothing was added to the card.');
  const lookup = new Map(blocks.map(b => [b.id, b]));
  const seen = new Set();
  return value.picks.map(pick => {
    if (!pick || Object.keys(pick).some(k => !['id', 'section'].includes(k)) || !lookup.has(pick.id) || !Object.hasOwn(SECTIONS, pick.section) || seen.has(pick.id)) throw new Error('The model returned an unknown, repeated or invalid source ID. Nothing was added to the card.');
    seen.add(pick.id);
    return { id: pick.id, section: pick.section };
  });
}

export function resolvePicks(input, picks) {
  const blocks = sourceBlocks(input.text);
  const valid = validateSelection({ picks }, blocks);
  const ids = new Map(valid.map(p => [p.id, p.section]));
  return blocks.filter(b => ids.has(b.id)).map(b => ({ ...b, section: ids.get(b.id) }));
}

export function exportIssue(input, picks, reviewed) {
  if (!reviewed) return 'Review the complete source, including lines left out, then tick the confirmation.';
  const selected = resolvePicks(input, picks);
  if (!selected.length) return 'Select at least one source excerpt.';
  const length = selected.reduce((n, b) => n + b.text.length, 0);
  if (length > MAX_CARD) return `The card has ${length.toLocaleString('en-US')} characters. Keep at most ${MAX_CARD.toLocaleString('en-US')} so the paper stays readable.`;
  if (Object.keys(SECTIONS).some(section => selected.filter(b => b.section === section).reduce((n, b) => n + b.text.length, 0) > 800)) return 'One panel is too full. Keep each panel below 800 characters by removing excerpts or changing their section.';
  return '';
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function paperMarkup(input, picks, meta = {}) {
  const selected = resolvePicks(input, picks);
  const e = escapeHTML;
  const panels = Object.entries(SECTIONS).map(([key, name], index) => `<section class="fold-panel"><p class="panel-number">${index + 1} / 4</p><h2>${name}</h2>${selected.some(b => b.section === key) ? `<ul>${selected.filter(b => b.section === key).map(b => `<li>${e(b.text)} <span class="source-id">[${e(b.id)}]</span></li>`).join('')}</ul>` : '<p class="empty-panel">Nothing selected here. Check the full source before leaving.</p>'}</section>`).join('');
  const date = meta.savedAt ? new Date(meta.savedAt) : null;
  const saved = date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : 'Not saved yet';
  return `<div class="paper-heading"><p class="paper-brand">OutingFold</p><h2>${e(input.title)}</h2><p>Source excerpts for a short time outside</p></div><div class="fold-grid">${panels}<section class="fold-panel field-notes"><p class="panel-number">4 / 4</p><h2>Bring back a detail.</h2><p>Something I noticed</p><div class="writing-lines" aria-hidden="true"></div><p>Something to look up later</p><div class="writing-lines" aria-hidden="true"></div><p class="small">Recheck opening hours, closures, weather and access before you go. These excerpts may omit important information.</p></section></div><div class="paper-footer"><p>${input.url ? `<a href="${e(safeURL(input.url))}" rel="noreferrer">${e(input.url)}</a>` : 'Source link not provided.'}</p><p>Notes saved: ${saved} · This is a reading aid, not a route or a conditions report.</p></div>`;
}

export const PAPER_CSS = `
*{box-sizing:border-box}body{margin:0;color:#203c2e;font:16px/1.5 system-ui,sans-serif;background:#f4f4ec}.paper{background:white;border:1px solid #bdc8b9}.paper-heading{padding:22px 26px 18px;border-bottom:1px solid #bdc8b9}.paper-heading h2{font:32px/1.12 Georgia,serif;margin:4px 0 8px;overflow-wrap:anywhere}.paper-heading p{margin:0;font-size:13px}.paper-brand{font-weight:700;letter-spacing:.04em}.fold-grid{display:grid;grid-template-columns:1fr 1fr}.fold-panel{padding:20px 26px;min-height:230px;overflow-wrap:anywhere}.fold-panel:nth-child(odd){border-right:1px dashed #bdc8b9}.fold-panel:nth-child(-n+2){border-bottom:1px dashed #bdc8b9}.panel-number{margin:0 0 8px;font:11px/1.4 ui-monospace,monospace;color:#59665d}.fold-panel h2{font:23px/1.2 Georgia,serif;margin:0 0 16px}.fold-panel ul{padding-left:16px;margin:0}.fold-panel li{margin:0 0 10px;font-size:13px;line-height:1.5}.source-id{font:10px/1.4 ui-monospace,monospace;white-space:nowrap;color:#59665d}.empty-panel,.small{font-size:12px;line-height:1.5;color:#59665d}.field-notes>p:not(.panel-number){font-size:12px}.writing-lines{height:32px;background:repeating-linear-gradient(transparent 0,transparent 15px,#bdc8b9 15px,#bdc8b9 16px)}.paper-footer{border-top:1px solid #bdc8b9;padding:12px 26px;font-size:10px;overflow-wrap:anywhere}.paper-footer p{margin:3px 0}.paper-footer a{color:inherit}.full-source{margin:26px 0;background:white;padding:20px;border:1px solid #bdc8b9}.full-source summary{cursor:pointer;font-weight:600}.full-source ol{padding-left:26px}.full-source li{white-space:pre-wrap;overflow-wrap:anywhere;margin:16px 0}.export-meta{font-size:12px;overflow-wrap:anywhere;color:#59665d}a{color:#245b3f}@media(max-width:550px){.fold-grid{display:block}.fold-panel{min-height:0;border-right:0!important;border-bottom:1px dashed #bdc8b9}.fold-panel:last-child{border-bottom:0}.paper-heading h2{font-size:28px}}@page{size:A4 portrait;margin:12mm}@media print{body{background:#fff;color:#000}main{max-width:none;padding:0;margin:0}.paper{width:100%;border-color:#777;break-inside:avoid}.paper-heading{padding:6mm}.paper-heading h2{font-size:25pt}.fold-grid{display:grid;grid-template-columns:1fr 1fr}.fold-panel{min-height:74mm;padding:5mm;border-color:#888}.fold-panel:nth-child(odd){border-right:1px dashed #888!important}.fold-panel:nth-child(-n+2){border-bottom:1px dashed #888}.fold-panel h2{font-size:17pt}.fold-panel li{font-size:9.5pt;line-height:1.42}.paper-footer{padding:3mm 6mm;font-size:7.5pt}.panel-number,.source-id,.small,.empty-panel{color:#333}.writing-lines{background:none;border-bottom:1px solid #999}.full-source,.export-meta,.offline-intro{display:none}.field-notes .small{font-size:8.5pt}}
`;

export function offlineDocument(input, picks, meta, reviewed) {
  checkInput(input);
  const issue = exportIssue(input, picks, reviewed);
  if (issue) throw new Error(issue);
  const e = escapeHTML;
  const selected = new Set(picks.map(p => p.id));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(input.title)} · OutingFold</title><style>main{max-width:860px;margin:30px auto;padding:0 16px}${PAPER_CSS}</style></head><body><main><p class="offline-intro">Saved for offline reading. Use your browser’s Print command for a foldable page. Check the print preview, then fold along the dashed lines. Unfold to read.</p><article class="paper">${paperMarkup(input, picks, meta)}</article><details class="full-source"><summary>Complete source · including excerpts left out</summary><ol>${sourceBlocks(input.text).map(b => `<li><strong>${b.id} · ${selected.has(b.id) ? 'On the card' : 'Left out'}</strong><br>${e(b.text)}</li>`).join('')}</ol></details><p class="export-meta">${e(meta.mode || 'Manual selection')} · ${e(meta.model || 'No model')}<br>Source SHA-256: ${e(meta.sourceHash || 'unavailable')}<br>Review confirmed when saved. Source matching verifies the copied words; it does not verify the source or its completeness.</p></main></body></html>`;
}
