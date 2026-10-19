"""SessionStart フック：会話の始まり（と要約のあと）に、今の状態を Claude に渡す。

標準出力に書いた文は、Claude が読む前置きになる。会話が要約されて記憶が薄れても、
ここで「まだやっていないこと」と突き合わせの件数を、毎回思い出せるようにする。
作業メモは 2 つある（設計の notes.md と、AI の基盤の notes-ai.md）ので、両方を読む。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from _common import NOTES, NOTES_AI, read_input, run_doc_check, setup_utf8

MAX_LINES = 40


def todo_section(path: Path) -> list[str]:
    name = f".claude/{path.name}"
    if not path.exists():
        return [f"（{name} がまだありません）"]
    lines = path.read_text(encoding="utf-8").splitlines()
    start = next((i for i, l in enumerate(lines) if re.match(r"^## まだやっていないこと", l)), None)
    if start is None:
        return [f"（{name} に「## まだやっていないこと」がありません）"]
    body = []
    for line in lines[start + 1 :]:
        if line.startswith("## "):
            break
        if line.strip():
            body.append(line)
    if len(body) > MAX_LINES:
        body = body[:MAX_LINES] + [f"…（続きは {name}。全 {len(body)} 行）"]
    return body or ["（なし）"]


def main() -> int:
    setup_utf8()
    source = read_input().get("source", "")
    summary = run_doc_check("--summary").stdout.strip() or "（実行できませんでした）"

    print("# Foxonar の今の状態（SessionStart フックが自動で表示）")
    if source == "compact":
        print("会話が要約されました。細かい経緯は .claude/notes.md と docs/ を読み直してください。")
    print(f"\n突き合わせ（python scripts/doc_check.py）：{summary}")
    print("\n## 作業メモの「まだやっていないこと」")
    print("\n".join(todo_section(NOTES)))
    # main のように AI の基盤のファイルが無いブランチでは、何も出さない
    if NOTES_AI.exists():
        print("\n## AI の基盤のメモ（notes-ai.md）の「まだやっていないこと」")
        print("\n".join(todo_section(NOTES_AI)))
    print("\n決まりは AGENTS.md、会話の要点は .claude/notes.md（AI の基盤は .claude/notes-ai.md）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
