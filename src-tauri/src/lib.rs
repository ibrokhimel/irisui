use std::process::Command;
use sysinfo::{Disks, System};

// Field names are renamed to match the SystemSnapshot interface the frontend
// already consumes (src/lib/system.ts), so useSystemMonitor.ts and
// SystemMonitor.tsx need no changes when this replaces the old /api/system
// Vite middleware.

#[derive(serde::Serialize)]
struct GpuStats {
    name: String,
    #[serde(rename = "utilPct")]
    util_pct: u32,
    #[serde(rename = "vramUsedMb")]
    vram_used_mb: u64,
    #[serde(rename = "vramTotalMb")]
    vram_total_mb: u64,
    #[serde(rename = "tempC")]
    temp_c: u32,
}

#[derive(serde::Serialize)]
struct Cpu {
    #[serde(rename = "utilPct")]
    util_pct: u32,
    cores: usize,
}

#[derive(serde::Serialize)]
struct Ram {
    #[serde(rename = "usedBytes")]
    used_bytes: u64,
    #[serde(rename = "totalBytes")]
    total_bytes: u64,
}

#[derive(serde::Serialize)]
struct Disk {
    #[serde(rename = "freeBytes")]
    free_bytes: u64,
    #[serde(rename = "totalBytes")]
    total_bytes: u64,
}

#[derive(serde::Serialize)]
struct SystemSnapshot {
    gpu: Option<GpuStats>,
    cpu: Cpu,
    ram: Ram,
    disk: Option<Disk>,
}

/// One CSV line from `nvidia-smi --format=csv,noheader,nounits`:
/// `name, util, mem.used, mem.total, temp`. Any malformed field yields None,
/// which the panel renders as "no GPU" rather than an error.
fn parse_nvidia_smi(line: &str) -> Option<GpuStats> {
    let parts: Vec<&str> = line.split(',').map(str::trim).collect();
    if parts.len() < 5 || parts[0].is_empty() {
        return None;
    }
    Some(GpuStats {
        name: parts[0].to_string(),
        util_pct: parts[1].parse().ok()?,
        vram_used_mb: parts[2].parse().ok()?,
        vram_total_mb: parts[3].parse().ok()?,
        temp_c: parts[4].parse().ok()?,
    })
}

fn query_gpu() -> Option<GpuStats> {
    let out = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    parse_nvidia_smi(String::from_utf8_lossy(&out.stdout).lines().next()?)
}

/// Largest disk by total space — a good proxy for where Ollama keeps its
/// models without re-implementing the old plugin's OLLAMA_MODELS path probing.
fn query_disk() -> Option<Disk> {
    Disks::new_with_refreshed_list()
        .list()
        .iter()
        .max_by_key(|d| d.total_space())
        .map(|d| Disk {
            free_bytes: d.available_space(),
            total_bytes: d.total_space(),
        })
}

/// Blocking: sleeps ~200 ms between CPU samples and shells out to nvidia-smi.
/// Never call this on the async runtime — see `system_stats`.
fn collect_snapshot() -> SystemSnapshot {
    let mut sys = System::new();

    // CPU usage is a delta: it needs two samples at least
    // MINIMUM_CPU_UPDATE_INTERVAL apart, or every core reads 0%.
    sys.refresh_cpu_usage();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpus = sys.cpus();
    let util = if cpus.is_empty() {
        0.0
    } else {
        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len() as f32
    };

    SystemSnapshot {
        gpu: query_gpu(),
        cpu: Cpu {
            util_pct: util.round().clamp(0.0, 100.0) as u32,
            cores: cpus.len(),
        },
        ram: Ram {
            used_bytes: sys.used_memory(),
            total_bytes: sys.total_memory(),
        },
        disk: query_disk(),
    }
}

/// The frontend polls this every 2 s. Collection blocks (a CPU-delta sleep plus
/// an nvidia-smi spawn), so it runs on the blocking pool rather than stalling a
/// runtime worker on every tick.
#[tauri::command]
async fn system_stats() -> Result<SystemSnapshot, String> {
    tauri::async_runtime::spawn_blocking(collect_snapshot)
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![system_stats])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::parse_nvidia_smi;

    #[test]
    fn parses_a_well_formed_line() {
        let gpu = parse_nvidia_smi("NVIDIA GeForce RTX 4090, 42, 8000, 24564, 61").unwrap();
        assert_eq!(gpu.name, "NVIDIA GeForce RTX 4090");
        assert_eq!(gpu.util_pct, 42);
        assert_eq!(gpu.vram_used_mb, 8000);
        assert_eq!(gpu.vram_total_mb, 24564);
        assert_eq!(gpu.temp_c, 61);
    }

    #[test]
    fn rejects_short_lines() {
        assert!(parse_nvidia_smi("NVIDIA, 42, 8000").is_none());
    }

    #[test]
    fn rejects_non_numeric_fields() {
        assert!(parse_nvidia_smi("NVIDIA, N/A, 8000, 24564, 61").is_none());
    }

    #[test]
    fn rejects_empty_name() {
        assert!(parse_nvidia_smi(", 42, 8000, 24564, 61").is_none());
    }
}
