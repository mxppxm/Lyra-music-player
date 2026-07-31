import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func loadView() {
        super.loadView()
        bridge?.registerPluginType(LyraAudioPlugin.self)
    }
}
