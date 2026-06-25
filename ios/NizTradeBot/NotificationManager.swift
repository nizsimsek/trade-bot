import Foundation
import UserNotifications

final class NotificationManager {
    static let shared = NotificationManager()

    private init() {}

    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
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
}
