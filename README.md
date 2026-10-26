# Relay

Relay is a realtime direct-messaging workspace with a minimal, enterprise-focused interface. It ships as a small monorepo: a Next.js App Router frontend and an Express + Socket.io backend that persists to **Cloud Firestore**, with Firebase Storage for uploaded media and a local fallback when no bucket is configured.

Messages, reactions, presence, typing indicators, uploads, and WebRTC call signalling are realtime. Privacy controls — **anonymity** and **vanish mode** — are enforced on the server.

---

## Quick start

Requirements: **Node.js 20.11+** and npm.

```bash
npm install
npm run dev
```

- Web app: http://localhost:3000
- API + Socket.io: http://localhost:4000
- Health check: http://localhost:4000/api/health

The first API boot hydrates an in-memory cache from Firestore and seeds the database with demo users, conversations, messages, and sample media when the `users` collection is empty. If Firebase credentials are absent, it falls back to the local JSON snapshot at `server/data/db.json`. No Firebase SDK is needed in the browser.

### Demo accounts

| Username | Password | Display name | Role |
|---|---|---|---|
| `demo` | `demo123` | Avery Quinn | Product lead |
| `alice` | `alice123` | Alice Morgan | Client partner |
| `bob` | `bob123` | Bob Chen | Platform engineering |
| `carol` | `carol123` | Carol Diaz | Security & privacy |
| `dev` | `dev123` | Dev Patel | Design |

The sign-in screen can autofill any of the first three accounts. To test realtime delivery, open a second browser profile and sign in as another user.

### Production build

```bash
npm run build
npm start
```

`npm start` runs the API on `:4000` and the production Next.js server on `:3000`.

### Useful scripts

| Command | Description |
|---|---|
| `npm run dev` | API and web app together, with file watching |
| `npm run dev:server` | API only (`server/`, port 4000) |
| `npm run dev:web` | Next.js dev server only (port 3000) |
| `npm run build` | Production build of the web app |
| `npm start` | Both production servers |
| `npm run start:server` | Production API only |
| `npm run start:web` | Production web server only |

---

## Features

### Messaging
- Direct threads addressed by exact username, with directory search and instant thread creation.
- Text messages with optimistic-feeling delivery and realtime fan-out to both participants.
- Emoji reactions on hover, plus double-click / tap to like. Reaction state is per-user and persisted.
- Read state and unread counts per conversation.
- Live presence and typing indicators over Socket.io.
- Date separators, grouped bubbles, message skeletons, and empty states.
- Light and dark themes, persisted in `localStorage`.

### Media
- **Voice notes** recorded in-browser with `MediaRecorder` and a live waveform.
- **Video notes** recorded from the camera with a preview and duration.
- **File and image attachments** with upload progress, inline image previews, download links, size metadata, and a lightbox for images.
- 30 MB upload limit. Files go to Firebase Storage when `FIREBASE_STORAGE_BUCKET` is configured, and otherwise fall back to `server/uploads`.

### Privacy controls
- **Anonymity mode** (per user, per thread): the sender's identity is replaced **server-side** before the message is sent to the other participant. The receiver sees `Anonymous Operator`, a null sender ID, and no profile link. The sender still sees their own message normally.
- **Vanish mode** (per user, per thread): messages sent while enabled are flagged `ephemeral`. They are purged from the UI and the database when:
  - the sender switches threads,
  - the sender navigates back to the conversation list (mobile),
  - the page is hidden or unloaded,
  - the app boots again.

  Ordinary messages in the same thread are never touched. Purges are broadcast to both participants in realtime.

### Calls
- Native WebRTC audio and video calls using `RTCPeerConnection` (no third-party calling SDK).
- Offer/answer and trickle ICE are relayed through Socket.io; media flows peer-to-peer over DTLS-SRTP.
- Incoming call overlay, accept/decline, mute, camera toggle, call duration, and cleanup on hang-up.
- Public STUN servers are configured for NAT traversal. There is no TURN server in the demo setup, so some restrictive networks may not connect.

### Account and session
- Username + password registration and login. Passwords are hashed with `bcryptjs`.
- Stateless HMAC-signed session tokens (7-day TTL), stored in `localStorage` as `relay.token`.
- No email verification, OAuth, or cookie sessions.

---

## Configuration

Copy the examples if you need to override defaults:

```bash
cp server/.env.example server/.env
cp web/.env.example web/.env.local
```

### Server (`server/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API and Socket.io port |
| `PUBLIC_URL` | `http://localhost:4000` | Base URL used for uploaded media links |
| `CLIENT_ORIGIN` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated CORS origins |
| `SESSION_SECRET` | generated in `server/data/.secret` | HMAC signing secret; set for stable sessions across data resets |
| `FIREBASE_SERVICE_ACCOUNT` | `server/data/firebase-service-account.json` | Path to a service-account JSON file, or the JSON itself on one line |
| `FIREBASE_PROJECT_ID` | from the service account | Firebase project ID |
| `FIREBASE_FIRESTORE_DATABASE` | `default` | Firestore database ID |
| `FIREBASE_STORAGE_BUCKET` | unset | Storage bucket name; uploads use local disk while unset |

### Web (`web/.env.local`)

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API base URL used by REST and Socket.io clients |

---

## Firebase

Relay is connected to the Firebase project **`relay-messenger-anasprm`** (Firestore database `default`, region `asia-south1`).

- The Express API talks to Firebase only through the **Admin SDK**. No Firebase credentials or client SDK are shipped to the browser.
- `users`, `conversations`, and `messages` live in Firestore. The API keeps an in-memory cache for synchronous serializers and Socket.io fan-out, and writes every mutation back to Firestore.
- `firestore.rules` and `storage.rules` deny all direct client access. The Admin SDK bypasses rules, so the API remains the only data path.
- On boot, an empty `users` collection is seeded from `server/src/seed.js`. If credentials are missing or Firestore is unreachable, the API logs a warning and keeps working from `server/data/db.json`.

### Setup

1. Create or download a service-account key from **Firebase Console → Project settings → Service accounts** and save it to `server/data/firebase-service-account.json`. Alternatively set `FIREBASE_SERVICE_ACCOUNT` to its path (or to the JSON itself).
2. Grant the service account `roles/datastore.user` for Firestore and `roles/storage.objectAdmin` for Storage.
3. Start the API and check `/api/health` — it reports `database.backend` and `firebase.storage`.
4. Deploy security rules with `npx firebase-tools deploy --only firestore:rules`.

### Storage caveat

New Cloud Storage buckets require the **Blaze** billing plan. Until billing is enabled, leave `FIREBASE_STORAGE_BUCKET` unset: uploads are written to `server/uploads` and served by the API. The client upload and message flow is identical either way; once a bucket exists, set `FIREBASE_STORAGE_BUCKET=relay-messenger-anasprm.firebasestorage.app` and restart the API.

---

## Project layout

```text
.
├── package.json              # npm workspaces + combined scripts
├── firebase.json             # Firestore + Storage rules configuration
├── .firebaserc               # default Firebase project
├── firestore.rules           # deny all direct client access
├── storage.rules             # deny all direct client access
├── server/
│   ├── src/
│   │   ├── index.js          # Express app, static uploads, HTTP + Socket.io server
│   │   ├── auth.js           # bcrypt hashing and HMAC session tokens
│   │   ├── firebase.js       # Firebase Admin init, Firestore handle, Storage probe
│   │   ├── db.js             # Firestore persistence + in-memory cache + JSON fallback
│   │   ├── storage.js        # Firebase Storage upload with local-disk fallback
│   │   ├── seed.js           # demo users, conversations, messages, generated media
│   │   ├── realtime.js       # presence, typing, messages, calls, purge broadcasts
│   │   ├── serializers.js    # user-safe shapes, anonymous sender masking
│   │   └── routes/           # auth, users, conversations, messages, uploads
│   ├── data/                 # service account, db.json fallback, generated .secret
│   └── uploads/              # fallback uploads and generated seed media
└── web/
    ├── app/                  # App Router pages: /, /login, /register, /chat
    ├── components/
    │   ├── auth/             # sign-in / registration experience
    │   ├── chat/             # sidebar, thread, composer, bubbles, recorders, calls
    │   └── ui/               # avatars, modal, theme toggle, splash, logo
    └── lib/                  # API client, auth, sockets, WebRTC, theme, toasts
```

---

## How it works

### Data model
Firestore holds three top-level collections: `users`, `conversations`, and `messages`. Each conversation document stores participant IDs, per-user modes, and read timestamps. Each message document stores its kind (`text`, `audio`, `video`, `image`, `file`), optional attachment metadata, reaction map, and flags.

The API loads the collections into memory at boot, then writes each mutation to the matching document. `server/data/db.json` is kept as a mirror for local development and as an automatic fallback if Firebase is not configured. Deleting the `users` collection (and restarting the API) reseeds demo data. Uploaded files are not removed automatically when the database is reset.

### Realtime events
Socket.io authenticates with the same bearer token. Key events:

- `message:new`, `message:update`, `messages:purged`
- `typing`, `typing:update`
- `presence:snapshot`, `presence:update`
- `conversation:modes`, `conversation:refresh`
- `call:invite`, `call:accept`, `call:decline`, `call:end`
- `webrtc:offer`, `webrtc:answer`, `webrtc:ice`

Both participants join per-user rooms; conversation access is checked before broadcasts and API reads.

### REST endpoints
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account and return a session |
| `POST` | `/api/auth/login` | Sign in and return a session |
| `GET` | `/api/users/search?q=` | Search the directory by username / display name |
| `GET` | `/api/conversations` | List threads with last message and unread counts |
| `POST` | `/api/conversations` | Start or reuse a direct thread by exact username |
| `GET` | `/api/conversations/:id/messages` | Load a thread and mark it read |
| `POST` | `/api/conversations/:id/messages` | Send a message (applies anonymity / vanish flags) |
| `PATCH` | `/api/conversations/:id/modes` | Toggle anonymity or vanish for the current user |
| `POST` | `/api/conversations/:id/read` | Mark the thread read |
| `POST` | `/api/conversations/:id/purge` | Delete the current user's vanish messages in a thread |
| `POST` | `/api/conversations/purge-ephemeral` | Delete all vanish messages owned by the caller |
| `POST` | `/api/messages/:id/reactions` | Toggle a reaction |
| `POST` | `/api/uploads` | Multipart upload (max 30 MB) |
| `GET` | `/api/health` | Liveness and row counts |

---

## Notes and limitations

- Relay uses Firestore for persistence but keeps a single-process in-memory cache; it is not yet designed for multiple API instances without a shared pub/sub layer.
- Sessions are stateless; signing out clears the client token but does not maintain a server-side revocation list.
- WebRTC uses public STUN only. Add a TURN service for reliable calls across restrictive NATs or corporate networks.
- Usernames are unique and matched case-insensitively. Anonymity masking happens on serialization, so raw sender IDs are not exposed to the other participant.
- Vanish mode is cooperative: it removes data from Firestore and broadcasts the removal, but it cannot control screenshots or copies made by a recipient.
