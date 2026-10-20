#!/usr/bin/env python3
"""Foxonar のドキュメントを機械的に突き合わせる。

目で読まなくても分かる「ずれ」だけを見つける。言葉の意味のずれは、
エージェント（term-guardian、design-verifier）が読んで調べる。

使い方:
    python scripts/doc_check.py               # 調べて結果を出す
    python scripts/doc_check.py --todo        # 宿題（決めること・残り）の一覧も出す
    python scripts/doc_check.py --summary     # 件数だけを 1 行で出す
    python scripts/doc_check.py --only-errors # エラーだけを出す（フック用）

終了コード: 0 = エラーなし（警告・お知らせはあってもよい）/ 1 = エラーあり
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
GLOSSARY_JA = DOCS / "glossary.ja.md"
GLOSSARY_EN = DOCS / "glossary.md"
DECISIONS = DOCS / "decisions.ja.md"
DESIGN = DOCS / "design.ja.md"
TODO = DOCS / "todo.ja.md"
NOTES = ROOT / ".claude" / "notes.md"

# 相対リンクの行き先を確かめるファイル
LINK_FILES = [
    *sorted(DOCS.glob("*.md")),
    ROOT / "AGENTS.md",
    ROOT / "CLAUDE.md",
    ROOT / ".claude" / "README.md",
]
# 「論点 X」の参照先を確かめるファイル
REF_FILES = [GLOSSARY_JA, DECISIONS, DESIGN, TODO, NOTES, ROOT / "AGENTS.md"]
# 使わない言葉を調べるファイル（議論の記録は、言葉そのものを話題にするので外す）
BANNED_WORD_FILES = [DESIGN, TODO]

LEVEL_NAMES = {"error": "エラー", "warning": "警告", "info": "お知らせ"}

# カタカナ（「・」は区切りなので入れない）
KATAKANA = "ァ-ヺー"


@dataclass
class Finding:
    level: str  # "error" | "warning" | "info"
    path: Path
    line: int
    message: str


@dataclass
class Term:
    name: str
    en: str
    definition: str
    line: int
    pattern: re.Pattern[str] = field(init=False)

    def __post_init__(self) -> None:
        self.pattern = term_pattern(self.name)


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)
    todo: list[tuple[str, int, str]] = field(default_factory=list)

    def add(self, level: str, path: Path, line: int, message: str) -> None:
        self.findings.append(Finding(level, path, line, message))

    def count(self, level: str) -> int:
        return sum(1 for f in self.findings if f.level == level)


# ---------------------------------------------------------------- 読み込み


def read_lines(path: Path) -> list[tuple[int, str, bool]]:
    """(行番号, 行, コードブロックの中か) の一覧を返す。"""
    if not path.exists():
        return []
    rows = []
    in_code = False
    for no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if re.match(r"^\s*(```|~~~)", line):
            rows.append((no, line, True))
            in_code = not in_code
            continue
        rows.append((no, line, in_code))
    return rows


def rel(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def strip_inline_code(text: str) -> str:
    return re.sub(r"`[^`]*`", "", text)


def table_cells(line: str) -> list[str] | None:
    """表の行ならセルの一覧を返す。区切り行（|---|）や表でない行は None。"""
    s = line.strip()
    if not s.startswith("|"):
        return None
    cells = [c.strip() for c in re.split(r"(?<!\\)\|", s.strip("|"))]
    if all(re.fullmatch(r":?-+:?", c) for c in cells if c):
        return None
    return cells


def is_katakana(ch: str) -> bool:
    return bool(re.match(f"[{KATAKANA}]", ch))


def term_pattern(term: str) -> re.Pattern[str]:
    """用語を探す正規表現。カタカナの端は、となりもカタカナなら別の言葉とみなす。

    例：「ラン」は「プラン」「ランログ」には当たらない。「ロック」は「ファイルロック」に当たらない。
    """
    p = re.escape(term)
    if is_katakana(term[0]):
        p = f"(?<![{KATAKANA}])" + p
    if is_katakana(term[-1]):
        p = p + f"(?![{KATAKANA}])"
    return re.compile(p)


def find_terms(text: str, terms: list[Term]) -> set[str]:
    """文の中に出てくる用語を返す。長い用語を先に取り、重なる短い用語は数えない。"""
    claimed = [False] * len(text)
    found: set[str] = set()
    for t in sorted(terms, key=lambda t: len(t.name), reverse=True):
        for m in t.pattern.finditer(text):
            if any(claimed[m.start() : m.end()]):
                continue
            for i in range(m.start(), m.end()):
                claimed[i] = True
            found.add(t.name)
    return found


def parse_glossary_terms(path: Path, header: str) -> list[Term]:
    """用語集の、見出しの 1 列目が header の表から、上から順に用語を集める。

    章の番号では選ばない（章が増えても直さずに済むように）。言い方の決まりの表は、
    見出しが違う（「層」「使わない言葉」など）ので入らない。
    """
    terms: list[Term] = []
    in_term_table = False
    for no, line, in_code in read_lines(path):
        if in_code or not line.strip().startswith("|"):
            in_term_table = False
            continue
        cells = table_cells(line)
        if cells is None:
            continue  # 区切りの行（|---|）
        if cells[0] == header:
            in_term_table = True
            continue
        if in_term_table and len(cells) >= 3:
            terms.append(Term(cells[0], cells[1], " | ".join(cells[2:]), no))
    return terms


def parse_decisions() -> list[tuple[str, str, bool, int]]:
    """議論の記録の論点 (記号, 見出し, 決定か, 行番号) の一覧。"""
    result = []
    for no, line, in_code in read_lines(DECISIONS):
        if in_code:
            continue
        m = re.match(r"^## ([A-Z]+)\. (.+)$", line)
        if m:
            title = m.group(2).strip()
            result.append((m.group(1), title, title.endswith("（決定）"), no))
    return result


# ---------------------------------------------------------------- 調べること


def check_code_fences(report: Report) -> None:
    for path in {*LINK_FILES, *REF_FILES}:
        open_line = 0
        for no, line, _ in read_lines(path):
            if re.match(r"^\s*(```|~~~)", line):
                open_line = 0 if open_line else no
        if open_line:
            report.add("error", path, open_line, "コードブロック（```）が閉じていません")


def check_links(report: Report) -> None:
    for path in LINK_FILES:
        for no, line, in_code in read_lines(path):
            if in_code:
                continue
            for target in re.findall(r"\]\(([^)\s]+)\)", strip_inline_code(line)):
                if re.match(r"^[a-z][a-z0-9+.-]*:", target) or target.startswith("#"):
                    continue  # https: などの外のリンクと、同じページの見出しへのリンク
                file_part = target.split("#", 1)[0]
                if file_part and not (path.parent / file_part).exists():
                    report.add("error", path, no, f"リンク先 {target} がありません")


def symbol_to_number(symbol: str) -> int:
    """論点の記号を番号にする。Z の次は AA（表計算の列名と同じ数え方。A=1、Z=26、AA=27）。"""
    n = 0
    for ch in symbol:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n


def number_to_symbol(n: int) -> str:
    """symbol_to_number の逆。"""
    symbol = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        symbol = chr(ord("A") + r) + symbol
    return symbol


def expand_refs(spec: str) -> list[str]:
    """「O〜U」「Q、T」「Y〜AB」などを、論点の記号の一覧にする。"""
    tokens = re.findall(r"[A-Z]+|[〜~～]", spec)
    letters: list[str] = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok in "〜~～":
            i += 1
            continue
        if i + 2 < len(tokens) and tokens[i + 1] in "〜~～":
            end = tokens[i + 2]
            letters.extend(
                number_to_symbol(n)
                for n in range(symbol_to_number(tok), symbol_to_number(end) + 1)
            )
            i += 3
            continue
        letters.append(tok)
        i += 1
    return letters


def check_decision_refs(report: Report) -> None:
    decisions = parse_decisions()
    known = {d[0] for d in decisions}

    # 記号の重複と抜け
    seen: dict[str, int] = {}
    for letter, _, _, no in decisions:
        if letter in seen:
            report.add("error", DECISIONS, no, f"論点 {letter} が 2 回出てきます（最初は {seen[letter]} 行目）")
        seen[letter] = no
    if known:
        last = max(symbol_to_number(k) for k in known)
        expected = [number_to_symbol(n) for n in range(1, last + 1)]
        missing = [c for c in expected if c not in known]
        if missing:
            report.add("error", DECISIONS, 1, f"論点の記号が抜けています：{'、'.join(missing)}")

    # 参照先があるか。記号は Z の次から 2 文字（AA、AB、…）
    ref_re = re.compile(r"論点\s*([A-Z]{1,2}(?:\s*[〜~～、,]\s*[A-Z]{1,2})*)(?![A-Za-z])")
    for path in REF_FILES:
        for no, line, in_code in read_lines(path):
            if in_code:
                continue
            for m in ref_re.finditer(line):
                for letter in expand_refs(m.group(1)):
                    if letter not in known:
                        report.add("error", path, no, f"論点 {letter} は議論の記録にありません")

    # お知らせ：まだ決まっていない論点
    for letter, title, decided, no in decisions:
        if not decided:
            report.add("info", DECISIONS, no, f"論点 {letter} はまだ決定していません：{title}")


def check_glossary_order(report: Report) -> list[Term]:
    """定義には、それより上で定義した言葉だけを使う（用語集の決まり）。"""
    terms = parse_glossary_terms(GLOSSARY_JA, "用語")
    if not terms:
        report.add("error", GLOSSARY_JA, 1, "用語集の 1〜3 章から用語を読み取れませんでした")
        return terms
    index = {t.name: i for i, t in enumerate(terms)}
    seen: dict[str, int] = {}
    for t in terms:
        if t.name in seen:
            report.add("error", GLOSSARY_JA, t.line, f"用語「{t.name}」が 2 回定義されています（最初は {seen[t.name]} 行目）")
        seen[t.name] = t.line
    for i, t in enumerate(terms):
        used = find_terms(strip_inline_code(t.definition), terms)
        later = sorted((u for u in used if index[u] > i), key=lambda u: index[u])
        for u in later:
            report.add(
                "error",
                GLOSSARY_JA,
                t.line,
                f"「{t.name}」の定義に、それより下で定義する「{u}」を使っています"
                "（定義には上で定義した言葉だけを使う決まり）",
            )
    return terms


def check_banned_words(report: Report) -> None:
    """使わない言葉のうち、機械で見分けられるものだけを調べる。

    「非同期（実行のしかたの意味で）」「ファイル（ランの対象として）」は意味で決まるので、
    term-guardian エージェントが読んで調べる。
    """
    rules = [
        (
            re.compile(r"(?<!OS )(?<![A-Za-z{0}])イベント(?![{0}])".format(KATAKANA)),
            "「イベント」を単独で使っています → OS イベント／変化／通知",
        ),
        (re.compile(r"(?<![{0}])ルール(?![{0}])".format(KATAKANA)), "「ルール」を使っています → トリガー／ジョブ"),
    ]
    targets: list[tuple[Path, int, str]] = []
    for path in BANNED_WORD_FILES:
        targets += [(path, no, line) for no, line, in_code in read_lines(path) if not in_code]
    # 用語集は用語の表の定義だけ（言い方の決まりの表は、使わない言葉そのものを書いている）
    for t in parse_glossary_terms(GLOSSARY_JA, "用語"):
        targets.append((GLOSSARY_JA, t.line, f"{t.name} | {t.definition}"))
    for path, no, line in targets:
        text = strip_inline_code(line)
        for pattern, message in rules:
            if pattern.search(text):
                report.add("warning", path, no, message)


def check_english_glossary(report: Report, ja_terms: list[Term]) -> None:
    """英訳の用語集と、用語がそろっているか（英訳は後回しなので、お知らせにとどめる）。"""
    en_terms = parse_glossary_terms(GLOSSARY_EN, "English name")
    if not en_terms:
        return
    no_name = ("—", "-", "")
    ja_names = {t.en.lower() for t in ja_terms if t.en not in no_name}
    en_names = {t.name.lower() for t in en_terms if t.name not in no_name}
    for name in sorted(ja_names - en_names):
        report.add("info", GLOSSARY_EN, 1, f"英訳に無い用語：{name}（英訳は仕様が固まってから）")
    for name in sorted(en_names - ja_names):
        report.add("info", GLOSSARY_EN, 1, f"日本語版に無い用語：{name}")


def check_design_has_only_decided(report: Report) -> None:
    """設計書には決まったことだけを書く（Roze の方針）。まだ決めていないことは宿題一覧へ。"""
    for no, line, in_code in read_lines(DESIGN):
        if in_code:
            continue
        cells = table_cells(line)
        if (line.startswith("#") and "決めること" in line) or (cells and len(cells) >= 2 and cells[1] == "決めること"):
            report.add("warning", DESIGN, no, "設計書に「決めること」があります → 宿題一覧（todo.ja.md）へ移す")
        elif "（案：" in line or "の案" in line.split("（")[0] and line.startswith("#"):
            report.add("warning", DESIGN, no, "設計書に「案」があります → 宿題一覧（todo.ja.md）へ移す")


def collect_todo(report: Report) -> None:
    """宿題一覧の「決めること」の表と、議論の記録の「残り」を集める。"""
    chapter = ""
    in_todo_table = False
    for no, line, in_code in read_lines(TODO):
        if line.startswith("## "):
            chapter = line[3:].strip()
        if in_code or not line.strip().startswith("|"):
            in_todo_table = False
            continue
        cells = table_cells(line)
        if cells is None:
            continue  # 区切りの行（|---|）
        # 2 列目が「決めること」の表だけが宿題。案の中の表（プレースホルダの一覧など）は数えない
        if len(cells) >= 2 and cells[1] == "決めること":
            in_todo_table = True
            continue
        if in_todo_table and len(cells) >= 2:
            report.todo.append((chapter, no, f"{cells[0]}：{cells[1]}"))
    current = ""
    for no, line, in_code in read_lines(DECISIONS):
        if in_code:
            continue
        m = re.match(r"^## ([A-Z]+)\.", line)
        if m:
            current = m.group(1)
        elif re.match(r"^\s*- 残り", line):
            text = line.strip()[2:]
            if len(text) > 70:
                text = text[:70] + "…"
            report.add("info", DECISIONS, no, f"論点 {current} に残りがあります：{text}")


# ---------------------------------------------------------------- 出力


def print_report(report: Report, only_errors: bool, show_todo: bool) -> None:
    e, w, i = (report.count(x) for x in ("error", "warning", "info"))
    print(f"ドキュメントの突き合わせ：エラー {e} / 警告 {w} / お知らせ {i}")
    for level in ("error", "warning", "info"):
        if only_errors and level != "error":
            continue
        items = [f for f in report.findings if f.level == level]
        if not items:
            continue
        print(f"\n[{LEVEL_NAMES[level]}]")
        for f in sorted(items, key=lambda f: (rel(f.path), f.line)):
            print(f"  {rel(f.path)}:{f.line}  {f.message}")
    if show_todo and report.todo:
        print(f"\n[宿題] 宿題一覧の「決めること」{len(report.todo)} 件")
        last = None
        for chapter, no, text in report.todo:
            if chapter != last:
                print(f"  {chapter}")
                last = chapter
            print(f"    {rel(TODO)}:{no}  {text}")


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Foxonar のドキュメントを突き合わせる")
    parser.add_argument("--todo", action="store_true", help="宿題の一覧も出す")
    parser.add_argument("--summary", action="store_true", help="件数だけを 1 行で出す")
    parser.add_argument("--only-errors", action="store_true", help="エラーだけを出す")
    args = parser.parse_args()

    report = Report()
    check_code_fences(report)
    check_links(report)
    check_decision_refs(report)
    ja_terms = check_glossary_order(report)
    check_banned_words(report)
    check_english_glossary(report, ja_terms)
    check_design_has_only_decided(report)
    collect_todo(report)

    if args.summary:
        print(
            f"エラー {report.count('error')} / 警告 {report.count('warning')} / "
            f"お知らせ {report.count('info')} / 宿題 {len(report.todo)}"
        )
    else:
        print_report(report, args.only_errors, args.todo)
    return 1 if report.count("error") else 0


if __name__ == "__main__":
    sys.exit(main())
