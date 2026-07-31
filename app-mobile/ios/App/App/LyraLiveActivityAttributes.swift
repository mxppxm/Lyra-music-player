import ActivityKit
import Foundation

/// Shared between the app target and the LyraLiveActivity widget extension
/// (the file is compiled into both targets).
struct LyraLiveActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var artist: String
        var isPlaying: Bool
        var durationSeconds: Double
        var positionSeconds: Double
        var updatedAt: Date
    }
}
