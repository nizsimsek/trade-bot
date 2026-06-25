import React from "react";
import { Bell, BellOff } from "lucide-react";

type NotificationState = "unsupported" | "blocked-context" | NotificationPermission;

export function NotificationControl() {
  const [state, setState] = React.useState<NotificationState>(() => getNotificationState());

  async function requestPermission() {
    if (!("Notification" in window) || !window.isSecureContext) {
      setState(getNotificationState());
      return;
    }

    const permission = await Notification.requestPermission();
    setState(permission);
  }

  if (state === "unsupported") {
    return (
      <button className="notification-button disabled" type="button" disabled title="Bu tarayıcı web bildirimi desteklemiyor.">
        <BellOff size={16} />
        Bildirim yok
      </button>
    );
  }

  if (state === "blocked-context") {
    return (
      <button className="notification-button disabled" type="button" disabled title="Web bildirimleri için HTTPS veya localhost gerekir.">
        <BellOff size={16} />
        HTTPS gerekli
      </button>
    );
  }

  if (state === "granted") {
    return (
      <button className="notification-button enabled" type="button" title="Web bildirimleri açık.">
        <Bell size={16} />
        Bildirim açık
      </button>
    );
  }

  if (state === "denied") {
    return (
      <button className="notification-button disabled" type="button" disabled title="Bildirim izni tarayıcıdan engellenmiş.">
        <BellOff size={16} />
        İzin kapalı
      </button>
    );
  }

  return (
    <button className="notification-button" type="button" onClick={requestPermission}>
      <Bell size={16} />
      Bildirim aç
    </button>
  );
}

function getNotificationState(): NotificationState {
  if (!("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "blocked-context";
  return Notification.permission;
}
