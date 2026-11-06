/* Clark YSA Ward – Sacrament Meeting Conducting Sheet
 * Plain JavaScript, no build step. Reads the "Schedule" tab of the Google Sheet,
 * lets the person conducting fill in what is missing, and renders a printable sheet. */
(function () {
  'use strict';

  const CFG = window.AGENDA_CONFIG || {};
  const HYMNS = window.HYMNS || {};

  // Column headers in the Google Sheet  ->  keys used in this app. Order matters only for the sheet.
  const COLUMNS = [
    ['Date', 'date'], ['Meeting Type', 'meetingType'], ['Presiding', 'presiding'], ['Conducting', 'conducting'],
    ['Chorister', 'chorister'], ['Organist / Accompanist', 'organist'],
    ['Opening Hymn #', 'openingHymnNum'], ['Opening Hymn', 'openingHymn'], ['Invocation', 'invocation'],
    ['Sacrament Hymn #', 'sacramentHymnNum'], ['Sacrament Hymn', 'sacramentHymn'],
    ['Speaker 1', 'speaker1'], ['Speaker 1 Topic', 'speaker1Topic'], ['Speaker 2', 'speaker2'], ['Speaker 2 Topic', 'speaker2Topic'],
    ['Rest Hymn #', 'restHymnNum'], ['Rest Hymn', 'restHymn'], ['Musical Number', 'musicalNumber'],
    ['Speaker 3', 'speaker3'], ['Speaker 3 Topic', 'speaker3Topic'],
    ['Closing Hymn #', 'closingHymnNum'], ['Closing Hymn', 'closingHymn'], ['Benediction', 'benediction'],
    ['Announcements', 'announcements'], ['Ward Business', 'wardBusiness'], ['Notes', 'notes'], ['Assigning Counselor', 'assigningCounselor'],
    ['Stake Business', 'stakeBusiness'], ['New Members (Records)', 'newMembers'], ['Releases', 'releases'], ['Sustainings', 'sustainings']
  ];
  const HEADER_TO_KEY = Object.fromEntries(COLUMNS);
  const KEY_TO_HEADER = Object.fromEntries(COLUMNS.map(([h, k]) => [k, h]));
  const KEYS = COLUMNS.map(c => c[1]);

  const LS_DRAFTS = 'cysa.drafts.v1';
  const LS_SCRIPT = 'cysa.appsScriptUrl';

  const state = {
    rows: new Map(),      // date -> record from the sheet / snapshot
    drafts: loadJSON(LS_DRAFTS, {}),
    source: '',           // 'script' | 'csv' | 'snapshot'
    sourceLabel: '',
    date: null,
    canSave: false
  };

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const fields = () => $$('[data-key]', $('#formView'));

  /* ------------------------------------------------------------------ data */

  function loadJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode etc. */ }
  }
  function scriptUrl() {
    let u = '';
    try { u = localStorage.getItem(LS_SCRIPT) || ''; } catch (e) { /* ignore */ }
    return (u || CFG.appsScriptUrl || '').trim();
  }

  function normalizeRecord(obj) {
    // obj may be keyed by sheet headers (script / csv) or by app keys (snapshot)
    const rec = {};
    KEYS.forEach(k => { rec[k] = ''; });
    Object.keys(obj).forEach(h => {
      const k = HEADER_TO_KEY[h] || (KEYS.includes(h) ? h : null);
      if (k) rec[k] = String(obj[h] == null ? '' : obj[h]).trim();
    });
    rec.date = toISODate(rec.date);
    return rec;
  }

  function toISODate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
    return s;
  }

  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1).filter(r => r.some(v => v.trim())).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
  }

  async function fetchWithTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 9000);
    try { return await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {})); }
    finally { clearTimeout(t); }
  }

  async function loadSchedule() {
    setBadge('Loading schedule…', 'loading');
    let records = null;
    const url = scriptUrl();
    state.canSave = false;

    if (url) {
      try {
        const r = await fetchWithTimeout(url + (url.includes('?') ? '&' : '?') + 'action=list&t=' + Date.now());
        const j = await r.json();
        if (j && j.ok && Array.isArray(j.rows)) {
          records = j.rows; state.source = 'script'; state.sourceLabel = 'Live from Google Sheet'; state.canSave = true;
        } else throw new Error(j && j.error ? j.error : 'Bad response');
      } catch (e) {
        console.warn('Apps Script load failed:', e);
        toast('Could not reach the Apps Script bridge; falling back.');
      }
    }
    if (!records && CFG.sheetId) {
      try {
        const u = `https://docs.google.com/spreadsheets/d/${CFG.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CFG.sheetTab || 'Schedule')}`;
        const r = await fetchWithTimeout(u, { mode: 'cors' }, 7000);
        const text = await r.text();
        if (r.ok && !/^\s*</.test(text)) {
          const parsed = parseCSV(text);
          // gviz silently falls back to the first tab when the named tab is missing,
          // so only accept it if it really is the Schedule layout.
          if (parsed.length && 'Date' in parsed[0] && ('Conducting' in parsed[0] || 'Presiding' in parsed[0])) {
            records = parsed; state.source = 'csv'; state.sourceLabel = 'Google Sheet (link-shared, read-only)';
          } else {
            console.warn('Public CSV reachable but has no Schedule tab; using the snapshot instead.');
            toast('That Google Sheet has no "Schedule" tab – showing the snapshot instead.');
          }
        }
      } catch (e) { /* sheet is private – expected */ }
    }
    if (!records) {
      try {
        const r = await fetchWithTimeout((CFG.snapshotUrl || 'data/schedule.json') + '?t=' + Date.now(), {}, 7000);
        const j = await r.json();
        records = j.rows || []; state.source = 'snapshot';
        state.sourceLabel = 'Snapshot' + (j.generated ? ' from ' + j.generated : '') + ' (read-only)';
      } catch (e) {
        records = []; state.source = 'none'; state.sourceLabel = 'No schedule loaded';
      }
    }

    state.rows = new Map();
    records.map(normalizeRecord).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date)).forEach(r => state.rows.set(r.date, r));
    setBadge(state.sourceLabel, state.source === 'script' ? '' : 'warn');
    $('#footerSource').textContent = 'Schedule source: ' + state.sourceLabel + '.';
    $('#saveBtn').hidden = !state.canSave;
    populateDates();
  }

  function setBadge(text, cls) {
    const b = $('#sourceBadge'); b.textContent = text; b.className = 'badge ' + (cls || '');
  }

  /* ------------------------------------------------------------------ dates */

  function fmtDate(iso, opts) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', opts || { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function nextSundayISO() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function populateDates() {
    const sel = $('#dateSelect');
    const dates = Array.from(new Set([...state.rows.keys(), ...Object.keys(state.drafts)])).sort();
    const wanted = new URLSearchParams(location.search).get('date') || state.date || nextSundayISO();
    sel.innerHTML = '';
    let pick = dates.includes(wanted) ? wanted : (dates.find(d => d >= wanted) || dates[dates.length - 1]);
    dates.forEach(d => {
      const r = state.rows.get(d) || {};
      const o = document.createElement('option');
      o.value = d;
      const extras = [];
      if (r.meetingType && r.meetingType !== 'Regular') extras.push(r.meetingType);
      else if (r.speaker1) extras.push('speakers set');
      if (state.drafts[d] && Object.keys(state.drafts[d]).length) extras.push('edited here');
      o.textContent = fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + (extras.length ? '  ·  ' + extras.join(', ') : '');
      sel.appendChild(o);
    });
    if (!dates.length) {
      const o = document.createElement('option'); o.value = nextSundayISO(); o.textContent = fmtDate(o.value); sel.appendChild(o); pick = o.value;
    }
    sel.value = pick;
    selectDate(pick);
  }

  /* ------------------------------------------------------------------ form */

  function baseRecord(date) {
    const r = Object.assign({}, state.rows.get(date) || {});
    KEYS.forEach(k => { if (r[k] == null) r[k] = ''; });
    r.date = date;
    return r;
  }
  function effectiveRecord(date) {
    const r = baseRecord(date);
    const d = state.drafts[date] || {};
    Object.keys(d).forEach(k => { r[k] = d[k]; });
    if (!r.presiding && CFG.defaults && CFG.defaults.presiding && !('presiding' in d)) r.presiding = CFG.defaults.presiding;
    if (!r.meetingType) r.meetingType = 'Regular';
    return r;
  }

  function selectDate(date) {
    state.date = date;
    const base = baseRecord(date);
    const rec = effectiveRecord(date);
    const draft = state.drafts[date] || {};
    fields().forEach(el => {
      const k = el.dataset.key;
      el.value = rec[k] || '';
      el.classList.remove('from-sheet', 'edited');
      const tag = el.closest('.field') && el.closest('.field').querySelector('.tag');
      if (tag) tag.remove();
      let label = null;
      if (k in draft && draft[k] !== base[k]) { el.classList.add('edited'); label = 'edited'; }
      else if (base[k]) { el.classList.add('from-sheet'); label = 'from-sheet'; }
      else if (k === 'presiding' && rec[k]) { label = 'default'; }
      if (label) {
        const span = el.closest('.field') && el.closest('.field').querySelector('span');
        if (span) { const t = document.createElement('i'); t.className = 'tag ' + label; t.textContent = label === 'from-sheet' ? 'from schedule' : label; span.appendChild(t); }
      }
      if (el.dataset.hymn) el.dataset.auto = '';
    });
    const counselor = base.assigningCounselor ? `Assigning counselor for this Sunday: ${base.assigningCounselor}.` : '';
    $('#counselorLine').textContent = counselor;
    $('#rowSummary').textContent = state.rows.has(date)
      ? `${fmtDate(date)} · in the schedule`
      : `${fmtDate(date)} · not in the schedule yet` + (state.canSave ? ' (saving will add a row)' : '');
    applyMeetingType();
    updateDraftStatus();
    const url = new URL(location.href); url.searchParams.set('date', date); history.replaceState(null, '', url);
  }

  function applyMeetingType() {
    const t = $('#meetingType').value;
    $('#programSection').classList.toggle('fast', t === 'Fast & Testimony');
  }

  function onFieldInput(e) {
    const el = e.target; const k = el.dataset.key; if (!k) return;
    const date = state.date; const base = baseRecord(date);
    state.drafts[date] = state.drafts[date] || {};
    const val = el.value;
    if (val === (base[k] || '') && !(k === 'presiding' && !base[k])) delete state.drafts[date][k];
    else state.drafts[date][k] = val;
    if (!Object.keys(state.drafts[date]).length) delete state.drafts[date];
    saveJSON(LS_DRAFTS, state.drafts);
    // hymn number -> title
    if (el.dataset.hymn) {
      const titleEl = $(`[data-key="${el.dataset.hymn}"]`);
      const n = parseInt(val, 10);
      if (HYMNS[n] && (!titleEl.value || titleEl.dataset.auto === '1')) {
        titleEl.value = HYMNS[n]; titleEl.dataset.auto = '1';
        titleEl.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (!val && titleEl.dataset.auto === '1') {
        titleEl.value = ''; titleEl.dataset.auto = ''; titleEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (el.getAttribute('list') === 'hymnList') {
      // "169 — Title" chosen from the list -> split into number + title
      const m = val.match(/^\s*(\d{1,4})\s*[—–-]\s*(.+)$/);
      if (m) {
        const numEl = $(`[data-hymn="${k}"]`);
        el.value = m[2].trim(); el.dataset.auto = '1';
        if (numEl) { numEl.value = m[1]; numEl.dispatchEvent(new Event('input', { bubbles: true })); }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (e.isTrusted) el.dataset.auto = '';
    }
    if (k === 'meetingType') applyMeetingType();
    // re-tag
    el.classList.remove('from-sheet', 'edited');
    const span = el.closest('.field') && el.closest('.field').querySelector('span');
    const old = span && span.querySelector('.tag'); if (old) old.remove();
    if (state.drafts[date] && k in state.drafts[date]) { el.classList.add('edited'); if (span) { const t = document.createElement('i'); t.className = 'tag edited'; t.textContent = 'edited'; span.appendChild(t); } }
    else if (base[k]) { el.classList.add('from-sheet'); if (span) { const t = document.createElement('i'); t.className = 'tag from-sheet'; t.textContent = 'from schedule'; span.appendChild(t); } }
    updateDraftStatus();
  }

  function updateDraftStatus() {
    const d = state.drafts[state.date];
    const n = d ? Object.keys(d).length : 0;
    $('#clearBtn').hidden = !n;
    $('#draftStatus').textContent = n
      ? `${n} field${n > 1 ? 's' : ''} edited on this device` + (state.canSave ? ' – not yet saved to the sheet.' : '. Saving to the sheet needs the Apps Script bridge (see ⚙).')
      : (state.rows.has(state.date) ? 'Matches the schedule.' : '');
  }

  /* ------------------------------------------------------------------ save */

  async function saveToSheet() {
    const url = scriptUrl(); if (!url) return;
    const btn = $('#saveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
    const rec = effectiveRecord(state.date);
    const fieldsOut = {};
    KEYS.filter(k => k !== 'date').forEach(k => { fieldsOut[KEY_TO_HEADER[k]] = rec[k] || ''; });
    try {
      const r = await fetchWithTimeout(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save', date: state.date, fields: fieldsOut })
      }, 15000);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Save failed');
      state.rows.set(state.date, Object.assign({}, rec));
      delete state.drafts[state.date]; saveJSON(LS_DRAFTS, state.drafts);
      toast('Saved to the Google Sheet.');
      populateDates();
    } catch (e) {
      console.error(e); toast('Save failed: ' + e.message);
    } finally { btn.disabled = false; btn.textContent = 'Save to Google Sheet'; }
  }

  /* ------------------------------------------------------------------ render */

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const val = (s, cls) => s ? `<b>${esc(s)}</b>` : `<span class="blank ${cls || ''}"></span>`;
  const joinNames = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

  function hymnHTML(num, title) {
    if (!num && !title) return `<p class="hymn"><span class="num">#<span class="blank short"></span></span> <span class="blank"></span></p>`;
    const n = num ? `#${esc(num)}` : '';
    let t = title; if (!t && HYMNS[parseInt(num, 10)]) t = HYMNS[parseInt(num, 10)];
    return `<p class="hymn"><span class="num">${n}</span> ${esc(t || '')}</p>`;
  }
  function item(title, bodyHTML, sub) {
    return `<section class="item"><h3>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h3><div class="body">${bodyHTML}</div></section>`;
  }
  function speakerHTML(name, topic) {
    return `<p><span class="name">${esc(name)}</span>${topic ? ` <span class="topic">— ${esc(topic)}</span>` : ''}</p>`;
  }

  function renderSheet(rec) {
    const ward = CFG.wardName || 'Ward';
    const church = CFG.churchName || 'The Church of Jesus Christ of Latter-day Saints';
    const isFast = rec.meetingType === 'Fast & Testimony';
    const parts = [];

    parts.push(`<header class="ph"><div><h1>${esc(ward)}</h1><h2>Sacrament Meeting Conducting Sheet</h2></div>
      <div class="pdate">${esc(fmtDate(rec.date))}${rec.meetingType && rec.meetingType !== 'Regular' ? `<small>${esc(rec.meetingType)}</small>` : ''}</div></header>`);

    parts.push(`<table class="roster">
      <tr><th>Presiding</th><td>${esc(rec.presiding) || '&nbsp;'}</td><th>Conducting</th><td>${esc(rec.conducting) || '&nbsp;'}</td></tr>
      <tr><th>Chorister</th><td>${esc(rec.chorister) || '&nbsp;'}</td><th>Organist</th><td>${esc(rec.organist) || '&nbsp;'}</td></tr>
    </table>`);

    const musicThanks = (rec.chorister || rec.organist)
      ? ` We wish to thank ${val(rec.chorister)} and ${val(rec.organist)}, serving as chorister and organist today.`
      : ` We wish to thank <span class="blank"></span> and <span class="blank"></span>, serving as chorister and organist today.`;
    parts.push(item('Welcome', `<p class="lead">Welcome to ${esc(church)}. This is the Sacrament Meeting service of the ${esc(ward)}. ${val(rec.presiding)} is presiding. My name is ${val(rec.conducting)}, and I'll be conducting today's services.${musicThanks}</p>`));

    const ann = lines(rec.announcements);
    if (ann.length) parts.push(item('Announcements', `<ul>${ann.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`));

    parts.push(item('Opening Hymn', hymnHTML(rec.openingHymnNum, rec.openingHymn)));
    parts.push(item('Invocation', `<p>${val(rec.invocation)}</p>`));

    if (rec.stakeBusiness) parts.push(item('Stake Business', `<p>${esc(rec.stakeBusiness)}</p>`));
    if (rec.wardBusiness) parts.push(item('Ward Business', `<p>${esc(rec.wardBusiness)}</p>`));

    const newM = lines(rec.newMembers);
    if (newM.length) parts.push(item('Records', `<p>We have received the following records of members who have moved into our ward. We'd like to welcome you to the ${esc(ward)}. Please stand and remain standing as your names are read:</p>
      <ul>${newM.map(n => `<li><b>${esc(n)}</b></li>`).join('')}</ul>
      <p>All those who can accept these sisters and brothers as members of the ${esc(ward)}, please signify by raising your right hand.</p>`, 'new members'));

    const rel = lines(rec.releases);
    if (rel.length) parts.push(item('Releases', `<p>The following individual${rel.length > 1 ? 's have' : ' has'} been released from ${rel.length > 1 ? 'their callings' : 'a calling'}:</p>
      <ul>${rel.map(n => `<li><b>${esc(n)}</b></li>`).join('')}</ul>
      <p>We propose that ${rel.length > 1 ? 'they' : 'he or she'} be given a vote of thanks for ${rel.length > 1 ? 'their' : 'his or her'} service. Those who wish to express their appreciation may manifest it by the uplifted hand.</p>`));

    const sus = lines(rec.sustainings);
    if (sus.length) parts.push(item('Sustainings', `<p>The following individual${sus.length > 1 ? 's have' : ' has'} accepted ${sus.length > 1 ? 'new callings' : 'a new calling'}. Please stand as your name${sus.length > 1 ? 's are' : ' is'} read:</p>
      <ul>${sus.map(n => `<li><b>${esc(n)}</b></li>`).join('')}</ul>
      <p>We propose that ${sus.length > 1 ? 'they' : 'he or she'} be sustained. Those in favor may manifest it by the uplifted hand. Those opposed, if any, may manifest it.</p>`));

    parts.push(item('Sacrament', `<p>We invite you to direct your thoughts to the Savior as we proceed to the Sacrament portion of today's services. We will be singing…</p>
      ${hymnHTML(rec.sacramentHymnNum, rec.sacramentHymn)}
      <p>Thank you for your reverence during the administration of today's Sacrament.*</p>
      <p class="fine">*Thank the congregation and/or acknowledge the Spirit during the Sacrament, if prompted to do so.</p>`));

    if (isFast) {
      parts.push(item('Testimonies', `<p>The bishopric will bear brief testimonies, after which the time is turned over to the congregation. Please keep testimonies brief so that all who wish to may participate.</p>${rec.speaker1 ? speakerHTML(rec.speaker1, rec.speaker1Topic) : ''}`, 'Fast & Testimony'));
    } else {
      if (rec.speaker1 || rec.speaker2 || rec.speaker3) {
        if (rec.speaker1) parts.push(item('Speaker', speakerHTML(rec.speaker1, rec.speaker1Topic)));
        if (rec.speaker2) parts.push(item('Speaker', speakerHTML(rec.speaker2, rec.speaker2Topic)));
      } else {
        parts.push(item('Speaker', `<p><span class="blank"></span></p>`));
        parts.push(item('Speaker', `<p><span class="blank"></span></p>`));
      }
      if (rec.restHymnNum || rec.restHymn) parts.push(item('Rest Hymn', hymnHTML(rec.restHymnNum, rec.restHymn)));
      if (rec.musicalNumber) parts.push(item('Musical Number', `<p><b>${esc(rec.musicalNumber)}</b></p>`));
      if (!rec.restHymnNum && !rec.restHymn && !rec.musicalNumber) parts.push(item('Rest Hymn', hymnHTML('', ''), 'or musical number'));
      if (rec.speaker3) parts.push(item('Speaker', speakerHTML(rec.speaker3, rec.speaker3Topic)));
    }

    parts.push(item('Closing Hymn', hymnHTML(rec.closingHymnNum, rec.closingHymn)));
    parts.push(item('Benediction', `<p>${val(rec.benediction)}</p>`));

    if (rec.notes) parts.push(`<div class="notes">${esc(rec.notes)}</div>`);
    parts.push(`<footer><span>${esc(ward)} · Sacrament Meeting</span><span>Generated ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></footer>`);
    return parts.join('\n');
  }

  function sheetAsText(rec) {
    const el = document.createElement('div'); el.innerHTML = renderSheet(rec);
    el.querySelectorAll('.blank').forEach(b => { b.textContent = '____________'; });
    const out = [];
    el.querySelectorAll('.ph, .roster, .item, .notes').forEach(node => {
      if (node.classList.contains('ph')) { out.push(node.querySelector('h1').textContent + ' — ' + node.querySelector('.pdate').textContent.trim()); out.push('='.repeat(40)); return; }
      if (node.classList.contains('roster')) { node.querySelectorAll('tr').forEach(tr => { const c = Array.from(tr.children).map(x => x.textContent.trim()); out.push(`${c[0]}: ${c[1]}    ${c[2]}: ${c[3]}`); }); out.push(''); return; }
      if (node.classList.contains('notes')) { out.push('NOTES: ' + node.textContent.trim()); return; }
      const h = node.querySelector('h3').textContent.trim().toUpperCase();
      const body = Array.from(node.querySelectorAll('.body > *')).map(p => p.tagName === 'UL' ? Array.from(p.children).map(li => '  • ' + li.textContent.trim()).join('\n') : p.textContent.replace(/\s+/g, ' ').trim()).join('\n');
      out.push(h); out.push(body); out.push('');
    });
    return out.join('\n');
  }

  function generate() {
    const rec = effectiveRecord(state.date);
    $('#agendaSheet').innerHTML = renderSheet(rec);
    $('#formView').hidden = true; $('#sheetView').hidden = false;
    document.title = `Conducting Sheet – ${rec.date}`;
    window.scrollTo(0, 0);
  }
  function backToForm() {
    $('#sheetView').hidden = true; $('#formView').hidden = false;
    document.title = 'Clark YSA Conducting Sheet';
  }

  /* ------------------------------------------------------------------ misc UI */

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function buildHymnList() {
    const dl = $('#hymnList'); const frag = document.createDocumentFragment();
    Object.keys(HYMNS).map(Number).sort((a, b) => a - b).forEach(n => {
      const o = document.createElement('option'); o.value = `${n} — ${HYMNS[n]}`; frag.appendChild(o);
    });
    dl.appendChild(frag);
  }

  function openSettings() {
    $('#appsScriptInput').value = scriptUrl();
    $('#settingsTest').textContent = ''; $('#settingsTest').className = 'small';
    $('#settingsDialog').showModal();
  }
  async function testScript() {
    const url = $('#appsScriptInput').value.trim(); const out = $('#settingsTest');
    if (!url) { out.textContent = 'Paste a URL first.'; out.className = 'small bad'; return; }
    out.textContent = 'Testing…'; out.className = 'small';
    try {
      const r = await fetchWithTimeout(url + '?action=ping', {}, 10000); const j = await r.json();
      if (j.ok) { out.textContent = `Connected. Reading tab "${j.sheet}".`; out.className = 'small ok'; }
      else throw new Error(j.error || 'unexpected response');
    } catch (e) { out.textContent = 'Could not connect: ' + e.message; out.className = 'small bad'; }
  }

  function wire() {
    buildHymnList();
    $('#wardTitle').textContent = CFG.wardName || 'Ward';
    if (CFG.sheetId) $('#sheetLink').href = `https://docs.google.com/spreadsheets/d/${CFG.sheetId}/edit`; else $('#sheetLink').hidden = true;

    $('#dateSelect').addEventListener('change', e => selectDate(e.target.value));
    $('#agendaForm').addEventListener('input', onFieldInput);
    $('#meetingType').addEventListener('input', onFieldInput);
    $('#agendaForm').addEventListener('submit', e => { e.preventDefault(); generate(); });
    $('#generateBtn').addEventListener('click', generate);
    $('#backBtn').addEventListener('click', backToForm);
    $('#printBtn').addEventListener('click', () => window.print());
    $('#copyBtn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(sheetAsText(effectiveRecord(state.date))); toast('Copied as plain text.'); }
      catch (e) { toast('Copy failed – your browser blocked clipboard access.'); }
    });
    $('#saveBtn').addEventListener('click', saveToSheet);
    $('#reloadBtn').addEventListener('click', () => loadSchedule().then(() => toast('Schedule reloaded.')));
    $('#clearBtn').addEventListener('click', () => {
      if (!confirm('Discard everything you typed for this Sunday on this device?')) return;
      delete state.drafts[state.date]; saveJSON(LS_DRAFTS, state.drafts); populateDates(); toast('Edits discarded.');
    });
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#settingsCancel').addEventListener('click', () => $('#settingsDialog').close());
    $('#testScriptBtn').addEventListener('click', testScript);
    $('#settingsDialog').querySelector('form').addEventListener('submit', () => {
      const u = $('#appsScriptInput').value.trim();
      try { if (u) localStorage.setItem(LS_SCRIPT, u); else localStorage.removeItem(LS_SCRIPT); } catch (e) { /* ignore */ }
      loadSchedule().then(() => toast(u ? 'Settings saved – schedule reloaded.' : 'Apps Script URL cleared.'));
    });
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p' && !$('#sheetView').hidden) { /* native print is fine */ }
      if (e.key === 'Escape' && !$('#sheetView').hidden && !$('#settingsDialog').open) backToForm();
    });
    loadSchedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
