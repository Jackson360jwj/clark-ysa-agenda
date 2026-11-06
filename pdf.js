/* Builds the conducting sheet as a real PDF (US Letter) with jsPDF.
 * Exposes window.buildConductingPdf(rec, cfg, hymns) -> jsPDF document. */
(function () {
  'use strict';

  const PAGE_W = 612, PAGE_H = 792;            // US Letter, points
  const M_L = 50, M_R = 50, M_T = 46, M_B = 46;
  const CONTENT_W = PAGE_W - M_L - M_R;
  const LABEL_W = 92, GUTTER = 14;
  const BODY_X = M_L + LABEL_W + GUTTER;
  const BODY_W = CONTENT_W - LABEL_W - GUTTER;
  const ACCENT = [42, 107, 153];
  const INK = [17, 17, 17];
  const GRAY = [95, 95, 95];
  const RULE = [215, 215, 215];

  function build(rec, cfg, HYMNS, scale) {
    const k = scale || 1;               // <1 shrinks body text/spacing so a full sheet fits one page
    const BODY = 11 * k, LH = 14 * k, BIG = 12.5 * k, ROW = 17 * k, FINE = 8.5 * k, FLH = 10.5 * k;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
    const ward = cfg.wardName || 'Ward';
    const church = cfg.churchName || 'The Church of Jesus Christ of Latter-day Saints';
    const isFast = rec.meetingType === 'Fast & Testimony';
    let y = M_T;
    let page = 1;

    /* ---------- text helpers ---------- */
    const font = (fam, style, size, color) => { doc.setFont(fam, style); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
    const width = (s) => doc.getTextWidth(s);

    // runs: [{t:'text', b:true}] or {blank: ptWidth}
    function layoutRich(runs, maxW, size) {
      const lines = [[]]; let x = 0;
      const push = (item, w) => { lines[lines.length - 1].push(item); x += w; };
      runs.forEach(r => {
        if (r.blank) {
          const w = Math.min(r.blank, maxW);
          if (x + w > maxW && x > 0) { lines.push([]); x = 0; }
          push({ blank: w }, w); return;
        }
        font('times', r.b ? 'bold' : 'normal', size);
        const words = String(r.t).split(/(\s+)/).filter(s => s.length);
        words.forEach(w => {
          const ww = width(w);
          if (/^\s+$/.test(w)) { if (x > 0 && x + ww <= maxW) push({ t: w, b: r.b }, ww); return; }
          if (x + ww > maxW && x > 0) { lines.push([]); x = 0; }
          push({ t: w, b: r.b }, ww);
        });
      });
      return lines.map(l => { while (l.length && l[0].t && /^\s+$/.test(l[0].t)) l.shift(); return l; });
    }
    function drawRich(runs, x, y0, maxW, size, lh) {
      const lines = layoutRich(runs, maxW, size);
      let yy = y0;
      lines.forEach(l => {
        let xx = x;
        l.forEach(it => {
          if (it.blank) { doc.setDrawColor(60); doc.setLineWidth(.6); doc.line(xx, yy + 1.5, xx + it.blank, yy + 1.5); xx += it.blank; return; }
          font('times', it.b ? 'bold' : 'normal', size); doc.text(it.t, xx, yy); xx += width(it.t);
        });
        yy += lh;
      });
      return yy;
    }
    const richHeight = (runs, maxW, size, lh) => layoutRich(runs, maxW, size).length * lh;

    /* ---------- page management ---------- */
    function footer() {
      font('helvetica', 'normal', 7.5, GRAY);
      doc.setDrawColor(...RULE); doc.setLineWidth(.5);
      doc.line(M_L, PAGE_H - M_B + 10, PAGE_W - M_R, PAGE_H - M_B + 10);
      doc.text(`${ward} · Sacrament Meeting · ${fmtDate(rec.date)}`, M_L, PAGE_H - M_B + 21);
      const gen = 'Generated ' + new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      doc.text(gen, PAGE_W - M_R, PAGE_H - M_B + 21, { align: 'right' });
    }
    function ensure(h) {
      if (y + h > PAGE_H - M_B) { footer(); doc.addPage(); page++; y = M_T; }
    }

    /* ---------- building blocks ---------- */
    // body: array of blocks {p: runs} | {ul: [runs]} | {hymn:{num,title}} | {fine: 'text'} | {speaker:{name,topic}}
    function blockHeight(b) {
      if (b.p) return richHeight(b.p, BODY_W, BODY, LH) + 2;
      if (b.ul) return b.ul.reduce((h, r) => h + richHeight(r, BODY_W - 14, BODY, LH), 0) + 2;
      if (b.hymn) return ROW;
      if (b.fine) return richHeight([{ t: b.fine }], BODY_W, FINE, FLH) + 1;
      if (b.speaker) return ROW;
      if (b.gap) return b.gap;
      return 0;
    }
    function drawBlock(b) {
      if (b.p) { y = drawRich(b.p, BODY_X, y, BODY_W, BODY, LH) + 2; return; }
      if (b.ul) {
        b.ul.forEach(r => {
          font('times', 'normal', BODY); doc.text('•', BODY_X + 2, y);
          y = drawRich(r, BODY_X + 14, y, BODY_W - 14, BODY, LH);
        }); y += 2; return;
      }
      if (b.hymn) {
        let { num, title } = b.hymn;
        if (!title && HYMNS && HYMNS[parseInt(num, 10)]) title = HYMNS[parseInt(num, 10)];
        font('times', 'bold', BIG);
        if (num || title) {
          const n = num ? `#${num}` : '';
          doc.text(n, BODY_X, y);
          font('times', 'normal', BIG); doc.text(title || '', BODY_X + Math.max(width(n) + 10, 40), y);
        } else {
          doc.text('#', BODY_X, y);
          doc.setDrawColor(60); doc.setLineWidth(.6);
          doc.line(BODY_X + 9, y + 1.5, BODY_X + 44, y + 1.5);
          doc.line(BODY_X + 54, y + 1.5, BODY_X + 300, y + 1.5);
        }
        y += ROW; return;
      }
      if (b.fine) { font('times', 'italic', FINE, GRAY); y = drawRich([{ t: b.fine }], BODY_X, y, BODY_W, FINE, FLH) + 1; doc.setTextColor(...INK); return; }
      if (b.speaker) {
        font('times', 'bold', BIG); doc.text(b.speaker.name, BODY_X, y);
        if (b.speaker.topic) {
          const nw = width(b.speaker.name) + 6;
          font('times', 'normal', BODY, [50, 50, 50]);
          const topic = doc.splitTextToSize('— ' + b.speaker.topic, BODY_W - nw);
          doc.text(topic[0], BODY_X + nw, y);
          if (topic.length > 1) { y += LH; doc.text(topic.slice(1), BODY_X + 10, y); y += (topic.length - 2) * LH; }
          doc.setTextColor(...INK);
        }
        y += ROW; return;
      }
      if (b.gap) { y += b.gap; }
    }
    function item(label, blocks, sub) {
      const h = blocks.reduce((s, b) => s + blockHeight(b), 0) + 6 * k;
      ensure(Math.min(h, 160));
      doc.setDrawColor(...RULE); doc.setLineWidth(.5);
      doc.line(M_L, y - 4, PAGE_W - M_R, y - 4);
      y += 8 * k;
      const top = y;
      font('helvetica', 'bold', 7.5, ACCENT);
      doc.setCharSpace(.6); doc.text(label.toUpperCase(), M_L, y); doc.setCharSpace(0);
      if (sub) { font('helvetica', 'normal', 7.5, GRAY); doc.text(sub, M_L, y + 10); }
      doc.setTextColor(...INK);
      y = top;
      blocks.forEach(b => { ensure(blockHeight(b)); drawBlock(b); });
      y += 2 * k;
    }
    const val = (s) => s ? { t: s, b: true } : { blank: 120 };
    const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const joinRuns = (arr) => arr.flatMap((r, i) => i ? [{ t: ', ' }, r] : [r]);

    /* ---------- header ---------- */
    font('times', 'bold', 20); doc.text(ward, M_L, y + 16);
    font('helvetica', 'bold', 8.5, GRAY); doc.setCharSpace(1); doc.text('SACRAMENT MEETING CONDUCTING SHEET', M_L, y + 30); doc.setCharSpace(0);
    font('times', 'bold', 12); doc.text(fmtDate(rec.date), PAGE_W - M_R, y + 16, { align: 'right' });
    if (rec.meetingType && rec.meetingType !== 'Regular') { font('helvetica', 'normal', 9, GRAY); doc.text(rec.meetingType, PAGE_W - M_R, y + 30, { align: 'right' }); }
    y += 38;
    doc.setDrawColor(...ACCENT); doc.setLineWidth(2); doc.line(M_L, y, PAGE_W - M_R, y);
    y += 16;

    /* ---------- roster ---------- */
    const colW = CONTENT_W / 2;
    const cell = (label, value, x, yy) => {
      font('helvetica', 'bold', 7, GRAY); doc.setCharSpace(.6); doc.text(label.toUpperCase(), x, yy); doc.setCharSpace(0);
      font('times', 'normal', 11); doc.text(value || '', x + 62, yy);
      doc.setDrawColor(190); doc.setLineWidth(.4); doc.setLineDashPattern([1, 1.5], 0);
      doc.line(x + 62, yy + 3, x + colW - 18, yy + 3); doc.setLineDashPattern([], 0);
    };
    cell('Presiding', rec.presiding, M_L, y); cell('Conducting', rec.conducting, M_L + colW, y); y += 16;
    cell('Chorister', rec.chorister, M_L, y); cell('Organist', rec.organist, M_L + colW, y); y += 20;

    /* ---------- items ---------- */
    const musicRuns = [
      { t: ` We wish to thank ` }, rec.chorister ? { t: rec.chorister, b: true } : { blank: 110 },
      { t: ' and ' }, rec.organist ? { t: rec.organist, b: true } : { blank: 110 },
      { t: ', serving as chorister and organist today.' }
    ];
    item('Welcome', [{ p: [
      { t: `Welcome to ${church}. This is the Sacrament Meeting service of the ${ward}. ` }, val(rec.presiding), { t: ' is presiding. My name is ' },
      val(rec.conducting), { t: ", and I'll be conducting today's services." }, ...musicRuns
    ] }]);

    const ann = lines(rec.announcements);
    if (ann.length) item('Announcements', [{ ul: ann.map(a => [{ t: a }]) }]);

    item('Opening Hymn', [{ hymn: { num: rec.openingHymnNum, title: rec.openingHymn } }]);
    item('Invocation', [{ p: [val(rec.invocation)] }]);

    if (rec.stakeBusiness) item('Stake Business', [{ p: [{ t: rec.stakeBusiness }] }]);
    if (rec.wardBusiness) item('Ward Business', [{ p: [{ t: rec.wardBusiness }] }]);

    const newM = lines(rec.newMembers);
    if (newM.length) item('Records', [
      { p: [{ t: `We have received the following records of members who have moved into our ward. We'd like to welcome you to the ${ward}. Please stand and remain standing as your names are read:` }] },
      { ul: newM.map(n => [{ t: n, b: true }]) },
      { p: [{ t: `All those who can accept these sisters and brothers as members of the ${ward}, please signify by raising your right hand.` }] }
    ], 'new members');

    const rel = lines(rec.releases);
    if (rel.length) item('Releases', [
      { p: [{ t: `The following individual${rel.length > 1 ? 's have' : ' has'} been released from ${rel.length > 1 ? 'their callings' : 'a calling'}:` }] },
      { ul: rel.map(n => [{ t: n, b: true }]) },
      { p: [{ t: `We propose that ${rel.length > 1 ? 'they' : 'he or she'} be given a vote of thanks for ${rel.length > 1 ? 'their' : 'his or her'} service. Those who wish to express their appreciation may manifest it by the uplifted hand.` }] }
    ]);

    const sus = lines(rec.sustainings);
    if (sus.length) item('Sustainings', [
      { p: [{ t: `The following individual${sus.length > 1 ? 's have' : ' has'} accepted ${sus.length > 1 ? 'new callings' : 'a new calling'}. Please stand as your name${sus.length > 1 ? 's are' : ' is'} read:` }] },
      { ul: sus.map(n => [{ t: n, b: true }]) },
      { p: [{ t: `We propose that ${sus.length > 1 ? 'they' : 'he or she'} be sustained. Those in favor may manifest it by the uplifted hand. Those opposed, if any, may manifest it.` }] }
    ]);

    item('Sacrament', [
      { p: [{ t: "We invite you to direct your thoughts to the Savior as we proceed to the Sacrament portion of today's services. We will be singing…" }] },
      { hymn: { num: rec.sacramentHymnNum, title: rec.sacramentHymn } },
      { p: [{ t: "Thank you for your reverence during the administration of today's Sacrament.*" }] },
      { fine: '*Thank the congregation and/or acknowledge the Spirit during the Sacrament, if prompted to do so.' }
    ]);

    if (isFast) {
      const blocks = [{ p: [{ t: 'The bishopric will bear brief testimonies, after which the time is turned over to the congregation. Please keep testimonies brief so that all who wish to may participate.' }] }];
      if (rec.speaker1) blocks.push({ speaker: { name: rec.speaker1, topic: rec.speaker1Topic } });
      item('Testimonies', blocks, 'Fast & Testimony');
    } else {
      if (rec.speaker1 || rec.speaker2 || rec.speaker3) {
        if (rec.speaker1) item('Speaker', [{ speaker: { name: rec.speaker1, topic: rec.speaker1Topic } }]);
        if (rec.speaker2) item('Speaker', [{ speaker: { name: rec.speaker2, topic: rec.speaker2Topic } }]);
      } else {
        item('Speaker', [{ p: [{ blank: 220 }] }]);
        item('Speaker', [{ p: [{ blank: 220 }] }]);
      }
      if (rec.restHymnNum || rec.restHymn) item('Rest Hymn', [{ hymn: { num: rec.restHymnNum, title: rec.restHymn } }]);
      if (rec.musicalNumber) item('Musical Number', [{ p: [{ t: rec.musicalNumber, b: true }] }]);
      if (!rec.restHymnNum && !rec.restHymn && !rec.musicalNumber) item('Rest Hymn', [{ hymn: { num: '', title: '' } }], 'or musical number');
      if (rec.speaker3) item('Speaker', [{ speaker: { name: rec.speaker3, topic: rec.speaker3Topic } }]);
    }

    item('Closing Hymn', [{ hymn: { num: rec.closingHymnNum, title: rec.closingHymn } }]);
    item('Benediction', [{ p: [val(rec.benediction)] }]);

    if (rec.notes) {
      const noteLines = doc.splitTextToSize(rec.notes, CONTENT_W - 20);
      const h = noteLines.length * 11 + 14;
      ensure(h + 10); y += 6;
      doc.setFillColor(244, 245, 247); doc.setDrawColor(205, 212, 220); doc.setLineWidth(.5);
      doc.rect(M_L, y, CONTENT_W, h, 'FD');
      doc.setFillColor(...ACCENT); doc.rect(M_L, y, 2.5, h, 'F');
      font('helvetica', 'bold', 7, GRAY); doc.setCharSpace(.6); doc.text('NOTES', M_L + 10, y + 10); doc.setCharSpace(0);
      font('helvetica', 'normal', 9, INK); doc.text(noteLines, M_L + 10, y + 21);
      y += h;
    }

    footer();
    if (page > 1) {
      for (let i = 1; i <= page; i++) {
        doc.setPage(i); font('helvetica', 'normal', 7.5, GRAY);
        doc.text(`Page ${i} of ${page}`, PAGE_W / 2, PAGE_H - M_B + 21, { align: 'center' });
      }
    }
    doc.setProperties({ title: `${ward} conducting sheet – ${rec.date}`, subject: 'Sacrament meeting conducting sheet', creator: 'Clark YSA conducting sheet' });
    return doc;
  }

  function fmtDate(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y || !m || !d) return String(iso);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  window.buildConductingPdf = build;
})();
