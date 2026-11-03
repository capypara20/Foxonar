// Foxonar の動きの流れ（flow.html）を動かす部分。中身は flow-data.js にある。
// file:// で開いても動くように、モジュールにせず、ふつうのスクリプトとして読み込む。

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

// GitHub の見出しのアンカーと同じ作り方（記号を消し、空白を - にする）
const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
function refChip(ref) {
  const title = REF[ref] || '';
  const head = ref === '8' ? '8. ' + title : ref + ' ' + title;
  return `<a class="ref" href="${DESIGN_URL}#${encodeURIComponent(slug(head))}" target="_blank" rel="noopener">${esc(ref)} ${esc(title)}</a>`;
}

let sc = 0, k = 0, sel = null;
const tallQuery = window.matchMedia('(max-width: 640px)');

// 0 段目から今の段までを順にたどり、ログの中身と、通った箱・線を作る
function replay() {
  const s = SCENARIOS[sc];
  const det = new Map(), run = new Map(), chD = new Set(), chR = new Set();
  const doneN = new Set(), doneE = new Set();
  s.steps.forEach((st, i) => {
    if (i > k) return;
    if (i < k) {
      (st.n || []).forEach((x) => doneN.add(x));
      (st.e || []).forEach((x) => doneE.add(x));
    }
    (st.d || []).forEach((row) => { det.set(row.id, Object.assign({}, det.get(row.id), row)); if (i === k) chD.add(row.id); });
    (st.r || []).forEach((row) => { run.set(row.id, Object.assign({}, run.get(row.id), row)); if (i === k) chR.add(row.id); });
  });
  return { det, run, chD, chR, doneN, doneE };
}

const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const a in attrs) e.setAttribute(a, attrs[a]);
  if (parent) parent.appendChild(e);
  return e;
}

function shape(kind, x, y, w, h, parent) {
  if (kind === 'db') {
    const e = 8, rx = w / 2;
    el('path', { class: 'shape', d: `M${x},${y + e} A${rx},${e} 0 0 1 ${x + w},${y + e} V${y + h - e} A${rx},${e} 0 0 1 ${x},${y + h - e} Z` }, parent);
    el('path', { class: 'shape', d: `M${x},${y + e} A${rx},${e} 0 0 0 ${x + w},${y + e}`, style: 'fill:none' }, parent);
    return;
  }
  if (kind === 'dec') {
    const c = 16;
    el('polygon', { class: 'shape', points: `${x + c},${y} ${x + w - c},${y} ${x + w},${y + h / 2} ${x + w - c},${y + h} ${x + c},${y + h} ${x},${y + h / 2}` }, parent);
    return;
  }
  const rx = kind === 'end' ? h / 2 : 10;
  const r = el('rect', { class: 'shape', x, y, width: w, height: h, rx }, parent);
  if (kind === 'opt') r.setAttribute('style', 'stroke-dasharray:6 4');
}

function labelPos(pts) {
  let best = -1, bi = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
    if (len > best) { best = len; bi = i; }
  }
  const [a, b] = [pts[bi], pts[bi + 1]];
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  return a[1] === b[1] ? [mx, my - 7, 'middle'] : [mx + 7, my + 4, 'start'];
}

function drawDiagram(st, cur) {
  const L = LAYOUTS[tallQuery.matches ? 'tall' : 'wide'];
  const svg = $('#flow');
  svg.setAttribute('viewBox', `0 0 ${L.w} ${L.h}`);
  svg.textContent = '';
  const defs = el('defs', {}, svg);
  for (const s of ['idle', 'done', 'active']) {
    const m = el('marker', { id: 'm-' + s, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'mk-' + s }, m);
  }
  const curN = new Set(cur.n || []), curE = new Set(cur.e || []);
  const edgeLayer = el('g', {}, svg), labelLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg);

  for (const id in EDGES) {
    const pts = L.edges[id];
    const state = curE.has(id) ? 'active' : st.doneE.has(id) ? 'done' : 'idle';
    const d = 'M' + pts.map((p) => p.join(',')).join(' L');
    el('path', { d, class: `edge ${state}${EDGES[id].dash ? ' dash' : ''}`, 'marker-end': `url(#m-${state})` }, edgeLayer);
    if (EDGES[id].label && !L.hide.includes(id)) {
      const [x, y, anchor] = (L.lab && L.lab[id]) || labelPos(pts);
      const t = el('text', { x, y, 'text-anchor': anchor, class: 'elbl' + (state === 'active' ? ' active' : '') }, labelLayer);
      t.textContent = EDGES[id].label;
    }
  }

  for (const id in NODES) {
    const N = NODES[id];
    const [x, y, w, h] = L.nodes[id];
    const state = curN.has(id) ? 'active' : st.doneN.has(id) ? 'done' : 'idle';
    const g = el('g', { class: `node ${state}${N.shape === 'side' ? ' side' : ''}${sel === id ? ' sel' : ''}`, tabindex: 0, role: 'button', 'aria-label': N.label + 'の説明' }, nodeLayer);
    shape(N.shape, x, y, w, h, g);
    const tag = cur.tags && cur.tags[id];
    const sub = tag || N.sub;
    const cy = y + h / 2 + (N.shape === 'db' ? 4 : 0);
    const lbl = el('text', { x: x + w / 2, y: sub ? cy - 4 : cy + 5, 'text-anchor': 'middle', class: 'lbl' }, g);
    lbl.textContent = N.label;
    if (sub) {
      const s = el('text', { x: x + w / 2, y: cy + 15, 'text-anchor': 'middle', class: 'sub' }, g);
      s.textContent = sub;
    }
    const pick = () => { sel = sel === id ? null : id; render(); };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
  }
}

const RES = { '成功': 'ok', '失敗': 'ng', '無視': 'muted', '中断': 'warn', '走っている': 'accent', '待っている': 'accent' };

function drawLogs(st) {
  if (!st.det.size) {
    $('#dlog').innerHTML = '<p class="empty">まだ行はありません。</p>';
  } else {
    const rows = [...st.det.values()].map((r) => `<tr class="${st.chD.has(r.id) ? 'new' : ''}">
      <td>${r.id}</td><td>${esc(r.t)}</td><td>${esc(r.f)}</td><td>${esc(r.k)}</td><td><b>${esc(r.c)}</b></td>
      <td><code>${esc(r.p)}</code></td><td>${r.o ? '<code>' + esc(r.o) + '</code>' : ''}</td><td>${esc(r.h)}</td></tr>`).join('');
    $('#dlog').innerHTML = `<table><thead><tr><th>検知 ID</th><th>日時</th><th>監視フォルダ ID</th><th>ファイルかフォルダか</th><th>変化の種類</th><th>パス</th><th>変更前のパス</th><th>見つけ方</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  if (!st.run.size) {
    $('#rlog').innerHTML = '<p class="empty">まだ行はありません。</p>';
  } else {
    const rows = [...st.run.values()].map((r) => `<tr class="${st.chR.has(r.id) ? 'new' : ''}">
      <td>${r.id}</td><td>${esc(r.d)}</td><td>${esc(r.tr)}</td><td>${esc(r.j)}</td>
      <td><span class="res ${RES[r.r] || ''}">${esc(r.r)}</span></td><td>${esc(r.s)}</td><td>${esc(r.x)}</td><td class="long">${esc(r.e)}</td></tr>`).join('');
    $('#rlog').innerHTML = `<table><thead><tr><th>ラン ID</th><th>検知 ID</th><th>トリガー ID</th><th>ジョブ ID</th><th>結果</th><th>止まったステップ</th><th>終了コード</th><th>理由・エラーの中身</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}

function drawStep(s, cur) {
  const last = k === s.steps.length - 1;
  const nextSc = SCENARIOS[(sc + 1) % SCENARIOS.length];
  let html = `<div class="stepno">${k + 1} / ${s.steps.length}　${esc(s.name)}</div><h2>${esc(cur.t)}</h2>`;
  if (cur.ev) html += `<pre class="ev">${cur.ev.map(esc).join('\n')}</pre>`;
  if (cur.tbl) {
    html += `<div class="tablewrap"><table class="mini"><thead><tr>${cur.tbl.h.map((h) => `<th>${fmt(h)}</th>`).join('')}</tr></thead><tbody>${
      cur.tbl.r.map((r) => `<tr>${r.map((c) => `<td>${fmt(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  html += `<ul>${cur.b.map((b) => `<li>${fmt(b)}</li>`).join('')}</ul>`;
  if (cur.refs && cur.refs.length) html += `<div class="refs">${cur.refs.map(refChip).join('')}</div>`;
  html += `<div class="nav">
    <button class="btn" id="prev" ${k === 0 ? 'disabled' : ''}>◀ 前へ</button>
    <button class="btn primary" id="next">${last ? '次の例：' + esc(nextSc.name) + ' ▶' : '次へ ▶'}</button>
    <div class="dots">${s.steps.map((_, i) => `<button class="dot ${i === k ? 'cur' : i < k ? 'done' : ''}" data-i="${i}" aria-label="${i + 1} 段目"></button>`).join('')}</div>
  </div>`;
  $('#step').innerHTML = html;
  $('#prev').onclick = prev;
  $('#next').onclick = next;
  document.querySelectorAll('.dot').forEach((d) => { d.onclick = () => { k = Number(d.dataset.i); render(); }; });
}

// 設定の部品 1 つ分の札。rows は [見出し, 中身] の並び、steps はジョブのステップ（順番どおり）
function cfgCard(kind, id, name, rows, steps) {
  let html = `<div class="cfgcard ${kind}"><div class="kind">${esc(CFG_KIND[kind])}</div>`;
  html += `<div class="ttl"><code>${esc(id)}</code>${name ? '　' + esc(name) : ''}</div>`;
  if (steps) html += `<ol class="steps">${steps.map((x) => `<li>${fmt(x)}</li>`).join('')}</ol>`;
  if (rows.length) html += `<dl>${rows.map(([h, v]) => `<dt>${esc(h)}</dt><dd>${fmt(v)}</dd>`).join('')}</dl>`;
  return html + '</div>';
}
const CFG_KIND = { folder: '監視フォルダ', trigger: 'トリガー', job: 'ジョブ' };

// 例の設定を、監視フォルダ・トリガー・ジョブの札にする。書かなかった項目は、設計書の既定を出す
function drawCfg(c) {
  const cards = [];
  for (const f of c.folders || []) {
    cards.push(cfgCard('folder', f.id, '', [['パス', '`' + f.path + '`'], ['見る深さ', f.depth || '0（制限なし）'], ...(f.more || [])]));
  }
  for (const t of c.triggers || []) {
    cards.push(cfgCard('trigger', t.id, t.name, [
      ['監視フォルダ', '`' + t.folder + '`'],
      ['変化の種類', t.changes],
      ['反応する対象', t.target],
      ['反応する深さ', t.depth || '書かない（見る深さまで）'],
      ['フィルタ', t.filter || 'なし'],
      ['ジョブ', t.jobs.map((j) => '`' + j + '`').join('、')],
      ['依存', t.needs || 'なし（並行に走る）'],
    ]));
  }
  for (const j of c.jobs || []) cards.push(cfgCard('job', j.id, j.name, j.more || [], j.steps));
  return `<div class="cfg">${cards.join('')}</div>`;
}

function drawSetup(s) {
  let html = '<h3>この例の設定</h3>';
  if (s.cfg) html += drawCfg(s.cfg);
  if (s.setup && s.setup.length) html += `<ul>${s.setup.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`;
  if (s.tree) html += `<pre class="tree">${s.tree.map(esc).join('\n')}</pre>`;
  html += '<h3>この例で分かること</h3>';
  html += `<ul>${s.learn.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`;
  $('#setup').innerHTML = html;
}

function drawInfo() {
  if (!sel) { $('#info').innerHTML = '箱を押すと、その箱の説明が出ます。'; return; }
  const N = NODES[sel];
  $('#info').innerHTML = `<b>${esc(N.label)}</b>：${fmt(N.info)} ${(N.refs || []).map(refChip).join(' ')}`;
}

function drawPicker() {
  $('#picker').innerHTML = SCENARIOS.map((s, i) =>
    `<button class="pick" data-i="${i}" aria-pressed="${i === sc}"><b>${esc(s.name)}</b><span>${esc(s.short)}</span></button>`).join('');
  document.querySelectorAll('.pick').forEach((b) => { b.onclick = () => { sc = Number(b.dataset.i); k = 0; render(); }; });
}

function render() {
  const s = SCENARIOS[sc];
  const cur = s.steps[k];
  const st = replay();
  drawPicker();
  drawDiagram(st, cur);
  drawInfo();
  drawStep(s, cur);
  drawSetup(s);
  drawLogs(st);
  try { history.replaceState(null, '', `#${s.id}-${k + 1}`); } catch (e) { /* file:// で使えないブラウザもある */ }
}

function next() {
  const s = SCENARIOS[sc];
  if (k < s.steps.length - 1) k++;
  else { sc = (sc + 1) % SCENARIOS.length; k = 0; }
  render();
}
function prev() { if (k > 0) { k--; render(); } }

document.addEventListener('keydown', (ev) => {
  if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
  if (ev.key === 'ArrowRight') next();
  else if (ev.key === 'ArrowLeft') prev();
});
tallQuery.addEventListener('change', render);

// 下の「トリガーとジョブのしくみ」の節番号の札（data-refs="4.3 5.8" のように書いた所）を作る
document.querySelectorAll('[data-refs]').forEach((e) => {
  e.innerHTML = e.dataset.refs.split(' ').map(refChip).join('');
});

// URL の #download-3 のような印から、例と段を戻す
const m = location.hash.match(/^#([a-z]+)-(\d+)$/);
if (m) {
  const i = SCENARIOS.findIndex((s) => s.id === m[1]);
  if (i >= 0) { sc = i; k = Math.min(Math.max(Number(m[2]) - 1, 0), SCENARIOS[i].steps.length - 1); }
}
render();
