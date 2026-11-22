use crate::logic::debounce::OsEventKind;
use notify::{self, Event, EventKind, RecommendedWatcher, Result, Watcher};
use std::{
    path::Path,
    sync::mpsc::{self, Receiver},
};

/// 監視フォルダの見張りを始め、OS イベントの受け口を返す
///
/// watcher は捨てると見張りが止まるので、受け口と一緒に呼び出し元へ返し、
/// 持ち続けてもらう。
pub fn start(paths: &[&str]) -> Result<(RecommendedWatcher, Receiver<Result<Event>>)> {
    let (sender, receiver) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(sender)?;
    for target_path in paths {
        // 見張れなかったフォルダを黙って飛ばさないよう、エラーは呼び出し元へ返す
        watcher.watch(Path::new(target_path), notify::RecursiveMode::Recursive)?;
    }
    Ok((watcher, receiver))
}

/// notify の種類を、デバウンスに渡す OS イベントの種類に直す
///
/// 開いただけ（Access）など、デバウンスに要らない種類は None にして捨てる。
/// 名前変更（Modify の Name）も今は Changed として扱う（本当の扱いは設計書 5.5）。
pub fn to_os_event_kind(kind: &EventKind) -> Option<OsEventKind> {
    match kind {
        EventKind::Create(_) => Some(OsEventKind::Created),
        EventKind::Modify(_) => Some(OsEventKind::Changed),
        EventKind::Remove(_) => Some(OsEventKind::Deleted),
        _ => None,
    }
}
