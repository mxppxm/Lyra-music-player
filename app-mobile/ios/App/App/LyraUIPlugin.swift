import Capacitor
import UIKit

@objc(LyraUIPlugin)
public class LyraUIPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LyraUIPlugin"
    public let jsName = "LyraUI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setImmersive", returnType: CAPPluginReturnPromise),
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
}
