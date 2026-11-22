use std::{
    collections::HashMap,
    path::PathBuf,
    time::{Duration, Instant},
};

/// 受け取る OS イベントの種類
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OsEventKind {
    Created,
    Changed,
    Deleted,
}

/// 検知する変化の種類
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Created,
    Modified,
    Deleted,
}

/// デバウンスで待っている 1 パス分の状態
pub struct PathState {
    /// はじめ（最初の OS イベントの前）にパスがあったか
    existed_at_start: bool,
    /// 今（最後の OS イベントの後）パスがあるか
    exists_now: bool,
    /// 最後に OS イベントを受け取った時刻
    last_at: Instant,
}

impl PathState {
    /// 最初の OS イベントから状態を作る
    fn new(kind: OsEventKind, at: Instant) -> Self {
        Self {
            // Created だけは「その前は無かった」ことを表す
            existed_at_start: kind != OsEventKind::Created,
            exists_now: kind != OsEventKind::Deleted,
            last_at: at,
        }
    }

    /// 同じパスの OS イベントをまとめる
    fn merge(&mut self, kind: OsEventKind, at: Instant) {
        self.exists_now = kind != OsEventKind::Deleted;
        self.last_at = at;
    }

    /// 最後の OS イベントからデバウンス時間が過ぎ、変化として検知してよいかの判定
    fn is_ready(&self, now: Instant, debounce_time: Duration) -> bool {
        now >= self.last_at + debounce_time
    }

    /// 最初と最後の状態を元に、結果的な変化を出力
    fn into_changes(self) -> Vec<ChangeKind> {
        match (self.existed_at_start, self.exists_now) {
            (false, false) => vec![ChangeKind::Created, ChangeKind::Deleted],
            (false, true) => vec![ChangeKind::Created],
            (true, false) => vec![ChangeKind::Deleted],
            (true, true) => vec![ChangeKind::Modified],
        }
    }
}

pub struct Debouncer {
    /// デバウンス時間
    window_time: Duration,
    /// 状態管理
    states: HashMap<PathBuf, PathState>,
}

impl Debouncer {
    pub fn new(debounce_time: Duration) -> Self {
        Self {
            window_time: debounce_time,
            states: HashMap::new(),
        }
    }
    /// OS イベントを受け取ったら、そのパスの状態を作るか、まとめる
    pub fn push(&mut self, path: PathBuf, kind: OsEventKind, at: Instant) {
        if let Some(state) = self.states.get_mut(&path) {
            state.merge(kind, at);
        } else {
            self.states.insert(path, PathState::new(kind, at));
        }
    }

    /// デバウンス時間が過ぎたパスの状態を、変化にして消す
    pub fn flush(&mut self, now: Instant) -> Vec<(PathBuf, ChangeKind)> {
		let mut ready_to_path: Vec<PathBuf> = Vec::new();
		for (path, state) in &self.states {
			if state.is_ready(now, self.window_time) {
				ready_to_path.push(path.to_path_buf())
			}
		}

		let mut changes = Vec::new();
		for path in ready_to_path {
			if let Some(state) = self.states.remove(&path) {
				for change in state.into_changes() {
					changes.push((path.to_path_buf(), change));
				}
			}
		}
		changes
	}
}
