<p align="center">
  <img src="assets/icon.png" width="128" alt="Foxonar icon">
</p>

<h1 align="center">Foxonar</h1>

<p align="center"><a href="README.md">日本語</a> | English</p>

Foxonar is a resident app that watches folders, detects when files arrive, change, or disappear, and starts the jobs you have set up (copy, move, starting a program, and so on). It is written in Rust.

> [!NOTE]
> **Foxonar is in the design phase.** There is no working program yet. What has been decided so far is in the [design document](docs/design.md).

## Example

```
cat.jpg arrives in C:\inbox
  │  wait until writing has finished
  ▼
matches the trigger "When a photo arrives" (watched folder inbox, create, *.jpg)
  │
  ├─ job "Thumbnail" ─┐
  └─ job "Backup"    ─┘ execute concurrently
        │
        ▼
the results go to the run log, which you can view in the browser (Web UI)
```

## Planned features

- **Watch**: Windows and Linux (including servers without a screen). For each watched folder, choose how deep to watch and whether to include hidden files.
- **Tell changes apart**: create, modify, delete, rename, and move. Even when the OS reports many small notifications (copying a large file, saving in Word), they are merged into one change.
- **Wait**: jobs start only after writing has finished. When a whole folder is copied in, Foxonar waits until its contents are complete.
- **Execute**: copy, move, delete, and starting a program (exec). No shell is involved, so a file name is never executed as a command.
- **Record**: every detected change goes to the detection log, and every job result to the run log. Even without jobs, you can check what files arrived. When a job did not execute, the run log tells you why.
- **Notify**: choose which of "arrived", "succeeded", and "failed" to show as desktop notifications.
- **Configure**: a TOML file. It can also be edited from the browser, and is reloaded automatically when it changes.

## Documents

| Document | Contents |
|---|---|
| [Design document](docs/design.md) ([Japanese](docs/design.ja.md)) | How things are done, as decided, and why |
| [Glossary](docs/glossary.md) ([Japanese](docs/glossary.ja.md)) | The meaning of the words used in Foxonar |
| [To-do list](docs/todo.ja.md) (Japanese only) | What is not decided yet, and the proposals |
| [Flow page](docs/flow.html) (Japanese only) | Follows the design document's examples step by step on a flow diagram. GitHub shows it as HTML source, so clone or download it and open it in a browser |

- The Japanese documents are authoritative. If a translation disagrees, follow the Japanese version.

## Development

- Language: Rust 1.98.1 (pinned in `rust-toolchain.toml`)
- Developed mainly in WSL (Ubuntu-24.04); Windows builds are also made from WSL. See [design document 9.1](docs/design.md#91-development-setup).
- Designed together with AI agents (Claude Code, etc.). The instructions for AI agents are in [AGENTS.md](AGENTS.md) (Japanese).

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or <http://opensource.org/licenses/MIT>)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
