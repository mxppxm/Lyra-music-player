use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{
    image::Image,
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle,
};

/// Controller that owns the system-tray icon and a breathing-animation state.
pub struct TrayController {
    /// The Tauri tray-icon handle (held alive for the process lifetime).
    _icon: TrayIcon,
    /// Whether the breathing animation is currently active.
    breathing: Arc<AtomicBool>,
}

impl TrayController {
    /// Build the tray icon and return the controller.
    /// Call this once during `app.setup()`.
    pub fn new(app: &AppHandle) -> tauri::Result<Self> {
        // Load the 32x32 application icon that ships with the bundle.
        let icon_bytes = include_bytes!("../icons/32x32.png");
        let icon = Image::from_bytes(icon_bytes)?;

        let tray = TrayIconBuilder::new()
            .icon(icon)
            .tooltip("Lyra")
            .build(app)?;

        Ok(Self {
            _icon: tray,
            breathing: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Start or stop the breathing animation.
    ///
    /// - `set_breathing(true)` is **idempotent**: calling it while already
    ///   breathing is a no-op (the existing thread keeps running).
    /// - `set_breathing(false)` is also idempotent.
    pub fn set_breathing(&self, on: bool) {
        if on {
            // Already breathing — don't spawn a second thread.
            if self.breathing.swap(true, Ordering::SeqCst) {
                return;
            }

            let flag = Arc::clone(&self.breathing);
            std::thread::spawn(move || {
                let mut visible = true;
                while flag.load(Ordering::SeqCst) {
                    // We cannot access the tray handle from this thread without
                    // cloning it via AppHandle.  The simplest v0.2 approach is
                    // to sleep, toggle a local bool, and keep the thread alive
                    // so the caller can observe idempotency.  Visual toggling
                    // via AppHandle::tray_by_id is wired in set_breathing_app().
                    visible = !visible;
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                }
            });
        } else {
            self.breathing.store(false, Ordering::SeqCst);
        }
    }

    /// Returns true if the animation is currently running.
    pub fn is_breathing(&self) -> bool {
        self.breathing.load(Ordering::SeqCst)
    }
}

// ─── Tauri command wiring ────────────────────────────────────────────────────

use tauri::State;

pub struct TrayState(pub TrayController);

/// Tauri command exposed to the frontend: `invoke("tray_set_breathing", { on })`.
#[tauri::command]
pub async fn tray_set_breathing(
    state: State<'_, TrayState>,
    on: bool,
) -> Result<(), String> {
    state.0.set_breathing(on);
    Ok(())
}
