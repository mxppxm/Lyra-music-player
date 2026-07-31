import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Capacitor 7 defaults to autoRegisterPlugins, which silently turns
        // registerPluginType into a no-op; instances must be registered directly.
        bridge?.registerPluginInstance(LyraAudioPlugin())
    }
}
