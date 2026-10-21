// exe（エクスプローラー上のファイル）のアイコンを埋め込む
use image::codecs::ico::{IcoEncoder, IcoFrame};
use image::imageops::FilterType;
use std::{env, fs::File, path::PathBuf};

// build.rs の中の相対パスは Cargo.toml がある場所が起点
const ICON_SRC: &str = "assets/icon.png";

fn main() {
    println!("cargo:rerun-if-changed={ICON_SRC}");

    let src = image::open(ICON_SRC).expect("アイコン画像を開けません");

    // Windowsは用途ごとにサイズを使い分けるので、複数サイズを1つの.icoに入れる
    let frames: Vec<IcoFrame> = [16u32, 32, 48, 64, 128, 256]
        .iter()
        .map(|&s| {
            let rgba = src.resize_exact(s, s, FilterType::Lanczos3).to_rgba8();
            IcoFrame::as_png(rgba.as_raw(), s, s, image::ExtendedColorType::Rgba8)
                .expect("ico変換に失敗")
        })
        .collect();

    let ico_path = PathBuf::from(env::var("OUT_DIR").unwrap()).join("icon.ico");
    IcoEncoder::new(File::create(&ico_path).unwrap())
        .encode_images(&frames)
        .expect("icoの書き出しに失敗");

    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set_icon(ico_path.to_str().unwrap());
        res.compile().expect("アイコンの埋め込みに失敗");
    }
}
