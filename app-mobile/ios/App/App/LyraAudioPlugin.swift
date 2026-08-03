import Foundation
import Capacitor
import AVFoundation
import MediaPlayer
import ActivityKit
import UIKit

private let bilibiliUserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
private let bilibiliReferer = "https://www.bilibili.com/"

private struct PendingNextTrack {
    let url: URL
    let durationMs: Int
    let title: String
    let artist: String
    let coverUrl: String
    let songId: String
}

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
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeEnded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingEnded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNextTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearNextTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendToPlaybackQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlaybackQueueInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainNativeAdvanced", returnType: CAPPluginReturnPromise),
    ]

    private var player: AVPlayer?
    private var currentPlaybackId: Int = 0
    private var endObserver: NSObjectProtocol?
    private var failObserver: NSObjectProtocol?
    private var statusObservation: NSKeyValueObservation?
    private var timeControlObservation: NSKeyValueObservation?
    /// Only one "failed" event per playback — KVO and the failed-to-end
    /// notification can both fire for the same broken item.
    private var didEmitFailure = false
    /// Download-fallback state (see startDownloadFallback).
    private var didStartFallback = false
    private var currentRemoteUrl: URL?
    private var stallWorkItem: DispatchWorkItem?
    private var downloadTask: URLSessionDataTask?
    /// Tracks a pause that happened while the fallback download was still
    /// in flight, so the completed download doesn't start blaring anyway.
    private var userPaused = false
    /// Codec fourcc of the last downloaded fallback file (diagnostics).
    private var lastDownloadedCodec: String?
    /// Natural completion the web layer hasn't acknowledged yet — WKWebView
    /// JS is suspended in background, so we re-emit on foreground.
    private var pendingEndedPlaybackId: Int?
    private var endBackgroundTaskId: UIBackgroundTaskIdentifier = .invalid
    /// Starts a background task ~20s before track end while backgrounded so
    /// auto-advance has time to run LLM + start the next song.
    private var endProximityObserver: Any?
    /// Bilibili m4s streams often never fire DidPlayToEndTime — mirror the
    /// desktop fallback timer (duration + 750ms slack).
    private var fallbackEndWorkItem: DispatchWorkItem?
    private var endedEmittedForPlaybackId: Int = -1
    private var currentTrackDurationMs: Int = 0
    /// Prefetched by JS while the current track plays — native plays through in order.
    private var pendingNextTracks: [PendingNextTrack] = []
    /// Native auto-advances that happened while JS was suspended.
    private var unsyncedNativeAdvanced: [[String: Any]] = []
    private var refillBackgroundTaskId: UIBackgroundTaskIdentifier = .invalid

    // Metadata shown on the lock screen / Dynamic Island.
    private var nowPlayingTitle: String = ""
    private var nowPlayingArtist: String = ""
    private var nowPlayingDurationSeconds: Double = 0
    private var artworkUrl: String = ""
    private var artwork: MPMediaItemArtwork?

    @available(iOS 16.1, *)
    private var liveActivity: Activity<LyraLiveActivityAttributes>? {
        get { _liveActivity as? Activity<LyraLiveActivityAttributes> }
        set { _liveActivity = newValue }
    }
    // Stored as Any so the property itself needs no availability annotation.
    private var _liveActivity: Any?

    override public func load() {
        super.load()
        activateAudioSession()
        setupRemoteCommands()
        setupAudioSessionObservers()
        // Live Activity buttons (App Intents) run in this process and reach
        // the plugin through the shared bridge.
        LyraPlaybackBridge.shared.toggleHandler = { [weak self] in
            self?.emitRemoteCommand("toggle")
        }
        LyraPlaybackBridge.shared.skipHandler = { [weak self] in
            self?.emitRemoteCommand("next")
        }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }

    /// The session can be deactivated by interruptions (calls, Siri, alarms,
    /// other apps). Every playback entry point must re-activate it — a dead
    /// session is silent while the player itself looks perfectly healthy.
    private func activateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("[LyraAudio] audio session activation failed: \(error)")
        }
    }

    private func setupAudioSessionObservers() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
    }

    @objc private func handleInterruption(_ note: Notification) {
        guard
            let info = note.userInfo,
            let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: typeValue)
        else { return }
        switch type {
        case .began:
            // Route through the web Orchestrator so UI/lock screen stay
            // consistent with the actual (now silent) output.
            emitRemoteCommand("pause")
        case .ended:
            let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            if AVAudioSession.InterruptionOptions(rawValue: optionsValue).contains(.shouldResume) {
                activateAudioSession()
                emitRemoteCommand("play")
            }
        @unknown default:
            break
        }
    }

    @objc private func handleRouteChange(_ note: Notification) {
        guard
            let info = note.userInfo,
            let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue)
        else { return }
        // Headphones / bluetooth disconnected — pause like the system player.
        if reason == .oldDeviceUnavailable {
            emitRemoteCommand("pause")
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
            self.activateAudioSession()

            if self.nowPlayingDurationSeconds <= 0, durationMs > 0 {
                self.nowPlayingDurationSeconds = Double(durationMs) / 1000.0
            }

            self.currentPlaybackId += 1
            let playbackId = self.currentPlaybackId
            self.didEmitFailure = false
            self.didStartFallback = false
            self.userPaused = false
            self.lastDownloadedCodec = nil
            self.currentRemoteUrl = url
            self.currentTrackDurationMs = durationMs
            self.endedEmittedForPlaybackId = -1

            self.startPlayer(url: url, playbackId: playbackId, isLocalFile: false)
            self.scheduleFallbackEnd(playbackId: playbackId)
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
            self.userPaused = true
            self.player?.pause()
            self.publishNowPlayingInfo()
            self.syncLiveActivity()
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.userPaused = false
            self.activateAudioSession()
            self.player?.play()
            self.publishNowPlayingInfo()
            self.syncLiveActivity()
            call.resolve()
        }
    }

    @objc func isPlaying(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["isPlaying": self.isActuallyPlaying])
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

    @objc func seek(_ call: CAPPluginCall) {
        let positionMs = call.getInt("positionMs") ?? 0
        DispatchQueue.main.async {
            guard let player = self.player else {
                call.reject("no player")
                return
            }
            let playbackId = self.currentPlaybackId
            let seconds = max(0, Double(positionMs) / 1000.0)
            player.seek(to: CMTime(seconds: seconds, preferredTimescale: 1000)) { [weak self] _ in
                guard let self = self else { return }
                self.publishNowPlayingInfo()
                self.scheduleFallbackEnd(playbackId: playbackId, fromPositionMs: positionMs)
                call.resolve()
            }
        }
    }

    @objc func setNowPlaying(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let durationMs = call.getInt("durationMs") ?? 0
        let coverUrl = call.getString("coverUrl") ?? ""
        DispatchQueue.main.async {
            self.nowPlayingTitle = title
            self.nowPlayingArtist = artist
            self.nowPlayingDurationSeconds = Double(durationMs) / 1000.0
            self.updateArtwork(coverUrl: coverUrl)
            self.publishNowPlayingInfo()
            self.syncLiveActivity()
            call.resolve()
        }
    }

    @objc func acknowledgeEnded(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pendingEndedPlaybackId = nil
            self.endEndBackgroundTask()
            call.resolve()
        }
    }

    @objc func getPendingEnded(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let id = self.pendingEndedPlaybackId {
                call.resolve(["playbackId": id])
            } else {
                call.resolve(["playbackId": NSNull()])
            }
        }
    }

    @objc func setNextTrack(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("invalid url")
            return
        }
        let track = PendingNextTrack(
            url: url,
            durationMs: call.getInt("durationMs") ?? 0,
            title: call.getString("title") ?? "",
            artist: call.getString("artist") ?? "",
            coverUrl: call.getString("coverUrl") ?? "",
            songId: call.getString("songId") ?? ""
        )
        DispatchQueue.main.async {
            self.pendingNextTracks.append(track)
            print("[LyraAudio] queued next track songId=\(track.songId) depth=\(self.pendingNextTracks.count)")
            call.resolve(["count": self.pendingNextTracks.count])
        }
    }

    @objc func clearNextTrack(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pendingNextTracks.removeAll()
            call.resolve()
        }
    }

    @objc func appendToPlaybackQueue(_ call: CAPPluginCall) {
        guard let rawTracks = call.getArray("tracks") else {
            call.reject("tracks required")
            return
        }
        DispatchQueue.main.async {
            var appended = 0
            for raw in rawTracks {
                guard let obj = raw as? [String: Any],
                      let urlString = obj["url"] as? String,
                      let url = URL(string: urlString)
                else { continue }
                let track = PendingNextTrack(
                    url: url,
                    durationMs: obj["durationMs"] as? Int ?? 0,
                    title: obj["title"] as? String ?? "",
                    artist: obj["artist"] as? String ?? "",
                    coverUrl: obj["coverUrl"] as? String ?? "",
                    songId: obj["songId"] as? String ?? ""
                )
                self.pendingNextTracks.append(track)
                appended += 1
            }
            print("[LyraAudio] appended \(appended) tracks, queue depth=\(self.pendingNextTracks.count)")
            call.resolve(["count": self.pendingNextTracks.count, "appended": appended])
        }
    }

    @objc func getPlaybackQueueInfo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "count": self.pendingNextTracks.count,
                "songIds": self.pendingNextTracks.map { $0.songId },
            ])
        }
    }

    @objc func drainNativeAdvanced(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let events = self.unsyncedNativeAdvanced
            self.unsyncedNativeAdvanced = []
            call.resolve(["events": events])
        }
    }

    // MARK: - Dual-mode playback

    /// Mode A: AVPlayer streams the URL directly (fastest start).
    /// Mode B (fallback): if the stream errors out or stays silent for 10s,
    /// download the file with our own URLSession (fully controlled headers)
    /// and play it from disk. Bilibili audio streams are only 2–5 MB.
    private func startPlayer(url: URL, playbackId: Int, isLocalFile: Bool) {
        let asset: AVURLAsset
        if isLocalFile {
            asset = AVURLAsset(url: url)
        } else {
            let headers: [String: Any] = [
                "User-Agent": bilibiliUserAgent,
                "Referer": bilibiliReferer,
                "Origin": "https://www.bilibili.com",
            ]
            asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        }
        let item = AVPlayerItem(asset: asset)
        let player = AVPlayer(playerItem: item)
        player.automaticallyWaitsToMinimizeStalling = true
        self.player = player

        self.endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            self?.handlePlaybackEnded(playbackId: playbackId)
        }

        self.statusObservation = item.observe(\.status, options: [.new]) { [weak self] observedItem, _ in
            guard let self = self, observedItem.status == .failed else { return }
            let message = self.describe(observedItem.error)
            DispatchQueue.main.async {
                guard self.currentPlaybackId == playbackId else { return }
                if isLocalFile || self.didStartFallback {
                    let codec = self.lastDownloadedCodec.map { " codec=\($0)" } ?? ""
                    self.emitFailedOnce(playbackId: playbackId, message: "\(message)\(codec)")
                } else {
                    print("[LyraAudio] stream failed (\(message)); falling back to download")
                    self.startDownloadFallback(playbackId: playbackId)
                }
            }
        }

        self.failObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] note in
            guard let self = self, self.currentPlaybackId == playbackId else { return }
            let error = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
            if isLocalFile || self.didStartFallback {
                self.emitFailedOnce(
                    playbackId: playbackId,
                    message: self.describe(error)
                )
            } else {
                self.startDownloadFallback(playbackId: playbackId)
            }
        }

        self.timeControlObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] observed, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if observed.timeControlStatus == .playing {
                    self.stallWorkItem?.cancel()
                }
                self.publishNowPlayingInfo()
                self.syncLiveActivity()
            }
        }

        if !isLocalFile {
            armStallTimer(playbackId: playbackId)
        }

        player.play()
        installEndProximityObserver(playbackId: playbackId)
        publishNowPlayingInfo()
        syncLiveActivity()
    }

    /// If the stream hasn't produced audible playback within 10s it's
    /// effectively dead ("waiting to play" forever) — fall back to download.
    private func armStallTimer(playbackId: Int) {
        stallWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            guard
                self.currentPlaybackId == playbackId,
                self.player != nil,
                !self.isActuallyPlaying,
                !self.didStartFallback
            else { return }
            print("[LyraAudio] stream silent >10s; falling back to download")
            self.startDownloadFallback(playbackId: playbackId)
        }
        stallWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: work)
    }

    private func startDownloadFallback(playbackId: Int) {
        guard
            let url = currentRemoteUrl,
            currentPlaybackId == playbackId,
            !didStartFallback
        else { return }
        didStartFallback = true
        stallWorkItem?.cancel()

        // Tear down the streaming player but keep Now Playing metadata —
        // it's still the same song.
        stopInternal()
        activateAudioSession()

        var request = URLRequest(url: url)
        request.setValue(bilibiliUserAgent, forHTTPHeaderField: "User-Agent")
        request.setValue(bilibiliReferer, forHTTPHeaderField: "Referer")
        request.setValue("https://www.bilibili.com", forHTTPHeaderField: "Origin")
        // Raw bytes only — a brotli/gzip-encoded body saved to disk is not a
        // playable MP4, and some mirror nodes compress regardless.
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")

        downloadTask = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self, self.currentPlaybackId == playbackId else { return }
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
                guard
                    let data = data,
                    statusCode == 200,
                    error == nil,
                    data.count > 1024
                else {
                    let reason = error != nil
                        ? self.describe(error)
                        : "http \(statusCode)"
                    let host = self.currentRemoteUrl?.host ?? "unknown-host"
                    self.emitFailedOnce(
                        playbackId: playbackId,
                        message: "download: \(reason) @ \(host)"
                    )
                    return
                }
                // A 200 doesn't mean audio — error pages and compressed bodies
                // also come back 200. Every playable stream starts with an
                // MP4 "ftyp" box; if it isn't there, show what the CDN
                // actually sent instead of dying later with "Cannot Open".
                guard Self.looksLikeMP4(data) else {
                    let host = self.currentRemoteUrl?.host ?? "unknown-host"
                    self.emitFailedOnce(
                        playbackId: playbackId,
                        message: "200 but not audio @ \(host): \(Self.sample(of: data))"
                    )
                    return
                }
                do {
                    let tmp = FileManager.default.temporaryDirectory
                        .appendingPathComponent("lyra-\(playbackId).m4s")
                    try data.write(to: tmp, options: .atomic)
                    self.lastDownloadedCodec = Self.codecFourCC(in: data)
                    print("[LyraAudio] fallback file codec=\(self.lastDownloadedCodec ?? "?") size=\(data.count)")
                    self.startPlayer(url: tmp, playbackId: playbackId, isLocalFile: true)
                    if self.userPaused {
                        self.player?.pause()
                        self.publishNowPlayingInfo()
                        self.syncLiveActivity()
                    }
                } catch {
                    self.emitFailedOnce(playbackId: playbackId, message: "failed to store downloaded audio")
                }
            }
        }
        downloadTask?.resume()
    }

    // MARK: - Internals

    private func stopInternal() {
        removeEndProximityObserver()
        fallbackEndWorkItem?.cancel()
        fallbackEndWorkItem = nil
        pendingEndedPlaybackId = nil
        pendingNextTracks.removeAll()
        endEndBackgroundTask()
        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
            endObserver = nil
        }
        if let observer = failObserver {
            NotificationCenter.default.removeObserver(observer)
            failObserver = nil
        }
        statusObservation?.invalidate()
        statusObservation = nil
        timeControlObservation?.invalidate()
        timeControlObservation = nil
        stallWorkItem?.cancel()
        stallWorkItem = nil
        downloadTask?.cancel()
        downloadTask = nil
        player?.pause()
        player = nil
    }

    private func emitFailedOnce(playbackId: Int, message: String) {
        guard currentPlaybackId == playbackId, !didEmitFailure else { return }
        didEmitFailure = true
        print("[LyraAudio] playback \(playbackId) failed: \(message)")
        notifyListeners("failed", data: ["playbackId": playbackId, "message": message])
    }

    /// Reads the codec fourcc from the first stsd sample entry (mp4a, ac-3,
    /// ec-3, …) — the smoking gun when a valid MP4 still won't play.
    static func codecFourCC(in data: Data) -> String {
        let window = data.prefix(8192)
        guard let stsd = window.range(of: Data("stsd".utf8)) else { return "?" }
        let entryStart = stsd.upperBound + 8 // version/flags + entry_count
        guard window.count > entryStart + 8 else { return "?" }
        let codec = window[(entryStart + 4)..<(entryStart + 8)]
        return String(decoding: codec, as: UTF8.self)
    }

    /// MP4-family containers open with a box header whose type sits at bytes
    /// 4–8 (ftyp / styp / moov). Anything else is not playable audio.
    static func looksLikeMP4(_ data: Data) -> Bool {
        guard data.count > 8 else { return false }
        let type = data[4..<8]
        return type == Data("ftyp".utf8)
            || type == Data("styp".utf8)
            || type == Data("moov".utf8)
    }

    /// Printable prefix of a non-audio payload, so the failure message shows
    /// what the CDN actually returned (error XML, HTML, garbage…).
    static func sample(of data: Data, limit: Int = 120) -> String {
        let prefix = data.prefix(limit).map { byte -> Character in
            (byte >= 0x20 && byte < 0x7f) ? Character(UnicodeScalar(byte)) : "."
        }
        return "\"\(String(prefix))\""
    }

    /// AVPlayer's localizedDescription is uselessly generic ("Cannot Open").
    /// The diagnostic value lives in domain/code and the underlying error
    /// chain, e.g. "CoreMediaErrorDomain -12642 ← NSURLErrorDomain -1002".
    private func describe(_ error: Error?) -> String {
        guard let nsError = error as NSError? else { return "unknown error" }
        var parts = ["\(nsError.domain) \(nsError.code)"]
        var underlying = nsError.userInfo[NSUnderlyingErrorKey] as? NSError
        while let current = underlying {
            parts.append("\(current.domain) \(current.code)")
            underlying = current.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        if let host = currentRemoteUrl?.host {
            parts.append("@ \(host)")
        }
        return parts.joined(separator: " ← ")
    }

    private func clearNowPlaying() {
        nowPlayingTitle = ""
        nowPlayingArtist = ""
        nowPlayingDurationSeconds = 0
        artworkUrl = ""
        artwork = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        endLiveActivity()
    }

    /// Downloads the cover once per URL and republishes Now Playing info so
    /// iOS can pick it up as the lock-screen artwork.
    private func updateArtwork(coverUrl: String) {
        guard coverUrl != artworkUrl else { return }
        artworkUrl = coverUrl
        artwork = nil
        guard !coverUrl.isEmpty, let url = URL(string: coverUrl) else { return }
        // hdslb.com runs a Referer allowlist — send the bilibili one explicitly.
        var request = URLRequest(url: url)
        request.setValue(bilibiliUserAgent, forHTTPHeaderField: "User-Agent")
        request.setValue(bilibiliReferer, forHTTPHeaderField: "Referer")
        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                // A newer track may have replaced this one while downloading.
                guard self.artworkUrl == coverUrl,
                      let data = data,
                      let image = UIImage(data: data)
                else { return }
                self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                self.publishNowPlayingInfo()
            }
        }.resume()
    }

    /// rate stays 1 while AVPlayer is merely "waiting to play" (buffering) —
    /// timeControlStatus is the only honest signal, and it's what keeps the
    /// lock-screen scrubber from running while nothing is actually audible.
    private var isActuallyPlaying: Bool {
        player?.timeControlStatus == .playing
    }

    private func playbackRateForNowPlaying() -> Float {
        isActuallyPlaying ? (player?.rate ?? 0) : 0
    }

    private func currentPositionSeconds() -> Double {
        guard let player = player else { return 0 }
        let seconds = CMTimeGetSeconds(player.currentTime())
        return seconds.isFinite ? seconds : 0
    }

    private func emitRemoteCommand(_ command: String) {
        notifyListeners("remoteCommand", data: ["command": command])
    }

    @objc private func handleDidBecomeActive() {
        guard let playbackId = pendingEndedPlaybackId else { return }
        emitEnded(playbackId: playbackId)
    }

    private func handlePlaybackEnded(playbackId: Int) {
        guard currentPlaybackId == playbackId else { return }
        guard endedEmittedForPlaybackId != playbackId else { return }

        if !pendingNextTracks.isEmpty {
            let next = pendingNextTracks.removeFirst()
            playPrefetchedNext(next, fromPlaybackId: playbackId)
            requestQueueRefill(remaining: pendingNextTracks.count)
            return
        }

        endedEmittedForPlaybackId = playbackId
        fallbackEndWorkItem?.cancel()
        fallbackEndWorkItem = nil
        pendingEndedPlaybackId = playbackId
        beginEndBackgroundTask()
        print("[LyraAudio] playback \(playbackId) ended")
        emitEnded(playbackId: playbackId)
    }

    /// Seamless handoff — no JS required while backgrounded.
    private func playPrefetchedNext(_ next: PendingNextTrack, fromPlaybackId: Int) {
        endedEmittedForPlaybackId = fromPlaybackId
        fallbackEndWorkItem?.cancel()
        fallbackEndWorkItem = nil
        endEndBackgroundTask()

        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
            endObserver = nil
        }
        if let observer = failObserver {
            NotificationCenter.default.removeObserver(observer)
            failObserver = nil
        }
        statusObservation?.invalidate()
        statusObservation = nil
        timeControlObservation?.invalidate()
        timeControlObservation = nil
        stallWorkItem?.cancel()
        stallWorkItem = nil
        downloadTask?.cancel()
        downloadTask = nil
        removeEndProximityObserver()
        player?.pause()
        player = nil

        activateAudioSession()

        nowPlayingTitle = next.title
        nowPlayingArtist = next.artist
        nowPlayingDurationSeconds = Double(next.durationMs) / 1000.0
        artworkUrl = ""
        artwork = nil
        updateArtwork(coverUrl: next.coverUrl)

        currentPlaybackId += 1
        let playbackId = currentPlaybackId
        didEmitFailure = false
        didStartFallback = false
        userPaused = false
        lastDownloadedCodec = nil
        currentRemoteUrl = next.url
        currentTrackDurationMs = next.durationMs
        endedEmittedForPlaybackId = -1

        startPlayer(url: next.url, playbackId: playbackId, isLocalFile: false)
        scheduleFallbackEnd(playbackId: playbackId)
        print("[LyraAudio] native auto-advanced → songId=\(next.songId) playbackId=\(playbackId)")
        unsyncedNativeAdvanced.append([
            "songId": next.songId,
            "playbackId": playbackId,
            "previousPlaybackId": fromPlaybackId,
        ])
        notifyListeners("nativeAdvanced", data: [
            "playbackId": playbackId,
            "songId": next.songId,
            "previousPlaybackId": fromPlaybackId,
        ])
    }

    /// Ask JS to top up the native queue — runs during background tasks too.
    private func requestQueueRefill(remaining: Int) {
        beginRefillBackgroundTask()
        notifyListeners("refillQueue", data: ["remaining": remaining])
    }

    private func beginRefillBackgroundTask() {
        guard refillBackgroundTaskId == .invalid else { return }
        refillBackgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "LyraQueueRefill") { [weak self] in
            self?.endRefillBackgroundTask()
        }
    }

    private func endRefillBackgroundTask() {
        guard refillBackgroundTaskId != .invalid else { return }
        UIApplication.shared.endBackgroundTask(refillBackgroundTaskId)
        refillBackgroundTaskId = .invalid
    }

    @objc private func handleDidEnterBackground() {
        guard !pendingNextTracks.isEmpty || player != nil else { return }
        requestQueueRefill(remaining: pendingNextTracks.count)
    }

    /// Fires handlePlaybackEnded when AVPlayer's end notification is missing.
    private func scheduleFallbackEnd(playbackId: Int, fromPositionMs: Int = 0) {
        fallbackEndWorkItem?.cancel()
        guard endedEmittedForPlaybackId != playbackId else { return }
        let durationMs = currentTrackDurationMs
        guard durationMs > 0 else { return }
        let remainingMs = max(0, durationMs - fromPositionMs)
        if remainingMs <= 0 {
            handlePlaybackEnded(playbackId: playbackId)
            return
        }
        let slackMs = 750
        let delay = Double(remainingMs + slackMs) / 1000.0
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, !self.userPaused else { return }
            self.handlePlaybackEnded(playbackId: playbackId)
        }
        fallbackEndWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func emitEnded(playbackId: Int) {
        notifyListeners("ended", data: ["playbackId": playbackId])
    }

    private func beginEndBackgroundTask() {
        guard endBackgroundTaskId == .invalid else { return }
        endBackgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "LyraAutoAdvance") { [weak self] in
            self?.endEndBackgroundTask()
        }
    }

    private func endEndBackgroundTask() {
        guard endBackgroundTaskId != .invalid else { return }
        UIApplication.shared.endBackgroundTask(endBackgroundTaskId)
        endBackgroundTaskId = .invalid
    }

    /// While backgrounded, start a background task shortly before the track
    /// ends so the web Orchestrator can pick and start the next song.
    private func installEndProximityObserver(playbackId: Int) {
        removeEndProximityObserver()
        guard let player = player else { return }
        let interval = CMTime(seconds: 1, preferredTimescale: 1)
        endProximityObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard
                let self = self,
                self.currentPlaybackId == playbackId,
                !self.userPaused,
                let item = self.player?.currentItem
            else { return }
            let durationSec = CMTimeGetSeconds(item.duration)
            let elapsedSec = CMTimeGetSeconds(time)
            let metaDuration = self.nowPlayingDurationSeconds
            let effectiveDuration =
                durationSec.isFinite && durationSec > 0 ? durationSec : metaDuration
            guard effectiveDuration > 0, elapsedSec.isFinite else { return }
            let remaining = effectiveDuration - elapsedSec
            if remaining <= 20 && remaining > 0 && UIApplication.shared.applicationState != .active {
                self.beginEndBackgroundTask()
            }
        }
    }

    private func removeEndProximityObserver() {
        if let observer = endProximityObserver, let player = player {
            player.removeTimeObserver(observer)
        }
        endProximityObserver = nil
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
            MPNowPlayingInfoPropertyPlaybackRate: playbackRateForNowPlaying(),
            MPNowPlayingInfoPropertyMediaType: NSNumber(value: MPMediaType.music.rawValue),
        ]
        if nowPlayingDurationSeconds > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = nowPlayingDurationSeconds
        }
        if let artwork = artwork {
            info[MPMediaItemPropertyArtwork] = artwork
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func refreshNowPlayingElapsed() {
        guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo, !info.isEmpty else {
            return
        }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentPositionSeconds()
        info[MPNowPlayingInfoPropertyPlaybackRate] = playbackRateForNowPlaying()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    // MARK: - Live Activity (Dynamic Island)

    /// Disabled: the Live Activity lock-screen banner duplicated the system
    /// Now Playing controls, and ActivityKit cannot show a Dynamic Island
    /// without the lock-screen banner — so the system surface wins.
    /// Re-enable by removing the early return; endLiveActivity stays active
    /// to clean up any activity started by older builds.
    private func syncLiveActivity() {
        return
        // swiftlint:disable:next unreachable_code
        guard #available(iOS 16.1, *) else { return }
        let state = LyraLiveActivityAttributes.ContentState(
            title: nowPlayingTitle,
            artist: nowPlayingArtist,
            isPlaying: isActuallyPlaying,
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
