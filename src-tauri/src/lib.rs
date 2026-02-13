use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[cfg(target_os = "macos")]
fn apply_dock_icon_bytes(bytes: &[u8]) -> Result<(), String> {
  use objc2::AllocAnyThread;
  use objc2_app_kit::{NSApplication, NSImage};
  use objc2_foundation::{MainThreadMarker, NSData};

  if bytes.is_empty() {
    return Err("图标数据为空".to_string());
  }

  // 该命令仅在主线程触发，和 Tauri 内部 dev 模式设置 app icon 的方式一致。
  let mtm = unsafe { MainThreadMarker::new_unchecked() };
  let app = NSApplication::sharedApplication(mtm);
  let data = NSData::with_bytes(bytes);
  let app_icon = NSImage::initWithData(NSImage::alloc(), &data)
    .ok_or_else(|| "无法解析图标数据（请确认是可读的 PNG/JPEG）".to_string())?;

  unsafe { app.setApplicationIconImage(Some(&app_icon)) };
  Ok(())
}

fn resolve_preset_icon_bytes(preset_id: &str, theme: &str) -> Option<&'static [u8]> {
  let preset = preset_id.trim().to_ascii_lowercase();
  let theme = theme.trim().to_ascii_lowercase();

  match (preset.as_str(), theme.as_str()) {
    ("kada-core", "dark") => Some(include_bytes!("../icons/presets/kada-core-dark.png")),
    ("kada-core", "light") => Some(include_bytes!("../icons/presets/kada-core-light.png")),
    ("kada-knot", "dark") => Some(include_bytes!("../icons/presets/kada-knot-dark.png")),
    ("kada-knot", "light") => Some(include_bytes!("../icons/presets/kada-knot-light.png")),
    ("kada-mark", "dark") => Some(include_bytes!("../icons/presets/kada-mark-dark.png")),
    ("kada-mark", "light") => Some(include_bytes!("../icons/presets/kada-mark-light.png")),
    _ => None,
  }
}

#[tauri::command]
fn set_runtime_dock_icon(icon_path: String) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  {
    use std::fs;
    use std::path::Path;

    let trimmed_path = icon_path.trim();
    if trimmed_path.is_empty() {
      return Err("icon_path 不能为空".to_string());
    }

    let path = Path::new(trimmed_path);
    if !path.exists() {
      return Err(format!("图标文件不存在: {trimmed_path}"));
    }

    let bytes = fs::read(path).map_err(|err| format!("读取图标文件失败: {err}"))?;
    apply_dock_icon_bytes(&bytes)
  }

  #[cfg(not(target_os = "macos"))]
  {
    let _ = icon_path;
    Err("仅支持 macOS".to_string())
  }
}

#[tauri::command]
fn set_runtime_dock_icon_preset(preset_id: String, theme: String) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  {
    let bytes = resolve_preset_icon_bytes(&preset_id, &theme).ok_or_else(|| {
      format!("未知预设或主题: preset_id={preset_id}, theme={theme}")
    })?;
    apply_dock_icon_bytes(bytes)
  }

  #[cfg(not(target_os = "macos"))]
  {
    let _ = preset_id;
    let _ = theme;
    Err("仅支持 macOS".to_string())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 启动 Sidecar（仅在生产环境，开发环境由 pnpm dev:sidecar 启动）
      if !cfg!(debug_assertions) {
        let app_handle = app.handle().clone();
        let sidecar_command = app_handle.shell().sidecar("binaries/sidecar")
          .expect("Failed to create sidecar command");

        let (mut rx, _child) = sidecar_command
          .spawn()
          .expect("Failed to spawn sidecar");

        // 异步读取 sidecar 输出（用于调试）
        tauri::async_runtime::spawn(async move {
          while let Some(event) = rx.recv().await {
            match event {
              CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line);
                log::info!("[sidecar] {}", line_str);
              }
              CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line);
                log::error!("[sidecar] {}", line_str);
              }
              CommandEvent::Error(err) => {
                log::error!("[sidecar] error: {}", err);
              }
              CommandEvent::Terminated(status) => {
                log::info!("[sidecar] terminated with status: {:?}", status);
                break;
              }
              _ => {}
            }
          }
        });

        log::info!("Sidecar started successfully");
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      set_runtime_dock_icon,
      set_runtime_dock_icon_preset
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
