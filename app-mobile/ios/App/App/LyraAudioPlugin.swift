import Foundation
import Capacitor
import AVFoundation
import MediaPlayer
import ActivityKit

private let bilibiliUserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
private let bilibiliReferer = "https://www.bilibili.com/"

@objc(LyraAudioPlugin)
public class LyraAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LyraAudioPlugin"
    public let jsName = "LyraAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "playUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNowPlaying", returnType: CAPPluginReturnPromise),
    ]

    private var player: AVPlayer?
    private var currentPlaybackId: Int = 0
    private var endObserver: NSObjectProtocol?

    // Metadata shown on the lock screen / Dynamic Island.
    private var nowPlayingTitle: String = ""
    private var nowPlayingArtist: String = ""
    private var nowPlayingDurationSeconds: Double = 0

    @available(iOS 16.1, *)
    private var liveActivity: Activity<LyraLiveActivityAttributes>? {
        get { _liveActivity as? Activity<LyraLiveActivityAttributes> }
        set { _liveActivity = newValue }
    }
    // Stored as Any so the property itself needs no availability annotation.
    private var _liveActivity: Any?

    override public func load() {
        super.load()
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[LyraAudio] audio session setup failed: \(error)")
        }
        setupRemoteCommands()
        // Live Activity buttons (App Intents) run in this process and reach
        // the plugin through the shared bridge.
        LyraPlaybackBridge.shared.toggleHandler = { [weak self] in
            self?.emitRemoteCommand("toggle")
        }
        LyraPlaybackBridge.shared.skipHandler = { [weak self] in
            self?.emitRemoteCommand("next")
        }
    }

    @objc func playUrl(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("invalid url")
            return
        }
        let durationMs = call.getInt("durationMs") ?? 0

        DispatchQueue.main.async {
            self.stopInternal()

            let headers: [String: Any] = [
                "User-Agent": bilibiliUserAgent,
                "Referer": bilibiliReferer,
                "Origin": "https://www.bilibili.com",
            ]
            let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
            let item = AVPlayerItem(asset: asset)
            let player = AVPlayer(playerItem: item)
            player.automaticallyWaitsToMinimizeStalling = true
            self.player = player

            if self.nowPlayingDurationSeconds <= 0, durationMs > 0 {
                self.nowPlayingDurationSeconds = Double(durationMs) / 1000.0
            }

            self.currentPlaybackId += 1
            let playbackId = self.currentPlaybackId

            self.endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: item,
                queue: .main
            ) { [weak self] _ in
                self?.notifyListeners("ended", data: ["playbackId": playbackId])
            }

            player.play()
            self.publishNowPlayingInfo()
            self.syncLiveActivity()
            call.resolve(["playbackId": playbackId, "durationMs": durationMs])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopInternal()
            self.clearNowPlaying()
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.player?.pause()
            self.publishNowPlayingInfo()
            self.syncLiveActivity()
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.player?.play()
            self.publishNowPlayingInfo()
            self.syncLiveActivity()
            call.resolve()
        }
    }

    @objc func isPlaying(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let playing = self.player?.rate ?? 0 > 0
            call.resolve(["isPlaying": playing])
        }
    }

    @objc func getPosition(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let player = self.player, let item = player.currentItem else {
                call.resolve(["elapsedMs": NSNull(), "durationMs": NSNull()])
                return
            }
            let elapsed = CMTimeGetSeconds(player.currentTime())
            let duration = CMTimeGetSeconds(item.duration)
            let elapsedMs: Any = elapsed.isFinite ? Int(elapsed * 1000) : NSNull()
            let durationMs: Any = duration.isFinite ? Int(duration * 1000) : NSNull()
            // The web layer polls this every 500 ms while playing; refreshing
            // the lock-screen elapsed time here keeps the scrubber in sync
            // without a dedicated timer.
            self.refreshNowPlayingElapsed()
            call.resolve(["elapsedMs": elapsedMs, "durationMs": durationMs])
        }
    }

    @objc func setNowPlaying(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let durationMs = call.getInt("durationMs") ?? 0
        DispatchQueue.main.async {
            self.nowPlayingTitle = title
            self.nowPlayingArtist = artist
            self.nowPlayingDurationSeconds = Double(durationMs) / 1000.0
            self.publishNowPlayingInfo()
            self.syncLiveActivity()
            call.resolve()
        }
    }

    // MARK: - Internals

    private func stopInternal() {
        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
            endObserver = nil
        }
        player?.pause()
        player = nil
    }

    private func clearNowPlaying() {
        nowPlayingTitle = ""
        nowPlayingArtist = ""
        nowPlayingDurationSeconds = 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        endLiveActivity()
    }

    private var isPlayingNow: Bool {
        (player?.rate ?? 0) > 0
    }

    private func currentPositionSeconds() -> Double {
        guard let player = player else { return 0 }
        let seconds = CMTimeGetSeconds(player.currentTime())
        return seconds.isFinite ? seconds : 0
    }

    private func emitRemoteCommand(_ command: String) {
        notifyListeners("remoteCommand", data: ["command": command])
    }

    // MARK: - Lock screen (Now Playing + remote commands)

    private func setupRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        center.previousTrackCommand.isEnabled = false
        center.playCommand.addTarget { [weak self] _ in
            self?.emitRemoteCommand("play")
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.emitRemoteCommand("pause")
            return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.emitRemoteCommand("toggle")
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            self?.emitRemoteCommand("next")
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard
                let self = self,
                let positionEvent = event as? MPChangePlaybackPositionCommandEvent,
                let player = self.player
            else {
                return .commandFailed
            }
            player.seek(to: CMTime(seconds: positionEvent.positionTime, preferredTimescale: 1000))
            return .success
        }
    }

    private func publishNowPlayingInfo() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: nowPlayingTitle,
            MPMediaItemPropertyArtist: nowPlayingArtist,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentPositionSeconds(),
            MPNowPlayingInfoPropertyPlaybackRate: player?.rate ?? 0,
            MPNowPlayingInfoPropertyMediaType: NSNumber(value: MPMediaType.music.rawValue),
        ]
        if nowPlayingDurationSeconds > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = nowPlayingDurationSeconds
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func refreshNowPlayingElapsed() {
        guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo, !info.isEmpty else {
            return
        }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentPositionSeconds()
        info[MPNowPlayingInfoPropertyPlaybackRate] = player?.rate ?? 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    // MARK: - Live Activity (Dynamic Island)

    private func syncLiveActivity() {
        guard #available(iOS 16.1, *) else { return }
        let state = LyraLiveActivityAttributes.ContentState(
            title: nowPlayingTitle,
            artist: nowPlayingArtist,
            isPlaying: isPlayingNow,
            durationSeconds: nowPlayingDurationSeconds,
            positionSeconds: currentPositionSeconds(),
            updatedAt: Date()
        )
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            if #available(iOS 16.2, *) {
                let content = ActivityContent(state: state, staleDate: nil)
                if let activity = self.liveActivity, activity.activityState == .active {
                    await activity.update(content)
                } else if let existing = Activity<LyraLiveActivityAttributes>.activities.first {
                    self.liveActivity = existing
                    await existing.update(content)
                } else {
                    do {
                        self.liveActivity = try Activity<LyraLiveActivityAttributes>.request(
                            attributes: LyraLiveActivityAttributes(),
                            content: content,
                            pushType: nil
                        )
                    } catch {
                        print("[LyraAudio] live activity request failed: \(error)")
                    }
                }
            } else {
                if let activity = self.liveActivity, activity.activityState == .active {
                    await activity.update(using: state)
                } else if let existing = Activity<LyraLiveActivityAttributes>.activities.first {
                    self.liveActivity = existing
                    await existing.update(using: state)
                } else {
                    do {
                        self.liveActivity = try Activity<LyraLiveActivityAttributes>.request(
                            attributes: LyraLiveActivityAttributes(),
                            contentState: state,
                            pushType: nil
                        )
                    } catch {
                        print("[LyraAudio] live activity request failed: \(error)")
                    }
                }
            }
        }
    }

    private func endLiveActivity() {
        guard #available(iOS 16.1, *), let activity = liveActivity else { return }
        liveActivity = nil
        Task {
            if #available(iOS 16.2, *) {
                await activity.end(nil, dismissalPolicy: .immediate)
            } else {
                await activity.end(using: nil, dismissalPolicy: .immediate)
            }
        }
    }
}
