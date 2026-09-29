// macOS screensaver for Berlin Transit Live.
//
// Hosts a WKWebView that loads the bundled web app (Resources/www, produced by
// native-app/scripts/sync-web.mjs) in screensaver mode for the chosen station.
// Built without Xcode by ../build.sh.

import AppKit
import ScreenSaver
import WebKit

private let moduleName = "com.gcameo.berlintransit.saver"

struct Station {
    var id: String
    var name: String

    static let fallback = Station(id: "900003201", name: "Berlin Hauptbahnhof")

    static var saved: Station {
        get {
            let d = ScreenSaverDefaults(forModuleWithName: moduleName)
            guard let id = d?.string(forKey: "stationId"), !id.isEmpty else { return fallback }
            return Station(id: id, name: d?.string(forKey: "stationName") ?? "")
        }
        set {
            guard let d = ScreenSaverDefaults(forModuleWithName: moduleName) else { return }
            d.set(newValue.id, forKey: "stationId")
            d.set(newValue.name, forKey: "stationName")
            d.synchronize()
        }
    }

    /// Parses a "Screensaver link" from the web app (…?station=<id>&name=<name>).
    static func fromLink(_ text: String) -> Station? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let items = URLComponents(string: trimmed)?.queryItems,
              let id = items.first(where: { $0.name == "station" })?.value, !id.isEmpty
        else { return nil }
        return Station(id: id, name: items.first(where: { $0.name == "name" })?.value ?? "")
    }
}

/// A web view that never receives mouse events (the screensaver owns input).
private final class PassiveWebView: WKWebView {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

@objc(BerlinTransitView)
final class BerlinTransitView: ScreenSaverView {
    private var webView: WKWebView?
    private var previewLabel: NSTextField?
    private var configController: ConfigController?

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = 1.0
        // macOS 14+ keeps legacyScreenSaver instances alive after the saver
        // ends (they keep using network/CPU). Tear down on "willstop" and, like
        // other third-party savers, quit the host process.
        DistributedNotificationCenter.default().addObserver(
            self,
            selector: #selector(screenSaverWillStop(_:)),
            name: Notification.Name("com.apple.screensaver.willstop"),
            object: nil
        )
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    deinit {
        DistributedNotificationCenter.default().removeObserver(self)
    }

    @objc private func screenSaverWillStop(_ note: Notification) {
        tearDown()
        if !isPreview {
            if #available(macOS 14.0, *) {
                exit(0)
            }
        }
    }

    override func draw(_ rect: NSRect) {
        NSColor.black.setFill()
        rect.fill()
    }

    override func animateOneFrame() {}

    override func startAnimation() {
        super.startAnimation()
        if isPreview {
            showPreview()
        } else {
            startWebView()
        }
    }

    override func stopAnimation() {
        super.stopAnimation()
        tearDown()
    }

    // The small thumbnail in System Settings: static label, no network.
    private func showPreview() {
        guard previewLabel == nil else { return }
        let label = NSTextField(labelWithString: "Berlin Transit Live\n\(Station.saved.name)")
        label.alignment = .center
        label.textColor = NSColor(white: 1, alpha: 0.6)
        label.font = NSFont.systemFont(ofSize: max(10, bounds.height / 12))
        label.maximumNumberOfLines = 2
        label.sizeToFit()
        label.frame.origin = NSPoint(x: (bounds.width - label.frame.width) / 2,
                                     y: (bounds.height - label.frame.height) / 2)
        label.autoresizingMask = [.minXMargin, .maxXMargin, .minYMargin, .maxYMargin]
        addSubview(label)
        previewLabel = label
    }

    private func startWebView() {
        guard webView == nil else { return }
        let web = PassiveWebView(frame: bounds, configuration: WKWebViewConfiguration())
        web.autoresizingMask = [.width, .height]
        web.underPageBackgroundColor = .black
        addSubview(web)
        webView = web

        let station = Station.saved
        let bundle = Bundle(for: BerlinTransitView.self)
        if let index = bundle.url(forResource: "index", withExtension: "html", subdirectory: "www"),
           var parts = URLComponents(url: index, resolvingAgainstBaseURL: false) {
            parts.queryItems = queryItems(for: station)
            web.loadFileURL(parts.url ?? index, allowingReadAccessTo: index.deletingLastPathComponent())
        } else {
            // Bundled page missing: use the hosted web app instead.
            var parts = URLComponents(string: "https://gcameo.com/berlin-transit.html")!
            parts.queryItems = queryItems(for: station)
            web.load(URLRequest(url: parts.url!))
        }
    }

    private func queryItems(for station: Station) -> [URLQueryItem] {
        var items = [URLQueryItem(name: "screensaver", value: "1"),
                     URLQueryItem(name: "station", value: station.id)]
        if !station.name.isEmpty {
            items.append(URLQueryItem(name: "name", value: station.name))
        }
        return items
    }

    private func tearDown() {
        if let web = webView {
            web.stopLoading()
            web.load(URLRequest(url: URL(string: "about:blank")!))
            web.removeFromSuperview()
            webView = nil
        }
        previewLabel?.removeFromSuperview()
        previewLabel = nil
    }

    // MARK: Options sheet

    override var hasConfigureSheet: Bool { true }

    override var configureSheet: NSWindow? {
        let controller = configController ?? ConfigController()
        configController = controller
        controller.reset()
        return controller.window
    }
}

/// Options: search VBB stations or paste a Screensaver link.
@MainActor
final class ConfigController: NSObject {
    let window: NSPanel
    private let currentLabel = NSTextField(labelWithString: "")
    private let searchField = NSSearchField()
    private let resultsPopup = NSPopUpButton(frame: .zero, pullsDown: false)
    private let linkField = NSTextField()
    private var results: [Station] = []
    private var task: URLSessionDataTask?

    override init() {
        window = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 440, height: 250),
                         styleMask: [.titled], backing: .buffered, defer: true)
        super.init()
        window.title = "Berlin Transit Live"
        guard let content = window.contentView else { return }

        func label(_ text: String, y: CGFloat) -> NSTextField {
            let l = NSTextField(labelWithString: text)
            l.frame = NSRect(x: 20, y: y, width: 400, height: 17)
            return l
        }
        currentLabel.frame = NSRect(x: 20, y: 214, width: 400, height: 17)
        currentLabel.font = NSFont.boldSystemFont(ofSize: NSFont.systemFontSize)

        searchField.frame = NSRect(x: 20, y: 160, width: 400, height: 22)
        searchField.placeholderString = "Search a station, e.g. Alexanderplatz"
        searchField.target = self
        searchField.action = #selector(searchChanged)

        resultsPopup.frame = NSRect(x: 17, y: 126, width: 406, height: 26)

        linkField.frame = NSRect(x: 20, y: 70, width: 400, height: 22)
        linkField.placeholderString = "https://gcameo.com/berlin-transit.html?screensaver=1&station=…"

        let cancel = NSButton(title: "Cancel", target: self, action: #selector(cancelPressed))
        cancel.frame = NSRect(x: 236, y: 14, width: 90, height: 32)
        cancel.keyEquivalent = "\u{1b}"
        let ok = NSButton(title: "Save", target: self, action: #selector(savePressed))
        ok.frame = NSRect(x: 330, y: 14, width: 90, height: 32)

        let views: [NSView] = [
            currentLabel, label("Station:", y: 188), searchField, resultsPopup,
            label("…or paste a Screensaver link from the web app:", y: 98), linkField, cancel, ok,
        ]
        views.forEach { content.addSubview($0) }
    }

    func reset() {
        let station = Station.saved
        currentLabel.stringValue = "Current: \(station.name.isEmpty ? "Stop \(station.id)" : station.name)"
        searchField.stringValue = ""
        linkField.stringValue = ""
        showResults([])
    }

    @objc private func searchChanged() {
        task?.cancel()
        let query = searchField.stringValue.trimmingCharacters(in: .whitespaces)
        guard query.count >= 2 else { showResults([]); return }
        var parts = URLComponents(string: "https://v6.vbb.transport.rest/locations")!
        parts.queryItems = [URLQueryItem(name: "query", value: query),
                            URLQueryItem(name: "results", value: "8"),
                            URLQueryItem(name: "poi", value: "false"),
                            URLQueryItem(name: "addresses", value: "false")]
        guard let url = parts.url else { return }
        task = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            var stations: [Station] = []
            if let data = data,
               let items = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
                stations = items.compactMap { item in
                    guard let id = item["id"] as? String, let name = item["name"] as? String else { return nil }
                    return Station(id: id, name: name)
                }
            }
            DispatchQueue.main.async { self?.showResults(stations) }
        }
        task?.resume()
    }

    private func showResults(_ stations: [Station]) {
        results = stations
        resultsPopup.removeAllItems()
        if stations.isEmpty {
            resultsPopup.addItem(withTitle: searchField.stringValue.isEmpty ? "Type to search…" : "No stations found")
            resultsPopup.isEnabled = false
            return
        }
        // Add menu items directly: addItem(withTitle:) drops duplicate titles.
        for station in stations {
            resultsPopup.menu?.addItem(NSMenuItem(title: station.name, action: nil, keyEquivalent: ""))
        }
        resultsPopup.isEnabled = true
        resultsPopup.selectItem(at: 0)
    }

    @objc private func savePressed() {
        if let station = Station.fromLink(linkField.stringValue) {
            Station.saved = station
        } else if resultsPopup.isEnabled,
                  results.indices.contains(resultsPopup.indexOfSelectedItem) {
            Station.saved = results[resultsPopup.indexOfSelectedItem]
        }
        close()
    }

    @objc private func cancelPressed() {
        close()
    }

    private func close() {
        task?.cancel()
        if let parent = window.sheetParent {
            parent.endSheet(window)
        } else {
            window.close()
        }
    }
}
