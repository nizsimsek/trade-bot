import SwiftUI

enum DashboardConfig {
    static var url: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "DashboardURL") as? String else {
            return nil
        }

        return URL(string: value)
    }
}

struct ContentView: View {
    var body: some View {
        Group {
            if let url = DashboardConfig.url {
                WebView(url: url)
            } else {
                Text("DashboardURL Info.plist icinde hatali.")
                    .foregroundStyle(.white)
                    .padding()
            }
        }
        .ignoresSafeArea()
        .background(Color(red: 0.04, green: 0.06, blue: 0.08))
        .onAppear {
            NotificationManager.shared.requestPermission()
        }
    }
}
