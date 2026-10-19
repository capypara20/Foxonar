"""フックで共通に使う道具。

フックは Claude Code が自動で呼ぶ小さなプログラム。標準入力に JSON が届く。
終了コード 2 で終わると、標準エラーに書いた文が Claude に届く（Claude はそれを読んで動く）。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
DOC_CHECK = ROOT / "scripts" / "doc_check.py"
NOTES = ROOT / ".claude" / "notes.md"
# AI の基盤の話だけを書く作業メモ。ai-loop ブランチにだけ入れ、main の notes.md と混ぜないために分けた
NOTES_AI = ROOT / ".claude" / "notes-ai.md"
STATE = ROOT / ".claude" / "state" / "hook_state.json"

# 書き換えたら突き合わせを走らせるファイル（ROOT からの相対パス）
WATCHED_DIRS = ("docs",)
WATCHED_FILES = ("AGENTS.md", "CLAUDE.md")


def setup_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def read_input() -> dict:
    try:
        return json.loads(sys.stdin.buffer.read().decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def to_rel(path: str | Path) -> str | None:
    """ROOT からの相対パス（/ 区切り）。ROOT の外なら None。"""
    try:
        p = Path(path)
        if not p.is_absolute():
            p = ROOT / p
        r = os.path.relpath(os.path.normcase(p.resolve()), os.path.normcase(ROOT.resolve()))
    except (OSError, ValueError):
        return None
    if r.startswith(".."):
        return None
    return Path(r).as_posix()


def is_watched(rel: str | None) -> bool:
    if not rel or not rel.lower().endswith(".md"):
        return False
    first = rel.split("/", 1)[0].lower()
    return first in WATCHED_DIRS or rel.lower() in (f.lower() for f in WATCHED_FILES)


def run_doc_check(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(DOC_CHECK), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=ROOT,
    )


def changed_doc_files() -> list[Path]:
    """git で見て、まだコミットしていない変更がある文書（削除したものは除く）。"""
    try:
        out = subprocess.run(
            ["git", "status", "--porcelain", "-z", "--", *WATCHED_DIRS, *WATCHED_FILES],
            capture_output=True,
            cwd=ROOT,
            check=True,
        ).stdout.decode("utf-8")
    except (OSError, subprocess.CalledProcessError):
        return []
    files = []
    tokens = out.split("\0")
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        i += 1
        if len(tok) < 4:
            continue
        status, path = tok[:2], tok[3:]
        if status[0] in "RC":
            i += 1  # 名前変更は、次に元の名前が来る
        p = ROOT / path
        if is_watched(path) and p.exists():
            files.append(p)
    return files


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
