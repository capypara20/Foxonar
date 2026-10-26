// Foxonar の Web UI の見本（webui.html）で使う、仮のデータ。
// 検知ログとランログは、設計書 7.2 の例（検知 100〜104、ラン 42〜45）に合わせ、前後を足している。
// 10:20 に、写真 500 枚の入ったフォルダ photos_1020 が届く（一度にたくさん来たときの見え方を確かめるため）。
// 見本なので正本ではない。食い違うときは設計書に従う。
"use strict";

const MOCK = (() => {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const hms = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  const sec = (t) => {
    const [a, b, c] = t.split(":").map(Number);
    return a * 3600 + b * 60 + c;
  };
  const TNAME = { photos: "写真が来たら", "scan-pdf": "スキャンを日付で整理", "zip-done": "zip が届いたら" };
  const JNAME = { thumbnail: "サムネイル", backup: "バックアップ", upload: "アップロード", convert: "変換", archive: "日付で整理", unzip: "展開" };

  const config = {
    global: { maxConcurrency: 3, grace: 30, stdoutLines: 50 },
    folders: [
      {
        id: "inbox", name: "受信箱", path: "C:\\in", depth: null,
        hidden: false, detect: "both", exclude: ["*.tmp", "~*"], debounce: 2,
        whileStopped: "rescan", noMemory: "remember", toastOnDetect: false,
      },
      {
        id: "scans", name: "スキャン", path: "\\\\nas\\scans", depth: 1,
        hidden: false, detect: "file", exclude: [], debounce: 2,
        whileStopped: "remember", noMemory: "all", toastOnDetect: true,
      },
      {
        id: "dl", name: "ダウンロード", path: "D:\\dl", depth: 1,
        hidden: false, detect: "both", exclude: ["*.crdownload", "*.part"], debounce: 2,
        whileStopped: "remember", noMemory: "remember", toastOnDetect: false,
      },
    ],
    triggers: [
      {
        id: "photos", name: TNAME.photos, folder: "inbox", changes: ["create", "rename"],
        target: "file", depth: null, filter: { type: "glob", pattern: "*.jpg" },
        jobs: ["thumbnail", "backup", "upload", "convert"], needs: { upload: ["backup"] },
      },
      {
        id: "scan-pdf", name: TNAME["scan-pdf"], folder: "scans", changes: ["create", "rename"],
        target: "file", depth: null, filter: { type: "regex", pattern: "^scan_\\d{2}\\.pdf$" },
        jobs: ["archive"], needs: {},
      },
      {
        id: "zip-done", name: TNAME["zip-done"], folder: "dl", changes: ["create"],
        target: "file", depth: 1, filter: { type: "glob", pattern: "{*.zip,*.7z}" },
        jobs: ["unzip"], needs: {},
      },
    ],
    jobs: [
      {
        id: "thumbnail", name: JNAME.thumbnail, limit: null, timeout: null, retry: false,
        steps: [{ type: "exec", program: "magick", args: ["${path}", "-resize", "200x200", "D:\\thumbs\\${name}"], okCodes: "0", timeout: null }],
      },
      {
        id: "backup", name: JNAME.backup, limit: null, timeout: null, retry: false,
        steps: [
          { type: "exec", program: "C:\\tools\\check-space.bat", args: ["D:\\backup"], okCodes: "0", timeout: null },
          { type: "exec", program: "robocopy", args: ["${dir}", "D:\\backup", "${name}"], okCodes: "0-7", timeout: null },
        ],
      },
      {
        id: "upload", name: JNAME.upload, limit: null, timeout: 300, retry: false,
        steps: [{ type: "exec", program: "pwsh", args: ["-File", "C:\\tools\\upload.ps1", "${path}"], okCodes: "0", timeout: null }],
      },
      {
        id: "convert", name: JNAME.convert, limit: 1, timeout: null, retry: true,
        steps: [{ type: "exec", program: "ffmpeg", args: ["-i", "${path}", "D:\\webp\\${stem}.webp"], okCodes: "0", timeout: null }],
      },
      {
        id: "archive", name: JNAME.archive, limit: null, timeout: null, retry: false,
        steps: [{ type: "move", dest: "D:\\archive\\${date}\\${name}", mkdir: true, overwrite: false }],
      },
      {
        id: "unzip", name: JNAME.unzip, limit: null, timeout: 1800, retry: false,
        steps: [
          { type: "exec", program: "7z", args: ["x", "${path}", "-oD:\\unzipped\\${stem}"], okCodes: "0", timeout: null },
          { type: "delete" },
        ],
      },
    ],
  };

  // robocopy が失敗したランの、出力のファイル（設計書 7.1）
  function robocopyFail(r, name, free, error) {
    return {
      steps: [
        { no: 1, label: "プロセス実行 C:\\tools\\check-space.bat", start: r.start, end: r.start, result: "ok", code: 0 },
        { no: 2, label: "プロセス実行 robocopy", start: r.start, end: r.end, result: "fail", code: 16 },
      ],
      streams: [
        { step: 1, name: "標準出力（最後の 50 行）", text: `D:\\backup の空き：${free}\n足りている` },
        { step: 1, name: "標準エラー", text: "" },
        {
          step: 2,
          name: "標準出力（最後の 50 行）",
          text: `  コピー元 : ${r.dir}\\\n  コピー先 : D:\\backup\\\n  ファイル : ${name}\n\n2026/10/26 ${r.end} ${error}\n\n               合計   コピー済み   スキップ   失敗\n  ファイル:       1          0          0       1`,
        },
        { step: 2, name: "標準エラー", text: "" },
      ],
    };
  }

  // 場面ごとに、検知ログ・ランログ・待ち表・困りごとなどを作る。ID は時間の順に振る
  function build(scene) {
    const trouble = scene === "trouble";
    const dets = [];
    const runs = [];
    const outputs = {};
    let nd = 100;
    let nr = 38;
    const det = (time, folder, kind, change, path, extra = {}) => {
      const d = { id: nd++, time, folder, kind, change, path, ...extra };
      dets.push(d);
      return d;
    };
    const run = (d, trigger, job, r) => {
      const x = { id: nr++, det: d.id, trigger, triggerName: TNAME[trigger], job, jobName: JNAME[job], start: null, end: null, ...r };
      runs.push(x);
      return x;
    };
    // 写真のトリガーの 4 つのラン。アップロードはバックアップのあと（依存）
    const photoRuns = (d, t, fail) => {
      run(d, "photos", "thumbnail", { start: hms(t + 1), end: hms(t + 3), result: "ok", code: 0 });
      const bk = fail
        ? run(d, "photos", "backup", { start: hms(t + 1), end: hms(t + 4), result: "fail", step: "2 番目（プロセス実行 robocopy）", code: 16, reason: fail })
        : run(d, "photos", "backup", { start: hms(t + 1), end: hms(t + 4), result: "ok", code: 1 });
      if (bk.result === "ok") run(d, "photos", "upload", { start: hms(t + 4), end: hms(t + 8), result: "ok", code: 0 });
      else run(d, "photos", "upload", { start: hms(t + 4), result: "ignore", reason: `依存先が成功しなかった（ラン ${bk.id}）` });
      run(d, "photos", "convert", { start: hms(t + 1), end: hms(t + 6), result: "ok", code: 0 });
      return bk;
    };

    photoRuns(det("09:00:03", "inbox", "file", "create", "C:\\in\\dog.jpg", { how: "再スキャン（起動したとき）" }), sec("09:00:03"));

    const cat = det("10:01:05", "inbox", "file", "create", "C:\\in\\photos\\cat.jpg");
    run(cat, "photos", "thumbnail", { start: "10:01:06", end: "10:01:08", result: "ok", code: 0 });
    const r43 = run(cat, "photos", "backup", {
      start: "10:01:06", end: "10:01:09", result: "fail", step: "2 番目（プロセス実行 robocopy）", code: 16,
      reason: "ERROR 5 (0x00000005) D:\\backup\\ アクセスが拒否されました。",
    });
    run(cat, "photos", "upload", { start: "10:01:09", result: "ignore", reason: `依存先が成功しなかった（ラン ${r43.id}）` });
    const r45 = run(cat, "photos", "convert", { start: "10:01:06", end: "10:01:40", result: "interrupted", step: "1 番目（プロセス実行 ffmpeg）", reason: "コアを止めたため" });
    run(cat, "photos", "convert", { start: "10:02:01", end: "10:02:27", result: "ok", code: 0, reason: `ラン ${r45.id} のやり直し` });
    outputs[r43.id] = robocopyFail({ ...r43, dir: "C:\\in\\photos" }, "cat.jpg", "182 GB", "ERROR 5 (0x00000005) D:\\backup\\\nアクセスが拒否されました。");
    outputs[r45.id] = {
      steps: [{ no: 1, label: "プロセス実行 ffmpeg", start: "10:01:06", end: "10:01:40", result: "interrupted", code: null, note: "コアを止める猶予を過ぎたので、Ctrl+Break で終わるように頼んだ。後片付けして終わった" }],
      streams: [
        { step: 1, name: "標準出力（最後の 50 行）", text: "" },
        { step: 1, name: "標準エラー（最後の 1 MB）", text: "Input #0, image2, from 'C:\\in\\photos\\cat.jpg':\n  Stream #0:0: Video: mjpeg, 12000x8000\nStream mapping:\n  Stream #0:0 -> #0:0 (mjpeg -> libwebp)\nPress [q] to stop\nframe=    0 fps=0.0 q=0.0 size=       0kB time=00:00:00.00\nExiting normally, received signal 2." },
      ],
    };

    det("10:03:12", "inbox", "file", "rename", "C:\\in\\memo.txt", { old: "C:\\in\\memo_old.txt" });
    det("10:05:40", "inbox", "folder", "delete", "C:\\in\\tmp\\");
    const ov = det("10:10:00", "inbox", null, "overflow", "C:\\in\\");
    const bird = det("10:10:06", "inbox", "file", "create", "C:\\in\\photos\\bird.jpg", { how: "再スキャン（溢れのあと）" });
    photoRuns(bird, sec("10:10:06"));

    // 10:20 に、写真 500 枚の入ったフォルダが届く。全体の上限（3）があるので、ランは 11:15 ごろまで続く
    const b0 = sec("10:20:00");
    det("10:20:00", "inbox", "folder", "create", "C:\\in\\photos_1020\\", { how: "再スキャン（フォルダが入ってきたとき）" });
    const files = [];
    for (let k = 1; k <= 500; k++) {
      const t = b0 + 1 + Math.floor((k * 149) / 500);
      files.push(det(hms(t), "inbox", "file", "create", `C:\\in\\photos_1020\\IMG_${pad(k, 4)}.jpg`, k <= 3 ? { how: "再スキャン（フォルダが入ってきたとき）" } : {}));
    }
    const diskFull = "ERROR 112 (0x00000070) D:\\backup\\ ディスクに十分な空き領域がありません。";
    files.forEach((d, i) => {
      const k = i + 1;
      const fail = k >= 101 && k <= 110 ? diskFull : null;
      const bk = photoRuns(d, b0 + 2 + Math.floor(i * 6.6), fail);
      if (fail) outputs[bk.id] = robocopyFail({ ...bk, dir: "C:\\in\\photos_1020" }, `IMG_${pad(k, 4)}.jpg`, "0.4 GB", "ERROR 112 (0x00000070) D:\\backup\\\nディスクに十分な空き領域がありません。");
    });

    const scan = det("10:31:20", "scans", "file", "create", "\\\\nas\\scans\\scan_01.pdf");
    run(scan, "scan-pdf", "archive", { start: "10:31:23", end: "10:31:24", result: "ok" });
    det("10:31:24", "scans", "file", "delete", "\\\\nas\\scans\\scan_01.pdf");

    // 10:45 に、深いフォルダ（7 段）に写真 20 枚と PDF 3 つが届く（階層が深いときの見え方を確かめるため）
    const d0 = sec("10:45:00");
    const deep = "C:\\in\\archive\\2026\\10\\26";
    for (let k = 1; k <= 20; k++) {
      const d = det(hms(d0 + k * 2), "inbox", "file", "create", `${deep}\\camera\\raw\\day1\\IMG_A${pad(k, 3)}.jpg`);
      photoRuns(d, d0 + k * 2);
    }
    for (let k = 1; k <= 3; k++) det(hms(d0 + 41 + k), "inbox", "file", "create", `${deep}\\scan\\doc_${k}.pdf`);

    const pano = trouble ? det("11:02:30", "inbox", "file", "create", "C:\\in\\photos\\pano.jpg") : null;
    if (!trouble) det("10:58:12", "inbox", "file", "move", "C:\\in\\done\\report.pdf", { old: "C:\\in\\report.pdf" });

    const zip = det("11:15:38", "dl", "file", "create", "D:\\dl\\setup.zip");
    run(zip, "zip-done", "unzip", { start: "11:15:40", result: "running", stepNow: "1 番目（プロセス実行 7z）" });
    const a = det("11:19:55", "inbox", "file", "create", "C:\\in\\photos\\a.jpg");
    run(a, "photos", "thumbnail", { start: "11:19:57", result: "running", stepNow: "1 番目（プロセス実行 magick）" });
    const bkA = run(a, "photos", "backup", { result: "wait", waitFor: "全体の上限（3）に達している" });
    run(a, "photos", "upload", { result: "wait", waitFor: `依存先のラン ${bkA.id} が成功するのを待っている` });
    run(a, "photos", "convert", { start: "11:19:57", result: "running", stepNow: "1 番目（プロセス実行 ffmpeg）" });

    const last = trouble
      ? det("11:19:58", "scans", null, "lost", "\\\\nas\\scans")
      : det("11:19:58", "inbox", "file", "create", "C:\\in\\photos\\b.jpg");

    const appLog = [
      { time: "09:00:01", level: "info", text: "起動した（設定：C:\\foxonar\\foxonar.toml）" },
      { time: "09:00:01", level: "info", text: "設定を読み込んだ（監視フォルダ 3・トリガー 3・ジョブ 6）" },
      { time: "09:00:01", level: "info", text: "Web UI を http://127.0.0.1:8400 で待ち受ける" },
      { time: "09:00:01", level: "info", text: "監視フォルダ inbox の見張りを始めた（止まっている間：再スキャンする）" },
      { time: "09:00:02", level: "warn", text: "監視フォルダ scans では移動を見分けられない（新しい版の命令が使えないので、古い版に切り替えた）" },
      { time: "09:00:02", level: "info", text: "監視フォルダ dl の見張りを始めた" },
      { time: "09:00:03", level: "info", text: "inbox の再スキャンが終わった（起動したとき。変化 1）" },
      { time: "10:01:10", level: "info", text: "Web UI から止めるよう頼まれた。新しい発火は始めない。走っているラン 1 つを、猶予 30 秒の間待つ" },
      { time: "10:01:40", level: "warn", text: `猶予を過ぎた。ラン ${r45.id}（convert）の 1 番目のステップを止め、中断にした` },
      { time: "10:01:41", level: "info", text: "止まった" },
      { time: "10:02:00", level: "info", text: "起動した（設定：C:\\foxonar\\foxonar.toml）" },
      { time: "10:02:00", level: "info", text: `ラン ${r45.id} を、ラン ${r45.id + 1} としてやり直す（ジョブ convert は、中断したらやり直す）` },
      { time: "10:10:00", level: "warn", text: "inbox で溢れた。落ち着いたら再スキャンする" },
      { time: "10:10:06", level: "info", text: "inbox の再スキャンが終わった（溢れのあと。変化 1）" },
      { time: "10:20:00", level: "info", text: "inbox にフォルダ photos_1020 が入ってきた。中を再スキャンする" },
      { time: "10:20:01", level: "info", text: "inbox の photos_1020 の再スキャンが終わった（変化 3。残りはコピーが進むにつれて届く）" },
      { time: "10:42:13", level: "info", text: "設定を読み直した（jobs.toml が書き換わった）" },
    ];
    if (trouble) {
      appLog.push(
        { time: "11:12:40", level: "error", text: "設定の読み込みに失敗した：foxonar.toml 23 行目、知らないキー fliter。前の設定のまま動く" },
        { time: "11:17:30", level: "warn", text: "C:\\in\\photos\\pano.jpg の書き込みの終わりを、15 分待ち続けている（待つのはやめない）" },
        { time: "11:19:58", level: "warn", text: "監視フォルダ scans を見失った（\\\\nas\\scans が見つからない）。見張りを止めた" }
      );
    }

    const pending = trouble
      ? [{ no: 9, folder: "inbox", path: pano.path, waitFor: "書き込みの終わり", since: "11:02:30", det: pano.id, triggers: ["photos"], long: true }]
      : [{ no: 12, folder: "inbox", path: last.path, waitFor: "書き込みの終わり", since: "11:19:58", det: last.id, triggers: ["photos"] }];

    const problems = trouble
      ? [
          { key: "config", level: "error", title: "設定の読み込みに失敗しています", time: "11:12:40", body: "foxonar.toml の 23 行目：知らないキー fliter。壊れた設定は使わず、前の設定のまま動いています。", link: { label: "設定を見る", page: "settings" } },
          { key: "lost-scans", level: "warn", title: "監視フォルダ「スキャン」（\\\\nas\\scans）を見失いました", time: "11:19:58", body: "見張りを止めています。中のパスは削除にしません。同じパスにまた現れたら、自動で見張り直します。", link: { label: "検知ログで見る", sel: `det:${last.id}` } },
          { key: "settle-pano", level: "warn", title: "書き込みの終わりを待ち続けています", time: "11:17:30", body: "C:\\in\\photos\\pano.jpg（11:02:30 から）。書き込みが終わるまで、待つのはやめません。", link: { label: "待ち表を見る", page: "home", anchor: "pending" } },
        ]
      : [
          { key: "overflow", level: "past", title: "受信箱（inbox）で溢れました", time: "10:10:00", body: `OS イベントを受け取れなかった分は、落ち着いてから再スキャンし、取り戻しました（検知 ${bird.id}）。`, link: { label: "検知ログで見る", sel: `det:${ov.id}` } },
        ];

    const configError = trouble
      ? {
          time: "11:12:40", file: "foxonar.toml", line: 23, message: "知らないキー fliter",
          excerpt: [
            [21, 'folder = "inbox"'],
            [22, 'changes = ["create", "rename"]'],
            [23, 'fliter = { glob = "*.jpg" }'],
            [24, 'jobs = ["thumbnail", "backup", "upload", "convert"]'],
          ],
        }
      : null;

    return {
      dets, runs, outputs, appLog, pending, problems, configError,
      folderState: trouble ? { scans: { status: "lost", since: "11:19:58" } } : {},
      nextDet: nd,
    };
  }

  // 「設定の数：多い」で足す設定（監視フォルダ 9・トリガー 27・ジョブ 34。合わせて 12・30・40 になる）。
  // 数十個あるときの「つながり」や一覧の見え方を確かめるためのもので、ログには出てこない
  function manyConfig() {
    const fnames = ["経理", "請求書", "見積書", "スキャン 2F", "スキャン 3F", "カメラ", "動画", "共有の受信箱", "作業用"];
    const jnames = [
      "PDF を結合", "OCR で文字を読む", "Slack に知らせる", "S3 へ送る", "NAS へ写す", "ウイルスを調べる", "zip にまとめる", "名前を付け直す",
      "CSV に追記", "メールで送る", "印刷する", "暗号化する", "動画を縮める", "音声を書き起こす", "EXIF を消す", "透かしを入れる", "二次バックアップ",
      "ハッシュを記録", "Teams に知らせる", "Git にコミット", "画像を小さく", "HEIC を JPEG に", "Excel を PDF に", "7z を展開", "重複を調べる",
      "日付で振り分け", "大きさで振り分け", "古いものを退避", "ログを集める", "台帳に記録", "翻訳する", "サイトへ上げる", "チケットを作る", "整形する",
    ];
    const kinds = [
      ["PDF が来たら", ["create", "rename"], { type: "glob", pattern: "*.pdf" }],
      ["画像が来たら", ["create", "rename"], { type: "glob", pattern: "{*.jpg,*.png,*.heic}" }],
      ["直されたら", ["modify"], null],
    ];
    const folders = fnames.map((name, i) => ({
      id: `share-${i + 1}`, name, path: `\\\\nas\\share\\${pad(i + 1)}`, depth: null,
      hidden: false, detect: "both", exclude: ["*.tmp"], debounce: 2, whileStopped: "remember", noMemory: "remember", toastOnDetect: false,
    }));
    const jobs = jnames.map((name, i) => ({
      id: `job-${pad(i + 1)}`, name, limit: null, timeout: null, retry: false,
      steps: [{ type: "exec", program: `C:\\tools\\job-${pad(i + 1)}.bat`, args: ["${path}"], okCodes: "0", timeout: null }],
    }));
    const triggers = [];
    folders.forEach((f, fi) =>
      kinds.forEach(([kname, changes, filter], ki) => {
        const n = fi * 3 + ki;
        // ジョブは 1〜3 個。決まった式で選ぶ（開くたびに同じになるように）
        const picks = [...new Set([(n * 7) % 34, (n * 11 + 3) % 34, (n * 5 + 1) % 34].slice(0, 1 + (n % 3)))];
        triggers.push({
          id: `t-${pad(n + 1)}`, name: `${f.name}：${kname}`, folder: f.id, changes, target: "file", depth: null,
          filter: filter && { ...filter }, jobs: picks.map((p) => jobs[p].id), needs: picks.length > 1 ? { [jobs[picks[1]].id]: [jobs[picks[0]].id] } : {},
        });
      })
    );
    return { folders, triggers, jobs };
  }

  return {
    manyConfig,
    today: "2026-10-26",
    weekday: "月",
    // 見本を開いた時刻。ここから 1 秒ずつ進める
    now: "11:20:00",
    coreStartedAt: "10:02:00",
    webAddress: "http://127.0.0.1:8400",
    configDir: "C:\\foxonar",
    // 書き込みが終わらないことを知らせるまで（宿題一覧 4.5。見本の仮の値）
    settleWarnMin: 15,
    // 新しい版の命令が使えず、古い版に切り替えた監視フォルダ（設計書 5.12）
    oldApi: ["scans"],
    config,
    build,

    // フォルダ選びで見せる、コアから見えるフォルダ（キーのフォルダの、すぐ下のフォルダ）
    fs: {
      "": ["C:\\", "D:\\", "Z:\\", "\\\\nas\\scans"],
      "C:\\": ["foxonar", "in", "tools", "Users"],
      "C:\\foxonar": ["logs", "runs"],
      "C:\\in": ["done", "photos", "photos_1020"],
      "C:\\Users": ["Public"],
      "C:\\Users\\Public": ["Documents", "Pictures"],
      "D:\\": ["archive", "backup", "dl", "thumbs", "unzipped", "webp"],
      "Z:\\": ["共有", "写真"],
      "\\\\nas\\scans": ["2026-10"],
    },
    // ログインごとに割り当てるドライブ。サービスからは見えない（設計書 2.3）
    mappedDrives: ["Z:"],

    // ふだんの場面で、あとから届く変化（「新しい行が N 件」を見せるため。どのトリガーにも合わない）
    incoming: [
      { folder: "inbox", kind: "file", change: "modify", path: "C:\\in\\memo.txt" },
      { folder: "dl", kind: "file", change: "create", path: "D:\\dl\\readme.txt" },
      { folder: "inbox", kind: "folder", change: "create", path: "C:\\in\\photos\\2026-10\\" },
    ],

    // 「説明を出す」で、画面の上に出す決まりと案。k：決まり（設計書にある）・案（見本で付けたもの）・宿題（まだ決めていない）
    notes: {
      common: [
        { k: "決まり", t: "メニューは 5 つ：今の様子・検知ログ・ランログ・アプリログ・設定。広い画面では左に縦に、狭い画面では上に横に並べる", ref: "3.3" },
        { k: "案", t: "名前を大きく、ID を小さく並べて出す。名前を書いていないものは、ID を名前の代わりに出す。画面の名前（今の様子、困りごと、かたまり など）は、見本で付けた仮の名前", ref: "4.3" },
      ],
      home: [
        { k: "決まり", t: "Foxonar 自身の困りごと（溢れた、設定の読み込みに失敗した、書き込みが終わらない、監視フォルダを見失った）は、Web UI で知らせる。デスクトップ通知では知らせない", ref: "8 章" },
        { k: "決まり", t: "今動いているランと、待っているランが見える", ref: "7.2" },
        { k: "決まり", t: "移動を見分けられない監視フォルダは、Web UI で知らせる", ref: "5.12" },
        { k: "決まり", t: "コアは Web UI からも止められる", ref: "2.5" },
        { k: "案", t: "成功しなかったランは、ジョブと理由でまとめて出す（500 個のうち 10 個が同じ理由で失敗、など）。名前を押すと、ランログでそのランを開く" },
        { k: "案", t: "監視フォルダのカードに、10 分ごとの検知の数を小さな棒で出す" },
        { k: "案", t: "待っているランに、何を待っているか（全体の上限・依存先）を出す。待ち表の行も見せる", ref: "宿題一覧 3" },
        { k: "案", t: "過ぎた困りごと（溢れたが、再スキャンで取り戻した）は「見た」で消せる。続いている困りごとは、直るまで出し続ける" },
      ],
      detect: [
        { k: "決まり", t: "検知ログとランログは、別々の画面にする", ref: "3.3" },
        { k: "決まり", t: "見方は 2 つ：流れ（時間の順。一度にたくさん来た変化は畳む）と、フォルダごと（エクスプローラのように 1 階層ずつ。1 本道は縮める）", ref: "3.3" },
        { k: "決まり", t: "選んだものの詳しい中身は、一覧の横に並べる。一覧の上に重ねない", ref: "3.3" },
        { k: "決まり", t: "列は、検知 ID・日時・監視フォルダ・ファイルかフォルダか・変化の種類・パス・変更前のパス・見つけ方。溢れ・見失った・また現れたの行も出す", ref: "7.1、7.2" },
        { k: "決まり", t: "行から「この変化で走ったラン」をたどる（横の詳しい所から、ランログのそのランへ）", ref: "7.2" },
        { k: "案", t: "同じ監視フォルダの、同じ一番上のフォルダに、30 秒以内に続けて 5 個以上来た同じ種類の変化は、1 つの「かたまり」に畳む。中は 50 個ずつ出す" },
        { k: "案", t: "行の右に、その変化から走ったランの結果を、色の点で小さく出す" },
        { k: "案", t: "上の 10 分ごとの棒を押すと、その時間だけに絞る。棒の高さは数の平方根（少ない時間も見えるように）。赤い印は、成功しなかったランがある時間" },
        { k: "案", t: "パスは、名前を太く、監視フォルダからの場所を「受信箱 › photos」と薄く出す。深いときは「受信箱 › archive › … › raw › day1」と途中を縮める。フルパスは横の詳しい所に出す" },
        { k: "案", t: "フォルダごとの見方では、すぐ下のフォルダとファイルだけを、下の分も合わせた数と結果の帯つきで出す。中に 1 つしかフォルダが無い所は「2026 › 10 › 26」と縮めて 1 回で入る。パンくずが長いときは途中を「…」にする" },
        { k: "案", t: "狭い画面では、詳しい中身を一覧と入れ替えて出す（「一覧へ戻る」で戻る）" },
      ],
      runs: [
        { k: "決まり", t: "列は、ラン ID・検知 ID・トリガー・ジョブ・始まった時刻・終わった時刻・結果・止まったステップ・終了コード・理由・エラーの中身", ref: "7.2" },
        { k: "決まり", t: "行から「もとの変化」をたどる（横の詳しい所から、検知ログのその変化へ）", ref: "7.2" },
        { k: "決まり", t: "ステップごとの時刻と結果、成功しなかったときの出力は、ラン 1 回ごとの出力のファイルにある。手でやり直すボタンは作らない", ref: "7.1、6.6" },
        { k: "決まり", t: "一覧だけにする（行がパス・列がジョブの格子は、ジョブが増えると右へ伸び続けるので作らない）", ref: "3.3" },
        { k: "案", t: "検知ログで 1 つのかたまりになった変化から走ったランは、トリガーごとに 1 つに畳む（数と、結果の帯を出す）" },
        { k: "案", t: "結果ごとの数を、絞り込みのタブに出す。待っている・走っているランは、いちばん上に出す" },
        { k: "案", t: "対象パスは、検知 ID から検知ログを引いて見せる（ランログの列には無い）" },
        { k: "案", t: "走っているランの出力は、終わってから見られる" },
      ],
      applog: [
        { k: "決まり", t: "アプリログはテキストのファイル。人が上から読む", ref: "7.1" },
        { k: "決まり", t: "設定を読み直したことは、時刻とともにアプリログに書く", ref: "4.2" },
        { k: "案", t: "重さ（情報・注意・エラー）で絞り込む。「新しい行を追いかける」で、いちばん下に付いていく" },
        { k: "宿題", t: "アプリログの分け方と保存期間", ref: "宿題一覧 7" },
      ],
      settings: [
        { k: "決まり", t: "設定はフォームで直し、保存の前に TOML のどこが変わるかを見せる。保存すると、コアが自動で読み直す", ref: "3.2、4.2" },
        { k: "決まり", t: "保存の前に、開いたあとに設定ファイルが書き換わっていないかを確かめる。書き換わっていたら保存しない（上の「保存のときにぶつかる」で試せる）", ref: "4.1" },
        { k: "決まり", t: "監視フォルダのパスは、画面の中で、コアから見えるフォルダを選べる。コアがデスクトップで動いているときは、エクスプローラでも選べる。書いたパスは、その場であるかを確かめる（上の「動かし方」で試せる）", ref: "3.3" },
        { k: "決まり", t: "ID は利用者が書く（英数字と - _）。名前はいつ変えてもよい", ref: "4.3" },
        { k: "決まり", t: "止まっている間の扱いと、覚えている中身が無いときの扱いは、必ず選ぶ", ref: "5.2" },
        { k: "決まり", t: "移動・削除のステップを持つジョブが、ほかのジョブと依存なしで並行のときは警告する（トリガー「写真が来たら」に「日付で整理」を足すと出る）", ref: "6.1" },
        { k: "案", t: "見つからないパスでも保存はできる（見失ったとして見張りを始め、現れたら見張る）", ref: "5.11" },
        { k: "決まり", t: "「つながり」は、図と表を切り替えて見られる。図は監視フォルダ → トリガー → ジョブを線でつなぎ、表はトリガー 1 つを 1 行にする（上の「設定の数」を「多い」にすると、数十個のときを試せる）", ref: "3.3" },
        { k: "案", t: "つながり・一覧には「探す」欄を付け、名前か ID で絞る。図で探すと、合うものと、それにつながるものだけを出す" },
        { k: "案", t: "フィルタをその場で試せる。プレースホルダが置き換わった例を見せる" },
        { k: "案", t: "ID は、作ったあとは変えられないようにする（変えると別のものとして扱われ、覚えている中身を引き継がない）", ref: "9.3" },
        { k: "案", t: "キー名がまだ決まっていない項目は、差分ではコメント（# …）で見せている。見本のためだけの書き方", ref: "宿題一覧 9" },
        { k: "宿題", t: "設定の読み込みに失敗している間、この画面で何を見せるか（見本では、動いている前の設定を、直せない形で見せている）" },
        { k: "宿題", t: "人が書いたコメントと並び順を残す方法", ref: "宿題一覧 4.1" },
      ],
      login: [
        { k: "決まり", t: "合言葉（トークン）は、同じ PC からでも SSH のトンネルでも、いつでも要る", ref: "3.1" },
        { k: "決まり", t: "127.0.0.1 で待ち受けるときは HTTP も許す", ref: "3.1" },
        { k: "宿題", t: "トークンの作り方・置き場所・渡し方（案：起動したときにトークン付きの URL を表示する、CLI で表示する）", ref: "宿題一覧 3" },
        { k: "宿題", t: "ポート番号（見本の 8400 は仮）", ref: "宿題一覧 3" },
      ],
      stopped: [
        { k: "決まり", t: "止めるときは、新しい発火を始めない。走っているランは猶予の間だけ待ち、過ぎたら中断にする", ref: "2.5" },
        { k: "決まり", t: "まだ始まっていないもの（待ち表の行と、待っているラン）は、次に起動したときに続きから", ref: "2.5" },
        { k: "案", t: "止めている間は、猶予の残りと、走っているランの様子を見せる" },
        { k: "宿題", t: "止めたあと、もう一度起動するには（起動の登録）", ref: "宿題一覧 2" },
      ],
    },
  };
})();
