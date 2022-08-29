import { useContext } from "react";
import NotificationContext from "./notification-provider";

export interface Notifier {
    info(text: string, timeout?: number): void
    warning(text: string, timeout?: number): void
    error(text: string, timeout?: number): void
    clear(): void
}

export const useNotifications = (): Notifier => {
    const notifier = useContext(NotificationContext);
    if (notifier) {
        return notifier
    } else {
        throw "Notifier not initialized."
    }
}

