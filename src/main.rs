use std::{
    error::Error,
    path::Path,
    sync::mpsc::RecvTimeoutError,
    time::{Duration, Instant},
};

// 一旦notifyの使い方を学ぶ
use foxonar::{
    conf::{BaseConf, JobTriggerConf, loader::ConfLoader},
    logic::debounce::Debouncer,
    sys::watch,
};

pub fn main() -> Result<(), Box<dyn Error>> {
    // 設定ファイル取得
    let s = "/home/capypara20/Foxonar/tests/data/foxonar.toml";
    let s2 = "/home/capypara20/Foxonar/tests/data/trigger.toml";

    // 監視ディレクトリ設定
    let base_conf = BaseConf::load(Path::new(s))?;
    eprintln!("{:#?}", base_conf);
    let target_path: Vec<&str> = base_conf.folder.iter().map(|f| f.path.as_str()).collect();

    // トリガー設定
    let trig_conf = JobTriggerConf::load(Path::new(s2))?;
    eprintln!("{:#?}", trig_conf);

    // 監視開始。_watcher は使わないが、捨てると見張りが止まるので持ち続ける
    let (_watcher, rx) = watch::start(&target_path)?;
    // デバウンス時間は仮に 500ms（既定の値は宿題一覧 4.5 で決める）
    let mut debouncer = Debouncer::new(Duration::from_millis(500));

    loop {
        // 何も届かなくても 100ms ごとに目を覚まし、デバウンス時間が過ぎたかを見る
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Ok(event)) => {
                if let Some(kind) = watch::to_os_event_kind(&event.kind) {
                    // 時計を見るのは main の役目。debounce には時刻を渡すだけ
                    let now = Instant::now();
                    for path in event.paths {
                        debouncer.push(path, kind, now);
                    }
                }
            }
            Ok(Err(e)) => eprintln!("error: {e:?}"),
            Err(RecvTimeoutError::Timeout) => {}
            // 受け取り役が止まったら、もう何も届かないので抜ける
            Err(RecvTimeoutError::Disconnected) => break,
        }

        for (path, change) in debouncer.flush(Instant::now()) {
            println!("{change:?} {}", path.display());
        }
    }

    Ok(())
}
