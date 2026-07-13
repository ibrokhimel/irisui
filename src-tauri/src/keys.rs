//! Server-side API key storage for cloud providers, in the packaged app.
//!
//! This is the Tauri-native counterpart of the browser build's
//! `vite/keyStore.ts`. The security model is identical and non-negotiable:
//! key material lives here on disk and is NEVER handed back to the webview.
//! The webview can store a key, delete it, and ask which providers have one
//! (with a masked last-4 suffix) — but no command returns key material. Auth
//! headers are injected in Rust, at request time, by the http_fetch command.

use std::collections::BTreeMap;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// What the webview is allowed to see: which providers have a key, masked.
#[derive(serde::Serialize)]
pub struct KeyInfo {
    pub id: String,
    pub suffix: String,
}

/// Last four characters only — enough to recognize a key, useless to steal.
/// Counts and slices by char: a pasted key with any multi-byte character would
/// panic a byte-index slice mid-codepoint.
fn mask(key: &str) -> String {
    let n = key.chars().count();
    if n > 4 {
        let suffix: String = key.chars().skip(n - 4).collect();
        format!("…{suffix}")
    } else {
        "…".to_string()
    }
}

fn key_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    Ok(dir.join("keys.local.json"))
}

fn read_all(app: &AppHandle) -> BTreeMap<String, String> {
    let path = match key_file(app) {
        Ok(p) => p,
        Err(_) => return BTreeMap::new(),
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return BTreeMap::new();
    };
    let Ok(map) = serde_json::from_str::<BTreeMap<String, serde_json::Value>>(&text) else {
        return BTreeMap::new();
    };
    // Keep only non-empty string values, mirroring the JS store's tolerance
    // for a hand-edited or partially-corrupt file.
    map.into_iter()
        .filter_map(|(id, v)| match v {
            serde_json::Value::String(s) if !s.is_empty() => Some((id, s)),
            _ => None,
        })
        .collect()
}

fn write_all(app: &AppHandle, keys: &BTreeMap<String, String>) -> Result<(), String> {
    let path = key_file(app)?;
    let json = serde_json::to_string_pretty(keys).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("cannot write key file: {e}"))?;
    // Owner-only on Unix. Inert on Windows (Node's store carries the same
    // caveat) — the real network-exposure threat does not exist for a local
    // desktop app the way it does for a `vite --host` dev server.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn masked_list(keys: &BTreeMap<String, String>) -> Vec<KeyInfo> {
    keys.iter()
        .map(|(id, key)| KeyInfo {
            id: id.clone(),
            suffix: mask(key),
        })
        .collect()
}

/// Full key for one provider, for auth injection ONLY. Not a command — never
/// reachable from the webview.
pub fn key_for(app: &AppHandle, provider: &str) -> Option<String> {
    read_all(app).remove(provider)
}

#[tauri::command]
pub fn keys_list(app: AppHandle) -> Vec<KeyInfo> {
    masked_list(&read_all(&app))
}

#[tauri::command]
pub fn keys_set(app: AppHandle, id: String, key: String) -> Result<Vec<KeyInfo>, String> {
    let key = key.trim().to_string();
    if id.is_empty() || key.is_empty() {
        return Err("Missing id or key".to_string());
    }
    let mut keys = read_all(&app);
    keys.insert(id, key);
    write_all(&app, &keys)?;
    Ok(masked_list(&keys))
}

#[tauri::command]
pub fn keys_delete(app: AppHandle, id: String) -> Result<Vec<KeyInfo>, String> {
    let mut keys = read_all(&app);
    keys.remove(&id);
    write_all(&app, &keys)?;
    Ok(masked_list(&keys))
}

/// Header pairs that carry `key` for a given provider. The single source of
/// truth for provider auth shapes, mirroring vite/providerProxyPlugin.ts.
pub fn auth_headers(provider: &str, key: &str) -> Vec<(String, String)> {
    match provider {
        "openai" => vec![("Authorization".into(), format!("Bearer {key}"))],
        "anthropic" => vec![
            ("x-api-key".into(), key.to_string()),
            ("anthropic-version".into(), "2023-06-01".into()),
        ],
        _ => Vec::new(),
    }
}

/// The only host each provider's key may ever be sent to.
fn auth_host(provider: &str) -> Option<&'static str> {
    match provider {
        "openai" => Some("api.openai.com"),
        "anthropic" => Some("api.anthropic.com"),
        _ => None,
    }
}

/// Whether `url` may carry `provider`'s key. http_fetch takes both the url and
/// the provider from the webview, so without this check any JS running in the
/// page could aim a stored key at a host of its choosing. Requires https and an
/// exact host match; an unknown provider authorizes nothing.
pub fn may_authorize(provider: &str, url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    parsed.scheme() == "https" && auth_host(provider) == parsed.host_str()
}

#[cfg(test)]
mod tests {
    use super::{auth_headers, mask, may_authorize};

    #[test]
    fn masks_to_last_four() {
        assert_eq!(mask("sk-abcd1234"), "…1234");
    }

    #[test]
    fn masks_short_keys_without_leaking() {
        assert_eq!(mask("abc"), "…");
        assert_eq!(mask("abcd"), "…");
    }

    #[test]
    fn masks_multibyte_keys_without_panicking() {
        // Byte index len-4 lands inside the emoji; slicing there would panic.
        assert_eq!(mask("a🔑bcd"), "…🔑bcd");
    }

    #[test]
    fn authorizes_only_the_providers_own_host() {
        assert!(may_authorize("openai", "https://api.openai.com/v1/chat/completions"));
        assert!(may_authorize("anthropic", "https://api.anthropic.com/v1/messages"));
        // The key must not follow the url anywhere else.
        assert!(!may_authorize("openai", "https://attacker.example/v1/chat/completions"));
        assert!(!may_authorize("openai", "https://api.anthropic.com/v1/messages"));
        // Nor to a lookalike host that merely ends with the real one.
        assert!(!may_authorize("openai", "https://api.openai.com.attacker.example/v1"));
        // Nor in the clear.
        assert!(!may_authorize("openai", "http://api.openai.com/v1/chat/completions"));
        // An unknown provider authorizes nothing.
        assert!(!may_authorize("ollama", "https://api.openai.com/v1/chat/completions"));
        assert!(!may_authorize("openai", "not a url"));
    }

    #[test]
    fn openai_uses_bearer() {
        assert_eq!(
            auth_headers("openai", "K"),
            vec![("Authorization".to_string(), "Bearer K".to_string())]
        );
    }

    #[test]
    fn anthropic_uses_x_api_key_and_version() {
        let h = auth_headers("anthropic", "K");
        assert!(h.contains(&("x-api-key".to_string(), "K".to_string())));
        assert!(h.contains(&("anthropic-version".to_string(), "2023-06-01".to_string())));
    }

    #[test]
    fn unknown_provider_gets_no_headers() {
        assert!(auth_headers("mystery", "K").is_empty());
    }
}
