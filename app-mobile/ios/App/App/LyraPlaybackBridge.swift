import Foundation

/// In-process bus between Live Activity App Intents and LyraAudioPlugin.
/// iOS executes Live Activity intents inside the app process, so handlers
/// registered by the plugin are reachable from the intents via this singleton.
/// Compiled into both the app target and the widget extension.
final class LyraPlaybackBridge {
    static let shared = LyraPlaybackBridge()

    var toggleHandler: (() -> Void)?
    var skipHandler: (() -> Void)?

    private init() {}

    func toggleFromIsland() {
        DispatchQueue.main.async { self.toggleHandler?() }
    }

    func skipFromIsland() {
        DispatchQueue.main.async { self.skipHandler?() }
    }
}
