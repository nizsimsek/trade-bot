import Foundation
import UIKit
import UserNotifications

final class NotificationManager {
    static let shared = NotificationManager()

    private init() {}

    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }

            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func sendTradeNotification(id: String, title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = "XAU/USD Bot - \(title)"
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: id,
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    func registerDeviceToken(_ deviceToken: Data) {
        guard let url = makeDeviceRegistrationURL() else { return }

        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token])

        URLSession.shared.dataTask(with: request).resume()
    }

    func handleRemoteRegistrationError(_ error: Error) {
        print("APNs registration failed: \(error.localizedDescription)")
    }

    private func makeDeviceRegistrationURL() -> URL? {
        guard let dashboardUrl = DashboardConfig.url else { return nil }
        return URL(string: "/api/devices", relativeTo: dashboardUrl)?.absoluteURL
    }
}
