use std::{error::Error, path::Path};

// 一旦notifyの使い方を学ぶ
use foxonar::{
    conf::{BaseConf, JobTriggerConf, loader::ConfLoader},
    sys::watch::watcher_core,
};

pub fn main() -> Result<(), Box<dyn Error>> {
    // 本来は設定ファイルからパスを取得する
    let targets_path_str = vec![
        "/home/capypara20/developer/foxonar",
        "/home/capypara20/dotfiles",
        "/mnt/c/",
    ];

    // 配列から取り出す
    // watcher_core(targets_path_str)?;

    // 設定ファイル取得
    let s = "/home/capypara20/developer/foxonar/tests/data/foxonar.toml";
    let base_conf_path = Path::new(s);
    let base_conf = BaseConf::load(base_conf_path)?;
    println!("{:#?}", base_conf);
    let trig_conf_path = Path::new(s);
    let trig_conf = JobTriggerConf::load(trig_conf_path)?;
    println!("{:#?}", trig_conf);
    Ok(())
}
