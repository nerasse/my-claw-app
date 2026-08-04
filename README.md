# MyClaw App

Application Android companion pour [my-claw](https://git.kssimi.fr/claw/my-claw), agent AI self-hosted. Premier canal mobile: chat + outils de contrôle du téléphone.

## Stack

- React Native 0.86 (bare, TypeScript)
- Couche native Kotlin pour Android: `AccessibilityService`, `NotificationListenerService`, service foreground avec connexion WebSocket sécurisée (OkHttp)

## Architecture

```text
src/
├── core/
│   ├── types.ts        # Types du protocole partagé avec my-claw
│   ├── connection.ts   # Connexion WSS au backend (reconnexion auto, heartbeat)
│   └── device.ts       # Pont natif: capacités, accessibility, notifications
└── App.tsx             # UI minimale de test (connect, snapshot, log)

android/app/src/main/java/com/myclawapp/device/
├── DeviceBridgeModule.kt    # Module React Native -> Kotlin
├── DeviceBus.kt             # Pont d'événements Kotlin -> JS
├── ClawConnectionService.kt # Service foreground + WebSocket OkHttp
├── ClawAccessibilityService.kt
├── ClawNotificationListener.kt
└── DevicePackage.kt
```

La connexion est sortante (téléphone -> VPS) via WebSocket sécurisé, ce qui évite d'exposer de port public. Le service foreground maintient la connexion quand l'app passe en arrière-plan.

## Dev

```bash
npm install
npm run android   # avec un appareil connecté (USB ou adb sans fil)
npm run lint
npm test
```

Pour se connecter au serveur de dev Metro depuis un téléphone distant: voir `docs` de my-claw (workflow Tailscale: `npx react-native start --host <ip-tailscale>` puis configurer `Dev Settings -> Debug server host & port`).

## Permissions Android

- `AccessibilityService`: lecture d'écran + actions (activé manuellement dans les réglages Android)
- `NotificationListenerService`: notifications entrantes (activé manuellement dans les réglages Android)
- Service foreground + notifications: maintien de la connexion en arrière-plan

Aucune action n'est exécutée sans approbation explicite de l'utilisateur dans l'app.
