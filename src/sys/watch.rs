use notify::{self, Event, Result, Watcher};
use std::{path::Path, sync::mpsc};

pub fn watcher_core(paths_str: Vec<&str>) -> Result<()> {
    let (sender, receiver) = mpsc::channel::<Result<Event>>();
    let mut watcher = notify::recommended_watcher(sender).unwrap();
    for target_path in paths_str {
        let _ = watcher.watch(Path::new(target_path), notify::RecursiveMode::Recursive);
    }
    for res in receiver {
        match res {
            Ok(event) => println!("{:#?}", event),
            Err(e) => eprintln!("error: {:?}", e),
        }
    }
    Ok(())
}
