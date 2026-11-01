// 一旦notifyの使い方を学ぶ
use foxonar::sys::watch::watcher_core;
use notify::{self, Result};

pub fn main() -> Result<()> {
    // 本来は設定ファイルからパスを取得する
    let targets_path_str = vec![
        "/home/capypara20/developer/foxonar",
        "/home/capypara20/dotfiles",
        "/mnt/c/",
    ];

    // 配列から取り出す
    watcher_core(targets_path_str)?;
    Ok(())
}
