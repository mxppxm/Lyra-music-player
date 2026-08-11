import Capacitor
import UIKit

@objc(LyraUIPlugin)
public class LyraUIPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LyraUIPlugin"
    public let jsName = "LyraUI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setImmersive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lightImpact", returnType: CAPPluginReturnPromise),
    ]

    @objc func setImmersive(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            if let vc = self.bridge?.viewController as? MainViewController {
                vc.setStatusBarHidden(on)
            }
            call.resolve()
        }
    }

    /// Soft tap feedback (e.g. favorite heart) — does not block the JS caller.
    @objc func lightImpact(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.prepare()
            generator.impactOccurred()
            call.resolve()
        }
    }
}
