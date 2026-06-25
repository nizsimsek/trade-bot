import { Send } from "lucide-react";
import { notifyTradeEvent } from "./LiveToasts";

export function NotificationTestButton() {
  async function sendTestNotification() {
    if ("Notification" in window && window.isSecureContext && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    notifyTradeEvent({
      id: `test-${Date.now()}`,
      time: Math.floor(Date.now() / 1000),
      kind: "system",
      title: "Test bildirimi",
      message: "Dashboard bildirim kanalı çalışıyor. WebView içindeysen Swift local notification da tetiklenir."
    });
  }

  return (
    <button className="notification-button" type="button" onClick={sendTestNotification} title="Toast, web notification ve iOS bridge test eder.">
      <Send size={16} />
      Test
    </button>
  );
}
