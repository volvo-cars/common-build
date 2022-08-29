import React, { useState } from 'react';
import { Notifier } from './notifications';

const NotificationContext = React.createContext<Notifier & { notification: Notification | undefined } | undefined>(undefined);
NotificationContext.displayName = 'NotificationContext';

export enum NotificationType {
    INFO = "info",
    WARNING = "warning",
    ERROR = "error",
}

export type Notification = {
    text: string,
    type: NotificationType
}

type Props = {
    children?: JSX.Element | JSX.Element[]
};

const defaultTimeout = 4

export const NotificationProvider = ({ children }: Props) => {
    const [notification, setNotification] = useState<Notification | undefined>(undefined)
    const [timeoutRef, setTimeoutRef] = useState<any | undefined>(undefined)
    return (
        <NotificationContext.Provider
            value={{
                notification: notification,
                info: (text: string, timeout?: number) => {
                    clearTimeout(timeoutRef)
                    setNotification({ text: text, type: NotificationType.INFO });
                    setTimeoutRef(setTimeout(() => {
                        setNotification(undefined)
                    }, (timeout || defaultTimeout) * 1000))

                },
                warning: (text: string, timeout?: number) => {
                    clearTimeout(timeoutRef)
                    setNotification({ text: text, type: NotificationType.WARNING });
                    setTimeoutRef(setTimeout(() => {
                        setNotification(undefined)
                    }, (timeout || defaultTimeout) * 1000))

                },
                error: (text: string, timeout?: number) => {
                    clearTimeout(timeoutRef)
                    setNotification({ text: text, type: NotificationType.ERROR });
                    setTimeoutRef(setTimeout(() => {
                        setNotification(undefined)
                    }, (timeout || defaultTimeout) * 1000))

                },
                clear: () => {
                    clearTimeout(timeoutRef)
                    setNotification(undefined)
                }
            }}
        >
            {children}
        </NotificationContext.Provider>
    );
};

export default NotificationContext;