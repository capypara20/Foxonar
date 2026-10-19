"""Stop フック：Claude が返事を終えようとしたときの、最後の確認。

コミットしていない文書の変更があるときだけ、次の 2 つを確かめる。
1. 突き合わせでエラーが無いか（Bash で書き換えた分も、ここで拾う）
2. 作業メモ（.claude/notes.md）が、文書の変更より新しいか

どちらかに引っかかったら終了コード 2 で止め、Claude にもう一度だけ動いてもらう。
同じ理由で何度も止めないように、知らせた内容を .claude/state/ に覚えておく。
"""

from __future__ import annotations

import hashlib
import sys

from _common import (
    NOTES,
    changed_doc_files,
    load_state,
    read_input,
    run_doc_check,
    save_state,
    setup_utf8,
)


def main() -> int:
    setup_utf8()
    data = read_input()
    if data.get("stop_hook_active"):
        return 0  # このフックで一度止めたあとなので、今回は通す（止め続けない）

    changed = changed_doc_files()
    if not changed:
        return 0

    state = load_state()
    reasons: list[str] = []

    result = run_doc_check("--only-errors")
    if result.returncode == 1:
        digest = hashlib.sha1(result.stdout.encode("utf-8")).hexdigest()
        if state.get("last_error_digest") != digest:
            state["last_error_digest"] = digest
            reasons.append(
                "突き合わせでエラーがあります。自分の書き間違いなら直し、"
                "Roze の判断が要るものは報告に含めてください。\n" + result.stdout
            )
    else:
        state.pop("last_error_digest", None)

    latest_doc = max(p.stat().st_mtime for p in changed)
    notes_time = NOTES.stat().st_mtime if NOTES.exists() else 0.0
    if notes_time < latest_doc and state.get("notes_nudged_for", 0.0) < latest_doc:
        state["notes_nudged_for"] = latest_doc
        names = "、".join(sorted(p.relative_to(NOTES.parents[1]).as_posix() for p in changed))
        reasons.append(
            f"作業メモ（.claude/notes.md）が、文書の変更（{names}）より古いです。"
            "決まったことがあれば save-notes スキルで書き足してください。"
            "言い回しの直しだけなら、更新は要りません（そのまま終わってよい）。"
        )

    save_state(state)
    if not reasons:
        return 0
    sys.stderr.write("【フック：終わる前の確認】\n\n" + "\n\n".join(reasons))
    return 2


if __name__ == "__main__":
    sys.exit(main())
