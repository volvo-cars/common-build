import React from 'react';
import 'reflect-metadata'
import { createRoot } from 'react-dom/client';
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app';
import { NotificationProvider } from './notifications/notification-provider';
import { NotificationView } from './notifications/notification-view';

const rootElement = document.getElementById('root') as Element
const root = createRoot(rootElement)
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <NotificationProvider>
        <App />
        <NotificationView />
      </NotificationProvider>
    </BrowserRouter>
  </React.StrictMode>
)

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
//reportWebVitals();
