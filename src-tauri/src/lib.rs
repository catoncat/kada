use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

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
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
