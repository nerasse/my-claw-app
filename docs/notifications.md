# Notifications (côté app)

L'app affiche une notification système quand un run de session ou un job cron se termine côté
serveur. Le transport est **UnifiedPush** (pas de Firebase) · l'architecture complète, le
format du payload et les événements sont documentés côté serveur dans `docs/notifications.md`
du dépôt my-claw. Ce document couvre ce qui vit dans l'app.

## Ce qu'il faut sur le téléphone

1. Une **app distributrice** UnifiedPush : [ntfy](https://ntfy.sh/) (F-Droid ou Play) ou
   NextPush. C'est elle qui tient la connexion au serveur push ; elle doit être **exemptée de
   l'optimisation batterie** (Paramètres → Apps → ntfy → Batterie → Sans restriction).
2. La permission **notifications** pour my-claw-app (demandée automatiquement au premier
   enregistrement, Android 13+).
3. Un serveur **ntfy** joignable, celui configuré côté my-claw.

Sans distributeur installé, l'app fonctionne normalement : il n'y a simplement aucune
notification, et la raison est remontée par `registerForPush()`.

## Cycle de vie

```
connexion WS ──► frame notifications.info { vapidPublicKey }
                     │
                     ▼
            registerForPush(vapidPublicKey)
              ├─ permission POST_NOTIFICATIONS
              ├─ choix du distributeur (le premier externe, ntfy)
              └─ ExpoUnifiedPush.registerDevice(vapid)
                     │
      le distributeur répond (événement "registered")
                     │
                     ▼
        frame notifications.register { endpoint, pubKey, auth }  ──► serveur
```

- L'enregistrement est fait **une seule fois par session d'app** (au premier `notifications.info`,
  donc à la première connexion) : une reconnexion ramène la même clé VAPID et la même
  registration, et ré-appeler `registerDevice` ferait tourner l'endpoint pour rien (et fuiter
  une subscription chez le distributeur à chaque reconnexion). Il ne se refait que si le
  distributeur signale la registration perdue (`unregistered` ou échec).
- `unregistered` renvoie un endpoint vide au serveur, qui arrête de publier dans le vide.
- L'app envoie `notifications.state { foreground, threadId }` à chaque changement d'état
  (`AppState`) et de thread actif : c'est ce qui permet au serveur de **taire** la notification
  du run que l'utilisateur regarde déjà.

## La notification de connexion (foreground service)

Android exige qu'un foreground service affiche une notification persistante. Celle de
`ClawConnectionService` (« my-claw · Agent connection active », canal `IMPORTANCE_LOW`) est un
**statut silencieux** : pas de son, pas de bannière, `setOnlyAlertOnce` (aucun re-alerte quand
le service redémarre après une coupure réseau) et pas de badge. C'est elle qu'on voit dans le
tiroir des notifications ; la supprimer entièrement ferait tuer le service par le système et
couperait le lien avec le serveur en arrière-plan.

## Affichage et tap

La notification est rendue **nativement** par `expo-unified-push` (service Kotlin), sans passer
par le JS : elle s'affiche donc même quand l'app est **tuée**. Le payload porte un deep link :

| Lien | Effet |
| --- | --- |
| `myclaw://thread/<threadId>` | ouvre la conversation |
| `myclaw://job/<jobId>` | ouvre la page Jobs |

**Bannière en haut de l'écran** : la lib crée son canal en `IMPORTANCE_DEFAULT` (son, pas de
bannière). `MainApplication.kt` pré-crée au boot le canal `com.myclawapp:unified_push_channel:runs`
en `IMPORTANCE_HIGH` — les réglages d'un canal sont figés à la première création, donc la
bannière s'affiche et l'utilisateur peut toujours l'ajuster dans Paramètres → Apps →
my-claw-app → Notifications → canal « Runs ».

Le schéma `myclaw` est déclaré dans `AndroidManifest.xml` (intent-filter `VIEW` sur
`MainActivity`). `AppShell` résout `Linking.getInitialURL()` au démarrage (cas du démarrage à
froid : l'app était tuée et c'est le tap qui l'a lancée) et écoute l'événement `url` sinon.

Limite connue : le rendu natif relance l'activité avec `FLAG_ACTIVITY_CLEAR_TASK`, donc taper
une notification alors que l'app est déjà ouverte **recharge** l'écran.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `src/core/notifications.ts` | permissions, distributeur, enregistrement, parsing des deep links. Tout est no-op hors Android. |
| `src/core/protocol.ts` | frames `notifications.info` / `register` / `state` |
| `src/app/AppShell.tsx` | enregistrement à la réception de la clé, état premier-plan, ouverture sur tap |
| `__tests__/Notifications.test.tsx` | le cycle complet, avec le distributeur et `Linking` mockés |

## Plateformes

UnifiedPush est un standard **Android**. `pushSupported` est `false` ailleurs et chaque entrée
de `src/core/notifications.ts` devient un no-op plutôt que de prétendre que la plateforme est
couverte : un futur build iOS demandera APNs, un build web la Notification API (Web Push).

## Dépendances natives et build

L'app n'utilise que **deux** modules Expo : `expo-modules-core` (l'infrastructure) et
`expo-unified-push`. Le package `expo` est installé parce que la lib l'importe, mais :

- `metro.config.js` résout `'expo'` vers `expo-modules-core`, donc `Expo.fx` (et son
  `import 'expo-asset'`) n'entre jamais dans le bundle ;
- `package.json > expo.autolinking.exclude` sort les 7 modules inutilisés du build natif
  (`expo-asset`, `expo-constants`, `expo-file-system`, `expo-font`, `expo-keep-awake`,
  `@expo/dom-webview`, `@expo/log-box`) ;
- `scripts/check-native-deps.js` connaît cette liste : un module exclu n'est pas un module
  oublié.

Effet mesuré : 565 → 333 tâches Gradle, build complet 3m37s → 1m34s, incrémental ~11s, APK
33,5 → 29,4 Mo.
