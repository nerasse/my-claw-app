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

## Le son de fin de run

En plus du push, l'app joue elle-même le son de notification (`playAlertSound`, le
`RingtoneManager.TYPE_NOTIFICATION` du système) quand un run se termine **sur le fil affiché**.
Le partage est net : un run sur un autre fil est l'affaire du push, et le serveur tait celui du
fil que le téléphone regarde (`notifications.state`), donc jamais deux sons pour un même
événement. Son et push sont indiscernables à l'oreille : pour savoir lequel a parlé, on
s'abonne au topic ntfy et on regarde s'il sort un message.

Deux règles particulières, l'une parce qu'elle prêtait à confusion, l'autre par choix :

- **Le son suit le fil, pas le run.** Ouvrir un sous-agent et le regarder travailler, c'est
  regarder un fil : sa fin sonnait donc, exactement comme une conversation (mesuré le
  2026-09-14, en écartant le push au passage).
- **Un sous-agent est muet** (depuis le 14/09). Son handle est un thread id comme un autre,
  mais ce n'est pas une conversation : l'utilisateur a demandé ce run et la carte change d'état
  sous ses yeux, donc le son est du bruit, pas une nouvelle. Un sous-agent qui **pose une
  question** garde le son : là le run est bloqué sur une réponse, ce qui est précisément ce pour
  quoi le son existe.

Témoin : `src/core/__tests__/runEndSound.test.ts`.

## Les sons que l'owner choisit

Réglages → Notifications laisse choisir les deux sons : le son ordinaire (défaut du système, un
fichier importé, ou silencieux) et la sonnerie (défaut du système ou un fichier -- silencieux y
est refusé, une sonnerie qui ne sonne pas est un contresens). Le choix vit dans ses propres
SharedPreferences (`claw_notification_sounds`) parce qu'il doit survivre à la mort du process :
c'est le boot, sans JS, qui pré-crée les canaux.

Contrainte Android qui dicte tout : les réglages d'un canal sont figés à sa première création,
et recréer un canal supprimé le ressuscite avec ses vieux réglages. Un changement de son est donc
**un nouveau nom de canal**, dérivé du choix et de la **recette** (importance, son, vibration,
tels que l'app les pose) :

| Choix | Nom de canal |
| --- | --- |
| défaut du système | `runs-<8 hex>` / `ring-<8 hex>` |
| silencieux (ordinaire) | `runs-<8 hex>` |
| un fichier importé ou un son système | `runs-<8 hex>` / `ring-<8 hex>` |

Plus aucun nom fixe : les `runs` / `ring` des premières versions ont disparu, parce que c'est
précisément un nom fixe qu'un premier créateur autre que l'app peut geler. Le hash (FNV-1a
32 bits, minuscules) couvre maintenant la recette (`RECIPE`, NotificationSounds.kt), l'usage
**et** le choix : le même fichier choisi pour les deux usages vit dans deux canaux qui gèlent
des comportements différents (la sonnerie vibre longtemps), et un nom ne peut en porter qu'un.
Changer la recette (importance, type de flux, vibrations) change tous les noms, sinon un canal
déjà créé garderait l'ancienne recette pour toujours. Le nom reste dans la grammaire que le
serveur accepte (`validChannelName` : ^[a-z][a-z0-9_-]{0,40}$), et un même choix donne toujours
le même nom : c'est ce qui fait qu'un boot sans changement ne recrée rien. Le nom affiché dans
les réglages Android reste « Runs » / « Ring », quelle que soit la variante.

**La vérification.** Le nom n'est jamais annoncé de confiance : après chaque
`createNotificationChannel`, l'app relit le canal (`getNotificationChannel`) et le compare à
l'intention — importance `IMPORTANCE_HIGH`, son attendu (le défaut est posé explicitement via
`setSound(RingtoneManager.getDefaultUri(...))` pour que l'égalité soit vérifiable, « silencieux »
pose `setSound(null, null)`), vibration. Si ça ne correspond pas — le cas du canal créé en
premier par le renderer d'expo-unified-push, en `IMPORTANCE_DEFAULT`, sans son ni vibration :
créer un id qui existe ne change rien — l'app sonde les noms suffixés (`-v2`, `-v3`, ...)
jusqu'au premier libre ou conforme, et c'est celui-là qu'elle annonce. `state()` et
`getNotificationSounds()` passent par ce chemin **avant de répondre** : le nom envoyé au serveur
est toujours celui d'un canal conforme, et un téléphone déjà cassé se répare au boot suivant
(l'ancien nom, lui, est supprimé — c'est le nom précédent gardé dans les mêmes préférences).

`NotificationSounds.applyChannels(context)` est la seule fonction qui crée le canal du choix
courant et supprime celui qu'il remplace. `MainApplication` l'appelle au boot,
`DeviceBridgeModule` après chaque changement, et `state()` avant chaque réponse. Le serveur suit
le choix par la frame `notifications.channels { deviceId, channels }`, envoyée à chaque connexion
et à chaque changement (comme `notifications.state`) : c'est `entry.channels` côté serveur qui
décide du `type` du payload, donc du canal sur lequel la notification est publiée.

**Le diagnostic.** Le rapport de diagnostic (`diag.report`) porte un champ
`notificationChannels` : par usage, `expected` (le nom que la recette dérive), `id` (le canal en
service), `importance`, `sound` (l'URI voulue par la recette, ou null), `vibration`, et
`effectiveSound` (le son que le canal rapporte réellement, lu par `getNotificationChannel`).
C'est un fait sur l'appareil, pas une opinion : tout est relu du canal. Il part avec le rapport
au boot même quand `reports` est vide (un son qui ne suit pas est un téléphone en bonne santé),
lu par `getNotificationChannelState()` du bridge.

Les fichiers importés sont copiés dans `filesDir/notification-sounds/` et exposés par un
**FileProvider** (`${applicationId}.fileprovider`, `res/xml/file_paths.xml`). Le son d'un canal
est lu par le lecteur du système (SystemUI, ou system_server avant Android 10), qui n'a aucune
permission sur les fichiers privés de l'app : sans provider ni grant, le son est silencieusement
abandonné (« error loading sound »). `applyChannels` refait le `grantUriPermission` à chaque
boot, parce qu'un grant ne survit pas au redémarrage -- et le renderer démarre le process avant
de jouer quoi que ce soit, donc un push qui réveille une app tuée est couvert. Supprimer un
fichier encore choisi fait retomber l'usage sur le défaut, canal compris.

Le ding des questions et de fin de run (`src/core/alertSound.ts`) joue le son ordinaire choisi,
avec le même contrôle du mode sonnerie qu'avant (lu nativement au moment de jouer) : le choix
silencieux ne joue rien, « défaut » retombe sur la sonnerie système. Sur le web il n'y a rien à
choisir (le navigateur possède ses sons) et le ding WebAudio reste tel quel.

## Le navigateur : une permission, et une seule occasion de la demander

Le web a le même transport (Web Push, VAPID, `sw.js` pour l'affichage et le tap) et une
contrainte que l'Android n'a pas : `Notification.requestPermission()` n'est accordé que depuis un
**geste utilisateur**. Firefox refuse l'appel hors geste, Chrome dépense son unique prompt dans
une boîte que personne ne regarde, et le refus est mémorisé.

L'app demandait cette permission à la réception de `notifications.info`, c'est-à-dire à la
connexion. Résultat observé : le téléphone avait un endpoint, les deux fenêtres web **aucun** --
donc une question posée par l'agent atteignait le tray du téléphone et rien du tout sur le bureau.

Depuis : `notifications.info` ne (ré)enregistre que si la permission est déjà accordée
(`notificationPermission() === 'granted'`) ou si la plateforme n'en a pas la notion
(`'unavailable'`, l'Android, dont le distributeur possède l'enregistrement). Sinon, le navigateur
est laissé tranquille et la demande passe par une **ligne de Réglages → General → notifications**,
au doigt : `tray: allowed | blocked by the browser | not allowed yet`. Un navigateur qui a refusé
le dit, au lieu de rester muet. Témoin : `src/core/__tests__/notificationPermission.test.ts`.

Le service worker lit le corps sous `body` (le nom que le serveur publie), avec `message` en
repli : il n'affichait auparavant que le titre, quel que soit le contenu de la notification.

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
bannière). `MainApplication.kt` pré-crée au boot les canaux de la recette en `IMPORTANCE_HIGH` —
les réglages d'un canal sont figés à la première création, donc la bannière s'affiche et
l'utilisateur peut toujours l'ajuster dans Paramètres → Apps → my-claw-app → Notifications →
canal « Runs ». Si la lib a gagné la course et créé le canal en premier, la vérification le
détecte et l'app bascule sur un nom suffixé (`runs-<8 hex>-v2`), celui qu'elle annonce au serveur.

Le schéma `myclaw` est déclaré dans `AndroidManifest.xml` (intent-filter `VIEW` sur
`MainActivity`). `AppShell` résout `Linking.getInitialURL()` au démarrage (cas du démarrage à
froid : l'app était tuée et c'est le tap qui l'a lancée) et écoute l'événement `url` sinon.

Limite connue : le rendu natif relance l'activité avec `FLAG_ACTIVITY_CLEAR_TASK`, donc taper
une notification alors que l'app est déjà ouverte **recharge** l'écran.

## Effacement à l'ouverture

Un tap efface sa propre notification (`setAutoCancel` côté lib). Arriver sur la conversation
par un autre chemin ne l'effaçait pas : le tiroir gardait une notification qui annonçait un run
déjà lu à l'écran.

```
ouverture d'un thread (tiroir, deep link, /new …)
retour au premier plan sur le thread ouvert
        │
        ▼
dismissThreadNotification(threadId)
  └─ notificationIdFor("myclaw://thread/<id>")   même FNV-1a que le serveur
  └─ deviceBridge.cancelNotification(id)        NotificationManagerCompat.cancel
```

Le push arrive le plus souvent app tuée : personne ici n'a jamais vu la notification, donc son
id ne peut pas être mémorisé, il est **recalculé** à partir du deep link. `notificationIdFor`
est un contrat de fil avec `notificationIdFor` dans `src/notifications/push.ts` côté serveur :
les mêmes vecteurs sont assertés dans les deux dépôts, parce qu'une dérive ne casserait rien
de visible, elle arrêterait juste d'effacer quoi que ce soit. En arrière-plan rien n'est
effacé : la notification est légitime tant que personne ne la regarde.

Effet de bord côté serveur, voulu : l'id étant dérivé du lien, deux runs successifs sur la même
conversation ne s'empilent plus, le second remplace le premier.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `src/core/notifications.ts` | permissions, distributeur, enregistrement, parsing des deep links. Tout est no-op hors Android. |
| `src/core/notifications.web.ts` | le pendant navigateur : `pushSupported`, `notificationPermission`, subscription Web Push |
| `web/sw.js` | affichage et tap côté navigateur (l'app peut être fermée) |
| `src/app/GeneralSettingsScreen.tsx` | la ligne « notifications » : l'état de la permission et le geste qui la demande |
| `src/app/NotificationsScreen.tsx` | les deux sons (choix, écoute, retour au défaut) et les fichiers importés |
| `android/.../NotificationSounds.kt` | les choix, les noms dérivés (recette + choix), la vérification, la création/suppression des canaux |
| `android/.../DeviceBridgeModule.kt` | les méthodes `*NotificationSound*`, `getNotificationChannelState`, `playAlertSound(uri)`, `cancelNotification(id)` |
| `src/core/diagnostics.ts` | le rapport de diagnostic, l'état réel des canaux compris |
| `src/core/protocol.ts` | frames `notifications.info` / `register` / `state` / `channels` |
| `src/app/AppShell.tsx` | enregistrement à la réception de la clé, état premier-plan, ouverture sur tap, effacement à l'ouverture, envoi des noms de canaux à la connexion |
| `__tests__/Notifications.test.tsx` | le cycle complet, avec le distributeur et `Linking` mockés |
| `__tests__/NotificationSounds.test.tsx` | la page, les frames `notifications.channels` exactes, le ding du son choisi |
| `src/core/__tests__/diagnosticChannels.test.ts` | le champ `notificationChannels` de la frame `diag.report` |

## Plateformes

UnifiedPush est un standard **Android**. `pushSupported` est `false` sur les plateformes sans
transport et chaque entrée de `src/core/notifications.ts` devient un no-op plutôt que de prétendre
que la plateforme est couverte ; un futur build iOS demandera APNs. Le **web** est couvert par
`notifications.web.ts` : même payload chiffré VAPID, donc rien ne change côté serveur, mais la
permission du navigateur passe par un geste (section ci-dessus).

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
