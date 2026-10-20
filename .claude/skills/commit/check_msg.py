#!/usr/bin/env python3
"""コミットメッセージが Roze の形式に合っているかを確かめる。

形式：タイトル 50 文字以内 → 空行 → 本文（1 行 72 桁以内。全角は 2 桁）

使い方:
    python .claude/skills/commit/check_msg.py < message.txt
終了コード: 0 = OK / 1 = NG
"""

from __future__ import annotations

import sys
import unicodedata

TITLE_MAX_CHARS = 50
BODY_MAX_WIDTH = 72


def width(text: str) -> int:
    """表示の幅。全角（W・F）は 2、それ以外は 1 と数える。"""
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in text)


def check(message: str) -> list[str]:
    lines = message.strip("\n").splitlines()
    if not lines or not lines[0].strip():
        return ["1 行目（タイトル）が空です"]
    problems = []
    title = lines[0]
    if len(title) > TITLE_MAX_CHARS:
        problems.append(f"タイトルが {len(title)} 文字です（{TITLE_MAX_CHARS} 文字以内）")
    if title.rstrip().endswith("。"):
        problems.append("タイトルの最後に句点（。）があります")
    if len(lines) > 1 and lines[1].strip():
        problems.append("2 行目は空行にしてください")
    for no, line in enumerate(lines[2:], start=3):
        if line.startswith("Co-Authored-By:") or "://" in line:
            continue  # 署名と URL は折り返せないので数えない
        w = width(line)
        if w > BODY_MAX_WIDTH:
            problems.append(f"{no} 行目が {w} 桁です（{BODY_MAX_WIDTH} 桁以内）：{line}")
    return problems


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    message = sys.stdin.buffer.read().decode("utf-8")
    problems = check(message)
    if problems:
        print("NG")
        for p in problems:
            print(f"- {p}")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
