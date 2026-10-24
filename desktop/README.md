# Stitch desktop

The editor as a Tauri 2 app. It's the same build as the web editor (`packages/editor/dist`);
the difference is networking: the stage's HTTP requests go through Tauri's HTTP plugin, so
they're made natively and CORS doesn't apply. Host prompts, secrets and the stage sandbox work
as in the browser ([docs/network.md](../docs/network.md)).

## Run and build

Needs Rust (https://rustup.rs), the Tauri prerequisites for your system
(https://v2.tauri.app/start/prerequisites/) and the CLI:
`cargo install tauri-cli --version "^2" --locked`.

```sh
cd desktop
cargo tauri dev     # starts `pnpm dev` and opens the app on it
cargo tauri build   # runs `pnpm build`; installers land in src-tauri/target/release/bundle/
```

## Notes

- The capability file allows every http(s) URL at the plugin level, because the editor asks
  per host itself. Narrow it if you ship a build for a fixed set of APIs.
- Secrets live in the app's own webview storage, not your browser's.
- The icons are generated from the Stitch logo by `pnpm --filter @stitch/editor icons`.
- Exported games have their own Tauri template (Cart → Export → Desktop project).
