import Capacitor
import UIKit

class MainViewController: CAPBridgeViewController {
    private var statusBarHidden = false

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Capacitor 7 defaults to autoRegisterPlugins, which silently turns
        // registerPluginType into a no-op; instances must be registered directly.
        bridge?.registerPluginInstance(LyraAudioPlugin())
        bridge?.registerPluginInstance(LyraUIPlugin())
    }

    override var prefersStatusBarHidden: Bool {
        statusBarHidden
    }

    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation {
        .fade
    }

    func setStatusBarHidden(_ hidden: Bool) {
        guard statusBarHidden != hidden else { return }
        statusBarHidden = hidden
        setNeedsStatusBarAppearanceUpdate()
    }
}
