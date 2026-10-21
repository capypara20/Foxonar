"""PostToolUse フック：文書（docs/、AGENTS.md、CLAUDE.md）を書き換えた直後に突き合わせる。

エラーがあれば終了コード 2 で Claude に知らせ、その場で直させる（内側のループ）。
"""

from __future__ import annotations

import sys

from _common import is_watched, read_input, run_doc_check, setup_utf8, to_rel


def main() -> int:
    setup_utf8()
    data = read_input()
    file_path = (data.get("tool_input") or {}).get("file_path") or ""
    if not is_watched(to_rel(file_path)):
        return 0

    result = run_doc_check("--only-errors")
    if result.returncode != 1:
        return 0
    sys.stderr.write(
        "【フック：突き合わせ】文書を書き換えたら、機械で分かるずれが見つかりました。\n"
        "- 自分の書き間違い（リンク、残った「論点 X」、コードブロックなど）なら、今すぐ直してください。\n"
        "- 用語集の中身を変えないと直らないものは、直さずに Roze に報告してください"
        "（用語集の変更は、宿題一覧に書いて決まってから）。\n\n" + result.stdout
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
