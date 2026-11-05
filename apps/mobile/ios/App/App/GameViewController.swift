import UIKit
import Capacitor

/// Constrain the whole WebView, including fixed-position controls and both map
/// renderers. A scroll-view content inset alone does not protect fixed content
/// from the camera cutout after rotating an iPhone into landscape.
class GameViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let gameView = webView else { return }
        let container = UIView()
        container.backgroundColor = UIColor(red: 6 / 255, green: 12 / 255, blue: 22 / 255, alpha: 1)
        view = container
        gameView.translatesAutoresizingMaskIntoConstraints = false
        gameView.scrollView.contentInsetAdjustmentBehavior = .never
        container.addSubview(gameView)
        let safe = container.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            gameView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            gameView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            gameView.topAnchor.constraint(equalTo: safe.topAnchor),
            gameView.bottomAnchor.constraint(equalTo: safe.bottomAnchor)
        ])
    }
}
