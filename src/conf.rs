pub mod loader;
use serde::Deserialize;

/// 監視ディレクトリ基本設定構造体(foxonar.toml)
#[derive(Debug, Deserialize)]
pub struct BaseConf {
    /// 監視ディレクトリ構造体
    pub folder: Vec<TargetFolderConf>,
}

/// job・trigger 設定構造体(hooks.toml)
#[derive(Debug, Deserialize)]
pub struct JobTriggerConf {
    /// Trigger 設定構造体
    /// トリガーの無い監視フォルダを書いてよい（設計書 4.3）ので、書かなければ空にする
    #[serde(default)]
    pub trigger: Vec<TriggerConf>,
    /// Job 設定構造体（トリガーが無ければ、ジョブも無くてよい）
    #[serde(default)]
    pub job: Vec<JobConf>,
}

/// 監視ディレクトリ構造体
#[derive(Debug, Deserialize)]
pub struct TargetFolderConf {
    /// 設定のID(トリガー設定で参照)
    pub id: FolderId,
    /// nameを付与するかは任意であるためOption型に
    pub name: Option<String>,
    /// 監視するパス
    pub path: String,
    /// 監視する最大の深さ
    pub max_depth: u16,
}

/// トリガー設定構造体
#[derive(Debug, Deserialize)]
pub struct TriggerConf {
    /// 設定のID(jobで参照)
    pub id: TriggerId,
    /// nameを付与するかは人であるためOption型に
    pub name: Option<String>,
    /// 監視フォルダのID
    pub target_folder_id: FolderId,
    /// 変化の種類
    pub changes: Vec<Change>,
    /// フィルタ(Glob, Regex)
    pub filter: Option<Filter>,
    /// トリガーを下に実行するjobID
    pub jobs: Vec<JobId>,
}

/// Job設定構造体
#[derive(Debug, Deserialize)]
pub struct JobConf {
    /// JobID(トリガーで参照)
    pub id: JobId,
    /// JobName(任意)
    pub name: Option<String>,
    /// 処理
    pub steps: Vec<Step>,
}

// 監視設定ID
#[derive(Debug, Deserialize, Clone, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct FolderId(String);

// トリガーID
#[derive(Debug, Deserialize, Clone, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct TriggerId(String);

// jobID
#[derive(Debug, Deserialize, Clone, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct JobId(String);

/// 検知種類
#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Change {
    Create,
    Modify,
    Delete,
    Rename,
    Move,
}

// 正規表現なのかGlobなのか
#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Filter {
    Glob(String),
    Regex(String),
}

#[derive(Debug, Deserialize)]
pub struct Step {
    pub exec: String, // 動かすプログラム
    // 引数が無いときは書かなくてよい。書かなければ空の配列にして、
    // 「引数なし」の形を 1 つにする（None と [] の 2 通りにしない）
    #[serde(default)]
    pub args: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- foxonar.toml：監視フォルダ ----

    // 設定ファイルに書いた値が、そのまま struct に入るか
    #[test]
    fn read_folder() {
        let text = r#"
            [[folder]]
            id = "inbox"
            name = "受信箱"
            path = "/home/roze/in"
            max_depth = 2

            [[folder]]
            id = "photos"
            path = "/home/roze/photos"
            max_depth = 0
        "#;
        let conf: BaseConf = toml::from_str(text).unwrap();

        assert_eq!(conf.folder.len(), 2);
        assert_eq!(conf.folder[0].id, FolderId("inbox".to_string()));
        assert_eq!(conf.folder[0].name, Some("受信箱".to_string()));
        assert_eq!(conf.folder[0].path, "/home/roze/in");
        assert_eq!(conf.folder[0].max_depth, 2);
        // name は書かなくてよい（4.3）
        assert_eq!(conf.folder[1].name, None);
        // 0 は「制限なし」の意味だが、読んだ時点では 0 のまま届く（4.3）
        assert_eq!(conf.folder[1].max_depth, 0);
    }

    // 設計書 9.6 の foxonar.toml の例が読めるか。'…' で囲んだ Windows のパスは、\ がそのまま残る
    #[test]
    fn read_design_example_foxonar() {
        let text = r#"
            [[folder]]
            id = "inbox"
            name = "受信箱"
            path = 'C:\in'
            max_depth = 0      # 0 は制限なし
        "#;
        let conf: BaseConf = toml::from_str(text).unwrap();
        assert_eq!(conf.folder[0].path, r"C:\in");
    }

    // max_depth は必ず書く。書かなければ読み込みの失敗（9.6）
    #[test]
    fn missing_max_depth_is_error() {
        let text = r#"
            [[folder]]
            id = "inbox"
            path = "/home/roze/in"
        "#;
        let result: Result<BaseConf, _> = toml::from_str(text);
        assert!(result.is_err());
    }

    // ---- hooks.toml：トリガー ----

    // 設計書 9.6 の hooks.toml の例が、トリガーとジョブを 1 つのファイルに書いたまま読めるか
    #[test]
    fn read_design_example_hooks() {
        let text = r#"
            [[trigger]]
            id = "photos"
            name = "写真が来たら"
            target_folder_id = "inbox"    # foxonar.toml の監視フォルダ
            changes = ["create", "rename"]
            filter = { glob = "*.jpg" }
            jobs = ["thumbnail"]          # このファイルの下のジョブ

            [[job]]
            id = "thumbnail"
            name = "サムネイル"
            steps = [
              { exec = "magick", args = ['${path}', '-resize', '200x200', '${dir}\thumb_${name}'] },
            ]
        "#;
        let hooks: JobTriggerConf = toml::from_str(text).unwrap();
        let t = &hooks.trigger[0];

        assert_eq!(t.id, TriggerId("photos".to_string()));
        assert_eq!(t.name, Some("写真が来たら".to_string()));
        assert_eq!(t.target_folder_id, FolderId("inbox".to_string()));
        assert_eq!(t.changes, vec![Change::Create, Change::Rename]);
        assert_eq!(t.filter, Some(Filter::Glob("*.jpg".to_string())));
        assert_eq!(t.jobs, vec![JobId("thumbnail".to_string())]);
        // トリガーが指すジョブが、同じファイルの中にある
        assert_eq!(hooks.job[0].id, t.jobs[0]);
        // '…' の中の \ はそのまま
        assert_eq!(hooks.job[0].steps[0].args[3], r"${dir}\thumb_${name}");
    }

    // トリガーのジョブは、書いた順のまま並ぶ
    #[test]
    fn trigger_jobs_keep_order() {
        let text = r#"
            [[trigger]]
            id = "photos"
            target_folder_id = "inbox"
            changes = ["create"]
            jobs = ["thumbnail", "backup"]
        "#;
        let hooks: JobTriggerConf = toml::from_str(text).unwrap();
        assert_eq!(
            hooks.trigger[0].jobs,
            vec![JobId("thumbnail".to_string()), JobId("backup".to_string())]
        );
    }

    // 変化の種類 5 つが、すべて読めるか
    #[test]
    fn read_all_changes() {
        let text = r#"
            [[trigger]]
            id = "all"
            target_folder_id = "inbox"
            changes = ["create", "modify", "delete", "rename", "move"]
            jobs = ["j1"]
        "#;
        let hooks: JobTriggerConf = toml::from_str(text).unwrap();
        assert_eq!(
            hooks.trigger[0].changes,
            vec![
                Change::Create,
                Change::Modify,
                Change::Delete,
                Change::Rename,
                Change::Move,
            ]
        );
    }

    // フィルタは regex でも書ける。書かなければ None（9.6）
    #[test]
    fn read_filter_regex_and_none() {
        let text = r#"
            [[trigger]]
            id = "with-regex"
            target_folder_id = "inbox"
            changes = ["create"]
            filter = { regex = '^IMG_\d+\.jpg$' }
            jobs = ["j1"]

            [[trigger]]
            id = "no-filter"
            target_folder_id = "inbox"
            changes = ["create"]
            jobs = ["j1"]
        "#;
        let hooks: JobTriggerConf = toml::from_str(text).unwrap();
        assert_eq!(
            hooks.trigger[0].filter,
            Some(Filter::Regex(r"^IMG_\d+\.jpg$".to_string()))
        );
        assert_eq!(hooks.trigger[1].filter, None);
    }

    // 変化の種類の打ち間違いは、読み込みの失敗
    #[test]
    fn unknown_change_is_error() {
        let text = r#"
            [[trigger]]
            id = "photos"
            target_folder_id = "inbox"
            changes = ["craete"]
            jobs = ["j1"]
        "#;
        let result: Result<JobTriggerConf, _> = toml::from_str(text);
        assert!(result.is_err());
    }

    // glob と regex の両方は書けない（9.6）
    #[test]
    fn both_glob_and_regex_is_error() {
        let text = r#"
            [[trigger]]
            id = "photos"
            target_folder_id = "inbox"
            changes = ["create"]
            filter = { glob = "*.jpg", regex = ".*" }
            jobs = ["j1"]
        "#;
        let result: Result<JobTriggerConf, _> = toml::from_str(text);
        assert!(result.is_err());
    }

    // トリガーの無い監視フォルダを書いてよい（4.3）ので、hooks.toml が空でも読める
    #[test]
    fn empty_hooks_is_ok() {
        let hooks: JobTriggerConf = toml::from_str("").unwrap();
        assert!(hooks.trigger.is_empty());
        assert!(hooks.job.is_empty());
    }

    // ---- hooks.toml：ジョブ ----

    // ステップは書いた順に並ぶ
    #[test]
    fn read_job() {
        // { } の中の改行と、最後の , は TOML 1.1 の書き方（9.6）
        let text = r#"
            [[job]]
            id = "thumbnail"
            name = "サムネイル"
            steps = [
              { exec = "magick", args = ['${path}', '-resize', '200x200', '${dir}/thumb_${name}'] },
              {
                exec = "upload",
                args = ['${dir}/thumb_${name}'],
              },
            ]
        "#;
        let hooks: JobTriggerConf = toml::from_str(text).unwrap();
        let j = &hooks.job[0];

        assert_eq!(j.id, JobId("thumbnail".to_string()));
        assert_eq!(j.name, Some("サムネイル".to_string()));
        assert_eq!(j.steps.len(), 2);
        assert_eq!(j.steps[0].exec, "magick");
        assert_eq!(
            j.steps[0].args,
            vec!["${path}", "-resize", "200x200", "${dir}/thumb_${name}"]
        );
        assert_eq!(j.steps[1].exec, "upload");
        // ジョブだけで、トリガーが無くても読める（4.3）
        assert!(hooks.trigger.is_empty());
    }

    // args は書かなくてよい。書かなくても、空の配列を書いても、同じ「引数なし」になる（9.6）
    #[test]
    fn args_can_be_omitted() {
        let text = r#"
            [[job]]
            id = "no-args"
            steps = [
              { exec = "sync" },
              { exec = "sync", args = [] },
            ]
        "#;
        let hooks: JobTriggerConf = toml::from_str(text).unwrap();
        let steps = &hooks.job[0].steps;
        assert_eq!(steps[0].args, Vec::<String>::new());
        assert_eq!(steps[1].args, Vec::<String>::new());
    }
}
