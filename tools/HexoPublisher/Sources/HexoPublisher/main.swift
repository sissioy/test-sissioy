import AppKit

private enum PublishState: Equatable {
    case idle, building, success, warning, failure

    var symbol: String {
        switch self {
        case .idle: return "arrow.up.circle"
        case .building: return "hammer.circle"
        case .success: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .failure: return "xmark.circle.fill"
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let repositoryPath = "/Users/syo/Documents/ChatGPT/hexo-blog"
    private let logPath = NSString(string: "~/Library/Logs/HexoPublisher/publish.log").expandingTildeInPath
    private var statusItem: NSStatusItem!
    private var publishing = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        guard let button = statusItem.button else { return }
        button.target = self
        button.action = #selector(statusItemClicked(_:))
        button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        setState(.idle, tooltip: "一键发布 Hexo 文章")
    }

    @objc private func statusItemClicked(_ sender: NSStatusBarButton) {
        if NSApp.currentEvent?.type == .rightMouseUp {
            showMenu()
        } else {
            publish()
        }
    }

    private func showMenu() {
        let menu = NSMenu()
        menu.addItem(withTitle: "打开仓库", action: #selector(openRepository), keyEquivalent: "")
        menu.addItem(withTitle: "查看日志", action: #selector(openLog), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出", action: #selector(quit), keyEquivalent: "q")
        menu.items.forEach { $0.target = self }
        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil
    }

    private func publish() {
        guard !publishing else { return }
        publishing = true
        setState(.building, tooltip: "正在构建并发布")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["\(repositoryPath)/tooling/publish-posts.sh"]
        process.currentDirectoryURL = URL(fileURLWithPath: repositoryPath)
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                guard let self else { return }
                self.publishing = false
                switch process.terminationStatus {
                case 0:
                    self.setState(.success, tooltip: "线上发布成功")
                case 10:
                    self.setState(.warning, tooltip: "没有文章改动")
                default:
                    self.setState(.failure, tooltip: "发布失败，右键查看日志")
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
                    if !self.publishing { self.setState(.idle, tooltip: "一键发布 Hexo 文章") }
                }
            }
        }

        do {
            try process.run()
        } catch {
            publishing = false
            setState(.failure, tooltip: "无法启动发布脚本")
        }
    }

    private func setState(_ state: PublishState, tooltip: String) {
        statusItem.button?.image = NSImage(systemSymbolName: state.symbol, accessibilityDescription: tooltip)
        statusItem.button?.toolTip = tooltip
        statusItem.button?.isEnabled = true
    }

    @objc private func openRepository() {
        NSWorkspace.shared.open(URL(fileURLWithPath: repositoryPath))
    }

    @objc private func openLog() {
        let manager = FileManager.default
        if !manager.fileExists(atPath: logPath) {
            manager.createFile(atPath: logPath, contents: nil)
        }
        NSWorkspace.shared.open(URL(fileURLWithPath: logPath))
    }

    @objc private func quit() {
        NSApplication.shared.terminate(nil)
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
application.run()
