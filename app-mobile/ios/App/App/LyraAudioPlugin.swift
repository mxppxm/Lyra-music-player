import Foundation
import Capacitor
import AVFoundation

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
    ]

    private var player: AVPlayer?
    private var currentPlaybackId: Int = 0
    private var endObserver: NSObjectProtocol?

    override public func load() {
        super.load()
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[LyraAudio] audio session setup failed: \(error)")
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
            call.resolve(["playbackId": playbackId, "durationMs": durationMs])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopInternal()
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.player?.pause()
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.player?.play()
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
            let elapsedMs = elapsed.isFinite ? Int(elapsed * 1000) : NSNull()
            let durationMs = duration.isFinite ? Int(duration * 1000) : NSNull()
            call.resolve(["elapsedMs": elapsedMs, "durationMs": durationMs])
        }
    }

    private func stopInternal() {
        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
            endObserver = nil
        }
        player?.pause()
        player = nil
    }
}
