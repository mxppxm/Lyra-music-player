import ActivityKit
import SwiftUI
import WidgetKit

// Warm ink / paper palette matching the app's home surface tokens.
private let lyraInk = Color(red: 28 / 255, green: 24 / 255, blue: 20 / 255)
private let lyraPaper = Color(red: 250 / 255, green: 248 / 255, blue: 245 / 255)

@main
struct LyraLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        LyraLiveActivity()
    }
}

struct LyraLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LyraLiveActivityAttributes.self) { context in
            LyraLockScreenView(state: context.state)
                .activityBackgroundTint(lyraPaper)
                .activitySystemActionForegroundColor(lyraInk)
        } dynamicIsland: { context in
            // The island sits on the system's dark material — everything here
            // must be light-on-dark.
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    LyraAppMark(onDarkSurface: true)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                        .foregroundStyle(.white)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    LyraIslandBottomView(state: context.state)
                }
            } compactLeading: {
                LyraAppMark(onDarkSurface: true)
            } compactTrailing: {
                Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                    .foregroundStyle(.white)
            } minimal: {
                LyraAppMark(onDarkSurface: true)
            }
        }
    }
}

/// App glyph. On light surfaces: ink tile with a white note. On the dark
/// island: paper tile with an ink note so the silhouette stays visible.
private struct LyraAppMark: View {
    let onDarkSurface: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(onDarkSurface ? lyraPaper : lyraInk)
            Image(systemName: "music.note")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(onDarkSurface ? lyraInk : Color.white.opacity(0.96))
        }
        .frame(width: 24, height: 24)
    }
}

private struct LyraLockScreenView: View {
    let state: LyraLiveActivityAttributes.ContentState

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                LyraAppMark(onDarkSurface: false)
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.title.isEmpty ? "Lyra" : state.title)
                        .font(.headline)
                        .foregroundStyle(lyraInk)
                        .lineLimit(1)
                    if !state.artist.isEmpty {
                        Text(state.artist)
                            .font(.subheadline)
                            .foregroundStyle(lyraInk.opacity(0.65))
                            .lineLimit(1)
                    }
                }
                Spacer()
                LyraControlButtons(state: state, tint: lyraInk)
            }
            LyraActivityProgress(state: state, tint: lyraInk.opacity(0.75))
        }
        .padding()
    }
}

private struct LyraIslandBottomView: View {
    let state: LyraLiveActivityAttributes.ContentState

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(state.title.isEmpty ? "Lyra" : state.title)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if !state.artist.isEmpty {
                        Text(state.artist)
                            .font(.caption2)
                            .foregroundStyle(.white.opacity(0.65))
                            .lineLimit(1)
                    }
                }
                Spacer()
                LyraControlButtons(state: state, tint: .white)
            }
            LyraActivityProgress(state: state, tint: .white.opacity(0.85))
        }
    }
}

/// Play/pause + skip. Interactive buttons need iOS 17 App Intents; on iOS 16
/// the island stays read-only and taps open the app.
private struct LyraControlButtons: View {
    let state: LyraLiveActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        HStack(spacing: 16) {
            if #available(iOS 17.0, *) {
                Button(intent: LyraTogglePlaybackIntent()) {
                    Image(systemName: state.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title3)
                }
                .buttonStyle(.borderless)
                .tint(tint)
                Button(intent: LyraSkipPlaybackIntent()) {
                    Image(systemName: "forward.fill")
                        .font(.title3)
                }
                .buttonStyle(.borderless)
                .tint(tint)
            } else {
                Image(systemName: state.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title3)
                    .foregroundStyle(tint)
            }
        }
    }
}

/// While playing, the bar advances by itself via the timer interval — no
/// ActivityKit updates needed. While paused it shows a static position.
private struct LyraActivityProgress: View {
    let state: LyraLiveActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        if state.durationSeconds > 0 {
            if state.isPlaying {
                let start = state.updatedAt.addingTimeInterval(-state.positionSeconds)
                ProgressView(
                    timerInterval: start...start.addingTimeInterval(state.durationSeconds),
                    countsDown: false
                ) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .tint(tint)
            } else {
                ProgressView(
                    value: min(max(state.positionSeconds, 0), state.durationSeconds),
                    total: state.durationSeconds
                )
                .tint(tint)
            }
        }
    }
}
