#!/usr/bin/env swift
//
// AirPodsPopup.swift
//
// Visual-only recreation of the macOS "accessory connected" popup animation
// (the card that slides in near the top of the screen when AirPods, a Magic
// Mouse, etc. connect). No Bluetooth is used — this just draws the same kind
// of card and animates it with fake data.
//
// Usage:
//   swift AirPodsPopup.swift --list
//   swift AirPodsPopup.swift --type airpodspro
//   swift AirPodsPopup.swift --type magicmouse --name "Gilad's Magic Mouse" --battery 88
//   swift AirPodsPopup.swift --type airpodspro --name "Gilad's AirPods Pro" --battery 80,76,45 --duration 5
//
// Requires macOS (AppKit/SwiftUI). Run with the Swift that ships with Xcode
// Command Line Tools: `xcode-select --install` if `swift` isn't found.

import AppKit
import SwiftUI

// MARK: - Accessory presets

struct AccessoryInfo {
    var name: String
    var symbolCandidates: [String]
    var batteries: [(label: String, percent: Int)]
}

let presets: [String: AccessoryInfo] = [
    "airpods": AccessoryInfo(
        name: "AirPods",
        symbolCandidates: ["airpods", "airpods.gen3", "earbuds.case"],
        batteries: [("L", 62), ("R", 58)]
    ),
    "airpodspro": AccessoryInfo(
        name: "AirPods Pro",
        symbolCandidates: ["airpodspro", "airpods.pro", "earbuds.case"],
        batteries: [("L", 80), ("R", 76), ("Case", 45)]
    ),
    "airpodsmax": AccessoryInfo(
        name: "AirPods Max",
        symbolCandidates: ["airpodsmax", "airpods.max", "headphones"],
        batteries: [("Battery", 54)]
    ),
    "magicmouse": AccessoryInfo(
        name: "Magic Mouse",
        symbolCandidates: ["magicmouse", "magicmouse.fill", "computermouse"],
        batteries: [("Battery", 88)]
    ),
    "magickeyboard": AccessoryInfo(
        name: "Magic Keyboard",
        symbolCandidates: ["magickeyboard", "keyboard"],
        batteries: [("Battery", 92)]
    ),
    "trackpad": AccessoryInfo(
        name: "Magic Trackpad",
        symbolCandidates: ["trackpad", "rectangle.and.hand.point.up.left"],
        batteries: [("Battery", 70)]
    ),
    "applewatch": AccessoryInfo(
        name: "Apple Watch",
        symbolCandidates: ["applewatch", "applewatch.watchface"],
        batteries: [("Battery", 65)]
    ),
    "homepod": AccessoryInfo(
        name: "HomePod mini",
        symbolCandidates: ["homepod.mini.fill", "homepod.fill", "homepod"],
        batteries: []
    ),
]

// MARK: - CLI parsing

func printUsageAndExit() -> Never {
    print("""
    AirPodsPopup — visual recreation of the macOS accessory-connected popup.

    Usage:
      swift AirPodsPopup.swift --type <preset> [options]

    Presets (--list to print this again):
      \(presets.keys.sorted().joined(separator: ", "))

    Options:
      --name "Custom Name"      Override the displayed device name
      --battery 80,76,45        Comma-separated battery percentages
                                 (count should match the preset's rows)
      --duration 4.5            Seconds the popup stays visible (default 4.5)
      --list                    Print available presets and exit
      --help                    Print this message

    Example:
      swift AirPodsPopup.swift --type airpodspro --name "Gilad's AirPods Pro" --battery 80,76,45
    """)
    exit(0)
}

var args = Array(CommandLine.arguments.dropFirst())
if args.contains("--help") { printUsageAndExit() }
if args.contains("--list") { printUsageAndExit() }

func value(for flag: String) -> String? {
    guard let idx = args.firstIndex(of: flag), idx + 1 < args.count else { return nil }
    return args[idx + 1]
}

let typeKey = (value(for: "--type") ?? "airpodspro").lowercased()
guard var info = presets[typeKey] else {
    print("Unknown --type '\(typeKey)'. Known types: \(presets.keys.sorted().joined(separator: ", "))")
    exit(1)
}

if let customName = value(for: "--name") {
    info.name = customName
}
if let batteryArg = value(for: "--battery") {
    let parts = batteryArg.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
    if parts.count == info.batteries.count {
        for i in 0..<parts.count {
            info.batteries[i].percent = max(0, min(100, parts[i]))
        }
    } else {
        print("--battery expects \(info.batteries.count) value(s) for '\(typeKey)', got \(parts.count). Using defaults.")
    }
}
let duration = Double(value(for: "--duration") ?? "") ?? 4.5

func resolveSymbol(_ candidates: [String]) -> String {
    for name in candidates where NSImage(systemSymbolName: name, accessibilityDescription: nil) != nil {
        return name
    }
    return "wave.3.right.circle.fill"
}
let symbolName = resolveSymbol(info.symbolCandidates)

// MARK: - Blur background

struct VisualEffectView: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .hudWindow
        view.blendingMode = .behindWindow
        view.state = .active
        return view
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

// MARK: - Popup content

struct PopupView: View {
    let info: AccessoryInfo
    let symbolName: String

    @State private var showCard = false
    @State private var connectedPhase = false
    @State private var batteryProgress: [Double]

    init(info: AccessoryInfo, symbolName: String) {
        self.info = info
        self.symbolName = symbolName
        _batteryProgress = State(initialValue: info.batteries.map { _ in 0 })
    }

    func batteryColor(_ percent: Double) -> Color {
        if percent <= 20 { return .red }
        if percent <= 40 { return .yellow }
        return .green
    }

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.15))
                    .frame(width: 60, height: 60)
                Image(systemName: symbolName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 34, height: 34)
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(info.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)

                if connectedPhase && !info.batteries.isEmpty {
                    ForEach(Array(info.batteries.enumerated()), id: \.offset) { idx, battery in
                        HStack(spacing: 8) {
                            Text(battery.label)
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.7))
                                .frame(width: 34, alignment: .leading)
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Color.white.opacity(0.2))
                                    Capsule()
                                        .fill(batteryColor(batteryProgress[idx]))
                                        .frame(width: geo.size.width * CGFloat(batteryProgress[idx] / 100))
                                }
                            }
                            .frame(height: 6)
                            Text("\(Int(batteryProgress[idx]))%")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.white)
                                .frame(width: 30, alignment: .trailing)
                        }
                    }
                } else if connectedPhase {
                    Text("Connected")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.7))
                } else {
                    Text("Connecting…")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(width: 340)
        .background(VisualEffectView())
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.3), radius: 20, y: 8)
        .opacity(showCard ? 1 : 0)
        .scaleEffect(showCard ? 1 : 0.92)
        .offset(y: showCard ? 0 : -20)
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) {
                showCard = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
                withAnimation(.easeOut(duration: 0.25)) {
                    connectedPhase = true
                }
                for idx in info.batteries.indices {
                    withAnimation(.easeOut(duration: 0.8).delay(Double(idx) * 0.15)) {
                        batteryProgress[idx] = Double(info.batteries[idx].percent)
                    }
                }
            }
        }
    }
}

// MARK: - Window + app lifecycle

final class AppDelegate: NSObject, NSApplicationDelegate {
    let info: AccessoryInfo
    let symbolName: String
    let duration: Double
    var window: NSWindow?

    init(info: AccessoryInfo, symbolName: String, duration: Double) {
        self.info = info
        self.symbolName = symbolName
        self.duration = duration
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let rowCount = max(info.batteries.count, 1)
        let height: CGFloat = 60 + CGFloat(rowCount) * 20
        let width: CGFloat = 340 + 32

        guard let screen = NSScreen.main else {
            NSApp.terminate(nil)
            return
        }
        let screenFrame = screen.visibleFrame
        let originX = screenFrame.midX - width / 2
        let originY = screenFrame.maxY - height - 6

        let window = NSWindow(
            contentRect: NSRect(x: originX, y: originY, width: width, height: height),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.level = .statusBar
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        window.ignoresMouseEvents = true
        window.isMovableByWindowBackground = false

        let hosting = NSHostingView(rootView: PopupView(info: info, symbolName: symbolName))
        window.contentView = hosting

        window.orderFrontRegardless()
        self.window = window

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            self?.dismiss()
        }
    }

    func dismiss() {
        guard let window = window else {
            NSApp.terminate(nil)
            return
        }
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.35
            window.animator().alphaValue = 0
        }, completionHandler: {
            window.orderOut(nil)
            NSApp.terminate(nil)
        })
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate(info: info, symbolName: symbolName, duration: duration)
app.delegate = delegate
app.run()
