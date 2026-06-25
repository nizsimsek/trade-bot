import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(allowedHost: url.host)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.add(context.coordinator, name: "tradingNotification")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url != url {
            webView.load(URLRequest(url: url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        private let allowedHost: String?

        init(allowedHost: String?) {
            self.allowedHost = allowedHost
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let targetURL = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if targetURL.scheme == "about" || targetURL.host == allowedHost {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "tradingNotification",
                  let payload = message.body as? [String: Any] else {
                return
            }

            let id = payload["id"] as? String ?? UUID().uuidString
            let title = payload["title"] as? String ?? "İşlem bildirimi"
            let body = payload["body"] as? String ?? ""

            NotificationManager.shared.sendTradeNotification(id: id, title: title, body: body)
        }
    }
}
