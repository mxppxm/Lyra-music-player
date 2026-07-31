import AppIntents
import Foundation

/// Buttons in the Live Activity / Dynamic Island. For Live Activities the
/// system performs these intents inside the app process (background launch),
/// where they reach LyraAudioPlugin through LyraPlaybackBridge.
/// Compiled into both the app target and the widget extension.

@available(iOS 17.0, *)
struct LyraTogglePlaybackIntent: AppIntent {
    static var title: LocalizedStringResource = "播放 / 暂停"
    static var openAppWhenRun: Bool { false }

    func perform() async throws -> some IntentResult {
        LyraPlaybackBridge.shared.toggleFromIsland()
        return .result()
    }
}

@available(iOS 17.0, *)
struct LyraSkipPlaybackIntent: AppIntent {
    static var title: LocalizedStringResource = "下一首"
    static var openAppWhenRun: Bool { false }

    func perform() async throws -> some IntentResult {
        LyraPlaybackBridge.shared.skipFromIsland()
        return .result()
    }
}
