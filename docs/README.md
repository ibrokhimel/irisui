# IrisUI docs

Start at the [project README](../README.md) for setup and a tour.

## Reference

- **[FEATURES.md](FEATURES.md)** — the complete feature list for v1.0, written to be honest about what is and isn't real (where Ollama has no underlying capability, IrisUI doesn't pretend it does).

## Design docs & plans

`superpowers/` holds the working documents behind larger pieces of work — a **spec** describes the design, a **plan** breaks it into implementation steps. They're kept as a record of *why* things are shaped the way they are, and are not user-facing documentation.

| Doc | Type | What it covers |
|---|---|---|
| [system-monitor-and-custom-themes-design](superpowers/specs/2026-07-11-system-monitor-and-custom-themes-design.md) | spec | Live hardware/system monitor panel and the custom theme system. |
| [system-monitor-and-custom-themes](superpowers/plans/2026-07-11-system-monitor-and-custom-themes.md) | plan | Implementation breakdown for the above. |
| [irisui-brand-v05-v06](superpowers/plans/2026-07-11-irisui-brand-v05-v06.md) | plan | The IRIS mark, wordmark, and motion system. |

> The Tauri desktop migration (IrisOS) has its own spec and plan, which currently live on the unmerged `feat/tauri-migration` branch and will land here when that work merges.
