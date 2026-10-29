use std::{path::Path, sync::mpsc};

// 一旦notifyの使い方を学ぶ
use notify::{self, Event, Result, Watcher};

pub fn watcher_core(paths_str: Vec<&str>) -> Result<()> {
    let (sender, receiver) = mpsc::channel::<Result<Event>>();
    let mut watcher = notify::recommended_watcher(sender).unwrap();

    for target_path in paths_str {
        let _ = watcher.watch(Path::new(target_path), notify::RecursiveMode::Recursive);
    }

    for res in receiver {
        match res {
            Ok(event) => println!("{:?}", event),
            Err(e) => eprintln!("error: {:?}", e),
        }
    }

    Ok(())
}

pub fn main() -> Result<()> {
    // 本来は設定ファイルからパスを取得する
    let targets_path_str = vec![
        "/home/capypara20/developer/foxonar",
        "/home/capypara20/dotfiles",
        "/mnt/c/",
    ];

    // 配列から取り出す
    watcher_core(targets_path_str).unwrap();
    Ok(())
}
