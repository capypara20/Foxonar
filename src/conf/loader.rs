use std::{error::Error, fs::read_to_string, path::Path};

use serde::de::DeserializeOwned;

use crate::conf::{BaseConf, JobTriggerConf};

/// 設定ファイルローダー
pub trait ConfLoader: DeserializeOwned {
    fn load(path: &Path) -> Result<Self, Box<dyn Error>> {
        let contents = read_to_string(path)?;
        let conf = toml::from_str(&contents)?;
        Ok(conf)
    }
}

impl ConfLoader for BaseConf {}
impl ConfLoader for JobTriggerConf {}
