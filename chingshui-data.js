const DATA_URLS = {
  complete: 'data/chingshui-chongshe-records.json',
  fragmentary: 'data/chingshui-chongshe-fragmentary.json'
};
const DETAILS_URL = 'data/chingshui-chongshe-details.json.gz.b64';

const state = { complete: [], fragmentary: [], dataset: 'complete', filtered: [], selectedId: null, detailsLoaded: false };
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const textOrDash = (value) => value && String(value).trim() ? value : '—';

function status(message) { $('dataStatus').textContent = message; }

async function decodeGzipBase64(text) {
  if (!('DecompressionStream' in window)) throw new Error('This browser does not support in-browser gzip decompression.');
  const clean = text.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

function bilingualRows(rows) {
  return `<div class="data-table-wrap"><table class="recording-table bilingual-table"><thead><tr><th>Field</th><th>English</th><th lang="zh-Hant">原始中文</th></tr></thead><tbody>${rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(textOrDash(r[1]))}</td><td class="zh" lang="zh-Hant">${esc(textOrDash(r[2]))}</td></tr>`).join('')}</tbody></table></div>`;
}

function summaryFields(fields) {
  return fields.map(([label, value]) => `<div class="summary-field"><strong>${esc(label)}</strong><span>${esc(textOrDash(value))}</span></div>`).join('');
}

function recordSearchText(record) {
  return Object.entries(record).filter(([key, value]) => typeof value === 'string' && !key.startsWith('details')).map(([, value]) => value).join(' ').toLowerCase();
}

function updateRecordControls() {
  const query = $('recordSearch').value.trim().toLowerCase();
  const records = state[state.dataset];
  state.filtered = query ? records.filter(r => recordSearchText(r).includes(query)) : records.slice();
  $('recordSelect').innerHTML = state.filtered.map(r => `<option value="${esc(r.id)}">${esc(r.id)}</option>`).join('');
  $('recordList').innerHTML = state.filtered.map(r => `<button type="button" data-record-id="${esc(r.id)}">${esc(r.id)} <span>${esc(shortDescriptor(r))}</span></button>`).join('');
  $('recordListTitle').textContent = state.dataset === 'complete' ? `Complete burials (${state.filtered.length})` : `Fragmentary / mixed (${state.filtered.length})`;
  if (!state.filtered.length) { state.selectedId = null; status('No records match the filter.'); renderEmpty(); return; }
  if (!state.filtered.some(r => r.id === state.selectedId)) state.selectedId = state.filtered[0].id;
  $('recordSelect').value = state.selectedId;
  renderSelected();
}

function shortDescriptor(r) {
  if (state.dataset === 'complete') return `${r.sex_en || ''}, ${r.age_en || ''}`;
  return (r.record_type || '').replaceAll('_', ' ');
}

function renderEmpty() {
  $('recordTitle').textContent = 'No record selected';
  $('recordBadges').innerHTML = '';
  $('recordScope').textContent = '';
  $('summaryFields').innerHTML = '';
  $('burialFields').innerHTML = '';
  $('profileFields').innerHTML = '';
  $('pathologyEn').textContent = '—'; $('pathologyZh').textContent = '—';
  $('notesEn').textContent = '—'; $('notesZh').textContent = '—';
  $('detailSections').innerHTML = '<div class="empty-detail">Change the filter to display a record.</div>';
}

function renderSelected() {
  const record = state[state.dataset].find(r => r.id === state.selectedId);
  if (!record) return renderEmpty();
  $('recordSelect').value = record.id;
  document.querySelectorAll('[data-record-id]').forEach(btn => btn.classList.toggle('active', btn.dataset.recordId === record.id));
  if (state.dataset === 'complete') renderComplete(record); else renderFragmentary(record);
  status(`${record.id} loaded.`);
}

function renderComplete(r) {
  $('recordTitle').textContent = `Burial ${r.id}`;
  $('recordBadges').innerHTML = [
    `<span class="record-badge dark">${esc(r.cultural_layer_en)}</span>`,
    `<span class="record-badge">${esc(r.source_group === '2020_curation_project' ? 'Detailed project record' : 'Earlier curation summary')}</span>`,
    `<span class="record-badge warn">Report pp. ${esc(r.source_report_pages)}</span>`
  ].join('');
  $('recordScope').textContent = r.translation_status;
  $('summaryFields').innerHTML = summaryFields([
    ['Record ID', r.id], ['Layer', r.layer], ['Head direction', r.head_direction], ['Source pages', r.source_report_pages],
    ['Sex', r.sex_en], ['Age', r.age_en], ['Body position', r.body_position_en], ['Limb position', r.limb_position_en]
  ]);
  $('burialFields').innerHTML = bilingualRows([
    ['Cultural layer', r.cultural_layer_en, r.cultural_layer_zh], ['Head direction', r.head_direction, r.head_direction],
    ['Body position', r.body_position_en, r.body_position_zh], ['Limb position', r.limb_position_en, r.limb_position_zh],
    ['Arm / hand position', r.arm_position_en, r.arm_position_zh]
  ]);
  $('profileFields').innerHTML = bilingualRows([
    ['Sex assessment', r.sex_en, r.sex_zh], ['Age assessment', r.age_en, r.age_zh],
    ['Source reference', r.source_reference_en, r.reference_zh || '本報告']
  ]);
  $('pathologyEn').textContent = textOrDash(r.pathology_en); $('pathologyZh').textContent = textOrDash(r.pathology_zh);
  $('notesEn').textContent = textOrDash(r.notes_en); $('notesZh').textContent = textOrDash(r.notes_zh);
  renderCompleteDetails(r);
}

function renderCompleteDetails(r) {
  const d = r.details_zh;
  if (!d) {
    $('detailNotice').textContent = r.source_group === 'prior_curation'
      ? 'This report reproduces only summary information for this earlier curated burial. Consult the cited earlier publication for the full individual recording forms.'
      : state.detailsLoaded
        ? 'No extracted detailed text was found for this record.'
        : 'Detailed source text could not be loaded in this browser; the structured summary remains available.';
    $('detailSections').innerHTML = '<div class="empty-detail">No detailed individual text is currently displayed for this burial.</div>';
    return;
  }
  $('detailNotice').textContent = `Traditional Chinese source text extracted from the individual record on printed report pages ${d.report_pages}. PDF table formatting can produce line breaks or compacted columns; verify values against the original report before publication.`;
  const sections = [
    ['Curation record / 墓葬整飭紀錄', d.curation_record_zh], ['Skeletal preservation inventory / 人骨保存狀況', d.skeletal_inventory_text_zh],
    ['Dental preservation and wear / 牙齒保存狀況', d.dental_text_zh], ['Sex and age assessment / 性別年齡', d.sex_age_zh],
    ['Nonmetric traits / 非測量性特徵', d.nonmetric_zh], ['Measurements / 可測量性特徵', d.measurements_zh],
    ['Pathology and other observations / 病理觀察及其他', d.pathology_other_zh]
  ];
  $('detailSections').innerHTML = sections.map(([title, text], i) => `<details class="detail-section" ${i === 0 ? 'open' : ''}><summary>${esc(title)}</summary><pre lang="zh-Hant">${esc(textOrDash(text))}</pre></details>`).join('');
}

function renderFragmentary(r) {
  const isHuman = r.record_type === 'fragmentary_human';
  $('recordTitle').textContent = `Package ${r.id}`;
  $('recordBadges').innerHTML = [`<span class="record-badge dark">${esc(isHuman ? 'Fragmentary human remains' : 'Animal or mixed remains')}</span>`, `<span class="record-badge warn">Report pp. ${esc(r.source_report_pages)}</span>`].join('');
  $('recordScope').textContent = 'English research translation of the fragmentary-remains tables and associated curation narrative.';
  $('summaryFields').innerHTML = summaryFields([
    ['Record ID', r.id], ['Unit', r.unit], ['Layer', r.layer], ['Classification', (r.record_type || '').replaceAll('_', ' ')],
    ['Head direction', r.head_direction], ['Burial position', r.burial_position], ['Preservation', r.preservation], ['Source pages', r.source_report_pages]
  ]);
  $('burialFields').innerHTML = bilingualRows([['Excavation unit', r.unit, r.unit], ['Layer', r.layer, r.layer], ['Head direction', r.head_direction, r.head_direction], ['Burial position', r.burial_position, r.burial_position]]);
  $('profileFields').innerHTML = bilingualRows([['Classification', isHuman ? 'Fragmentary human remains' : 'Animal or mixed remains', isHuman ? '零散人骨' : '獸骨與不明／混合骨骼'], ['Preservation', r.preservation, r.preservation === 'Poor' ? '差' : r.preservation === 'Very poor' ? '極差' : '—']]);
  if (isHuman) {
    $('pathologyEn').textContent = textOrDash(r.description_en); $('pathologyZh').textContent = textOrDash(r.description_zh);
    $('notesEn').textContent = 'The report cautions that fragmentary groups may not represent a single individual.'; $('notesZh').textContent = '報告指出零散人骨可能無法確認皆屬於同一個體。';
  } else {
    $('pathologyEn').textContent = textOrDash(r.reassessment_en); $('pathologyZh').textContent = textOrDash(r.reassessment_zh);
    $('notesEn').textContent = `Original excavation interpretation: ${textOrDash(r.original_interpretation_en)}`; $('notesZh').textContent = `原發掘報告記錄：${textOrDash(r.original_interpretation_zh)}`;
  }
  $('detailNotice').textContent = 'The fragmentary dataset is a translated synthesis of Tables 7–8 and the accompanying narrative.';
  $('detailSections').innerHTML = `<details class="detail-section" open><summary>Translated description</summary><pre>${esc(isHuman ? r.description_en : r.reassessment_en)}</pre></details><details class="detail-section"><summary>Original Traditional Chinese</summary><pre lang="zh-Hant">${esc(isHuman ? r.description_zh : r.reassessment_zh)}</pre></details>`;
}

function moveRecord(delta) {
  if (!state.filtered.length) return;
  const idx = state.filtered.findIndex(r => r.id === state.selectedId);
  state.selectedId = state.filtered[(idx + delta + state.filtered.length) % state.filtered.length].id;
  renderSelected();
}

function downloadObject(object, filename) {
  const blob = new Blob([JSON.stringify(object, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
}

function downloadSelected() {
  const record = state[state.dataset].find(r => r.id === state.selectedId);
  if (record) downloadObject(record, `qingshui-zhongshe-${record.id}.json`);
}

function downloadFullData() {
  downloadObject({
    metadata: { generated: new Date().toISOString(), note: 'Summary records merged in-browser with extracted Traditional Chinese detailed text where available.' },
    records: state.complete
  }, 'chingshui-chongshe-complete-records-detailed.json');
}

async function loadData() {
  try {
    const [complete, fragmentary] = await Promise.all(Object.values(DATA_URLS).map(url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); })));
    state.complete = complete.records; state.fragmentary = fragmentary.records;
    try {
      const detailsResponse = await fetch(DETAILS_URL);
      if (!detailsResponse.ok) throw new Error(`${DETAILS_URL}: ${detailsResponse.status}`);
      const details = await decodeGzipBase64(await detailsResponse.text());
      const detailMap = new Map(details.records.map(r => [r.id, r]));
      state.complete.forEach(r => { r.details_zh = detailMap.get(r.id) || null; });
      state.detailsLoaded = true;
    } catch (detailError) {
      console.warn('Detailed source text unavailable:', detailError);
      state.complete.forEach(r => { r.details_zh = null; });
    }
    $('completeCount').textContent = state.complete.length;
    $('upperCount').textContent = state.complete.filter(r => r.cultural_layer_en === 'Upper cultural layer').length;
    $('lowerCount').textContent = state.complete.filter(r => r.cultural_layer_en === 'Lower cultural layer').length;
    $('projectCount').textContent = state.complete.filter(r => r.source_group === '2020_curation_project').length;
    $('priorCount').textContent = state.complete.filter(r => r.source_group === 'prior_curation').length;
    $('fragmentCount').textContent = state.fragmentary.length;
    state.selectedId = state.complete[0]?.id || null; updateRecordControls();
  } catch (error) {
    console.error(error); status('Data could not be loaded. Open this page through a web server or GitHub Pages.');
    $('detailSections').innerHTML = `<div class="empty-detail">${esc(error.message)}</div>`;
  }
}

$('datasetSelect').addEventListener('change', event => { state.dataset = event.target.value; $('recordSearch').value = ''; state.selectedId = state[state.dataset][0]?.id || null; updateRecordControls(); });
$('recordSelect').addEventListener('change', event => { state.selectedId = event.target.value; renderSelected(); });
$('recordSearch').addEventListener('input', updateRecordControls);
$('recordList').addEventListener('click', event => { const button = event.target.closest('[data-record-id]'); if (!button) return; state.selectedId = button.dataset.recordId; renderSelected(); document.getElementById('record-summary').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('prevRecord').addEventListener('click', () => moveRecord(-1)); $('nextRecord').addEventListener('click', () => moveRecord(1));
$('downloadRecord').addEventListener('click', downloadSelected); $('downloadFullData').addEventListener('click', downloadFullData); $('printRecord').addEventListener('click', () => window.print());
loadData();
