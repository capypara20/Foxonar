// Foxonar の Web UI の見本（webui.html）を動かす。データは webui-data.js。
// 見本なので、コアにはつながらない。押せるところは、仮のデータの上で動く。
"use strict";

/* ---------- 小さな道具 ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const toSec = (t) => {
  const [a, b, c] = t.split(":").map(Number);
  return a * 3600 + b * 60 + c;
};
const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (s) => `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
const fmtNum = (n) => Number(n).toLocaleString("ja-JP");
function fmtDur(sec) {
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m} 分 ${s} 秒` : `${m} 分`;
  return `${Math.floor(m / 60)} 時間 ${m % 60} 分`;
}
const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const baseName = (p) => String(p || "").split("\\").filter(Boolean).pop() || p;
const joinP = (a, b) => (a.endsWith("\\") ? a + b : `${a}\\${b}`);

/* ---------- 言葉と印 ---------- */

const L = {
  change: {
    create: "作成", modify: "変更", delete: "削除", rename: "名前変更", move: "移動",
    renamemove: "名前変更・移動", overflow: "溢れ", lost: "見失った", back: "また現れた",
  },
  result: { wait: "待っている", running: "走っている", ok: "成功", fail: "失敗", ignore: "無視", interrupted: "中断", todo: "まだ" },
  kind: { file: "ファイル", folder: "フォルダ" },
  level: { info: "情報", warn: "注意", error: "エラー" },
  step: { exec: "プロセス実行", copy: "コピー", move: "移動", delete: "削除" },
};
const GLYPH = { create: "+", modify: "~", delete: "−", rename: "⇄", move: "→", renamemove: "⇄", overflow: "!", lost: "?", back: "↺" };
const SPECIAL = new Set(["overflow", "lost", "back"]);
const BAD = new Set(["fail", "interrupted", "ignore"]);
const RESULTS = ["ok", "fail", "interrupted", "ignore", "running", "wait"];
const SPECIAL_NOTE = { overflow: "溢れ：ここで抜けがあった", lost: "見失った：見張りを止めた", back: "また現れた：見張り直した" };
const SPECIAL_LONG = {
  overflow: "溢れ：OS か Foxonar のバッファがいっぱいになり、OS イベントを受け取れなかった。ここで抜けがあった。落ち着いてから監視フォルダ全体を再スキャンし、見つけた変化はふつうの行で続く（5.2、7.1）。",
  lost: "見失った：監視フォルダそのものが見つからない。見張りを止めた。中のパスは削除にしない。同じパスにまた現れたら、自動で見張り直す（5.11）。",
  back: "また現れた：見張り直した。中を読み、覚えている中身を今の様子に合わせただけで、違いは変化にしていない（5.11）。",
};
const CHG_ORDER = ["create", "modify", "delete", "rename", "move"];
const WS = { rescan: "再スキャンする", remember: "覚えるだけ" };
const NM = { remember: "覚えるだけ", all: "すべて作成として扱う" };
const DETECT = { both: "ファイルとフォルダ", file: "ファイルだけ", folder: "フォルダだけ" };
const TARGET = { file: "ファイル", folder: "フォルダ", both: "両方" };
const KIND_LABEL = { folders: "監視フォルダ", triggers: "トリガー", jobs: "ジョブ" };
const KNOWN_PH = ["path", "dir", "name", "stem", "ext", "rel", "old_path", "date", "time"];
const PH_LIST = [...KNOWN_PH.map((k) => "${" + k + "}"), "${env:NAME}"];
const PH_DESC = {
  path: "対象パス", dir: "対象パスの入っているフォルダ", name: "名前", stem: "拡張子を除いた名前", ext: "拡張子（点は含めない）",
  rel: "監視フォルダからの相対パス", old_path: "変更前のパス（名前変更・移動のときだけ）", date: "変化を検知した日", time: "変化を検知した時刻",
};
const RUN_PH = /\$\{(path|dir|name|stem|ext|rel|old_path|date|time)\}/;
const SAMPLE = { inbox: "photos\\cat.jpg", scans: "scan_01.pdf", dl: "setup.zip" };
const DEFAULT_TESTS = {
  photos: "cat.jpg\nCAT.JPG\nthumb_cat.png\nphotos\\dog.jpg",
  "scan-pdf": "scan_01.pdf\nscan_1.pdf\nSCAN_02.PDF\nscan_01.pdf.tmp",
  "zip-done": "setup.zip\nphotos.7z\nsetup.zip.crdownload\nreadme.txt",
};

const ICON = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
  radar: '<path d="M4.5 15a8 8 0 1 1 15 0"/><path d="M8.2 15a4 4 0 1 1 7.6 0"/><circle cx="12" cy="15" r="1.4"/><path d="M12 15l4.5-6"/>',
  lines: '<path d="M5 6.5h14M5 10.5h14M5 14.5h10M5 18.5h7"/>',
  play: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M10 9.2v5.6l4.6-2.8z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.4"/>',
  power: '<path d="M12 3.5v8"/><path d="M7.2 6.6a7 7 0 1 0 9.6 0"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  file: '<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.3"/>',
  flow: '<circle cx="6" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><path d="M10 6h10M10 12h7M10 18h9"/>',
  tree: '<path d="M5 4v14a2 2 0 0 0 2 2h3"/><path d="M5 9h5"/><rect x="11" y="6.5" width="9" height="5" rx="1.2"/><rect x="11" y="15" width="9" height="5" rx="1.2"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  window: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17"/>',
};
const icon = (name) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

/* ---------- 状態 ---------- */

const T0 = Date.now();
const nowSec = () => toSec(MOCK.now) + Math.floor((Date.now() - T0) / 1000);

const S = {
  scene: "normal",
  mode: "desktop", // コアの動かし方：desktop（ログイン時に起動）・service
  page: "home",
  setTab: "map",
  sel: { folders: 0, triggers: 0, jobs: 0 },
  modal: null, // { type: "stop" | "diff" | "conflict", tab }
  notes: false,
  conflict: false,
  theme: null,
  many: false, // 設定の数を「多い」にして、数十個のときを見る
  dl: { view: "flow", sel: null, range: null, q: "", folder: "", onlyBad: false, open: new Set(), more: {}, cwd: "", crumbAll: false }, // 検知ログ
  rl: { sel: null, range: null, q: "", result: "", trigger: "", job: "", open: new Set(), more: {} }, // ランログ
  cmap: { view: "map", q: "" }, // 設定のつながり（図・表）
  lq: { folders: "", triggers: "", jobs: "" }, // 設定の一覧を探す
  lF: { levels: ["info", "warn", "error"], q: "", follow: true },
  tests: {},
  examples: {},
  pat: {},
  picker: null, // { idx, cur }
  lastPh: null,
  hl: null,
  ver: 0,
};

function resetScene(scene) {
  const base = MOCK.build(scene === "trouble" ? "trouble" : "normal");
  Object.assign(S, {
    scene,
    page: "home",
    modal: null,
    base,
    cfg: cfgBase(),
    cfgOrig: cfgBase(),
    loadedAt: "10:42:13",
    runs: clone(base.runs),
    dismissed: new Set(),
    extraDet: [],
    extraLog: [],
    arriving: [],
    arrivedIdx: 0,
    nextDet: base.nextDet,
    lastArrive: Date.now(),
    stopping: null,
    loginError: false,
    picker: null,
  });
  Object.assign(S.dl, { sel: null, range: null, q: "", folder: "", onlyBad: false, open: new Set(), more: {}, cwd: "", crumbAll: false });
  Object.assign(S.rl, { sel: null, range: null, q: "", result: "", trigger: "", job: "", open: new Set(), more: {} });
  S.ver++;
  render();
  window.scrollTo(0, 0);
}

// 設定。「設定の数：多い」のときは、数十個になるように足す
function cfgBase() {
  const c = clone(MOCK.config);
  if (S.many) {
    const m = MOCK.manyConfig();
    for (const k of ["folders", "triggers", "jobs"]) c[k].push(...m[k]);
  }
  return c;
}

// 場面ごとのデータをまとめる
function data() {
  const B = S.base;
  return {
    B,
    dets: S.extraDet.length ? [...B.dets, ...S.extraDet] : B.dets,
    runs: S.runs,
    pending: B.pending,
    log: [...B.appLog, ...S.extraLog].sort((a, b) => toSec(a.time) - toSec(b.time)),
    cfgErr: B.configError,
    problems: B.problems.filter((p) => !S.dismissed.has(p.key)),
    folderState: B.folderState,
  };
}

// 検知 ID からラン、などの引き当て。データが変わったとき（S.ver）だけ作り直す
let IDX = null;
let IDXV = -1;
function idx() {
  if (IDX && IDXV === S.ver) return IDX;
  const D = data();
  const runsByDet = new Map();
  for (const r of D.runs) {
    if (!runsByDet.has(r.det)) runsByDet.set(r.det, []);
    runsByDet.get(r.det).push(r);
  }
  const groups = groupFlow(D.dets);
  const burstOfDet = new Map();
  for (const g of groups) if (g.type === "burst") for (const d of g.g.dets) burstOfDet.set(d.id, g.key);
  IDX = {
    runsByDet,
    burstOfDet,
    detById: new Map(D.dets.map((d) => [d.id, d])),
    runById: new Map(D.runs.map((r) => [r.id, r])),
    pendByDet: new Map(D.pending.map((p) => [p.det, p])),
    groups,
  };
  IDXV = S.ver;
  return IDX;
}
const detRuns = (id) => idx().runsByDet.get(id) || [];
const detPath = (id) => idx().detById.get(id)?.path || "—";

// 名前を引く。ログの見た目は、動いている設定（cfgOrig）から。フォームは、直している設定（cfg）から
const fName = (id) => S.cfgOrig.folders.find((f) => f.id === id)?.name || id;
const fPath = (id) => S.cfgOrig.folders.find((f) => f.id === id)?.path || "";
const tName = (id) => S.cfgOrig.triggers.find((t) => t.id === id)?.name || id;
const jName = (id) => S.cfg.jobs.find((j) => j.id === id)?.name || id;
const fNameCfg = (id) => S.cfg.folders.find((f) => f.id === id)?.name || id;

// 監視フォルダからの場所。名前・途中のフォルダ・一番上のフォルダ
function rel(d) {
  const root = fPath(d.folder).replace(/\\+$/, "");
  const r = d.path.toLowerCase().startsWith(root.toLowerCase() + "\\") ? d.path.slice(root.length + 1) : d.path;
  const parts = r.split("\\").filter(Boolean);
  const name = parts[parts.length - 1] || d.path;
  return { root, parts, name, dirs: parts.slice(0, -1), top: parts.length > 1 || d.kind === "folder" ? parts[0] || "" : "" };
}
const where = (d) => [fName(d.folder), ...rel(d).dirs].join(" › ");

/* ---------- 部品 ---------- */

const resBadge = (k) => `<span class="badge r-${k}"><i class="d r-${k}"></i>${L.result[k] || k}</span>`;
const chgBadge = (c) => `<span class="badge c-${c}"><span class="g">${GLYPH[c]}</span>${L.change[c]}</span>`;
const kindIcon = (k) => `<span class="ki" title="${L.kind[k] || ""}">${icon(k === "folder" ? "folder" : "file")}</span>`;
const tableWrap = (html) => `<div class="tw">${html}</div>`;
const liveTag = () => `<span class="live"><span class="pulse"></span>自動で新しくする</span>`;

function countRuns(rs) {
  const c = { total: rs.length };
  RESULTS.forEach((k) => (c[k] = 0));
  rs.forEach((r) => c[r.result]++);
  return c;
}
function resultBar(c, cls = "") {
  if (!c.total) return "";
  return `<div class="rbar ${cls}" role="img" aria-label="${RESULTS.filter((k) => c[k]).map((k) => `${L.result[k]} ${c[k]}`).join("、")}">${RESULTS.filter((k) => c[k])
    .map((k) => `<span class="rs r-${k}" style="flex:${c[k]}"></span>`)
    .join("")}</div>`;
}
function resultCounts(c) {
  return `<span class="rcn">ラン ${fmtNum(c.total)}</span>${RESULTS.filter((k) => c[k])
    .map((k) => `<span class="rcn"><i class="d r-${k}"></i>${L.result[k]} ${fmtNum(c[k])}</span>`)
    .join("")}`;
}

function notesView(key) {
  if (!S.notes) return "";
  const items = [...(MOCK.notes[key] || []), ...MOCK.notes.common];
  const cls = { 決まり: "k-rule", 案: "k-idea", 宿題: "k-todo" };
  return `<section class="notes" aria-label="この画面の決まりと案">
    <header><b>この画面の決まりと案</b><span>決まり＝設計書にある　案＝見本で付けたもの　宿題＝まだ決めていない</span></header>
    <ul>${items.map((n) => `<li><span class="nk ${cls[n.k]}">${n.k}</span><span>${esc(n.t)}</span>${n.ref ? `<span class="ref">${esc(n.ref)}</span>` : ""}</li>`).join("")}</ul>
  </section>`;
}

function head(title, sub, actions = "") {
  return `<header class="phead"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>${actions ? `<div class="pact">${actions}</div>` : ""}</header>${notesView(S.page)}`;
}

function sec(title, body, { extra = "", id = "", desc = "" } = {}) {
  return `<section class="sec"${id ? ` id="${id}"` : ""}><div class="sech"><h2>${title}</h2>${extra}</div>${desc ? `<p class="secd">${desc}</p>` : ""}${body}</section>`;
}

// ランの短い一覧。押すと、ランログでそのランを開く
function runList(D, runs) {
  return `<ul class="rlist">${runs
    .map((r) => `<li data-sel="run:${r.id}" tabindex="0">${resBadge(r.result)}<span class="rl-main"><b>ラン ${r.id}</b> ${esc(r.jobName)} <span class="muted small">${esc(r.triggerName)}</span></span><span class="muted small rl-why">${esc(r.reason || r.waitFor || "")}</span><time>${r.start || ""}</time></li>`)
    .join("")}</ul>`;
}

function jobCell(r) {
  return `<b>${esc(r.jobName)}</b> <code class="id">${esc(r.job)}</code><div class="small muted">${esc(r.triggerName)}</div>`;
}

// 成功しなかったランを、ジョブ・結果・理由でまとめる（ラン ID の違いは同じ理由とみなす）
function badGroups(rs) {
  const m = new Map();
  for (const r of rs) {
    if (!BAD.has(r.result)) continue;
    const reason = (r.reason || "").replace(/ラン \d+/g, "ラン …");
    const k = `${r.job}|${r.result}|${reason}`;
    if (!m.has(k)) m.set(k, { job: r.jobName, result: r.result, reason, runs: [] });
    m.get(k).runs.push(r);
  }
  // 失敗 → 中断 → 無視 の順。同じ結果の中では、多いものを上に
  const rank = { fail: 0, interrupted: 1, ignore: 2 };
  return [...m.values()].sort((a, b) => rank[a.result] - rank[b.result] || b.runs.length - a.runs.length);
}
function badGroupsView(gs, max = 12) {
  if (!gs.length) return `<p class="empty">成功しなかったランはありません</p>`;
  return `<ul class="bglist">${gs
    .map(
      (g) => `<li><div class="bgh">${resBadge(g.result)}<b>${esc(g.job)}</b><span class="bgn">× ${fmtNum(g.runs.length)}</span></div>
      ${g.reason ? `<div class="small">${esc(g.reason)}</div>` : ""}
      <div class="bgnames">${g.runs
        .slice(-max)
        .reverse()
        .map((r) => `<button class="chip small" data-sel="run:${r.id}" title="ラン ${r.id}・${r.start || ""}">${esc(baseName(detPath(r.det)))}</button>`)
        .join("")}${g.runs.length > max ? `<span class="small muted">ほか ${fmtNum(g.runs.length - max)}</span>` : ""}</div></li>`
    )
    .join("")}</ul>`;
}

/* ---------- 全体 ---------- */

// 見本の操作の帯の高さ。横のメニューや、くっつく帯の位置に使う
// 狭い画面では帯を固定しない（CSS）ので、0 にする
function setMockH() {
  const bar = $("#mockbar");
  if (bar) document.documentElement.style.setProperty("--mockh", `${getComputedStyle(bar).position === "sticky" ? bar.offsetHeight : 0}px`);
}

function render() {
  syncMockbar();
  setMockH();
  const app = $("#app");
  if (S.scene === "login") app.innerHTML = loginView();
  else if (S.stopping) app.innerHTML = stopView();
  else app.innerHTML = `<div class="shell">${sideView()}<main class="main" id="main">${pageView()}</main></div>`;
  renderModal();
  tick();
  if (S.scene !== "login" && !S.stopping && S.page === "settings" && S.setTab === "map") requestAnimationFrame(drawMap);
  if (S.page === "applog" && S.lF.follow) {
    const b = $("#logbox");
    if (b) b.scrollTop = b.scrollHeight;
  }
}

function syncMockbar() {
  $$("[data-scene]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === S.scene)));
  $$("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === S.mode)));
  $$("[data-many]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.many === "1") === S.many)));
  const nb = $("#notesBtn");
  if (nb) {
    nb.setAttribute("aria-pressed", String(S.notes));
    nb.textContent = S.notes ? "説明を隠す" : "説明を出す";
  }
  const tb = $("#themeBtn");
  if (tb) tb.textContent = isDark() ? "ライトにする" : "ダークにする";
  const cc = $("#conflictChk");
  if (cc) cc.checked = S.conflict;
}

function isDark() {
  return S.theme ? S.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

function sideView() {
  const D = data();
  const cur = D.problems.filter((p) => p.level !== "past");
  const active = D.runs.filter((r) => r.result === "running" || r.result === "wait").length;
  const items = [
    ["home", "今の様子", "home", cur.length ? `<span class="nb ${cur.some((p) => p.level === "error") ? "err" : "warn"}">${cur.length}</span>` : ""],
    ["detect", "検知ログ", "radar", S.arriving.length ? `<span class="nb" title="新しい変化">${S.arriving.length}</span>` : ""],
    ["runs", "ランログ", "play", active ? `<span class="nb soft" title="走っている・待っているラン">${active}</span>` : ""],
    ["applog", "アプリログ", "lines", ""],
    ["settings", "設定", "sliders", D.cfgErr ? `<span class="nb err">!</span>` : ""],
  ];
  return `<aside class="side">
    <div class="brand"><img src="../../assets/icon.png" alt="" width="34" height="34"><div><b>Foxonar</b><span class="mono">${esc(MOCK.webAddress.replace("http://", ""))}</span></div></div>
    <nav class="nav" aria-label="画面">${items
      .map(([k, l, ic, b]) => `<button class="navi" aria-current="${S.page === k ? "page" : "false"}" data-act="page" data-v="${k}">${icon(ic)}<span>${l}</span>${b}</button>`)
      .join("")}</nav>
    <div class="sfoot">
      <div class="core"><span class="sdot s-watching"></span><div><b>コアは動いている</b><span class="small muted"><span data-uptime></span>（${MOCK.coreStartedAt} から・${S.mode === "desktop" ? "ログイン時に起動" : "サービス"}）</span></div></div>
      <div class="cfgs${D.cfgErr ? " bad" : ""}">${D.cfgErr ? `${icon("alert")}<span>設定の読み込みに失敗（前の設定で動いている）</span>` : `${icon("check")}<span>設定：${S.loadedAt} に読み込んだ</span>`}</div>
      <button class="btn ghost danger full" data-act="stop">${icon("power")}コアを止める</button>
    </div>
  </aside>`;
}

function pageView() {
  const D = data();
  const cur = D.problems.filter((p) => p.level !== "past");
  const bar =
    S.page !== "home" && cur.length
      ? `<div class="pbar ${cur.some((p) => p.level === "error") ? "err" : "warn"}">${icon("alert")}<span>困りごとが ${cur.length} つあります</span><button class="link" data-act="page" data-v="home">今の様子で見る</button></div>`
      : "";
  const view = { home: homeView, detect: detectView, runs: runsView, applog: applogView, settings: settingsView }[S.page];
  return bar + view(D);
}

/* ---------- 今の様子 ---------- */

function homeView(D) {
  const cur = D.problems.filter((p) => p.level !== "past");
  const past = D.problems.filter((p) => p.level === "past");
  const running = D.runs.filter((r) => r.result === "running");
  const waiting = D.runs.filter((r) => r.result === "wait");
  const done = D.runs.filter((r) => ["ok", "fail", "interrupted", "ignore"].includes(r.result));
  const c = countRuns(done);
  const changes = D.dets.filter((d) => !SPECIAL.has(d.change));
  const max = S.cfgOrig.global.maxConcurrency || 1;
  const tiles = `<div class="tiles">
    <div class="tile"><span class="tl">今日検知した変化</span><b class="tv">${fmtNum(changes.length)}</b><span class="ts">監視フォルダ ${S.cfgOrig.folders.length} つ</span></div>
    <div class="tile"><span class="tl">今日終わったラン</span><b class="tv">${fmtNum(done.length)}</b>${resultBar(c)}<span class="ts tsr">${["ok", "fail", "interrupted", "ignore"].map((k) => `<span><i class="d r-${k}"></i>${L.result[k]} ${fmtNum(c[k])}</span>`).join("")}</span></div>
    <div class="tile"><span class="tl">走っているラン</span><b class="tv">${running.length}<small> / 全体の上限 ${max}</small></b><span class="meter"><span style="width:${Math.min(100, (running.length / max) * 100)}%"></span></span></div>
    <div class="tile"><span class="tl">待っているラン</span><b class="tv">${waiting.length}</b><span class="ts">待ち表の行 ${D.pending.length}</span></div>
  </div>`;
  return (
    head("今の様子", `${MOCK.today}（${MOCK.weekday}）<span data-clock></span> 時点`, liveTag()) +
    problemsView(cur, past) +
    tiles +
    sec("監視フォルダ", folderCards(D)) +
    sec("走っている・待っているラン", nowRunsView(D, running, waiting), { extra: `<button class="link" data-act="page" data-v="runs">ランログで見る</button>` }) +
    `<div class="cols2">` +
    sec("成功しなかったラン（理由ごとにまとめて）", badGroupsView(badGroups(D.runs), 8), { desc: "名前を押すと、ランログでそのランを開く" }) +
    sec("待ち表", pendingView(D), { id: "pending", desc: "トリガーに合ったパスが、発火の前に、書き込みの終わりと、同じパスの発火の終わりを待つ所（5.9）" }) +
    `</div>`
  );
}

function problemsView(cur, past) {
  if (!cur.length && !past.length) return `<div class="okbar">${icon("check")}困りごとはありません</div>`;
  const linkBtn = (l) =>
    l.sel
      ? `<button class="btn small" data-sel="${l.sel}">${esc(l.label)}</button>`
      : `<button class="btn small" data-act="page" data-v="${l.page}"${l.anchor ? ` data-anchor="${l.anchor}"` : ""}>${esc(l.label)}</button>`;
  return `<section class="problems" aria-label="困りごと">${[...cur, ...past]
    .map(
      (p) => `<div class="prob p-${p.level}">
      <span class="pic">${icon(p.level === "past" ? "check" : "alert")}</span>
      <div class="pbody"><div class="pt"><b>${esc(p.title)}</b><span class="ptime">${p.time}・${p.level === "past" ? "済んだこと" : "続いている"}</span></div><p>${esc(p.body)}</p></div>
      <div class="pbtn">${p.link ? linkBtn(p.link) : ""}${p.level === "past" ? `<button class="btn small ghost" data-act="dismiss" data-v="${p.key}">見た</button>` : ""}</div>
    </div>`
    )
    .join("")}</section>`;
}

function folderCards(D) {
  return `<div class="fgrid">${S.cfgOrig.folders
    .map((f) => {
      const st = D.folderState[f.id]?.status || "watching";
      const fd = D.dets.filter((d) => d.folder === f.id && !SPECIAL.has(d.change));
      const last = fd.length ? fd[fd.length - 1].time : "—";
      const trig = S.cfgOrig.triggers.filter((t) => t.folder === f.id);
      const bs = binsOf(fd, (d) => d.time, (d) => detRuns(d.id).some((r) => BAD.has(r.result)));
      const max = Math.max(1, ...bs.map((b) => b.c));
      const tags = [`止まっている間：${WS[f.whileStopped]}`, `見る深さ：${f.depth ?? "制限なし"}`];
      return `<article class="fcard s-${st}">
      <header><span class="sdot s-${st}"></span><div class="fn"><b>${esc(f.name || f.id)}</b><code class="id">${esc(f.id)}</code></div><span class="stxt">${st === "lost" ? `見失った（${D.folderState[f.id].since} から）` : "見張っている"}</span></header>
      <div class="fpath mono">${esc(f.path)}</div>
      <div class="spark" title="10 分ごとの検知の数（09:00〜今）">${bs.map((b) => `<i style="height:${barH(b.c, max)}%"${b.bad ? ' class="bad"' : ""} title="${fmtTime(b.from).slice(0, 5)}〜：${b.c}"></i>`).join("")}</div>
      <ul class="tags">${tags.map((t) => `<li>${esc(t)}</li>`).join("")}${MOCK.oldApi.includes(f.id) ? `<li class="t-warn" title="新しい版の命令が使えない場所なので、古い版に切り替えた（5.12）">移動を見分けられない</li>` : ""}</ul>
      <dl class="mini"><div><dt>今日の検知</dt><dd>${fmtNum(fd.length)}</dd></div><div><dt>最後の変化</dt><dd>${last}</dd></div><div><dt>トリガー</dt><dd>${trig.length ? trig.map((t) => esc(t.name || t.id)).join("・") : "なし（検知ログだけ）"}</dd></div></dl>
    </article>`;
    })
    .join("")}</div>`;
}

function nowRunsView(D, running, waiting) {
  const rows = [...running, ...waiting];
  if (!rows.length) return `<p class="empty">走っているランも、待っているランもありません</p>`;
  return tableWrap(`<table class="tbl tbl-click"><thead><tr><th>ラン</th><th>ジョブ</th><th>対象パス</th><th>様子</th></tr></thead><tbody>${rows
    .map(
      (r) => `<tr data-sel="run:${r.id}" tabindex="0"><td class="num">${r.id}</td><td>${jobCell(r)}</td><td class="mono path">${esc(detPath(r.det))}</td>
      <td>${resBadge(r.result)} <span class="muted small">${r.result === "running" ? `${esc(r.stepNow)}・<span data-since="${r.start}"></span>` : esc(r.waitFor)}</span></td></tr>`
    )
    .join("")}</tbody></table>`);
}

function pendingView(D) {
  if (!D.pending.length) return `<p class="empty">待ち表は空です</p>`;
  return tableWrap(`<table class="tbl tbl-click"><thead><tr><th>行</th><th>パス</th><th>待っているもの</th><th>いつから</th></tr></thead><tbody>${D.pending
    .map(
      (p) => `<tr${p.long ? ' class="row-warn"' : ""} data-sel="det:${p.det}" tabindex="0"><td class="num">${p.no}</td>
      <td><span class="mono">${esc(p.path)}</span><div class="small muted">${esc(fName(p.folder))}・検知 ${p.det}・${p.triggers.map((t) => esc(tName(t))).join("・")}</div></td>
      <td>${esc(p.waitFor)}${p.long ? `<div><span class="tag t-warn">${MOCK.settleWarnMin} 分を過ぎた</span></div>` : ""}</td>
      <td class="num">${p.since}<div class="small muted"><span data-since="${p.since}"></span></div></td></tr>`
    )
    .join("")}</tbody></table>`);
}

/* ---------- 検知ログとランログの共通の部品 ---------- */

// 同じ監視フォルダの、同じ一番上のフォルダに、30 秒以内に続けて来た同じ種類の変化をまとめる。5 個以上を「かたまり」にする
function groupFlow(dets) {
  const groups = [];
  let cur = null;
  for (const d of dets) {
    if (SPECIAL.has(d.change)) {
      cur = null;
      groups.push({ dets: [d] });
      continue;
    }
    const r = rel(d);
    const key = `${d.folder}|${r.top}|${d.change}`;
    const t = toSec(d.time);
    if (cur && r.top && cur.key === key && t - cur.last <= 30) {
      cur.dets.push(d);
      cur.last = t;
    } else {
      cur = { key, dets: [d], last: t, top: r.top, folder: d.folder, change: d.change };
      groups.push(cur);
    }
  }
  const items = [];
  for (const g of groups) {
    if (g.top && g.dets.length >= 5) items.push({ type: "burst", key: `b${g.dets[0].id}`, g });
    else for (const d of g.dets) items.push({ type: "det", d });
  }
  return items;
}
const findBurst = (key) => idx().groups.find((x) => x.type === "burst" && x.key === key);
const inRange = (t, r) => t >= r[0] && t < r[1];

// 監視フォルダからの場所。深いときは「受信箱 › archive › … › raw › day1」と途中を縮める
function whereShort(d) {
  const parts = [fName(d.folder), ...rel(d).dirs];
  return (parts.length > 4 ? [parts[0], parts[1], "…", ...parts.slice(-2)] : parts).join(" › ");
}

function isSel(ns, kind, v) {
  const s = S[ns].sel;
  if (!s || s.kind !== kind) return "";
  return (s.id ?? s.key) === v ? " sel" : "";
}
function selKey(ns) {
  const s = S[ns].sel;
  if (!s) return "";
  const prefix = ns === "dl" ? { det: "det", burst: "dburst", dir: "dir" } : { run: "run", burst: "rburst" };
  return `${prefix[s.kind]}:${s.id ?? s.key}`;
}

const vseg = (views, cur, actName) =>
  `<div class="vseg" role="tablist" aria-label="見方">${views.map(([k, l, ic]) => `<button role="tab" aria-selected="${cur === k}" data-act="${actName}" data-v="${k}">${icon(ic)}${l}</button>`).join("")}</div>`;
const searchBox = (f, val, ph) => `<label class="search">${icon("search")}<input type="search" placeholder="${esc(ph)}" value="${esc(val)}" data-f="${f}" aria-label="${esc(ph)}"></label>`;
const folderSelect = (f, val) =>
  `<select data-f="${f}" aria-label="監視フォルダ"><option value="">すべての監視フォルダ</option>${S.cfgOrig.folders.map((x) => `<option value="${esc(x.id)}"${val === x.id ? " selected" : ""}>${esc(x.name || x.id)}（${esc(x.id)}）</option>`).join("")}</select>`;
const splitView = (ns, list, detail) =>
  `<div class="split${S[ns].sel ? " has-sel" : ""}"><div class="elist" id="elist">${list}</div><aside class="detail" id="detail" aria-label="詳しく">${detail}</aside></div>`;
const backBtn = (ns) => `<button class="btn small ghost backbtn" data-act="back" data-v="${ns}">${icon("back")}一覧へ戻る</button>`;
const emptyDetail = (what) => `<div class="dempty">${icon("info")}<p>左の一覧で、${what}を選ぶと、ここに詳しく出ます。</p></div>`;

// 10 分ごとの数。高さは数の平方根（少ない時間も見えるように）
function binsOf(items, timeOf, badOf) {
  const start = toSec("09:00:00");
  const step = 600;
  const n = Math.max(1, Math.ceil((nowSec() - start) / step));
  const out = Array.from({ length: n }, (_, i) => ({ from: start + i * step, to: start + (i + 1) * step, c: 0, bad: 0 }));
  for (const x of items) {
    const t = timeOf(x);
    if (!t) continue;
    const b = out[Math.floor((toSec(t) - start) / step)];
    if (!b) continue;
    b.c++;
    if (badOf(x)) b.bad++;
  }
  return out;
}
const barH = (c, max) => (c ? Math.max(10, Math.round(Math.sqrt(c / max) * 100)) : 0);

function histView(bs, ns, unit, badLabel) {
  const max = Math.max(1, ...bs.map((b) => b.c));
  const r = S[ns].range;
  const on = (b) => r && b.from < r[1] && b.to > r[0];
  const cols = `grid-template-columns:repeat(${bs.length},minmax(0,1fr))`;
  const line = r
    ? `<span><b>${fmtTime(r[0]).slice(0, 5)}〜${fmtTime(Math.min(r[1], nowSec())).slice(0, 5)}</b> の${unit}だけを出している</span><button class="link small" data-act="range" data-v="${ns}|">すべての時間に戻す</button>`
    : `<span class="muted">棒を押すと、その 10 分だけに絞る。赤い印は、${badLabel}がある時間</span>`;
  return `<div class="hist" style="${cols}" role="group" aria-label="10 分ごとの${unit}の数">${bs
    .map(
      (b) => `<button class="hb${on(b) ? " on" : r ? " dim" : ""}" data-act="range" data-v="${ns}|${b.from}" title="${fmtTime(b.from).slice(0, 5)}〜${fmtTime(b.to).slice(0, 5)}：${unit} ${fmtNum(b.c)}${b.bad ? `・${badLabel} ${b.bad}` : ""}"><span class="hbar" style="height:${barH(b.c, max)}%"></span>${b.bad ? '<i class="hbad"></i>' : ""}</button>`
    )
    .join("")}</div>
  <div class="hax" style="${cols}">${bs.map((b) => `<span>${b.from % 3600 === 0 ? fmtTime(b.from).slice(0, 5) : ""}</span>`).join("")}</div>
  <div class="hline">${line}</div>`;
}

// ランの結果を、色の点で小さく出す
function runSum(rs) {
  const bad = rs.filter((r) => BAD.has(r.result)).length;
  return `<span class="rsum" title="${esc(rs.map((r) => `ラン ${r.id} ${r.jobName}：${L.result[r.result]}`).join(" / "))}"><span class="dots">${rs.slice(0, 12).map((r) => `<i class="d r-${r.result}"></i>`).join("")}</span><span class="small muted">ラン ${rs.length}</span>${bad ? `<span class="small bad">成功しなかった ${bad}</span>` : ""}</span>`;
}

/* ---------- 検知ログ ---------- */

function dlDets(D) {
  const f = S.dl;
  const q = f.q.trim().toLowerCase();
  return D.dets.filter((d) => {
    if (f.range && !inRange(toSec(d.time), f.range)) return false;
    if (f.folder && d.folder !== f.folder) return false;
    if (q && !d.path.toLowerCase().includes(q) && !(d.old || "").toLowerCase().includes(q)) return false;
    if (f.onlyBad) return !SPECIAL.has(d.change) && detRuns(d.id).some((r) => BAD.has(r.result));
    return true;
  });
}
const dlList = (D) => (S.dl.view === "flow" ? flowView(D, dlDets(D)) : folderView(dlDets(D)));

function detectView(D) {
  const views = [
    ["flow", "流れ", "flow"],
    ["folder", "フォルダごと", "tree"],
  ];
  const bs = binsOf(D.dets.filter((d) => !SPECIAL.has(d.change)), (d) => d.time, (d) => detRuns(d.id).some((r) => BAD.has(r.result)));
  return (
    head("検知ログ", "検知した変化 1 件ごとの記録。トリガーに合わなかった変化も残る", liveTag()) +
    `<div class="evtop">${histView(bs, "dl", "変化", "成功しなかったランのある変化")}</div>
    <div class="toolbar">${vseg(views, S.dl.view, "dlview")}${searchBox("dl.q", S.dl.q, "パスで探す")}${folderSelect("dl.folder", S.dl.folder)}
      <label class="tog"><input type="checkbox" data-f="dl.onlyBad"${S.dl.onlyBad ? " checked" : ""}><span class="sw"></span>成功しなかったランのある変化だけ</label></div>
    <div id="newpill">${newPill()}</div>
    ${splitView("dl", dlList(D), dlDetail(D))}`
  );
}

const newPill = () => (S.arriving.length ? `<button class="newrows" data-act="shownew">${icon("up")}新しい変化が ${S.arriving.length} 件あります（押すと出す）</button>` : "");

// 流れ：検知した変化を、新しい順に並べる。かたまりは 1 つに畳む
function flowView(D, dets) {
  const pass = new Set(dets.map((d) => d.id));
  const items = [];
  for (const it of idx().groups) {
    if (it.type === "det") {
      if (pass.has(it.d.id)) items.push(it);
    } else {
      const members = it.g.dets.filter((d) => pass.has(d.id));
      if (members.length) items.push({ ...it, members });
    }
  }
  const out = [];
  let hour = null;
  for (const it of items.reverse()) {
    const t = it.type === "det" ? it.d.time : it.g.dets[it.g.dets.length - 1].time;
    if (t.slice(0, 2) !== hour) {
      hour = t.slice(0, 2);
      out.push(`<div class="hsep">${Number(hour)} 時台</div>`);
    }
    out.push(it.type === "det" ? flowRow(it.d) : burstRow(it));
  }
  return out.join("") || `<p class="empty">合う変化がありません</p>`;
}

function flowRow(d) {
  const sel = isSel("dl", "det", d.id);
  if (SPECIAL.has(d.change)) {
    return `<div class="fi sp${sel}" data-sel="det:${d.id}" tabindex="0"><time>${d.time}</time>${chgBadge(d.change)}<div class="fmain"><div class="fname"><span class="mono">${esc(d.path)}</span></div><div class="small sp-note">${SPECIAL_NOTE[d.change]}</div></div></div>`;
  }
  const rs = detRuns(d.id);
  const pend = idx().pendByDet.get(d.id);
  const r = rel(d);
  const right = rs.length
    ? runSum(rs)
    : pend
      ? `<span class="rp r-wait"><i class="d r-wait"></i>待ち表：${esc(pend.waitFor)}を待っている</span>`
      : `<span class="small muted">ランなし</span>`;
  return `<div class="fi${sel}" data-sel="det:${d.id}" tabindex="0">
    <time>${d.time}</time>${chgBadge(d.change)}
    <div class="fmain"><div class="fname">${kindIcon(d.kind)}<b>${esc(r.name)}</b><span class="fdir" title="${esc(where(d))}">${esc(whereShort(d))}</span>${d.old ? `<span class="fdir">← ${esc(baseName(d.old))}</span>` : ""}${d.how ? `<span class="tag">${esc(d.how)}</span>` : ""}</div>
    <div class="fruns">${right}</div></div></div>`;
}

function burstRow(it) {
  const { g, members, key } = it;
  const all = g.dets;
  const first = all[0];
  const last = all[all.length - 1];
  const c = countRuns(members.flatMap((d) => detRuns(d.id)));
  const open = S.dl.open.has(key);
  const shown = S.dl.more[key] || 50;
  const part = members.length !== all.length ? `<span class="tag">絞り込みに合う ${fmtNum(members.length)} 個</span>` : "";
  const inner = open
    ? `<div class="binner">${members
        .slice()
        .reverse()
        .slice(0, shown)
        .map((d) => `<div class="mi${isSel("dl", "det", d.id)}" data-sel="det:${d.id}" tabindex="0"><time>${d.time}</time>${d.kind === "folder" ? icon("folder") : ""}<span class="miname">${esc(rel(d).name)}</span><span class="dots">${detRuns(d.id).map((r) => `<i class="d r-${r.result}" title="${esc(r.jobName)}：${L.result[r.result]}"></i>`).join("")}</span></div>`)
        .join("")}${members.length > shown ? `<button class="link small" data-act="bmore" data-v="${key}">もっと見る（あと ${fmtNum(members.length - shown)} 個）</button>` : ""}</div>`
    : "";
  return `<div class="fi burst${isSel("dl", "burst", key)}" data-sel="dburst:${key}" tabindex="0">
    <time>${last.time}<small>〜${first.time}</small></time>${chgBadge(g.change)}
    <div class="fmain">
      <div class="fname"><span class="bicon">${icon("folder")}</span><b>${fmtNum(all.length)} 個の${L.change[g.change]}</b><span class="fdir">${esc(fName(g.folder))} › ${esc(g.top)}（${fmtDur(toSec(last.time) - toSec(first.time))}の間）</span>${part}</div>
      ${resultBar(c)}
      <div class="fruns">${resultCounts(c)}<button class="link small" data-act="bopen" data-v="${key}">${open ? "▾ 畳む" : "▸ 中を見る"}</button>${c.fail || c.interrupted ? `<button class="link small" data-act="bbad" data-v="${key}">成功しなかったものだけ見る</button>` : ""}</div>
      ${inner}
    </div></div>`;
}

// フォルダごと：エクスプローラのように、今いるフォルダのすぐ下だけを出す
function mkNode(name, key, folder, root = false) {
  return { name, key, folder, root, dirs: new Map(), files: new Map(), self: [] };
}
function buildTree(dets) {
  const roots = new Map(S.cfgOrig.folders.map((f) => [f.id, mkNode(f.name || f.id, f.id, f.id, true)]));
  for (const d of dets) {
    if (SPECIAL.has(d.change)) continue;
    const root = roots.get(d.folder);
    if (!root) continue;
    const r = rel(d);
    let cur = root;
    for (const s of d.kind === "folder" ? r.parts : r.dirs) {
      if (!cur.dirs.has(s)) cur.dirs.set(s, mkNode(s, `${cur.key}/${s}`, d.folder));
      cur = cur.dirs.get(s);
    }
    if (d.kind === "folder") cur.self.push(d);
    else {
      if (!cur.files.has(r.name)) cur.files.set(r.name, { name: r.name, dets: [] });
      cur.files.get(r.name).dets.push(d);
    }
  }
  const agg = (n) => {
    n.all = [...n.self];
    for (const f of n.files.values()) n.all.push(...f.dets);
    for (const c of n.dirs.values()) {
      agg(c);
      n.all.push(...c.all);
    }
    n.last = n.all.reduce((m, d) => (d.time > m ? d.time : m), "");
    n.cnt = countRuns(n.all.flatMap((d) => detRuns(d.id)));
  };
  roots.forEach(agg);
  return roots;
}
function findNode(roots, key) {
  const [rootId, ...segs] = key.split("/");
  let n = roots.get(rootId);
  for (const s of segs) n = n?.dirs.get(s);
  return n;
}
const dirKeyOf = (d) => [d.folder, ...(d.kind === "folder" ? rel(d).parts.slice(0, -1) : rel(d).dirs)].join("/");
// 中にフォルダが 1 つしか無い所（1 本道）は、「2026 › 10 › 26」と縮めて、1 回で入れるようにする
function compress(n) {
  const names = [n.name];
  let x = n;
  while (x.dirs.size === 1 && !x.files.size && !x.self.length) {
    x = [...x.dirs.values()][0];
    names.push(x.name);
  }
  return { node: x, label: names.join(" › ") };
}

function folderView(dets) {
  const roots = buildTree(dets);
  let cwd = S.dl.cwd;
  let node = cwd ? findNode(roots, cwd) : null;
  // 絞り込みで今いる所が無くなったら、ある所まで上に戻る
  while (cwd && !node) {
    cwd = cwd.includes("/") ? cwd.slice(0, cwd.lastIndexOf("/")) : "";
    node = cwd ? findNode(roots, cwd) : null;
  }
  S.dl.cwd = cwd;
  let rows = "";
  if (!node) rows = [...roots.values()].map((n) => dirRow(n, n.name)).join("");
  else {
    const parent = cwd.includes("/") ? cwd.slice(0, cwd.lastIndexOf("/")) : "";
    rows += `<div class="fo up" data-act="cwd" data-v="${esc(parent)}" tabindex="0">${icon("up")}<span class="foname">上へ</span></div>`;
    rows += node.self.map((d) => `<div class="fo self${isSel("dl", "det", d.id)}" data-sel="det:${d.id}" tabindex="0">${icon("folder")}<span class="foname">このフォルダ自身の${L.change[d.change]}</span><span class="fometa"><time>${d.time}</time></span></div>`).join("");
    const dirs = [...node.dirs.values()].map(compress).sort((a, b) => (a.node.last < b.node.last ? 1 : -1));
    rows += dirs.map(({ node: n, label }) => dirRow(n, label)).join("");
    const files = [...node.files.values()].sort((a, b) => (a.dets[a.dets.length - 1].time < b.dets[b.dets.length - 1].time ? 1 : -1));
    const limit = S.dl.more[cwd] || 50;
    rows += files.slice(0, limit).map(fileRow).join("");
    if (files.length > limit) rows += `<button class="link small fomore" data-act="fmore" data-v="${esc(cwd)}">ほか ${fmtNum(files.length - limit)} 個を出す</button>`;
    if (!dirs.length && !files.length && !node.self.length) rows += `<p class="empty">この時間に変化はありません</p>`;
  }
  return crumbView(cwd, roots) + `<div class="folist">${rows}</div>`;
}
function dirRow(n, label) {
  const bad = n.cnt.fail + n.cnt.interrupted + n.cnt.ignore;
  return `<div class="fo${isSel("dl", "dir", n.key)}" data-sel="dir:${esc(n.key)}" tabindex="0">${icon("folder")}<span class="foname">${esc(label)}${n.root ? "" : "\\"}</span>${n.root ? `<span class="mono small muted fopath">${esc(fPath(n.folder))}</span>` : ""}
    <span class="fometa"><span class="small muted">変化 ${fmtNum(n.all.length)}</span>${resultBar(n.cnt, "mini")}${bad ? `<span class="small bad">成功しなかった ${fmtNum(bad)}</span>` : ""}<time>${n.last || "—"}</time></span><span class="chev" aria-hidden="true">›</span></div>`;
}
function fileRow(f) {
  const d = f.dets[f.dets.length - 1];
  const rs = f.dets.flatMap((x) => detRuns(x.id));
  return `<div class="fo file${isSel("dl", "det", d.id)}" data-sel="det:${d.id}" tabindex="0">${icon("file")}<span class="foname">${esc(f.name)}</span>${chgBadge(d.change)}${f.dets.length > 1 ? `<span class="small muted">ほか ${f.dets.length - 1} 回</span>` : ""}
    <span class="fometa">${rs.length ? runSum(rs) : '<span class="small muted">ランなし</span>'}<time>${d.time}</time></span></div>`;
}
// パンくず。長いときは途中を「…」にする（押すと全部出す）
function crumbView(cwd, roots) {
  const segs = cwd ? cwd.split("/") : [];
  const items = [["", "すべての監視フォルダ"], ...segs.map((s, i) => [segs.slice(0, i + 1).join("/"), i === 0 ? roots.get(s)?.name || s : s])];
  const shown = items.length > 6 && !S.dl.crumbAll ? [items[0], items[1], null, ...items.slice(-3)] : items;
  return `<nav class="crumbs" aria-label="場所">${shown
    .map(
      (x, k) =>
        (k ? '<span class="muted">›</span>' : "") +
        (x ? `<button class="link" data-act="cwd" data-v="${esc(x[0])}"${x[0] === cwd ? ' aria-current="location"' : ""}>${esc(x[1])}</button>` : `<button class="link" data-act="crumbs" title="途中も出す">…</button>`)
    )
    .join("")}</nav>`;
}

function dlDetail(D) {
  const s = S.dl.sel;
  if (!s) return emptyDetail("変化やかたまり、フォルダ");
  if (s.kind === "det") return backBtn("dl") + detDetail(D, s.id);
  if (s.kind === "burst") return backBtn("dl") + burstDetail(s.key);
  return backBtn("dl") + dirDetail(s.key);
}

function detDetail(D, id) {
  const d = idx().detById.get(id);
  if (!d) return `<p class="empty">見つかりません</p>`;
  const rs = detRuns(id);
  const sp = SPECIAL.has(d.change);
  const pend = idx().pendByDet.get(id);
  let h = `<header class="dhd"><p class="eyebrow">検知 ${d.id}</p><h2>${esc(sp ? L.change[d.change] : rel(d).name)}</h2>${chgBadge(d.change)}</header>
  <dl class="kv">
    <div><dt>日時</dt><dd>${MOCK.today} ${d.time}</dd></div>
    <div><dt>監視フォルダ</dt><dd>${esc(fName(d.folder))} <code class="id">${esc(d.folder)}</code></dd></div>
    <div><dt>パス</dt><dd class="mono">${esc(d.path)}</dd></div>
    ${d.old ? `<div><dt>変更前のパス</dt><dd class="mono">${esc(d.old)}</dd></div>` : ""}
    <div><dt>ファイルかフォルダか</dt><dd>${d.kind ? L.kind[d.kind] : "—"}</dd></div>
    <div><dt>見つけ方</dt><dd>${esc(d.how || "—（OS イベントから）")}</dd></div>
  </dl>`;
  if (sp) h += `<div class="callout c-warn">${SPECIAL_LONG[d.change]}</div>`;
  h += `<h3 class="dh">この変化で走ったラン${rs.length ? `（${rs.length}）` : ""}</h3>`;
  if (rs.length) h += runList(D, rs) + `<p class="small muted">押すと、ランログでそのランを開く（ステップと出力が見られる）</p>`;
  else if (pend) h += `<div class="callout">まだ発火していない。待ち表の行 ${pend.no} で、${esc(pend.waitFor)}を待っている（5.9）。<span data-since="${pend.since}"></span></div>`;
  else if (sp) h += `<p class="muted small">この行は変化ではないので、ランは走らない。</p>`;
  else h += `<p class="muted small">この検知 ID を持つランはありません。トリガーに合わなかったか、待ち表で後の変化と 1 行にまとめられたとき（ランには、最後の変化の検知 ID を書く。5.9）。</p>`;
  return h;
}

// かたまりやフォルダの、ジョブごとの数
function jobTable(rs) {
  const jobs = [...new Set(rs.map((r) => r.job))];
  if (!jobs.length) return `<p class="muted small">ランはありません</p>`;
  const cols = ["ok", "fail", "interrupted", "ignore"];
  return tableWrap(`<table class="tbl jt"><thead><tr><th>ジョブ</th>${cols.map((k) => `<th class="num">${L.result[k]}</th>`).join("")}<th class="num">ほか</th></tr></thead><tbody>${jobs
    .map((j) => {
      const c = countRuns(rs.filter((r) => r.job === j));
      return `<tr><td><b>${esc(rs.find((r) => r.job === j).jobName)}</b></td>${cols.map((k) => `<td class="num${c[k] && k !== "ok" ? " bad" : ""}">${c[k] ? fmtNum(c[k]) : "—"}</td>`).join("")}<td class="num">${c.running + c.wait || "—"}</td></tr>`;
    })
    .join("")}</tbody></table>`);
}

function burstDetail(key) {
  const it = findBurst(key);
  if (!it) return `<p class="empty">見つかりません</p>`;
  const all = it.g.dets;
  const first = all[0];
  const last = all[all.length - 1];
  const rs = all.flatMap((d) => detRuns(d.id));
  const trigs = [...new Set(rs.map((r) => r.trigger))];
  return `<header class="dhd"><p class="eyebrow">かたまり</p><h2>${fmtNum(all.length)} 個の${L.change[it.g.change]}</h2>${chgBadge(it.g.change)}</header>
  <dl class="kv">
    <div><dt>場所</dt><dd><span class="mono">${esc(fPath(it.g.folder).replace(/\\+$/, ""))}\\${esc(it.g.top)}\\</span><div class="small muted">${esc(fName(it.g.folder))}（${esc(it.g.folder)}）</div></dd></div>
    <div><dt>時間</dt><dd>${first.time}〜${last.time}（${fmtDur(toSec(last.time) - toSec(first.time))}）</dd></div>
    <div><dt>検知 ID</dt><dd>${first.id}〜${last.id}</dd></div>
    <div><dt>ラン</dt><dd>${fmtNum(rs.length)}</dd></div>
  </dl>
  ${resultBar(countRuns(rs))}
  <h3 class="dh">ジョブごとの結果</h3>${jobTable(rs)}
  <h3 class="dh">成功しなかったラン（理由ごと）</h3>${badGroupsView(badGroups(rs))}
  <div class="dbtns">${trigs.map((t) => `<button class="btn small" data-sel="rburst:${key}|${esc(t)}">${icon("play")}ランログで見る（${esc(tName(t))}）</button>`).join("")}<button class="btn small" data-act="bfolder" data-v="${key}">${icon("tree")}フォルダごとに見る</button></div>`;
}

function dirDetail(key) {
  const n = findNode(buildTree(dlDets(data())), key);
  if (!n) return `<p class="empty">見つかりません</p>`;
  const rs = n.all.flatMap((d) => detRuns(d.id));
  const path = n.root ? fPath(n.folder) : `${fPath(n.folder).replace(/\\+$/, "")}\\${key.split("/").slice(1).join("\\")}\\`;
  return `<header class="dhd"><p class="eyebrow">${n.root ? "監視フォルダ" : "フォルダ"}</p><h2>${esc(n.name)}</h2></header>
  <dl class="kv">
    <div><dt>パス</dt><dd class="mono">${esc(path)}</dd></div>
    <div><dt>変化</dt><dd>${fmtNum(n.all.length)}（下のフォルダも合わせて${S.dl.range ? "。絞った時間の中" : ""}）</dd></div>
    <div><dt>最後の変化</dt><dd>${n.last || "—"}</dd></div>
    <div><dt>ラン</dt><dd>${fmtNum(rs.length)}</dd></div>
  </dl>
  ${resultBar(n.cnt)}
  <h3 class="dh">ジョブごとの結果</h3>${jobTable(rs)}
  <h3 class="dh">成功しなかったラン（理由ごと）</h3>${badGroupsView(badGroups(rs))}`;
}

/* ---------- ランログ ---------- */

function rlRuns(D) {
  const f = S.rl;
  const q = f.q.trim().toLowerCase();
  return D.runs.filter(
    (r) =>
      (!f.result || r.result === f.result) &&
      (!f.trigger || r.trigger === f.trigger) &&
      (!f.job || r.job === f.job) &&
      (!q || detPath(r.det).toLowerCase().includes(q)) &&
      (!f.range || (r.start && inRange(toSec(r.start), f.range)))
  );
}
// 待っているランは、いちばん上に出す
const runKey = (r) => (r.start ? toSec(r.start) : 1e9);
const runsOfBurst = (key) => {
  const [bk, trig] = key.split("|");
  return S.runs.filter((r) => r.trigger === trig && idx().burstOfDet.get(r.det) === bk);
};

// 検知ログで 1 つのかたまりになった変化から走ったランは、トリガーごとに 1 つに畳む
function runItems(runs) {
  const burstOf = idx().burstOfDet;
  const items = [];
  const groups = new Map();
  for (const r of runs.slice().sort((a, b) => runKey(b) - runKey(a) || b.id - a.id)) {
    const bk = burstOf.get(r.det);
    if (!bk) {
      items.push({ type: "run", r });
      continue;
    }
    const key = `${bk}|${r.trigger}`;
    if (!groups.has(key)) {
      const g = { type: "rburst", key, bk, trigger: r.trigger, runs: [] };
      groups.set(key, g);
      items.push(g);
    }
    groups.get(key).runs.push(r);
  }
  return items;
}

function runsView(D) {
  const counts = countRuns(D.runs);
  const tabs = ["", "wait", "running", "ok", "fail", "interrupted", "ignore"];
  const topt = S.cfgOrig.triggers.map((t) => `<option value="${esc(t.id)}"${S.rl.trigger === t.id ? " selected" : ""}>${esc(t.name || t.id)}</option>`).join("");
  const jopt = S.cfgOrig.jobs.map((j) => `<option value="${esc(j.id)}"${S.rl.job === j.id ? " selected" : ""}>${esc(j.name || j.id)}</option>`).join("");
  const bs = binsOf(D.runs, (r) => r.start, (r) => r.result === "fail" || r.result === "interrupted");
  return (
    head("ランログ", "ラン 1 回分ごとの記録。無視して走らなかったランも残る", liveTag()) +
    `<div class="evtop">${histView(bs, "rl", "ラン", "失敗・中断したラン")}</div>
    <div class="rtabs" role="tablist" aria-label="結果">${tabs
      .map((k) => `<button role="tab" aria-selected="${S.rl.result === k}" data-act="rres" data-v="${k}">${k ? `<i class="d r-${k}"></i>${L.result[k]}` : "すべて"}<span class="cnt">${fmtNum(k ? counts[k] : counts.total)}</span></button>`)
      .join("")}</div>
    <div class="toolbar">${searchBox("rl.q", S.rl.q, "対象パスで探す")}
      <select data-f="rl.trigger" aria-label="トリガー"><option value="">すべてのトリガー</option>${topt}</select>
      <select data-f="rl.job" aria-label="ジョブ"><option value="">すべてのジョブ</option>${jopt}</select></div>
    ${splitView("rl", rlList(D), rlDetail(D))}`
  );
}

function rlList(D) {
  const items = runItems(rlRuns(D));
  if (!items.length) return `<p class="empty">合うランがありません</p>`;
  const out = [];
  let hour = null;
  for (const it of items) {
    const t = it.type === "run" ? it.r.start : it.runs[0].start;
    const h = t ? t.slice(0, 2) : "wait";
    if (h !== hour) {
      hour = h;
      out.push(`<div class="hsep">${h === "wait" ? "まだ始まっていない" : `${Number(h)} 時台`}</div>`);
    }
    out.push(it.type === "run" ? runRow(it.r) : runBurstRow(it));
  }
  return out.join("");
}

function runRow(r) {
  const d = idx().detById.get(r.det);
  const sub = r.reason
    ? `<div class="small rreason r-${r.result}">${esc(r.reason)}</div>`
    : r.waitFor
      ? `<div class="small muted">${esc(r.waitFor)}</div>`
      : r.result === "running"
        ? `<div class="small muted">${esc(r.stepNow)}・<span data-since="${r.start}"></span></div>`
        : "";
  return `<div class="fi ri${isSel("rl", "run", r.id)}" data-sel="run:${r.id}" tabindex="0">
    <time>${r.start || "—"}</time>${resBadge(r.result)}
    <div class="fmain"><div class="fname"><b>${esc(r.jobName)}</b><span class="fdir">${esc(r.triggerName)}</span><span class="small muted">ラン ${r.id}</span></div>
      ${d ? `<div class="rtarget">${kindIcon(d.kind)}<span class="mono">${esc(rel(d).name)}</span><span class="fdir" title="${esc(where(d))}">${esc(whereShort(d))}</span></div>` : ""}${sub}</div>
    <span class="rdur">${r.start && r.end ? fmtDur(toSec(r.end) - toSec(r.start)) : ""}</span></div>`;
}

function runBurstRow(it) {
  const b = findBurst(it.bk);
  const all = runsOfBurst(it.key);
  const c = countRuns(it.runs);
  const open = S.rl.open.has(it.key);
  const shown = S.rl.more[it.key] || 50;
  const times = it.runs.map((r) => r.start).filter(Boolean).sort();
  const part = it.runs.length !== all.length ? `<span class="tag">絞り込みに合う ${fmtNum(it.runs.length)}</span>` : "";
  const inner = open
    ? `<div class="binner">${it.runs
        .slice(0, shown)
        .map((r) => `<div class="mi${isSel("rl", "run", r.id)}" data-sel="run:${r.id}" tabindex="0"><time>${r.start || "—"}</time>${resBadge(r.result)}<span class="miname">${esc(r.jobName)}・${esc(baseName(detPath(r.det)))}</span></div>`)
        .join("")}${it.runs.length > shown ? `<button class="link small" data-act="rmore" data-v="${esc(it.key)}">もっと見る（あと ${fmtNum(it.runs.length - shown)}）</button>` : ""}</div>`
    : "";
  return `<div class="fi burst ri${isSel("rl", "burst", it.key)}" data-sel="rburst:${esc(it.key)}" tabindex="0">
    <time>${times[times.length - 1] || "—"}<small>〜${times[0] || ""}</small></time><span class="badge">かたまり</span>
    <div class="fmain">
      <div class="fname"><span class="bicon">${icon("folder")}</span><b>${fmtNum(all.length)} 個のラン</b><span class="fdir">${esc(tName(it.trigger))}・${esc(fName(b.g.folder))} › ${esc(b.g.top)} の ${fmtNum(b.g.dets.length)} 個の変化から</span>${part}</div>
      ${resultBar(c)}
      <div class="fruns">${resultCounts(c)}<button class="link small" data-act="ropen" data-v="${esc(it.key)}">${open ? "▾ 畳む" : "▸ 中を見る"}</button></div>
      ${inner}
    </div><span class="rdur"></span></div>`;
}

function rlDetail(D) {
  const s = S.rl.sel;
  if (!s) return emptyDetail("ランやかたまり");
  if (s.kind === "run") return backBtn("rl") + runDetail(D, s.id);
  return backBtn("rl") + runBurstDetail(s.key);
}

function runDetail(D, id) {
  const r = idx().runById.get(id);
  if (!r) return `<p class="empty">見つかりません</p>`;
  const d = idx().detById.get(r.det);
  const sibs = D.runs.filter((x) => x.det === r.det && x.id !== r.id);
  const retried = D.runs.some((x) => x.reason === `ラン ${r.id} のやり直し`);
  return `<header class="dhd"><p class="eyebrow">ラン ${r.id}</p><h2>${esc(r.jobName)}</h2>${resBadge(r.result)}</header>
  ${runCard(D, r, r.id)}
  <h3 class="dh">もとの変化</h3>${
    d
      ? `<button class="origin" data-sel="det:${d.id}"><span class="num">検知 ${d.id}</span>${chgBadge(d.change)}<span class="mono">${esc(d.path)}</span><time>${d.time}</time></button><p class="small muted">押すと、検知ログでこの変化を開く</p>`
      : `<p class="muted small">見つかりません（古い検知ログを消したとき）</p>`
  }
  ${sibs.length ? `<h3 class="dh">同じ変化から走ったラン</h3>${runList(D, sibs)}` : ""}
  ${BAD.has(r.result) && !retried ? `<div class="callout c-info">${icon("info")}<span>手でやり直すボタンはありません（6.6）。もう一度走らせたいときは、もう一度変化を起こしてください（例：ファイルを監視フォルダから出して戻す）。</span></div>` : ""}`;
}

function runBurstDetail(key) {
  const [bk, trig] = key.split("|");
  const b = findBurst(bk);
  const rs = runsOfBurst(key);
  if (!b || !rs.length) return `<p class="empty">見つかりません</p>`;
  const times = rs.map((r) => r.start).filter(Boolean).sort();
  const ends = rs.map((r) => r.end).filter(Boolean).sort();
  return `<header class="dhd"><p class="eyebrow">かたまりのラン</p><h2>${fmtNum(rs.length)} 個のラン</h2></header>
  <dl class="kv">
    <div><dt>トリガー</dt><dd>${esc(tName(trig))} <code class="id">${esc(trig)}</code></dd></div>
    <div><dt>時間</dt><dd>${times[0] || "—"}〜${ends[ends.length - 1] || "—"}</dd></div>
    <div><dt>もとの変化</dt><dd><button class="link" data-sel="dburst:${bk}">${fmtNum(b.g.dets.length)} 個の${L.change[b.g.change]}（${esc(fName(b.g.folder))} › ${esc(b.g.top)}）</button><div class="small muted">押すと、検知ログで開く</div></dd></div>
  </dl>
  ${resultBar(countRuns(rs))}
  <h3 class="dh">ジョブごとの結果</h3>${jobTable(rs)}
  <h3 class="dh">成功しなかったラン（理由ごと）</h3>${badGroupsView(badGroups(rs))}`;
}

function runCard(D, r, focus) {
  const out = outputOf(r);
  const open = focus ? focus === r.id : BAD.has(r.result) || r.result === "running";
  const retriedBy = D.runs.find((x) => x.reason === `ラン ${r.id} のやり直し`);
  const retryOf = /^ラン (\d+) のやり直し$/.exec(r.reason || "");
  const when = r.start
    ? `${r.start}${r.end ? ` → ${r.end}（${fmtDur(toSec(r.end) - toSec(r.start))}）` : r.result === "running" ? ` から・<span data-since="${r.start}"></span>` : ""}`
    : esc(r.waitFor || "");
  const reason = r.reason ? `<div class="callout c-${r.result}">${retryOf ? `<button class="link" data-sel="run:${retryOf[1]}">${esc(r.reason)}</button>` : esc(r.reason)}</div>` : "";
  const streams = out?.streams?.length
    ? out.streams.map((s) => `<details class="stream"${s.text ? " open" : ""}><summary>${s.step} 番目・${esc(s.name)}${s.text ? "" : ' <span class="muted">（空）</span>'}</summary>${s.text ? `<pre>${esc(s.text)}</pre>` : ""}</details>`).join("")
    : r.result === "ok"
      ? `<p class="muted small">成功したランでは、プロセス実行の出力は残さない（7.1）。</p>`
      : "";
  return `<article class="rcard2 rr-${r.result}" id="run-${r.id}">
    <div class="rch">${resBadge(r.result)}<b>${esc(r.jobName)}</b><code class="id">${esc(r.job)}</code><span class="muted small">ラン ${r.id}・${esc(r.triggerName)}</span></div>
    <div class="rmeta small muted">${when}${r.code != null ? `・終了コード ${r.code}` : ""}${r.step ? `・止まったステップ：${esc(r.step)}` : ""}</div>
    ${reason}
    ${retriedBy ? `<div class="callout c-ok">次に起動したとき、<button class="link" data-sel="run:${retriedBy.id}">ラン ${retriedBy.id}</button> としてやり直した（6.6）</div>` : ""}
    ${out ? `<details class="rdet"${open ? " open" : ""}><summary>ステップ${out.streams?.length ? "と出力" : ""}</summary>${stepsView(r, out)}${streams}${r.start && r.result !== "ignore" ? `<p class="tfoot">出力のファイル：<span class="mono">${esc(MOCK.configDir)}\\runs\\${r.id}.txt</span>（置き場所は宿題）</p>` : ""}</details>` : ""}
  </article>`;
}

// ラン 1 回ごとの出力のファイル。見本のデータに無いものは、ジョブの設定から作る
function outputOf(r) {
  const given = S.base.outputs[r.id];
  if (given && r.result !== "running") return given;
  const job = S.cfgOrig.jobs.find((j) => j.id === r.job);
  if (!job || !r.start || r.result === "ignore" || r.result === "wait") return null;
  const label = (s) => (s.type === "exec" ? `プロセス実行 ${s.program}` : s.type === "delete" ? "削除（対象パス）" : `${L.step[s.type]} → ${s.dest}`);
  if (r.result === "running" || !r.end) {
    return { steps: job.steps.map((s, k) => ({ no: k + 1, label: label(s), start: k === 0 ? r.start : null, end: null, result: k === 0 ? r.result : "todo", code: null })) };
  }
  const a = toSec(r.start);
  const b = toSec(r.end);
  const n = job.steps.length;
  return {
    steps: job.steps.map((s, k) => ({
      no: k + 1,
      label: label(s),
      start: fmtTime(a + Math.round(((b - a) * k) / n)),
      end: fmtTime(a + Math.round(((b - a) * (k + 1)) / n)),
      result: r.result === "interrupted" && k === n - 1 ? "interrupted" : "ok",
      code: s.type === "exec" ? (k === n - 1 ? r.code ?? 0 : 0) : null,
    })),
  };
}

function stepsView(r, out) {
  return `<ol class="stl">${out.steps
    .map((s) => {
      let when = "";
      if (s.start && s.end) when = `${s.start} → ${s.end}（${fmtDur(toSec(s.end) - toSec(s.start))}）`;
      else if (s.result === "running") when = `${s.start} から・<span data-since="${s.start}"></span>`;
      return `<li class="tl-${s.result}"><span class="tln">${s.no}</span><div class="tlb"><b>${esc(s.label)}</b>${when ? `<div class="small muted">${when}</div>` : ""}${s.note ? `<div class="small">${esc(s.note)}</div>` : ""}</div>
      <span class="tlr">${s.result === "todo" ? '<span class="muted small">まだ</span>' : resBadge(s.result)}${s.code != null ? `<span class="code">終了コード ${s.code}</span>` : ""}</span></li>`;
    })
    .join("")}</ol>${r.result === "running" ? `<p class="muted small">出力は、ランが終わってから見られる（案）。</p>` : ""}`;
}

// 選ぶ。ほかの画面から来たときは、その画面に移って、その行が見える所まで動かす
function select(spec) {
  const i = spec.indexOf(":");
  const kind = spec.slice(0, i);
  const v = spec.slice(i + 1);
  const map = {
    det: ["detect", "dl", { kind: "det", id: Number(v) }],
    dburst: ["detect", "dl", { kind: "burst", key: v }],
    dir: ["detect", "dl", { kind: "dir", key: v }],
    run: ["runs", "rl", { kind: "run", id: Number(v) }],
    rburst: ["runs", "rl", { kind: "burst", key: v }],
  };
  const [page, ns, sel] = map[kind];
  S[ns].sel = sel;
  if (kind === "dir") S.dl.cwd = v;
  if (S.page !== page) {
    S.page = page;
    if (ns === "dl") {
      Object.assign(S.dl, { range: null, q: "", folder: "", onlyBad: false });
      if (sel.kind === "det") {
        const d = idx().detById.get(sel.id);
        const bk = idx().burstOfDet.get(sel.id);
        if (bk) S.dl.open.add(bk);
        if (d) S.dl.cwd = dirKeyOf(d);
      }
    } else {
      Object.assign(S.rl, { range: null, q: "", result: "", trigger: "", job: "" });
      if (sel.kind === "run") {
        const r = idx().runById.get(sel.id);
        const bk = r && idx().burstOfDet.get(r.det);
        if (bk) S.rl.open.add(`${bk}|${r.trigger}`);
      }
    }
    render();
    window.scrollTo(0, 0);
    requestAnimationFrame(() => $(`.elist [data-sel="${selKey(ns)}"]`)?.scrollIntoView({ block: "center" }));
    return;
  }
  // フォルダは中に入るので、一覧ごと描き直す
  if (kind === "dir") {
    render();
    return;
  }
  updateSel(ns);
}

function updateSel(ns) {
  const det = $("#detail");
  if (det) {
    det.innerHTML = ns === "dl" ? dlDetail(data()) : rlDetail(data());
    det.scrollTop = 0;
  }
  $(".split")?.classList.toggle("has-sel", !!S[ns].sel);
  $$(".elist .sel").forEach((e) => e.classList.remove("sel"));
  const k = selKey(ns);
  if (k) $$(`.elist [data-sel="${k}"]`).forEach((e) => e.classList.add("sel"));
  tick();
  // 狭い画面では、入れ替わった詳しい所の頭まで動かす（上にくっついている帯とメニューの分をよける）
  if (matchMedia("(max-width: 900px)").matches) {
    const top = $(".split")?.getBoundingClientRect().top + window.scrollY;
    const covered = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--mockh"), 10) + ($(".side")?.offsetHeight || 0);
    window.scrollTo(0, Math.max(0, top - covered - 8));
  }
}

/* ---------- アプリログ ---------- */

function applogView(D) {
  const counts = { info: 0, warn: 0, error: 0 };
  D.log.forEach((l) => counts[l.level]++);
  return (
    head("アプリログ", "Foxonar 自身の動き（起動、停止、設定の読み込み、エラーなど）の記録", liveTag()) +
    `<div class="toolbar">
      <div class="chips" role="group" aria-label="重さ">${["info", "warn", "error"]
        .map((k) => `<button class="chip lv-${k}" aria-pressed="${S.lF.levels.includes(k)}" data-act="lvl" data-v="${k}">${L.level[k]}<span class="cnt">${counts[k]}</span></button>`)
        .join("")}</div>
      <label class="search">${icon("search")}<input type="search" placeholder="言葉で探す" value="${esc(S.lF.q)}" data-f="lF.q" aria-label="言葉で探す"></label>
      <label class="tog"><input type="checkbox" data-f="lF.follow"${S.lF.follow ? " checked" : ""}><span class="sw"></span>新しい行を追いかける</label>
    </div>
    <div id="logwrap">${logBox(D)}</div>
    <p class="tfoot">ファイル：<span class="mono">${esc(MOCK.configDir)}\\logs\\foxonar.log</span>（置き場所と分け方は宿題）</p>`
  );
}

function logBox(D) {
  const q = S.lF.q.trim().toLowerCase();
  const rows = D.log.filter((l) => S.lF.levels.includes(l.level) && (!q || l.text.toLowerCase().includes(q)));
  return `<div class="logbox" id="logbox" role="log">${
    rows.map((l) => `<div class="ll lv-${l.level}"><time>${MOCK.today} ${l.time}</time><span class="lvb">${L.level[l.level]}</span><span class="tx">${esc(l.text)}</span></div>`).join("") ||
    `<p class="empty">合う行がありません</p>`
  }</div>`;
}

/* ---------- 設定 ---------- */

function settingsView(D) {
  const err = D.cfgErr;
  const locked = !!err;
  const tabs = [
    ["map", "つながり"],
    ["folders", "監視フォルダ"],
    ["triggers", "トリガー"],
    ["jobs", "ジョブ"],
    ["global", "全体"],
  ];
  const status = err
    ? ""
    : `<p class="cfgline">${icon("check")}<span>動いている設定：${S.loadedAt} に読み込んだもの。ファイルは <span class="mono">${esc(MOCK.configDir)}\\foxonar.toml</span> と、隣の <span class="mono">jobs.toml</span></span></p>`;
  const tabbar = `<div class="stabs" role="tablist" aria-label="設定の種類">${tabs
    .map(([k, l]) => `<button role="tab" aria-selected="${S.setTab === k}" data-act="settab" data-v="${k}">${l}${Array.isArray(S.cfg[k]) ? `<span class="cnt">${S.cfg[k].length}</span>` : ""}${tabHasError(k) ? '<i class="edot"></i>' : ""}</button>`)
    .join("")}</div>`;
  const body = {
    map: mapTab,
    folders: () => listForm("folders", locked),
    triggers: () => listForm("triggers", locked),
    jobs: () => listForm("jobs", locked),
    global: () => globalForm(locked),
  }[S.setTab]();
  return head("設定", "監視フォルダ・トリガー・ジョブを見る・直す。保存すると、コアが自動で読み直す") + (err ? cfgErrorView(err) : "") + status + tabbar + body + saveBarView();
}

function cfgErrorView(err) {
  return `<section class="cfgerr">
    <h2>${icon("alert")}設定の読み込みに失敗しています</h2>
    <p>${err.time} に ${esc(err.file)} を読み直したところ、${err.line} 行目：${esc(err.message)}。壊れた設定は使わず、前の設定のまま動いています。</p>
    <pre class="excerpt">${err.excerpt.map(([n, s]) => `<span class="${n === err.line ? "bad" : ""}"><i>${n}</i>${esc(s)}${n === err.line ? "   ← 知らないキー" : ""}</span>`).join("")}</pre>
    <p class="small">ファイルを直接直すと、自動で読み直します。直るまで、この画面では直せません（下は、今動いている前の設定。案）。直さないまま止めると、次は起動しません（4.2）。</p>
  </section>`;
}

const tabHasError = (k) => ["folders", "triggers", "jobs"].includes(k) && S.cfg[k].some((x) => check(k, x).E.length);
const allErrors = () => ["folders", "triggers", "jobs"].reduce((n, k) => n + S.cfg[k].reduce((m, x) => m + check(k, x).E.length, 0), 0);

function listItem(kind, x, i) {
  const c = check(kind, x);
  const sub =
    kind === "folders"
      ? x.path || "（パスが無い）"
      : kind === "triggers"
        ? `${fNameCfg(x.folder)}・${x.changes.map((v) => L.change[v]).join("・") || "—"}`
        : `ステップ ${x.steps.length}`;
  const dot = c.E.length ? '<i class="edot" title="直すところがある"></i>' : c.W.length ? '<i class="edot w" title="注意がある"></i>' : "";
  return `<button class="iitem" aria-current="${S.sel[kind] === i}" data-act="sel" data-v="${kind}|${i}" data-li="${kind}:${i}"><span class="it">${dot}<b>${esc(x.name || x.id)}</b><code class="id">${esc(x.id)}</code></span><span class="isub">${esc(sub)}</span></button>`;
}

// 一覧の項目。「探す」欄に書いた言葉を、名前か ID に含むものだけ
function listItems(kind) {
  const q = (S.lq[kind] || "").trim().toLowerCase();
  const hit = (x) => !q || (x.name || "").toLowerCase().includes(q) || x.id.toLowerCase().includes(q);
  return S.cfg[kind].map((x, k) => (hit(x) ? listItem(kind, x, k) : "")).join("") || `<p class="small muted">合うものがありません</p>`;
}

function listForm(kind, locked) {
  const items = S.cfg[kind];
  const i = Math.max(0, Math.min(S.sel[kind], items.length - 1));
  S.sel[kind] = i;
  const item = items[i];
  const search = items.length > 8 ? searchBox(`lq.${kind}`, S.lq[kind], `${KIND_LABEL[kind]}を探す`) : "";
  const list = `<div class="ilist">${search}<div id="ilist-items" class="iitems">${listItems(kind)}</div><button class="iadd" data-act="add" data-v="${kind}"${locked ? " disabled" : ""}>＋ ${KIND_LABEL[kind]}を足す</button></div>`;
  const form = item ? { folders: folderForm, triggers: triggerForm, jobs: jobForm }[kind](item, i) : `<p class="empty">まだありません</p>`;
  return `<div class="lf">${list}<fieldset class="form"${locked ? " disabled" : ""}>${form}</fieldset></div>`;
}

// フォームの部品
const B = (kind, i, path) => `data-b="${kind}|${i}|${path}"`;
function field(label, control, help = "") {
  return `<div class="field"><div class="fl">${label}</div><div class="fc">${control}${help ? `<p class="help">${help}</p>` : ""}</div></div>`;
}
function inp(b, v, { mono = false, ph = "", type = "text", t = "", cls = "" } = {}) {
  const c = [mono ? "mono" : "", cls].filter(Boolean).join(" ");
  return `<input type="${type}" ${b} value="${esc(v ?? "")}"${c ? ` class="${c}"` : ""}${ph ? ` placeholder="${esc(ph)}"` : ""}${t ? ` data-t="${t}"` : ""}${type === "number" ? ' min="0"' : ""}>`;
}
const tog = (b, on, label) => `<label class="tog"><input type="checkbox" ${b}${on ? " checked" : ""}><span class="sw"></span>${label}</label>`;
function seg(name, b, val, opts) {
  return `<div class="segc" role="radiogroup">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" ${b} value="${v}"${val === v ? " checked" : ""}><span>${l}</span></label>`).join("")}</div>`;
}
function rcards(name, b, val, opts) {
  return `<div class="rcards">${opts
    .map(([v, title, desc]) => `<label class="rcard"><input type="radio" name="${name}" ${b} value="${v}"${val === v ? " checked" : ""}><span class="rt">${title}</span><span class="rd">${desc}</span></label>`)
    .join("")}</div>`;
}
function idField(kind, i, x) {
  if (x._new) return field("ID", inp(B(kind, i, "id"), x.id, { mono: true }), "英数字と - _ だけ。同じ種類の中で重ならないように（4.3）。保存したあとは変えられない（案）");
  return field("ID", `<div class="idlock"><code>${esc(x.id)}</code>${icon("lock")}</div>`, "作ったあとは変えられない（案）。変えると別のものとして扱われ、覚えている中身を引き継がない（9.3）");
}
function formHead(kind, i, x, label, canDel, why = "") {
  return `<div class="fhead"><div><p class="eyebrow">${label}</p><h2>${esc(x.name || x.id)}</h2></div><button class="btn small ghost danger" data-act="del" data-v="${kind}|${i}"${canDel ? "" : " disabled"}>消す</button></div>${!canDel && why ? `<p class="help right">${why}</p>` : ""}`;
}
function msgsView({ E, W }) {
  if (!E.length && !W.length) return "";
  return `<ul class="msgs">${E.map((m) => `<li class="m-err">${icon("alert")}<span>${esc(m)}</span></li>`).join("")}${W.map((m) => `<li class="m-warn">${icon("alert")}<span>${esc(m)}</span></li>`).join("")}</ul>`;
}

// フォルダ選び：コアから見えるフォルダ（見本では MOCK.fs）
function normDir(p) {
  let s = String(p || "").trim();
  if (!s) return "";
  if (/^[A-Za-z]:$/.test(s)) s += "\\";
  if (s.length > 3 && s.endsWith("\\")) s = s.slice(0, -1);
  return s;
}
const FS_KNOWN = (() => {
  const set = new Set();
  for (const [k, kids] of Object.entries(MOCK.fs)) {
    if (k) set.add(k.toLowerCase());
    for (const c of kids) set.add((k ? joinP(k, c) : c).toLowerCase());
  }
  return set;
})();
const isMapped = (p) => MOCK.mappedDrives.includes(p.slice(0, 2).toUpperCase());
function pathCheck(p) {
  const n = normDir(p);
  if (!n) return "";
  if (S.mode === "service" && isMapped(n)) return `<span class="pc warn">${icon("alert")}サービスからは見えないドライブ（ログインごとの割り当て。2.3）</span>`;
  if (FS_KNOWN.has(n.toLowerCase())) return `<span class="pc ok">${icon("check")}ある（フォルダ）</span>`;
  return `<span class="pc warn">${icon("alert")}今は見つからない。保存はできる（見失ったとして見張りを始め、現れたら見張る。5.11）</span>`;
}
function crumbsOf(p) {
  if (!p) return [];
  const m = /^\\\\[^\\]+\\[^\\]+/.exec(p);
  const root = m ? m[0] : p.slice(0, 3);
  const out = [[root, root]];
  let acc = root;
  for (const s of p.slice(root.length).split("\\").filter(Boolean)) {
    acc = joinP(acc, s);
    out.push([acc, s]);
  }
  return out;
}
function pickerView() {
  const cur = S.picker.cur;
  const kids = (MOCK.fs[cur] || []).filter((c) => !(S.mode === "service" && !cur && isMapped(c)));
  const crumbs = [["", "この PC"], ...crumbsOf(cur)];
  return `<div class="picker">
    <div class="pkh"><div><b>コアから見えるフォルダ</b><div class="small muted">${S.mode === "service" ? "サービスのユーザーから見える所" : "ログインしているユーザーから見える所"}</div></div><button class="ib" data-act="pkclose" aria-label="閉じる">×</button></div>
    <div class="pkc">${crumbs.map(([p, l], k) => `${k ? '<span class="muted">›</span>' : ""}<button class="link" data-act="pkgo" data-v="${esc(p)}">${esc(l)}</button>`).join("")}</div>
    <ul class="pkl">${kids.length ? kids.map((c) => `<li><button data-act="pkgo" data-v="${esc(cur ? joinP(cur, c) : c)}">${icon("folder")}<span>${esc(c)}</span><span class="muted">›</span></button></li>`).join("") : `<li class="muted small pkempty">中にフォルダはありません</li>`}</ul>
    ${S.mode === "service" && !cur ? `<p class="small muted">Z: のようなドライブ文字は、ログインごとの割り当てなので、サービスからは見えない（2.3）。共有フォルダは \\\\server\\share の形で選ぶ。</p>` : ""}
    <div class="pkf"><span class="mono">${esc(cur || "（場所を選ぶ）")}</span><button class="btn small primary" data-act="pkok"${cur ? "" : " disabled"}>このフォルダにする</button></div>
  </div>`;
}

function folderForm(f, i) {
  const used = S.cfg.triggers.filter((t) => t.folder === f.id);
  const pathCtl = `<div class="pathrow">${inp(B("folders", i, "path"), f.path, { mono: true, ph: "C:\\in" })}</div>
    <div class="pcheck" id="pcheck-${i}">${pathCheck(f.path)}</div>
    <div class="pbtns"><button class="btn small" data-act="pick" data-v="${i}">${icon("folder")}画面で選ぶ</button>${
      S.mode === "desktop" ? `<button class="btn small" data-act="explorer" data-v="${i}">${icon("window")}エクスプローラで選ぶ</button>` : `<span class="small muted">サービスで動いているので、エクスプローラは開けない</span>`
    }</div>
    ${S.picker && S.picker.idx === i ? pickerView() : ""}`;
  return `${formHead("folders", i, f, "監視フォルダ", !used.length, `トリガー${used.map((t) => `「${esc(t.name || t.id)}」`).join("")}が指しているので、消せない（案）`)}
  <div id="ferr">${msgsView(check("folders", f))}</div>
  <section class="fsec"><h3>基本</h3>
    ${field("名前", inp(B("folders", i, "name"), f.name, { ph: f.id }), "日本語でよい。Web UI やランログに出す。いつ変えてもよい（4.3）")}
    ${idField("folders", i, f)}
    ${field("パス", pathCtl, "コアから見えるフォルダを書く。Windows のサービスからは、ドライブ文字（Z: など）が見えない。共有フォルダは \\\\server\\share の形で書く（2.3）")}
    ${field("見る深さ", inp(B("folders", i, "depth"), f.depth, { type: "number", t: "num", ph: "制限なし", cls: "short" }), "すぐ下を 1 段目と数える。これより深い所の変化は検知しない。空にすると制限なし（4.3）")}
  </section>
  <section class="fsec"><h3>監視フォルダの条件</h3><p class="fdesc">外れたものは検知しない。検知ログにも残らない（5.1）</p>
    ${field("", tog(B("folders", i, "hidden"), f.hidden, "隠しファイルも含む"), "Windows では隠し属性、Linux では名前が . で始まるもの（5.1）")}
    ${field("検知するもの", seg(`dt-${i}`, B("folders", i, "detect"), f.detect, [["both", "ファイルとフォルダ"], ["file", "ファイルだけ"], ["folder", "フォルダだけ"]]))}
    ${field("外す名前", `<textarea rows="3" class="mono" ${B("folders", i, "exclude")} data-t="lines" aria-label="外す名前">${esc(f.exclude.join("\n"))}</textarea>`, "1 行に 1 つ、glob で書く（*.tmp、~* など）。外したフォルダは、中もすべて外す（5.1）")}
  </section>
  <section class="fsec"><h3>止まっている間と、覚えている中身</h3><p class="fdesc">どちらも必ず選ぶ（5.2）</p>
    ${field("止まっている間に起きたこと", rcards(`ws-${i}`, B("folders", i, "whileStopped"), f.whileStopped, [
      ["rescan", "再スキャンする", "起動したときに中を読み、覚えている中身との違いを変化として扱う。止まっている間の名前変更・移動は、削除と作成に見える"],
      ["remember", "覚えるだけ", "起動したあとの変化だけを扱う。起動したときに中を読んで覚え直すが、違いは変化にしない"],
    ]))}
    ${field("覚えている中身が無いとき", rcards(`nm-${i}`, B("folders", i, "noMemory"), f.noMemory, [
      ["remember", "覚えるだけ", "初めて見張るとき、今あるファイルは覚えるだけで、発火しない"],
      ["all", "すべて作成として扱う", "今あるファイルをすべて作成として扱う。トリガーに合えばランが走る。たまったファイルを片付けたいときに"],
    ]), "初めて起動したとき、ここに新しく足したとき（5.2）")}
  </section>
  <section class="fsec"><h3>時間</h3>
    ${field("デバウンス時間", `${inp(B("folders", i, "debounce"), f.debounce, { type: "number", t: "num", ph: "既定", cls: "short" })} 秒`, "同じパスの OS イベントを、この時間待ってまとめる。0 にすると、まとめない（5.4）。既定の値は宿題")}
  </section>
  <section class="fsec"><h3>デスクトップ通知</h3>
    ${field("", tog(B("folders", i, "toastOnDetect"), f.toastOnDetect, "変化を検知したときに知らせる"), "例：「受信箱に report.pdf が来ました」。たくさん来たら、まとめて出す（8 章）")}
  </section>`;
}

function triggerForm(t, i) {
  const fopts = S.cfg.folders.map((f) => `<option value="${esc(f.id)}"${t.folder === f.id ? " selected" : ""}>${esc(f.name || f.id)}（${esc(f.id)}）</option>`).join("");
  const ft = t.filter ? t.filter.type : "none";
  const addable = S.cfg.jobs.filter((j) => !t.jobs.includes(j.id));
  return `${formHead("triggers", i, t, "トリガー", true)}
  <div id="ferr">${msgsView(check("triggers", t))}</div>
  <section class="fsec"><h3>基本</h3>
    ${field("名前", inp(B("triggers", i, "name"), t.name, { ph: t.id }), "Web UI やランログに出す。いつ変えてもよい")}
    ${idField("triggers", i, t)}
    ${field("監視フォルダ", `<select ${B("triggers", i, "folder")}>${fopts}</select>`, "1 つのトリガーが見張る監視フォルダは 1 つだけ（4.3）")}
  </section>
  <section class="fsec"><h3>何に反応するか</h3>
    ${field("変化の種類", `<div class="chips">${CHG_ORDER.map((c) => `<label class="chip c-${c} chkchip"><input type="checkbox" data-arr="triggers|${i}|changes" value="${c}"${t.changes.includes(c) ? " checked" : ""}><span class="g">${GLYPH[c]}</span>${L.change[c]}</label>`).join("")}</div>`, "ダウンロードやスキャンを待つなら、作成と名前変更の両方を選ぶ（5.5）。名前も入っているフォルダも変わったときは、名前変更にも移動にも反応する")}
    ${field("反応する対象", seg(`tg-${i}`, B("triggers", i, "target"), t.target, [["file", "ファイル"], ["folder", "フォルダ"], ["both", "両方"]]))}
    ${field("反応する深さ", inp(B("triggers", i, "depth"), t.depth, { type: "number", t: "num", ph: "見る深さまで", cls: "short" }), "空にすると、監視フォルダの見る深さまで全部。名前変更・移動では、変更後のパスに当てる（5.8）")}
  </section>
  <section class="fsec"><h3>フィルタ</h3><p class="fdesc">外れた変化も検知はする（検知ログに残る）が、発火しない（5.1）</p>
    ${field("書き方", seg(`ft-${i}`, `data-ftype="${i}"`, ft, [["none", "なし"], ["glob", "glob"], ["regex", "正規表現"]]))}
    ${
      t.filter
        ? field("パターン", inp(B("triggers", i, "filter.pattern"), t.filter.pattern, { mono: true }), t.filter.type === "glob" ? "名前全体に当てる。{*.jpg,*.png} のように並べられる（4.3）" : "名前の一部に合えばよい。名前全体に合わせるときは ^ と $ を書く（4.3）") +
          field("試す", `<div class="tester"><textarea rows="4" class="mono" data-test="${i}" aria-label="試す名前">${esc(testText(t))}</textarea><div id="ftest">${filterTest(t)}</div></div>`, "1 行に 1 つ名前を書くと、合うかがすぐ分かる。大文字と小文字は OS に合わせる（この見本は Windows なので区別しない。4.3）")
        : ""
    }
  </section>
  <section class="fsec"><h3>走らせるジョブ</h3><p class="fdesc">ジョブごとにランが 1 つずつでき、依存を書かなければ並行に走る（6.1）</p>
    ${field("ジョブ", `<div class="jchips">${t.jobs.map((j) => `<span class="jchip"><b>${esc(jName(j))}</b><code class="id">${esc(j)}</code><button class="x" data-act="rmjob" data-v="${i}|${esc(j)}" aria-label="外す">×</button></span>`).join("")}${addable.length ? `<select data-addjob="${i}" aria-label="ジョブを足す"><option value="">＋ ジョブを足す</option>${addable.map((j) => `<option value="${esc(j.id)}">${esc(j.name || j.id)}（${esc(j.id)}）</option>`).join("")}</select>` : ""}</div>`)}
    ${
      t.jobs.length > 1
        ? field("依存", `<div class="needs">${t.jobs.map((j) => `<div class="need"><span class="nl"><b>${esc(jName(j))}</b> は、次が成功してから始める：</span><span class="chips">${t.jobs.filter((d) => d !== j).map((d) => `<button class="chip" aria-pressed="${(t.needs[j] || []).includes(d)}" data-act="need" data-v="${i}|${esc(j)}|${esc(d)}">${esc(jName(d))}</button>`).join("")}</span></div>`).join("")}</div>`, "依存先が 1 つでも成功しなかったら、そのジョブは始めない（6.1）")
        : ""
    }
    ${field("走る順", `<div id="tlanes">${lanesView(t)}</div>`)}
  </section>
  <section class="fsec"><h3>デスクトップ通知</h3><p class="fdesc">ランが成功・失敗したときに知らせるかを、トリガーとジョブのどちらに書くかは宿題（宿題一覧 8）</p></section>`;
}

function lanesView(t) {
  if (!t.jobs.length) return `<p class="muted small">ジョブがまだありません</p>`;
  const lv = {};
  const visiting = new Set();
  const level = (j) => {
    if (lv[j] != null) return lv[j];
    if (visiting.has(j)) return 0;
    visiting.add(j);
    const deps = (t.needs[j] || []).filter((d) => t.jobs.includes(d));
    const v = deps.length ? 1 + Math.max(...deps.map(level)) : 0;
    visiting.delete(j);
    return (lv[j] = v);
  };
  t.jobs.forEach(level);
  const max = Math.max(...t.jobs.map((j) => lv[j]));
  const cols = [];
  for (let k = 0; k <= max; k++) cols.push(t.jobs.filter((j) => lv[j] === k));
  return `<div class="lanes">${cols
    .map(
      (c, k) => `${k ? '<span class="larrow" aria-hidden="true">→</span>' : ""}<div class="lane"><span class="lh">${k === 0 ? "発火したら、すぐ並行に" : "そのあと"}</span>${c
        .map((j) => {
          const deps = (t.needs[j] || []).filter((d) => t.jobs.includes(d));
          return `<div class="lbox"><b>${esc(jName(j))}</b>${deps.length ? `<small>${deps.map((d) => esc(jName(d))).join("・")} が成功したら</small>` : ""}</div>`;
        })
        .join("")}</div>`
    )
    .join("")}</div>`;
}

const testText = (t) => S.tests[t.id] ?? DEFAULT_TESTS[t.id] ?? "";

function globToRe(glob) {
  let re = "";
  let brace = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") re += "[^\\\\/]*";
    else if (c === "?") re += "[^\\\\/]";
    else if (c === "{") {
      re += "(?:";
      brace++;
    } else if (c === "}" && brace) {
      re += ")";
      brace--;
    } else if (c === "," && brace) re += "|";
    else if (c === "[") {
      const j = glob.indexOf("]", i + 1);
      if (j > i) {
        let cls = glob.slice(i + 1, j);
        if (cls[0] === "!") cls = "^" + cls.slice(1);
        re += "[" + cls.replace(/\\/g, "\\\\") + "]";
        i = j;
      } else re += "\\[";
    } else re += c.replace(/[.+^$()|\\\]]/g, "\\$&");
  }
  // Windows に合わせて、大文字と小文字を区別しない
  return new RegExp("^" + re + "$", "i");
}

function filterTest(t) {
  if (!t.filter) return "";
  const names = testText(t).split("\n").map((s) => s.trim()).filter(Boolean);
  if (!names.length) return `<p class="muted small">名前を書くと、ここに結果が出る</p>`;
  if (!t.filter.pattern) return `<p class="muted small">パターンを書くと、ここに結果が出る</p>`;
  let re;
  try {
    re = t.filter.type === "glob" ? globToRe(t.filter.pattern) : new RegExp(t.filter.pattern, "i");
  } catch {
    return `<p class="m-err small">パターンが読めない</p>`;
  }
  return `<ul class="tres">${names
    .map((n) => {
      const base = n.split(/[\\/]/).pop();
      const ok = re.test(base);
      return `<li class="${ok ? "ok" : "ng"}"><span class="tm">${ok ? "合う" : "合わない"}</span><span class="mono">${esc(n)}</span>${base !== n ? `<span class="muted small">（名前 ${esc(base)} に当てる）</span>` : ""}</li>`;
    })
    .join("")}</ul>`;
}

function jobForm(j, i) {
  const used = S.cfg.triggers.filter((t) => t.jobs.includes(j.id));
  const ex = exampleVars(j);
  return `${formHead("jobs", i, j, "ジョブ", !used.length, `トリガー${used.map((t) => `「${esc(t.name || t.id)}」`).join("")}が指しているので、消せない（案）`)}
  <div id="ferr">${msgsView(check("jobs", j))}</div>
  <section class="fsec"><h3>基本</h3>
    ${field("名前", inp(B("jobs", i, "name"), j.name, { ph: j.id }), "Web UI やランログに出す。いつ変えてもよい")}
    ${idField("jobs", i, j)}
    ${field("使っているトリガー", used.length ? used.map((t) => `<button class="link" data-act="goto" data-v="triggers|${esc(t.id)}">${esc(t.name || t.id)}</button>`).join("・") : `<span class="muted">なし（どのトリガーからも走らない）</span>`, "1 つのジョブを、複数のトリガーから使い回せる（4.3）")}
  </section>
  <section class="fsec"><h3>ステップ</h3><p class="fdesc">上から順に走る（逐次）。1 つ失敗したら、残りは走らない（6.1）</p>
    <div class="phbar">
      <div class="small muted">プレースホルダ（押すと、選んでいる欄に入る）</div>
      <div class="chips">${PH_LIST.map((p) => `<button class="chip ph" data-act="ph" data-v="${esc(p)}" title="${esc(PH_DESC[p.slice(2, -1)] || "環境変数の値")}">${esc(p)}</button>`).join("")}</div>
      <label class="exp"><span class="small muted">例の対象パス</span><input class="mono" data-ex="${esc(j.id)}" value="${esc(ex.path)}" aria-label="例の対象パス"></label>
      <div class="small muted">日時は、変化を検知したのが 2026-10-25 23:59:10 として置き換える（4.4 の例）</div>
    </div>
    <ol class="steps">${j.steps.map((s, k) => stepCard(j, i, s, k)).join("")}</ol>
    <div class="addstep"><select data-addstep="${i}" aria-label="ステップを足す"><option value="">＋ ステップを足す</option><option value="exec">プロセス実行</option><option value="copy">コピー</option><option value="move">移動</option><option value="delete">削除</option></select></div>
  </section>
  <section class="fsec"><h3>走り方</h3>
    ${field("ジョブごとの上限", inp(B("jobs", i, "limit"), j.limit, { type: "number", t: "num", ph: "なし", cls: "short" }), "同時に 2 つ動くと壊れるジョブに書く（同じ CSV に追記する、など。6.1）。空にすると上限なし")}
    ${field("時間の上限", `${inp(B("jobs", i, "timeout"), j.timeout, { type: "number", t: "num", ph: "なし", cls: "short" })} 秒`, "ランが始まってから数える。超えたら失敗（6.4）。空にすると上限なし")}
    ${field("中断したとき", tog(B("jobs", i, "retry"), j.retry, "次に起動したときに、自動でやり直す"), "何度やっても同じ結果になるジョブ（変換、サムネイル）向け。追記や送信のジョブは、やり直すと困る（6.6）")}
  </section>`;
}

function stepCard(j, i, s, k) {
  const b = (f) => `data-b="jobs|${i}|steps.${k}.${f}"`;
  const ctrl = `<span class="stepbtns"><button class="ib" data-act="stepmv" data-v="${i}|${k}|-1"${k === 0 ? " disabled" : ""} aria-label="上へ">↑</button><button class="ib" data-act="stepmv" data-v="${i}|${k}|1"${k === j.steps.length - 1 ? " disabled" : ""} aria-label="下へ">↓</button><button class="ib" data-act="rmstep" data-v="${i}|${k}" aria-label="このステップを消す">×</button></span>`;
  let body = "";
  if (s.type === "exec") {
    body =
      field("プログラム", `<input class="mono" data-ph ${b("program")} value="${esc(s.program)}" placeholder="magick、C:\\tools\\a.bat など">`, "フルパスでも、PATH から探す名前でもよい。常駐すると、PATH がターミナルと違うことがある（4.4）") +
      field("引数", `<div class="args">${s.args.map((a, n) => `<div class="arg"><span class="an">${n + 1}</span><input class="mono" data-ph ${b(`args.${n}`)} value="${esc(a)}" aria-label="引数 ${n + 1}"><button class="ib" data-act="rmarg" data-v="${i}|${k}|${n}" aria-label="引数を消す">×</button></div>`).join("")}<button class="btn small ghost" data-act="addarg" data-v="${i}|${k}">＋ 引数を足す</button></div>`, "1 つの欄が 1 つの引数。シェルを通さないので、空白があっても引用しなくてよい（1.2）") +
      field("成功とみなす終了コード", `<input class="mono short" ${b("okCodes")} value="${esc(s.okCodes)}">`, "既定は 0 だけ。robocopy は 0-7（6.3）") +
      field("ステップの時間の上限", `<input type="number" min="0" class="short" data-t="num" ${b("timeout")} value="${s.timeout ?? ""}" placeholder="なし"> 秒`);
  } else if (s.type === "copy" || s.type === "move") {
    body =
      field("行き先", `<input class="mono" data-ph ${b("dest")} value="${esc(s.dest)}">`, s.type === "copy" ? "対象パスを、ここへコピーする" : "対象パスを、ここへ移す。同じフォルダの中の名前の変更も、移動でできる（4.4）") +
      field("", `${tog(b("mkdir"), s.mkdir, "行き先のフォルダが無ければ作る")}${tog(b("overwrite"), s.overwrite, "同じ名前があったら上書きする")}`, "上書きしないときに同じ名前があると、そのステップの失敗になる（4.4）");
  } else {
    body = `<p class="m-warn small">${icon("alert")}<span>対象パスを消す。ごみ箱には入れず、すぐ消す。消えてほしくないときは、移動で退避用のフォルダへ移す（4.4）</span></p>`;
  }
  return `<li class="stepc st-${s.type}"><div class="sh"><span class="sno">${k + 1}</span><b>${L.step[s.type]}</b>${ctrl}</div>${body}<div class="pv" id="pv-${k}">${stepPreview(j, s)}</div></li>`;
}

function exampleVars(j) {
  const trig = S.cfg.triggers.find((t) => t.jobs.includes(j.id));
  const folder = trig && S.cfg.folders.find((f) => f.id === trig.folder);
  const root = (folder ? folder.path : "C:\\in").replace(/\\+$/, "");
  const path = S.examples[j.id] ?? `${root}\\${SAMPLE[folder?.id] || "cat.jpg"}`;
  const k = path.lastIndexOf("\\");
  const name = path.slice(k + 1);
  const dot = name.lastIndexOf(".");
  return {
    path,
    dir: k >= 0 ? path.slice(0, k) : "",
    name,
    stem: dot > 0 ? name.slice(0, dot) : name,
    ext: dot > 0 ? name.slice(dot + 1) : "",
    rel: path.toLowerCase().startsWith(root.toLowerCase() + "\\") ? path.slice(root.length + 1) : name,
    old_path: "",
    date: "2026-10-25",
    time: "23-59-10",
  };
}

function expandSegs(str, v) {
  const segs = [];
  const re = /\$\{([^}]*)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(str))) {
    if (m.index > last) segs.push({ t: str.slice(last, m.index) });
    const key = m[1];
    if (Object.prototype.hasOwnProperty.call(v, key)) segs.push({ t: v[key], ph: true });
    else if (/^env:[A-Za-z_][A-Za-z0-9_]*$/.test(key)) segs.push({ t: `‹${key.slice(4)} の値›`, ph: true });
    else segs.push({ t: m[0], bad: true });
    last = re.lastIndex;
  }
  if (last < str.length) segs.push({ t: str.slice(last) });
  return segs;
}

function expandHtml(str, v, quote = false) {
  const segs = expandSegs(str, v);
  const plain = segs.map((s) => s.t).join("");
  const html = segs.map((s) => (s.ph ? `<mark class="phv">${esc(s.t)}</mark>` : s.bad ? `<mark class="phbad">${esc(s.t)}</mark>` : esc(s.t))).join("");
  if (quote && (plain === "" || /\s/.test(plain))) return `"${html}"`;
  return html;
}

function stepPreview(j, s) {
  const v = exampleVars(j);
  if (s.type === "exec") return `<span class="pvl">例</span><code class="cmd">${[s.program, ...s.args].map((a) => expandHtml(a, v, true)).join(" ")}</code>`;
  if (s.type === "delete") return `<span class="pvl">例</span><code class="cmd">${esc(v.path)} を消す</code>`;
  return `<span class="pvl">例</span><code class="cmd">${esc(v.path)} → ${expandHtml(s.dest, v)}</code>`;
}

function globalForm(locked) {
  const g = S.cfg.global;
  return `<fieldset class="form solo"${locked ? " disabled" : ""}>
    <p class="help">全体の設定のキー名は、まだ決まっていない（宿題一覧 9）。</p>
    <section class="fsec"><h3>同時実行数</h3>${field("全体の上限", inp(B("global", 0, "maxConcurrency"), g.maxConcurrency, { type: "number", t: "num", cls: "short" }), "全部のジョブを合わせて、同時に走るランの数の上限。一度に大量のファイルが来たとき、PC を守る（6.1）。見本では、待つ様子を見せるために 3 にしている。既定の値は宿題（4.2）")}</section>
    <section class="fsec"><h3>止めるとき</h3>${field("猶予", `${inp(B("global", 0, "grace"), g.grace, { type: "number", t: "num", cls: "short" })} 秒`, "走っているランが終わるのを待つ時間。過ぎたら中断（2.5）。Windows のサービスは、ふつう数秒〜20 秒で OS に止められる")}</section>
    <section class="fsec"><h3>出力のファイル</h3>${field("標準出力の行数", `${inp(B("global", 0, "stdoutLines"), g.stdoutLines, { type: "number", t: "num", cls: "short" })} 行`, "成功しなかったランで、出力のファイルに残す標準出力の最後の行数。書かなければ 50 行（仮決め。7.1）")}</section>
    <section class="fsec"><h3>Web UI</h3>${field("待ち受け", `<code>${esc(MOCK.webAddress)}</code>`, "既定は、この PC からの接続だけ。127.0.0.1 では HTTP も許す（3.1）。ポート番号を設定で変えられるかは宿題（宿題一覧 3）")}</section>
  </fieldset>`;
}

/* ---------- 設定の確かめ ---------- */

function reach(t, from, to, seen = new Set()) {
  // from が、さかのぼって to に依存しているか
  for (const d of (t.needs[from] || []).filter((x) => t.jobs.includes(x))) {
    if (d === to) return true;
    if (!seen.has(d)) {
      seen.add(d);
      if (reach(t, d, to, seen)) return true;
    }
  }
  return false;
}

function unknownPh(strs) {
  const out = [];
  for (const s of strs) {
    for (const m of String(s).matchAll(/\$\{([^}]*)\}/g)) {
      const k = m[1];
      if (!KNOWN_PH.includes(k) && !/^env:[A-Za-z_][A-Za-z0-9_]*$/.test(k)) out.push(m[0]);
    }
  }
  return out;
}

function shellCode(s) {
  const prog = baseName(s.program).toLowerCase().replace(/\.exe$/, "");
  if (!["sh", "bash", "cmd", "powershell", "pwsh"].includes(prog)) return false;
  const k = s.args.findIndex((a) => ["-c", "/c", "-command"].includes(a.toLowerCase()));
  return k >= 0 && s.args.slice(k + 1).some((a) => RUN_PH.test(a));
}

function check(kind, x) {
  const E = [];
  const W = [];
  if (!/^[A-Za-z0-9_-]+$/.test(x.id)) E.push("ID に使えるのは、英数字と - _ だけ");
  else if (S.cfg[kind].filter((y) => y.id === x.id).length > 1) E.push(`ID「${x.id}」が、ほかの${KIND_LABEL[kind]}と重なっている`);
  if (kind === "folders") {
    if (!x.path.trim()) E.push("パスを書く");
    if (!x.whileStopped) E.push("止まっている間に起きたことの扱いを選ぶ（必ず書く。5.2）");
    if (!x.noMemory) E.push("覚えている中身が無いときの扱いを選ぶ（必ず書く。5.2）");
  }
  if (kind === "triggers") {
    if (!S.cfg.folders.some((f) => f.id === x.folder)) E.push("監視フォルダを選ぶ");
    if (!x.changes.length) E.push("変化の種類を 1 つ以上選ぶ");
    if (!x.jobs.length) E.push("走らせるジョブを 1 つ以上選ぶ");
    if (x.filter) {
      if (!x.filter.pattern) E.push("フィルタのパターンを書く（フィルタが要らなければ「なし」）");
      else if (x.filter.type === "regex") {
        try {
          new RegExp(x.filter.pattern);
        } catch (e) {
          E.push("正規表現が読めない：" + e.message);
        }
      }
    }
    if (x.jobs.some((j) => reach(x, j, j))) E.push("依存が輪になっている");
    // 移動・削除のステップを持つジョブが、依存なしで並行（6.1）
    for (const a of x.jobs) {
      const job = S.cfg.jobs.find((j) => j.id === a);
      if (!job || !job.steps.some((s) => s.type === "move" || s.type === "delete")) continue;
      const others = x.jobs.filter((b) => b !== a && !reach(x, a, b) && !reach(x, b, a));
      if (others.length) W.push(`「${jName(a)}」は移動・削除のステップを持ち、${others.map((b) => `「${jName(b)}」`).join("")}と依存なしで並行に走る。先に動かしたり消したりすると、もう片方が困る（6.1。読み込みのときに警告する）`);
    }
  }
  if (kind === "jobs") {
    if (!x.steps.length) E.push("ステップを 1 つ以上足す");
    x.steps.forEach((s, k) => {
      const no = `${k + 1} 番目のステップ`;
      if (s.type === "exec") {
        if (!s.program.trim()) E.push(`${no}：プログラムを書く`);
        const unk = unknownPh([s.program, ...s.args]);
        if (unk.length) E.push(`${no}：知らないプレースホルダ ${unk.join("、")}`);
        if (RUN_PH.test(s.program)) W.push(`${no}：プログラムの欄に、ランのプレースホルダがある。監視フォルダに書き込める人なら誰でも、Foxonar の権限でプログラムを実行できるようになる（警告するのは宿題一覧 4.3 の案）`);
        if (shellCode(s)) W.push(`${no}：シェルにコードとして文字列を渡すオプションの引数に、プレースホルダがある（警告するのは宿題一覧 4.3 の案）`);
        if (s.okCodes.trim() && !/^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/.test(s.okCodes)) E.push(`${no}：成功とみなす終了コードは「0」「0-7」「0, 3」のように書く（書き方は見本の案）`);
      } else if (s.type !== "delete") {
        if (!s.dest.trim()) E.push(`${no}：行き先を書く`);
        const unk = unknownPh([s.dest]);
        if (unk.length) E.push(`${no}：知らないプレースホルダ ${unk.join("、")}`);
      }
    });
  }
  return { E, W };
}

/* ---------- つながりの図 ---------- */

function mapTab() {
  const c = S.cfg;
  return `<div class="toolbar">${vseg(
    [
      ["map", "図", "tree"],
      ["table", "表", "lines"],
    ],
    S.cmap.view,
    "cmapview"
  )}${searchBox("cmap.q", S.cmap.q, "名前か ID で探す")}<span class="small muted">監視フォルダ ${c.folders.length}・トリガー ${c.triggers.length}・ジョブ ${c.jobs.length}</span></div>
  <div id="cmapbody">${cmapBody()}</div>`;
}
const cmapBody = () => (S.cmap.view === "map" ? mapView() : tableView());

// 探す言葉に合うもの。トリガーか監視フォルダが合えば、そのジョブも出す。ジョブが合えば、それを使うトリガーと監視フォルダも出す
function mapSets() {
  const c = S.cfg;
  const q = S.cmap.q.trim().toLowerCase();
  if (!q) return null;
  const hit = (x) => !!x && ((x.name || "").toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
  const F = new Set(c.folders.filter(hit).map((f) => f.id));
  const T = new Set();
  const J = new Set(c.jobs.filter(hit).map((j) => j.id));
  for (const t of c.triggers) {
    const f = c.folders.find((x) => x.id === t.folder);
    const js = t.jobs.map((id) => c.jobs.find((x) => x.id === id)).filter(Boolean);
    if (hit(t) || hit(f)) {
      T.add(t.id);
      F.add(t.folder);
      js.forEach((j) => J.add(j.id));
    } else if (js.some(hit)) {
      T.add(t.id);
      F.add(t.folder);
    }
  }
  return { F, T, J };
}

function mapView() {
  const c = S.cfg;
  const sets = mapSets();
  const show = (set, x) => !sets || set.has(x.id);
  const card = (k, tab, x, inner) => `<button class="mnode" data-node="${k}:${esc(x.id)}" data-act="goto" data-v="${tab}|${esc(x.id)}">${inner}</button>`;
  const depLine = (t) => {
    const deps = t.jobs.flatMap((j) => (t.needs[j] || []).map((d) => `${jName(d)} → ${jName(j)}`));
    return deps.length ? `<span class="small dep">依存：${deps.map(esc).join("、")}</span>` : "";
  };
  const fcol = c.folders.filter((f) => show(sets?.F, f)).map((f) => card("f", "folders", f, `<b>${esc(f.name || f.id)}</b><code class="id">${esc(f.id)}</code><span class="mono small">${esc(f.path)}</span>`)).join("");
  const tcol = c.triggers
    .filter((t) => show(sets?.T, t))
    .map((t) => card("t", "triggers", t, `<b>${esc(t.name || t.id)}</b><code class="id">${esc(t.id)}</code><span class="small">${t.changes.map((x) => L.change[x]).join("・") || "—"}${t.filter ? `・<span class="mono">${esc(t.filter.pattern)}</span>` : ""}</span>${depLine(t)}`))
    .join("");
  const jcol = c.jobs.filter((j) => show(sets?.J, j)).map((j) => card("j", "jobs", j, `<b>${esc(j.name || j.id)}</b><code class="id">${esc(j.id)}</code><span class="small">${j.steps.map((s) => L.step[s.type]).join(" → ") || "—"}</span>`)).join("");
  if (!fcol && !tcol && !jcol) return `<p class="empty">合うものがありません</p>`;
  return `<div class="map" id="map"><svg class="mlines" id="mlines" aria-hidden="true"></svg>
    <div class="mcol"><h3>監視フォルダ</h3>${fcol}</div>
    <div class="mcol"><h3>トリガー</h3>${tcol}</div>
    <div class="mcol"><h3>ジョブ</h3>${jcol}</div>
  </div>
  <p class="tfoot">線は「ID で指す」。カードにマウスを乗せると、つながりが光る。押すと、そのフォームを開く。数が多いときは、表にするか、探す欄で絞る</p>`;
}

// 表：トリガー 1 つを 1 行にする。並びは定義順（同じパスに合ったとき、この順に発火する。6.1）
function tableView() {
  const c = S.cfg;
  const sets = mapSets();
  const ts = c.triggers.filter((t) => !sets || sets.T.has(t.id));
  const rows = ts
    .map((t) => {
      const deps = t.jobs.flatMap((j) => (t.needs[j] || []).map((d) => `${jName(d)} → ${jName(j)}`));
      return `<tr>
      <td><button class="link" data-act="goto" data-v="folders|${esc(t.folder)}">${esc(fNameCfg(t.folder))}</button><div class="small muted mono">${esc(c.folders.find((f) => f.id === t.folder)?.path || "")}</div></td>
      <td><button class="link" data-act="goto" data-v="triggers|${esc(t.id)}">${esc(t.name || t.id)}</button> <code class="id">${esc(t.id)}</code></td>
      <td class="small">${t.changes.map((x) => L.change[x]).join("・") || "—"}${t.filter ? `<div class="mono">${esc(t.filter.pattern)}</div>` : ""}</td>
      <td><div class="jlist">${t.jobs.map((j) => `<button class="chip jn" data-act="goto" data-v="jobs|${esc(j)}">${esc(jName(j))}</button>`).join("")}</div>${deps.length ? `<div class="small dep">依存：${deps.map(esc).join("、")}</div>` : ""}</td></tr>`;
    })
    .join("");
  const noTrig = c.folders.filter((f) => !c.triggers.some((t) => t.folder === f.id) && (!sets || sets.F.has(f.id)));
  const unused = c.jobs.filter((j) => !c.triggers.some((t) => t.jobs.includes(j.id)) && (!sets || sets.J.has(j.id)));
  const chips = (xs, tab) => xs.map((x) => `<button class="chip jn" data-act="goto" data-v="${tab}|${esc(x.id)}">${esc(x.name || x.id)}</button>`).join("");
  return (
    tableWrap(`<table class="tbl ctbl"><thead><tr><th>監視フォルダ</th><th>トリガー（定義順）</th><th>変化の種類・フィルタ</th><th>走らせるジョブ</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="empty">合うトリガーがありません</td></tr>`}</tbody></table>`) +
    (noTrig.length ? `<div class="cextra"><b class="small">トリガーの無い監視フォルダ（検知ログだけ残す）</b><div class="jlist">${chips(noTrig, "folders")}</div></div>` : "") +
    (unused.length ? `<div class="cextra"><b class="small">どのトリガーからも走らないジョブ</b><div class="jlist">${chips(unused, "jobs")}</div></div>` : "")
  );
}

function drawMap() {
  const map = $("#map");
  const svg = $("#mlines");
  if (!map || !svg) return;
  const R = map.getBoundingClientRect();
  svg.setAttribute("width", R.width);
  svg.setAttribute("height", R.height);
  svg.setAttribute("viewBox", `0 0 ${R.width} ${R.height}`);
  const pos = (key) => {
    const el = map.querySelector(`[data-node="${CSS.escape(key)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { l: r.left - R.left, r: r.right - R.left, y: r.top - R.top + r.height / 2 };
  };
  const edges = [];
  S.cfg.triggers.forEach((t) => {
    edges.push([`f:${t.folder}`, `t:${t.id}`]);
    t.jobs.forEach((j) => edges.push([`t:${t.id}`, `j:${j}`]));
  });
  svg.innerHTML = edges
    .map(([a, b]) => {
      const p = pos(a);
      const q = pos(b);
      if (!p || !q) return "";
      const x1 = p.r;
      const x2 = q.l;
      const dx = Math.max(24, (x2 - x1) / 2);
      return `<path class="ml" data-a="${esc(a)}" data-b="${esc(b)}" d="M${x1},${p.y} C${x1 + dx},${p.y} ${x2 - dx},${q.y} ${x2},${q.y}"/>`;
    })
    .join("");
  if (S.hl) mapHL(S.hl);
}

function mapHL(key) {
  const map = $("#map");
  if (!map) return;
  if (!key) {
    map.classList.remove("hl");
    $$(".on", map).forEach((e) => e.classList.remove("on"));
    return;
  }
  const k = key[0];
  const id = key.slice(2);
  const on = new Set([key]);
  const edges = new Set();
  const addE = (a, b) => {
    on.add(a);
    on.add(b);
    edges.add(a + ">" + b);
  };
  const T = S.cfg.triggers;
  if (k === "f") T.filter((t) => t.folder === id).forEach((t) => { addE(key, `t:${t.id}`); t.jobs.forEach((j) => addE(`t:${t.id}`, `j:${j}`)); });
  if (k === "t") {
    const t = T.find((x) => x.id === id);
    if (t) {
      addE(`f:${t.folder}`, key);
      t.jobs.forEach((j) => addE(key, `j:${j}`));
    }
  }
  if (k === "j") T.filter((t) => t.jobs.includes(id)).forEach((t) => { addE(`f:${t.folder}`, `t:${t.id}`); addE(`t:${t.id}`, key); });
  map.classList.add("hl");
  $$("[data-node]", map).forEach((e) => e.classList.toggle("on", on.has(e.dataset.node)));
  $$(".ml", map).forEach((e) => e.classList.toggle("on", edges.has(e.dataset.a + ">" + e.dataset.b)));
}

/* ---------- 保存と差分 ---------- */

// TOML の文字列。\ を含むときは、9.6 のとおり '…' で書く
function q(s) {
  s = String(s ?? "");
  if (/\\/.test(s) && !/['\n]/.test(s)) return `'${s}'`;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
const lit = (s) => (/['\n]/.test(s) ? q(s) : `'${s}'`);
const arr = (a, f = q) => `[${a.map(f).join(", ")}]`;
const TODO_KEY = "（キー名は未定）";

function tomlMain(c) {
  const L2 = ["# 全体の設定" + TODO_KEY, `# 全体の上限：${c.global.maxConcurrency ?? "（書いていない）"}`, `# 止めるときの猶予：${c.global.grace ?? "（書いていない）"} 秒`, `# 標準出力の行数：${c.global.stdoutLines ?? "（書いていない）"}`];
  for (const f of c.folders) {
    L2.push("", "[[folder]]", `id = ${q(f.id)}`);
    if (f.name) L2.push(`name = ${q(f.name)}`);
    L2.push(`path = ${q(f.path)}`);
    L2.push(`# 見る深さ：${f.depth ?? "制限なし"}${TODO_KEY}`);
    L2.push(`# 隠しファイル：${f.hidden ? "含む" : "含まない"}${TODO_KEY}`);
    L2.push(`# 検知するもの：${DETECT[f.detect]}${TODO_KEY}`);
    L2.push(`# 外す名前：${f.exclude.length ? f.exclude.join(", ") : "なし"}${TODO_KEY}`);
    L2.push(`# デバウンス時間：${f.debounce ?? "既定"} 秒${TODO_KEY}`);
    L2.push(`# 止まっている間：${WS[f.whileStopped] || "（選んでいない）"}${TODO_KEY}`);
    L2.push(`# 覚えている中身が無いとき：${NM[f.noMemory] || "（選んでいない）"}${TODO_KEY}`);
    L2.push(`# 検知したときのデスクトップ通知：${f.toastOnDetect ? "出す" : "出さない"}${TODO_KEY}`);
  }
  for (const t of c.triggers) {
    L2.push("", "[[trigger]]", `id = ${q(t.id)}`);
    if (t.name) L2.push(`name = ${q(t.name)}`);
    L2.push(`folder = ${q(t.folder)}`);
    L2.push(`changes = ${arr(t.changes)}`);
    if (t.filter) L2.push(`filter = { ${t.filter.type} = ${q(t.filter.pattern)} }`);
    L2.push(`jobs = ${arr(t.jobs)}`);
    L2.push(`# 反応する対象：${TARGET[t.target]}${TODO_KEY}`);
    L2.push(`# 反応する深さ：${t.depth ?? "見る深さまで"}${TODO_KEY}`);
    for (const j of t.jobs) if (t.needs[j]?.length) L2.push(`# 依存：${j} は ${t.needs[j].join("・")} が成功してから${TODO_KEY}`);
  }
  return L2.join("\n") + "\n";
}

function tomlJobs(c) {
  const L2 = [];
  c.jobs.forEach((j, n) => {
    if (n) L2.push("");
    L2.push("[[job]]", `id = ${q(j.id)}`);
    if (j.name) L2.push(`name = ${q(j.name)}`);
    L2.push("steps = [");
    for (const s of j.steps) {
      if (s.type === "exec") {
        L2.push(`  { exec = ${q(s.program)}, args = ${arr(s.args, lit)} },`);
        if (s.okCodes.trim() !== "0") L2.push(`  # ↑ 成功とみなす終了コード：${s.okCodes}${TODO_KEY}`);
        if (s.timeout) L2.push(`  # ↑ 時間の上限：${s.timeout} 秒${TODO_KEY}`);
      } else if (s.type === "delete") {
        L2.push(`  # 削除：対象パス${TODO_KEY}`);
      } else {
        L2.push(`  # ${L.step[s.type]}：${s.dest}・フォルダが無ければ${s.mkdir ? "作る" : "作らない"}・同じ名前があったら${s.overwrite ? "上書きする" : "上書きしない"}${TODO_KEY}`);
      }
    }
    L2.push("]");
    L2.push(`# ジョブごとの上限：${j.limit ?? "なし"}${TODO_KEY}`);
    L2.push(`# 時間の上限：${j.timeout ? `${j.timeout} 秒` : "なし"}${TODO_KEY}`);
    L2.push(`# 中断したら、次に起動したときにやり直す：${j.retry ? "する" : "しない"}${TODO_KEY}`);
  });
  return L2.join("\n") + "\n";
}

function diffLines(a, b) {
  const A = a.split("\n");
  const Bv = b.split("\n");
  const n = A.length;
  const m = Bv.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === Bv[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === Bv[j]) {
      out.push({ t: " ", s: A[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: "-", s: A[i], a: i + 1 });
      i++;
    } else {
      out.push({ t: "+", s: Bv[j], b: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ t: "-", s: A[i], a: ++i });
  while (j < m) out.push({ t: "+", s: Bv[j], b: ++j });
  return out;
}
const changedCount = (a, b) => (a === b ? 0 : diffLines(a, b).filter((x) => x.t !== " ").length);

function saveBarView() {
  const a1 = tomlMain(S.cfgOrig);
  const b1 = tomlMain(S.cfg);
  const a2 = tomlJobs(S.cfgOrig);
  const b2 = tomlJobs(S.cfg);
  if (a1 === b1 && a2 === b2) return `<div id="savebar"></div>`;
  const errs = allErrors();
  return `<div id="savebar" class="savebar"><div class="sbt"><b>直したところがあります</b><span class="small">foxonar.toml ${changedCount(a1, b1)} 行・jobs.toml ${changedCount(a2, b2)} 行${errs ? `・<span class="errt">直すところが ${errs} つ</span>` : ""}</span></div>
    <div class="sbtn"><button class="btn ghost" data-act="revert">元に戻す</button><button class="btn primary" data-act="review"${errs ? " disabled" : ""}>保存の前に確かめる</button></div></div>`;
}

function hunks(d) {
  if (!d.some((x) => x.t !== " ")) return `<p class="empty">このファイルは変わらない</p>`;
  const keep = new Set();
  d.forEach((x, k) => {
    if (x.t !== " ") for (let m = k - 2; m <= k + 2; m++) keep.add(m);
  });
  let out = "";
  let gap = false;
  d.forEach((x, k) => {
    if (!keep.has(k)) {
      if (!gap) out += `<div class="dl gap">⋯</div>`;
      gap = true;
      return;
    }
    gap = false;
    const cls = x.t === "+" ? "dadd" : x.t === "-" ? "ddel" : "dctx";
    out += `<div class="dl ${cls}${x.s.trim().startsWith("#") ? " dcom" : ""}"><span class="ln">${x.a ?? ""}</span><span class="ln">${x.b ?? ""}</span><span class="sg">${x.t}</span><span class="tx">${esc(x.s) || " "}</span></div>`;
  });
  return out;
}

function doSave() {
  if (S.conflict) {
    S.modal = { type: "conflict" };
    renderModal();
    return;
  }
  for (const k of ["folders", "triggers", "jobs"]) S.cfg[k].forEach((x) => delete x._new);
  S.cfgOrig = clone(S.cfg);
  const t = fmtTime(nowSec());
  S.loadedAt = t;
  S.extraLog.push({ time: t, level: "info", text: "設定を読み直した（Web UI から保存した）" });
  S.modal = null;
  S.ver++;
  render();
  toast(`<b>保存しました</b>コアが読み直し、${t} から新しい設定で動いています。すでに発火したランは、発火したときの設定のまま走ります。`);
}

function addItem(kind) {
  const base = { folders: "new-folder", triggers: "new-trigger", jobs: "new-job" }[kind];
  let id = base;
  let n = 2;
  while (S.cfg[kind].some((x) => x.id === id)) id = `${base}-${n++}`;
  const x =
    kind === "folders"
      ? { _new: true, id, name: "", path: "", depth: null, hidden: false, detect: "both", exclude: [], debounce: null, whileStopped: null, noMemory: null, toastOnDetect: false }
      : kind === "triggers"
        ? { _new: true, id, name: "", folder: S.cfg.folders[0]?.id || "", changes: ["create"], target: "file", depth: null, filter: { type: "glob", pattern: "" }, jobs: [], needs: {} }
        : { _new: true, id, name: "", limit: null, timeout: null, retry: false, steps: [{ type: "exec", program: "", args: ["${path}"], okCodes: "0", timeout: null }] };
  S.cfg[kind].push(x);
  S.sel[kind] = S.cfg[kind].length - 1;
  render();
}

function renameRefs(kind, old, nw) {
  if (old === nw) return;
  if (kind === "folders") S.cfg.triggers.forEach((t) => t.folder === old && (t.folder = nw));
  if (kind === "jobs") {
    S.cfg.triggers.forEach((t) => {
      t.jobs = t.jobs.map((j) => (j === old ? nw : j));
      if (t.needs[old]) {
        t.needs[nw] = t.needs[old];
        delete t.needs[old];
      }
      for (const k in t.needs) t.needs[k] = t.needs[k].map((d) => (d === old ? nw : d));
    });
    if (S.examples[old] != null) S.examples[nw] = S.examples[old];
  }
  if (kind === "triggers" && S.tests[old] != null) S.tests[nw] = S.tests[old];
}

/* ---------- 窓（モーダル）と知らせ ---------- */

function modalWrap(inner, cls = "") {
  return `<div class="mback" data-act="mclose"></div><div class="modal ${cls}" role="dialog" aria-modal="true">${inner}</div>`;
}

function renderModal() {
  const root = $("#modal-root");
  if (!S.modal) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = { stop: stopModal, diff: diffModal, conflict: conflictModal }[S.modal.type]();
}

function stopModal() {
  const D = data();
  const running = D.runs.filter((r) => r.result === "running");
  const waiting = D.runs.filter((r) => r.result === "wait");
  return modalWrap(`<header class="mh"><h2>コアを止めますか？</h2><button class="ib" data-act="mclose" aria-label="閉じる">×</button></header>
    <ul class="bul">
      <li>新しい発火は始めません。</li>
      <li>走っているラン ${running.length} つ（${running.map((r) => esc(r.jobName)).join("・") || "なし"}）は、猶予 ${S.cfgOrig.global.grace} 秒の間だけ待ちます。終わらなければ中断になります。</li>
      <li>待っているラン ${waiting.length} つと、待ち表の ${D.pending.length} 行は、捨てずに残し、次に起動したときに続きから動きます。</li>
      <li><b>止めると、この画面も使えなくなります。</b>Web UI はコアの中にあるので、ここからもう一度起動することはできません。</li>
    </ul>
    <footer class="mf"><button class="btn ghost" data-act="mclose">止めない</button><button class="btn danger" data-act="stopgo">${icon("power")}止める</button></footer>`);
}

function diffModal() {
  const tab = S.modal.tab || "main";
  const files = {
    main: ["foxonar.toml", tomlMain(S.cfgOrig), tomlMain(S.cfg)],
    jobs: ["jobs.toml", tomlJobs(S.cfgOrig), tomlJobs(S.cfg)],
  };
  const [, a, b] = files[tab];
  return modalWrap(
    `<header class="mh"><h2>保存の前に確かめる</h2><button class="ib" data-act="mclose" aria-label="閉じる">×</button></header>
    <p class="small">保存すると、次のように書き換える。コアが気づいて、自動で読み直す（4.2）。</p>
    <div class="dtabs" role="tablist">${["main", "jobs"].map((k) => `<button role="tab" aria-selected="${tab === k}" data-act="dtab" data-v="${k}">${files[k][0]}<span class="cnt">${changedCount(files[k][1], files[k][2])}</span></button>`).join("")}</div>
    <div class="diff">${hunks(diffLines(a, b))}</div>
    <p class="small muted">人が書いたコメントや並び順が消えることがある（4.1）。残す方法は宿題（宿題一覧 4.1）。「キー名は未定」の # の行は、見本のための書き方。</p>
    <footer class="mf"><button class="btn ghost" data-act="mclose">戻る</button><button class="btn primary" data-act="save">保存する</button></footer>`,
    "wide"
  );
}

function conflictModal() {
  return modalWrap(`<header class="mh"><h2>${icon("alert")}保存しませんでした</h2><button class="ib" data-act="mclose" aria-label="閉じる">×</button></header>
    <p class="big">開いたあとに書き換えられています。読み込み直してから、もう一度直してください。</p>
    <p class="small muted">jobs.toml が ${fmtTime(nowSec() - 25)} に書き換えられた（人がファイルを直接直したか、別のタブで保存した）。古い内容のまま保存すると、その書き換えが消えるので、保存しない（4.1）。</p>
    <footer class="mf"><button class="btn ghost" data-act="mclose">閉じる</button><button class="btn primary" data-act="reload">読み込み直す（この画面の直しは消える）</button></footer>`);
}

function toast(html, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast t-${kind}`;
  el.innerHTML = html;
  $("#toast-root").appendChild(el);
  setTimeout(() => el.classList.add("out"), 5200);
  setTimeout(() => el.remove(), 5700);
}

/* ---------- 合言葉と、止めたあと ---------- */

function loginView() {
  return `<div class="center"><form class="logincard" id="login" autocomplete="off">
    ${notesView("login")}
    <img src="../../assets/icon.png" alt="" width="64" height="64">
    <h1>Foxonar</h1>
    <p>合言葉（トークン）を入れてください</p>
    <label class="lbl">合言葉<input type="password" id="tok" placeholder="例：fx-7Q2k-…" aria-describedby="tokhelp"></label>
    ${S.loginError ? `<p class="m-err small">${icon("alert")}<span>合言葉が違います</span></p>` : ""}
    <button class="btn primary full" type="submit">開く</button>
    <p class="small muted" id="tokhelp">接続先：<span class="mono">${esc(MOCK.webAddress)}</span>（ポート番号は仮）。合言葉の作り方・渡し方は宿題。見本では、何か入れれば開く。</p>
  </form></div>`;
}

function startStop() {
  S.modal = null;
  S.stopping = { left: 10, total: 10, phase: "grace", ids: S.runs.filter((r) => r.result === "running").map((r) => r.id) };
  S.extraLog.push({ time: fmtTime(nowSec()), level: "info", text: "Web UI から止めるよう頼まれた。新しい発火は始めない" });
  render();
}

function stopTick() {
  const st = S.stopping;
  if (st.phase !== "grace") return;
  st.left--;
  if (st.left === 7) {
    // 短いラン（サムネイル）は、猶予の間に終わる
    S.runs.filter((x) => x.result === "running" && x.job === "thumbnail").forEach((r) => Object.assign(r, { result: "ok", end: fmtTime(nowSec()), code: 0 }));
  }
  if (st.left <= 0) {
    S.runs.filter((x) => x.result === "running").forEach((x) => Object.assign(x, { result: "interrupted", end: fmtTime(nowSec()), reason: "コアを止めたため", step: x.stepNow }));
    st.phase = "stopped";
  }
  S.ver++;
  render();
}

function stopView() {
  const st = S.stopping;
  const D = data();
  const rows = S.runs
    .filter((r) => st.ids.includes(r.id))
    .map((r) => `<li>${resBadge(r.result)}<span class="rl-main"><b>ラン ${r.id}</b> ${esc(r.jobName)}</span><span class="muted small rl-why">${r.result === "interrupted" ? "コアを止めたため" : r.result === "ok" ? "猶予の間に終わった" : "終わるのを待っている"}</span></li>`)
    .join("");
  const waitN = S.runs.filter((r) => r.result === "wait").length;
  if (st.phase === "grace") {
    return `<div class="center"><div class="stopcard">${notesView("stopped")}<div class="spin" aria-hidden="true"></div><h1>コアを止めています</h1>
      <p>新しい発火は始めません。走っているランが終わるのを、猶予の間だけ待っています。</p>
      <div class="meter big"><span style="width:${(st.left / st.total) * 100}%"></span></div>
      <p class="small">猶予の残り <b>${st.left} 秒</b>（設定は ${S.cfgOrig.global.grace} 秒。見本なので 10 秒で進める）</p>
      <ul class="rlist plain">${rows}</ul>
      <p class="small muted">待っているラン ${waitN} つと、待ち表の ${D.pending.length} 行は、捨てずに残し、次に起動したときに続きから動きます。</p></div></div>`;
  }
  return `<div class="center"><div class="stopcard">${notesView("stopped")}<div class="bigic">${icon("power")}</div><h1>コアが止まりました</h1>
    <ul class="rlist plain">${rows}</ul>
    <p>この画面は、コアの中の Web サーバが出していたので、もう新しくなりません。もう一度起動するには、ターミナルから起動するか、OS のサービスを始めます（起動の登録のしかたは宿題）。</p>
    <button class="btn" data-act="reset">見本をはじめに戻す</button></div></div>`;
}

/* ---------- 時計 ---------- */

function tick() {
  const n = nowSec();
  $$("[data-clock]").forEach((e) => (e.textContent = fmtTime(n)));
  $$("[data-since]").forEach((e) => (e.textContent = `${fmtDur(Math.max(0, n - toSec(e.dataset.since)))}経過`));
  $$("[data-uptime]").forEach((e) => (e.textContent = fmtDur(n - toSec(MOCK.coreStartedAt))));
}

// ふだんの場面では、20 秒ごとに変化が 1 つ届く。一覧は勝手に動かさず、「新しい変化が N 件」を出す
function arrive() {
  const x = MOCK.incoming[S.arrivedIdx++];
  S.lastArrive = Date.now();
  S.arriving.push({ ...x, id: S.nextDet++, time: fmtTime(nowSec()), _new: true });
  const side = $(".side");
  if (side) side.outerHTML = sideView();
  const pill = $("#newpill");
  if (pill) pill.innerHTML = newPill();
  tick();
}

setInterval(() => {
  tick();
  if (S.stopping) stopTick();
  else if (S.scene === "normal" && S.arrivedIdx < MOCK.incoming.length && Date.now() - S.lastArrive >= 20000) arrive();
}, 1000);

/* ---------- 操作 ---------- */

function act(name, v, el) {
  switch (name) {
    case "page":
      S.page = v;
      render();
      if (el?.dataset.anchor) $("#" + el.dataset.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo(0, 0);
      break;
    case "mclose":
      S.modal = null;
      renderModal();
      break;
    case "stop":
      S.modal = { type: "stop" };
      renderModal();
      break;
    case "stopgo":
      startStop();
      break;
    case "reset":
      resetScene("normal");
      break;
    case "theme":
      S.theme = isDark() ? "light" : "dark";
      document.documentElement.dataset.theme = S.theme;
      syncMockbar();
      break;
    case "notes":
      S.notes = !S.notes;
      render();
      break;
    case "dismiss":
      S.dismissed.add(v);
      render();
      break;
    case "lvl":
      S.lF.levels = toggleIn(S.lF.levels, v);
      render();
      break;
    // 検知ログとランログ
    case "dlview":
      S.dl.view = v;
      render();
      break;
    case "back":
      S[v].sel = null;
      updateSel(v);
      break;
    case "range": {
      const [ns, f] = v.split("|");
      const from = Number(f);
      const r = S[ns].range;
      S[ns].range = !f || (r && r[0] === from && r[1] === from + 600) ? null : [from, from + 600];
      render();
      break;
    }
    case "shownew":
      S.extraDet.push(...S.arriving);
      S.arriving = [];
      S.ver++;
      render();
      break;
    case "bopen":
      S.dl.open.has(v) ? S.dl.open.delete(v) : S.dl.open.add(v);
      render();
      break;
    case "bmore":
      S.dl.more[v] = (S.dl.more[v] || 50) + 100;
      render();
      break;
    case "bbad":
      S.dl.onlyBad = true;
      S.dl.open.add(v);
      render();
      break;
    case "bfolder": {
      const it = findBurst(v);
      if (!it) break;
      const key = `${it.g.folder}/${it.g.top}`;
      Object.assign(S.dl, { view: "folder", cwd: key, sel: { kind: "dir", key } });
      render();
      break;
    }
    case "cwd":
      S.dl.cwd = v;
      S.dl.crumbAll = false;
      render();
      break;
    case "crumbs":
      S.dl.crumbAll = true;
      render();
      break;
    case "fmore":
      S.dl.more[v] = (S.dl.more[v] || 50) + 200;
      render();
      break;
    case "rres":
      S.rl.result = v;
      render();
      break;
    case "ropen":
      S.rl.open.has(v) ? S.rl.open.delete(v) : S.rl.open.add(v);
      render();
      break;
    case "rmore":
      S.rl.more[v] = (S.rl.more[v] || 50) + 200;
      render();
      break;
    case "cmapview":
      S.cmap.view = v;
      render();
      break;
    // 設定
    case "settab":
      S.setTab = v;
      render();
      break;
    case "sel": {
      const [k, i] = v.split("|");
      S.sel[k] = Number(i);
      S.picker = null;
      render();
      break;
    }
    case "goto": {
      const [k, id] = v.split("|");
      S.page = "settings";
      S.setTab = k;
      const i = S.cfg[k].findIndex((x) => x.id === id);
      if (i >= 0) S.sel[k] = i;
      S.hl = null;
      render();
      window.scrollTo(0, 0);
      break;
    }
    case "add":
      addItem(v);
      break;
    case "del": {
      const [k, i] = v.split("|");
      S.cfg[k].splice(Number(i), 1);
      S.sel[k] = 0;
      render();
      break;
    }
    case "pick": {
      const n = normDir(S.cfg.folders[Number(v)].path);
      S.picker = { idx: Number(v), cur: FS_KNOWN.has(n.toLowerCase()) ? n : "" };
      render();
      break;
    }
    case "pkgo":
      S.picker.cur = v;
      render();
      break;
    case "pkclose":
      S.picker = null;
      render();
      break;
    case "pkok":
      S.cfg.folders[S.picker.idx].path = S.picker.cur;
      S.picker = null;
      render();
      break;
    case "explorer": {
      const i = Number(v);
      toast("<b>エクスプローラを開きました（見本）</b>Foxonar が動いている PC で、フォルダ選びの画面が開きます。見本では、C:\\Users\\Public\\Pictures を選んだことにします。", "info");
      setTimeout(() => {
        S.cfg.folders[i].path = "C:\\Users\\Public\\Pictures";
        if (S.page === "settings") render();
      }, 1400);
      break;
    }
    case "rmjob": {
      const [i, j] = v.split("|");
      const t = S.cfg.triggers[Number(i)];
      t.jobs = t.jobs.filter((x) => x !== j);
      delete t.needs[j];
      for (const k in t.needs) {
        t.needs[k] = t.needs[k].filter((x) => x !== j);
        if (!t.needs[k].length) delete t.needs[k];
      }
      render();
      break;
    }
    case "need": {
      const [i, j, d] = v.split("|");
      const t = S.cfg.triggers[Number(i)];
      const nx = toggleIn(t.needs[j] || [], d);
      t.needs[j] = t.jobs.filter((x) => nx.includes(x));
      if (!t.needs[j].length) delete t.needs[j];
      render();
      break;
    }
    case "addarg": {
      const [i, k] = v.split("|").map(Number);
      S.cfg.jobs[i].steps[k].args.push("");
      render();
      const inputs = $$(`[data-b^="jobs|${i}|steps.${k}.args."]`);
      inputs[inputs.length - 1]?.focus();
      break;
    }
    case "rmarg": {
      const [i, k, n] = v.split("|").map(Number);
      S.cfg.jobs[i].steps[k].args.splice(n, 1);
      render();
      break;
    }
    case "stepmv": {
      const [i, k, dlt] = v.split("|").map(Number);
      const st = S.cfg.jobs[i].steps;
      const [x] = st.splice(k, 1);
      st.splice(k + dlt, 0, x);
      render();
      break;
    }
    case "rmstep": {
      const [i, k] = v.split("|").map(Number);
      S.cfg.jobs[i].steps.splice(k, 1);
      render();
      break;
    }
    case "ph":
      insertPh(v);
      break;
    case "revert":
      S.cfg = clone(S.cfgOrig);
      render();
      break;
    case "review":
      S.modal = { type: "diff", tab: "main" };
      renderModal();
      break;
    case "dtab":
      S.modal.tab = v;
      renderModal();
      break;
    case "save":
      doSave();
      break;
    case "reload":
      S.cfg = clone(S.cfgOrig);
      S.conflict = false;
      S.modal = null;
      render();
      toast("<b>読み込み直しました</b>もう一度直してから、保存してください。", "info");
      break;
  }
}

function insertPh(v) {
  const el = S.lastPh && document.contains(S.lastPh) ? S.lastPh : $("[data-ph]");
  if (!el) return;
  const a = el.selectionStart ?? el.value.length;
  const b = el.selectionEnd ?? a;
  el.value = el.value.slice(0, a) + v + el.value.slice(b);
  el.focus();
  el.setSelectionRange(a + v.length, a + v.length);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function setPath(o, path, v) {
  const ks = path.split(".");
  let x = o;
  for (let k = 0; k < ks.length - 1; k++) x = x[ks[k]];
  x[ks[ks.length - 1]] = v;
}

function setBound(el) {
  const [kind, i, path] = el.dataset.b.split("|");
  const obj = kind === "global" ? S.cfg.global : S.cfg[kind][Number(i)];
  let v;
  if (el.type === "checkbox") v = el.checked;
  else if (el.dataset.t === "num") v = el.value === "" ? null : Number(el.value);
  else if (el.dataset.t === "lines") v = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
  else v = el.value;
  if (path === "id" && kind !== "global") renameRefs(kind, obj.id, v);
  setPath(obj, path, v);
}

// 打っている間は、全体を描き直さず、変わる所だけを直す（入力欄から外れないように）
function refreshDerived() {
  const sb = $("#savebar");
  if (sb) sb.outerHTML = saveBarView();
  if (S.page !== "settings" || !["folders", "triggers", "jobs"].includes(S.setTab)) return;
  const kind = S.setTab;
  const i = S.sel[kind];
  const x = S.cfg[kind][i];
  if (!x) return;
  const fe = $("#ferr");
  if (fe) fe.innerHTML = msgsView(check(kind, x));
  const h2 = $(".fhead h2");
  if (h2) h2.textContent = x.name || x.id;
  const li = $(`[data-li="${kind}:${i}"]`);
  if (li) li.outerHTML = listItem(kind, x, i);
  if (kind === "folders") {
    const pc = $(`#pcheck-${i}`);
    if (pc) pc.innerHTML = pathCheck(x.path);
  }
  if (kind === "triggers") {
    const ft = $("#ftest");
    if (ft) ft.innerHTML = filterTest(x);
    const ln = $("#tlanes");
    if (ln) ln.innerHTML = lanesView(x);
  }
  if (kind === "jobs") {
    x.steps.forEach((s, k) => {
      const pv = $(`#pv-${k}`);
      if (pv) pv.innerHTML = stepPreview(x, s);
    });
  }
}

const isText = (el) => el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio"].includes(el.type));

function onEdit(e) {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  // 文字の欄は input、ほかは change だけを使う（二重に描き直さないため）
  if (isText(el) !== (e.type === "input")) return;
  const ds = el.dataset;
  if (ds.b) {
    setBound(el);
    if (isText(el)) refreshDerived();
    else render();
  } else if (ds.arr) {
    const [kind, i, path] = ds.arr.split("|");
    const obj = S.cfg[kind][Number(i)];
    const nx = el.checked ? [...obj[path], el.value] : obj[path].filter((x) => x !== el.value);
    obj[path] = CHG_ORDER.filter((c) => nx.includes(c));
    render();
  } else if (ds.ftype != null) {
    const t = S.cfg.triggers[Number(ds.ftype)];
    if (el.value === "none") {
      if (t.filter) S.pat[t.id] = t.filter.pattern;
      t.filter = null;
    } else t.filter = { type: el.value, pattern: t.filter ? t.filter.pattern : S.pat[t.id] ?? "" };
    render();
  } else if (ds.addjob != null) {
    if (el.value) S.cfg.triggers[Number(ds.addjob)].jobs.push(el.value);
    render();
  } else if (ds.addstep != null) {
    const ty = el.value;
    const j = S.cfg.jobs[Number(ds.addstep)];
    if (ty === "exec") j.steps.push({ type: "exec", program: "", args: ["${path}"], okCodes: "0", timeout: null });
    else if (ty === "delete") j.steps.push({ type: "delete" });
    else if (ty) j.steps.push({ type: ty, dest: "", mkdir: true, overwrite: false });
    render();
  } else if (ds.test != null) {
    const t = S.cfg.triggers[Number(ds.test)];
    S.tests[t.id] = el.value;
    const ft = $("#ftest");
    if (ft) ft.innerHTML = filterTest(t);
  } else if (ds.ex != null) {
    S.examples[ds.ex] = el.value;
    refreshDerived();
  } else if (ds.f) {
    const [grp, key] = ds.f.split(".");
    S[grp][key] = el.type === "checkbox" ? el.checked : el.value;
    if (grp === "lF" && isText(el)) $("#logwrap").innerHTML = logBox(data());
    else if ((grp === "dl" || grp === "rl") && isText(el)) {
      const elist = $("#elist");
      if (elist) elist.innerHTML = grp === "dl" ? dlList(data()) : rlList(data());
    } else if (grp === "cmap" && isText(el)) {
      const body = $("#cmapbody");
      if (body) body.innerHTML = cmapBody();
      requestAnimationFrame(drawMap);
    } else if (grp === "lq" && isText(el)) {
      const items = $("#ilist-items");
      if (items) items.innerHTML = listItems(key);
    } else render();
  } else if (el.id === "conflictChk") {
    S.conflict = el.checked;
  }
}

document.addEventListener("input", onEdit);
document.addEventListener("change", onEdit);

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-sel],[data-act],[data-scene],[data-mode],[data-many]");
  if (!el || el.disabled) return;
  if (el.dataset.scene) return resetScene(el.dataset.scene);
  if (el.dataset.mode) {
    S.mode = el.dataset.mode;
    render();
    return;
  }
  if (el.dataset.many) {
    S.many = el.dataset.many === "1";
    S.cfg = cfgBase();
    S.cfgOrig = cfgBase();
    S.sel = { folders: 0, triggers: 0, jobs: 0 };
    S.picker = null;
    render();
    return;
  }
  if (el.dataset.sel) return select(el.dataset.sel);
  act(el.dataset.act, el.dataset.v, el);
});

document.addEventListener("submit", (e) => {
  if (e.target.id !== "login") return;
  e.preventDefault();
  if (!$("#tok").value.trim()) {
    S.loginError = true;
    render();
    return;
  }
  resetScene("normal");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (S.modal) act("mclose");
    else if (S.picker) act("pkclose");
    else if ((S.page === "detect" || S.page === "runs") && S[S.page === "detect" ? "dl" : "rl"].sel) act("back", S.page === "detect" ? "dl" : "rl");
  }
  if (e.key === "Enter" && e.target.matches?.("[data-sel][tabindex]")) e.target.click();
});

document.addEventListener("focusin", (e) => {
  if (e.target.matches?.("[data-ph]")) S.lastPh = e.target;
});

document.addEventListener("mouseover", (e) => {
  const map = e.target.closest?.("#map");
  const key = map ? e.target.closest("[data-node]")?.dataset.node || null : null;
  if (key !== S.hl) {
    S.hl = key;
    mapHL(key);
  }
});

let rafId = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    setMockH();
    drawMap();
  });
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncMockbar);

resetScene("normal");
