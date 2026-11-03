use std::{error::Error, path::Path};

// 一旦notifyの使い方を学ぶ
use foxonar::{
    conf::{BaseConf, JobTriggerConf, loader::ConfLoader},
    sys::watch::watcher_core,
};

pub fn main() -> Result<(), Box<dyn Error>> {
    // 設定ファイル取得
    let s = "/home/capypara20/developer/foxonar/tests/data/foxonar.toml";
    let s2 = "/home/capypara20/developer/foxonar/tests/data/trigger.toml";

	// 監視ディレクトリ設定
    let base_conf = BaseConf::load(Path::new(s))?;
    eprintln!("{:#?}", base_conf);
    let target_path: Vec<&str> = base_conf.folder.iter().map(|f| f.path.as_str()).collect();
	
	// トリガー設定
    let trig_conf = JobTriggerConf::load(Path::new(s2))?;
    eprintln!("{:#?}", trig_conf);

	// 監視開始
    watcher_core(target_path)?;

    Ok(())
}
