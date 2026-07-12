const DATA_URLS = {
  complete: 'data/chingshui-chongshe-records.json',
  fragmentary: 'data/chingshui-chongshe-fragmentary.json'
};

const state = { complete: [], fragmentary: [], dataset: 'complete', filtered: [], selectedId: null };
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const textOrDash = (value) => value && String(value).trim() ? value : '—';

function status(message) { $('dataStatus').textContent = message; }

async function loadPartitionedJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const manifest = await response.json();
  if (Array.isArray(manifest.records)) return manifest;
  if (!Array.isArray(manifest.parts)) throw new Error(`${url}: invalid dataset manifest`);
  const base = new URL(url, window.location.href);
  const parts = await Promise.all(manifest.parts.map(name => fetch(new URL(name, base)).then(r => {
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return r.json();
  })));
  return { ...manifest, records: parts.flatMap(part => part.records || []) };
}

function bilingualRows(rows) {
  return `<div class="data-table-wrap"><table class="recording-table bilingual-table"><thead><tr><th>Field</th><th>English</th><th lang="zh-Hant">原始中文</th></tr></thead><tbody>${rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(textOrDash(r[1]))}</td><td class="zh" lang="zh-Hant">${esc(textOrDash(r[2]))}</td></tr>`).join('')}</tbody></table></div>`;
}

function summaryFields(fields) {
  return fields.map(([label, value]) => `<div class="summary-field"><strong>${esc(label)}</strong><span>${esc(textOrDash(value))}</span></div>`).join('');
}

function recordSearchText(record) {
  return Object.values(record).filter(value => typeof value === 'string').join(' ').toLowerCase();
}

function updateRecordControls() {
  const query = $('recordSearch').value.trim().toLowerCase();
  const records = state[state.dataset];
  state.filtered = query ? records.filter(r => recordSearchText(r).includes(query)) : records.slice();
  $('recordSelect').innerHTML = state.filtered.map(r => `<option value="${esc(r.id)}">${esc(r.id)}</option>`).join('');
  $('recordList').innerHTML = state.filtered.map(r => `<button type="button" data-record-id="${esc(r.id)}">${esc(r.id)} <span>${esc(shortDescriptor(r))}</span></button>`).join('');
  $('recordListTitle').textContent = state.dataset === 'complete' ? `Complete burials (${state.filtered.length})` : `Fragmentary / mixed (${state.filtered.length})`;
  if (!state.filtered.length) {
    state.selectedId = null;
    status('No records match the filter.');
    renderEmpty();
    return;
  }
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
  $('pathologyEn').textContent = '—';
  $('pathologyZh').textContent = '—';
  $('notesEn').textContent = '—';
  $('notesZh').textContent = '—';
  $('detailNotice').textContent = '';
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
    `<span class="record-badge">${esc(r.source_group === '2020_curation_project' ? 'Current-project record' : 'Earlier curation summary')}</span>`,
    `<span class="record-badge warn">Report pp. ${esc(r.source_report_pages)}</span>`
  ].join('');
  $('recordScope').textContent = r.translation_status;
  $('summaryFields').innerHTML = summaryFields([
    ['Record ID', r.id], ['Layer', r.layer], ['Head direction', r.head_direction], ['Source pages', r.source_report_pages],
    ['Sex', r.sex_en], ['Age', r.age_en], ['Body position', r.body_position_en], ['Limb position', r.limb_position_en]
  ]);
  $('burialFields').innerHTML = bilingualRows([
    ['Cultural layer', r.cultural_layer_en, r.cultural_layer_zh],
    ['Head direction', r.head_direction, r.head_direction],
    ['Body position', r.body_position_en, r.body_position_zh],
    ['Limb position', r.limb_position_en, r.limb_position_zh],
    ['Arm / hand position', r.arm_position_en, r.arm_position_zh]
  ]);
  $('profileFields').innerHTML = bilingualRows([
    ['Sex assessment', r.sex_en, r.sex_zh],
    ['Age assessment', r.age_en, r.age_zh],
    ['Source reference', r.source_reference_en, r.reference_zh || '本報告']
  ]);
  $('pathologyEn').textContent = textOrDash(r.pathology_en);
  $('pathologyZh').textContent = textOrDash(r.pathology_zh);
  $('notesEn').textContent = textOrDash(r.notes_en);
  $('notesZh').textContent = textOrDash(r.notes_zh);
  renderCompleteSource(r);
}

function renderCompleteSource(r) {
  const prior = r.source_group === 'prior_curation';
  $('detailNotice').textContent = prior
    ? 'This final report reproduces a summary of an earlier curation project. The cited earlier publication should be consulted for the full individual recording forms.'
    : `This structured record is linked to the individual burial discussion on printed report pages ${r.source_report_pages}. Consult those pages and the original recording tables before formal publication or secondary analysis.`;
  $('detailSections').innerHTML = bilingualRows([
    ['Record scope', prior ? 'Summary reproduced from an earlier curation project' : 'Burial documented in the current curation project', prior ? '前期整飭計畫摘要' : '本次整飭計畫墓葬紀錄'],
    ['Printed report pages', r.source_report_pages, r.source_report_pages],
    ['Citation in report', r.source_reference_en, r.reference_zh || '本報告'],
    ['Verification status', 'Structured summary translated; full individual tables are not reproduced in this dataset', '已翻譯結構化摘要；本資料集未重製完整個體紀錄表']
  ]);
}

function renderFragmentary(r) {
  const isHuman = r.record_type === 'fragmentary_human';
  const burialZh = r.burial_position === 'Prone' ? '俯身' : r.burial_position === 'Unknown' ? '不詳' : r.burial_position;
  const directionZh = r.head_direction === 'Unknown' ? '不詳' : r.head_direction;
  $('recordTitle').textContent = `Package ${r.id}`;
  $('recordBadges').innerHTML = [
    `<span class="record-badge dark">${esc(isHuman ? 'Fragmentary human remains' : 'Animal or mixed remains')}</span>`,
    `<span class="record-badge warn">Report pp. ${esc(r.source_report_pages)}</span>`
  ].join('');
  $('recordScope').textContent = 'English research translation of the fragmentary-remains tables and associated curation narrative.';
  $('summaryFields').innerHTML = summaryFields([
    ['Record ID', r.id], ['Unit', r.unit], ['Layer', r.layer], ['Classification', (r.record_type || '').replaceAll('_', ' ')],
    ['Head direction', r.head_direction], ['Burial position', r.burial_position], ['Preservation', r.preservation], ['Source pages', r.source_report_pages]
  ]);
  $('burialFields').innerHTML = bilingualRows([
    ['Excavation unit', r.unit, r.unit],
    ['Layer', r.layer, r.layer],
    ['Head direction', r.head_direction, directionZh],
    ['Burial position', r.burial_position, burialZh]
  ]);
  $('profileFields').innerHTML = bilingualRows([
    ['Classification', isHuman ? 'Fragmentary human remains' : 'Animal or mixed remains', isHuman ? '零散人骨' : '獸骨與不明／混合骨骼'],
    ['Preservation', r.preservation, r.preservation === 'Poor' ? '差' : r.preservation === 'Very poor' ? '極差' : '—']
  ]);
  if (isHuman) {
    $('pathologyEn').textContent = textOrDash(r.description_en);
    $('pathologyZh').textContent = textOrDash(r.description_zh);
    $('notesEn').textContent = 'The report cautions that fragmentary groups may not represent a single individual.';
    $('notesZh').textContent = '報告指出零散人骨可能無法確認皆屬於同一個體。';
  } else {
    $('pathologyEn').textContent = textOrDash(r.reassessment_en);
    $('pathologyZh').textContent = textOrDash(r.reassessment_zh);
    $('notesEn').textContent = `Original excavation interpretation: ${textOrDash(r.original_interpretation_en)}`;
    $('notesZh').textContent = `原發掘報告記錄：${textOrDash(r.original_interpretation_zh)}`;
  }
  $('detailNotice').textContent = 'This record is a translated synthesis of Tables 7–8 and the accompanying curation narrative on the printed report pages listed below.';
  $('detailSections').innerHTML = `<details class="detail-section" open><summary>English synthesis</summary><pre>${esc(isHuman ? r.description_en : r.reassessment_en)}</pre></details><details class="detail-section"><summary>Original Traditional Chinese</summary><pre lang="zh-Hant">${esc(isHuman ? r.description_zh : r.reassessment_zh)}</pre></details><p class="field-help"><strong>Printed report pages:</strong> ${esc(r.source_report_pages)}</p>`;
}

function moveRecord(delta) {
  if (!state.filtered.length) return;
  const idx = state.filtered.findIndex(r => r.id === state.selectedId);
  state.selectedId = state.filtered[(idx + delta + state.filtered.length) % state.filtered.length].id;
  renderSelected();
}

function downloadObject(object, filename) {
  const blob = new Blob([JSON.stringify(object, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadSelected() {
  const record = state[state.dataset].find(r => r.id === state.selectedId);
  if (record) downloadObject(record, `qingshui-zhongshe-${record.id}.json`);
}

async function loadData() {
  try {
    const [complete, fragmentary] = await Promise.all(Object.values(DATA_URLS).map(loadPartitionedJson));
    state.complete = complete.records;
    state.fragmentary = fragmentary.records;
    $('completeCount').textContent = state.complete.length;
    $('upperCount').textContent = state.complete.filter(r => r.cultural_layer_en === 'Upper cultural layer').length;
    $('lowerCount').textContent = state.complete.filter(r => r.cultural_layer_en === 'Lower cultural layer').length;
    $('projectCount').textContent = state.complete.filter(r => r.source_group === '2020_curation_project').length;
    $('priorCount').textContent = state.complete.filter(r => r.source_group === 'prior_curation').length;
    $('fragmentCount').textContent = state.fragmentary.length;
    state.selectedId = state.complete[0]?.id || null;
    updateRecordControls();
  } catch (error) {
    console.error(error);
    status('Data could not be loaded. Open this page through a web server or GitHub Pages.');
    $('detailSections').innerHTML = `<div class="empty-detail">${esc(error.message)}</div>`;
  }
}

$('datasetSelect').addEventListener('change', event => {
  state.dataset = event.target.value;
  $('recordSearch').value = '';
  state.selectedId = state[state.dataset][0]?.id || null;
  updateRecordControls();
});
$('recordSelect').addEventListener('change', event => { state.selectedId = event.target.value; renderSelected(); });
$('recordSearch').addEventListener('input', updateRecordControls);
$('recordList').addEventListener('click', event => {
  const button = event.target.closest('[data-record-id]');
  if (!button) return;
  state.selectedId = button.dataset.recordId;
  renderSelected();
  document.getElementById('record-summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('prevRecord').addEventListener('click', () => moveRecord(-1));
$('nextRecord').addEventListener('click', () => moveRecord(1));
$('downloadRecord').addEventListener('click', downloadSelected);
$('printRecord').addEventListener('click', () => window.print());
loadData();
