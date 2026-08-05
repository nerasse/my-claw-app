# MyClaw App

Android companion app for [my-claw](https://git.kssimi.fr/claw/my-claw), a self-hosted AI agent. First mobile channel: chat + phone control tools.

## Stack

- React Native 0.86 (bare, TypeScript)
- Native Kotlin layer for Android: `AccessibilityService`, `NotificationListenerService`, foreground service with a secure WebSocket connection (OkHttp)

## Architecture

```text
src/
├── core/
│   ├── types.ts        # Protocol types shared with my-claw
│   ├── connection.ts   # WSS connection to the backend (auto reconnect, heartbeat)
│   └── device.ts       # Native bridge: capabilities, accessibility, notifications
└── App.tsx             # Providers only (theme, safe area) around the app shell

android/app/src/main/java/com/myclawapp/device/
├── DeviceBridgeModule.kt    # React Native -> Kotlin module
├── DeviceBus.kt             # Kotlin -> JS event bridge
├── ClawConnectionService.kt # Foreground service + OkHttp WebSocket
├── ClawAccessibilityService.kt
├── ClawNotificationListener.kt
└── DevicePackage.kt
```

The connection is outbound (phone -> VPS) over a secure WebSocket, which avoids exposing a public port. The foreground service keeps the connection alive while the app is in the background.

## Dev

```bash
npm install
npm run android   # with a device connected (USB or wireless adb)
npm run lint
npm test
```

To connect to the Metro dev server from a remote phone: see the my-claw `docs` (Tailscale workflow: `npx react-native start --host <tailscale-ip>` then set `Dev Settings -> Debug server host & port`).

## Android permissions

- `AccessibilityService`: screen reading + actions (enabled manually in Android settings)
- `NotificationListenerService`: incoming notifications (enabled manually in Android settings)
- Foreground service + notifications: keeps the connection alive in the background

No action is taken without the user's explicit approval in the app.
