import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SEED_UPLOAD_DIR } from './config.js';
import { hashPassword } from './auth.js';

const id = () => crypto.randomUUID();

/** ---------- seed media ---------- */

const WIREFRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#141c33"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#818cf8"/>
    </linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="#ffffff" stroke-opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="1200" height="800" fill="url(#bg)"/>
  <rect width="1200" height="800" fill="url(#grid)"/>
  <text x="72" y="104" fill="#a5b4fc" font-family="Segoe UI, Arial, sans-serif" font-size="18" letter-spacing="6">RELAY · PRODUCT</text>
  <text x="72" y="166" fill="#f8fafc" font-family="Segoe UI, Arial, sans-serif" font-size="44" font-weight="600">Workspace wireframes — v2</text>
  <text x="72" y="204" fill="#94a3b8" font-family="Segoe UI, Arial, sans-serif" font-size="19">Conversation architecture, thread header and composer states</text>
  <rect x="72" y="264" width="300" height="452" rx="18" fill="#111a2e" stroke="#2a3552"/>
  <rect x="404" y="264" width="724" height="452" rx="18" fill="#111a2e" stroke="#2a3552"/>
  <rect x="96" y="292" width="156" height="14" rx="7" fill="#334155"/>
  <rect x="96" y="328" width="252" height="44" rx="12" fill="#16203a" stroke="#2a3552"/>
  <rect x="96" y="400" width="252" height="64" rx="12" fill="#1b2647" stroke="#3b4a75"/>
  <rect x="112" y="416" width="36" height="36" rx="18" fill="url(#accent)"/>
  <rect x="160" y="420" width="120" height="10" rx="5" fill="#c7d2fe"/>
  <rect x="160" y="438" width="170" height="8" rx="4" fill="#64748b"/>
  <rect x="96" y="480" width="252" height="64" rx="12" fill="#16203a" stroke="#2a3552"/>
  <rect x="112" y="496" width="36" height="36" rx="18" fill="#334155"/>
  <rect x="160" y="500" width="96" height="10" rx="5" fill="#94a3b8"/>
  <rect x="160" y="518" width="150" height="8" rx="4" fill="#475569"/>
  <rect x="96" y="560" width="252" height="64" rx="12" fill="#16203a" stroke="#2a3552"/>
  <rect x="112" y="576" width="36" height="36" rx="18" fill="#334155"/>
  <rect x="160" y="580" width="112" height="10" rx="5" fill="#94a3b8"/>
  <rect x="160" y="598" width="132" height="8" rx="4" fill="#475569"/>
  <rect x="428" y="292" width="300" height="18" rx="9" fill="#334155"/>
  <rect x="428" y="318" width="180" height="10" rx="5" fill="#475569"/>
  <rect x="428" y="368" width="392" height="56" rx="14" fill="#16203a" stroke="#2a3552"/>
  <rect x="444" y="384" width="360" height="8" rx="4" fill="#64748b"/>
  <rect x="444" y="400" width="260" height="8" rx="4" fill="#475569"/>
  <rect x="648" y="444" width="456" height="64" rx="16" fill="url(#accent)" fill-opacity="0.92"/>
  <rect x="664" y="460" width="330" height="9" rx="4" fill="#eef2ff"/>
  <rect x="664" y="478" width="240" height="9" rx="4" fill="#e0e7ff" fill-opacity="0.8"/>
  <rect x="428" y="532" width="368" height="56" rx="14" fill="#16203a" stroke="#2a3552"/>
  <rect x="444" y="548" width="336" height="8" rx="4" fill="#64748b"/>
  <rect x="444" y="564" width="200" height="8" rx="4" fill="#475569"/>
  <rect x="428" y="624" width="676" height="64" rx="16" fill="#16203a" stroke="#334155"/>
  <circle cx="462" cy="656" r="16" fill="#334155"/>
  <rect x="492" y="650" width="420" height="10" rx="5" fill="#334155"/>
  <rect x="1040" y="642" width="44" height="28" rx="14" fill="url(#accent)"/>
  <text x="72" y="762" fill="#64748b" font-family="Segoe UI, Arial, sans-serif" font-size="15">Confidential · Product design · 2026</text>
</svg>`;

const PLAN_TXT = `RELAY — Q4 COMMUNICATIONS PLAN
================================

1. Objectives
   - Consolidate internal messaging onto Relay by end of quarter.
   - Reduce response latency for priority channels to under 5 minutes.
   - Ship end-to-end privacy controls (anonymity + vanish mode) to all workspaces.

2. Milestones
   - Week 2  : Migration tooling for legacy exports
   - Week 5  : Directory sync + presence hardening
   - Week 8  : Privacy review with security team
   - Week 11 : Company-wide rollout

3. Owners
   - Program lead      : Alice Morgan
   - Platform          : Bob Chen
   - Security & privacy: Carol Diaz
   - Design            : Dev Patel

4. Success metrics
   - 90% weekly active usage across invited teams
   - Median message delivery < 150 ms
   - Zero unresolved P1 privacy findings at rollout

Confidential — internal distribution only.
`;

function writeIfMissing(file, data) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, data);
  return fs.statSync(file).size;
}

/** Generate a small 16-bit mono WAV so the seeded voice note actually plays. */
function makeVoiceWav(seconds = 4, sampleRate = 16000) {
  const total = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    const phrase = Math.sin(Math.PI * Math.min(1, (t % 1.15) / 1.15));
    const tone =
      Math.sin(2 * Math.PI * 196 * t) * 0.5 +
      Math.sin(2 * Math.PI * 246.9 * t) * 0.3 +
      Math.sin(2 * Math.PI * 293.7 * t) * 0.2;
    const noise = (Math.random() * 2 - 1) * 0.02;
    const sample = Math.max(-1, Math.min(1, (tone * 0.28 + noise) * phrase * 0.8));
    data.writeInt16LE(Math.round(sample * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

function ensureSeedAssets() {
  fs.mkdirSync(SEED_UPLOAD_DIR, { recursive: true });
  const wavPath = path.join(SEED_UPLOAD_DIR, 'voice-note.wav');

  const wireframes = writeIfMissing(path.join(SEED_UPLOAD_DIR, 'wireframes-v2.svg'), WIREFRAME_SVG);
  const plan = writeIfMissing(path.join(SEED_UPLOAD_DIR, 'q4-communications-plan.txt'), PLAN_TXT);
  let voice = 0;
  if (!fs.existsSync(wavPath)) fs.writeFileSync(wavPath, makeVoiceWav());
  voice = fs.statSync(wavPath).size;

  return {
    image: {
      url: '/uploads/seed/wireframes-v2.svg',
      name: 'wireframes-v2.svg',
      mime: 'image/svg+xml',
      size: wireframes,
      kind: 'image',
      width: 1200,
      height: 800,
    },
    file: {
      url: '/uploads/seed/q4-communications-plan.txt',
      name: 'Q4-communications-plan.txt',
      mime: 'text/plain',
      size: plan,
      kind: 'file',
    },
    audio: {
      url: '/uploads/seed/voice-note.wav',
      name: 'voice-note.wav',
      mime: 'audio/wav',
      size: voice,
      kind: 'audio',
      duration: 4,
    },
  };
}

/** ---------- seed data ---------- */

export function seedDatabase() {
  const assets = ensureSeedAssets();
  const now = Date.now();
  const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();

  const makeUser = (username, displayName, password, accent, lastSeenMinutes) => ({
    id: id(),
    username,
    displayName,
    accent,
    passwordHash: hashPassword(password),
    scope: 'public',
    createdAt: ago(60 * 24 * 90),
    lastSeen: ago(lastSeenMinutes),
  });

  const demo = makeUser('demo', 'Avery Quinn', 'demo123', 'violet', 0);
  const alice = makeUser('alice', 'Alice Morgan', 'alice123', 'indigo', 4);
  const bob = makeUser('bob', 'Bob Chen', 'bob123', 'emerald', 11);
  const carol = makeUser('carol', 'Carol Diaz', 'carol123', 'amber', 60 * 26);
  const dev = makeUser('dev', 'Dev Patel', 'dev123', 'cyan', 60 * 5);

  const users = [demo, alice, bob, carol, dev];

  const modes = (a, b) => ({
    [a.id]: { anonymity: false, vanish: false },
    [b.id]: { anonymity: false, vanish: false },
  });

  const makeConversation = (a, b, createdAt, updatedAt, reads) => {
    const conversation = {
      id: id(),
      participantIds: [a.id, b.id],
      scope: 'public',
      createdAt,
      updatedAt,
      modes: modes(a, b),
      reads: {},
    };
    for (const [userId, minutes] of Object.entries(reads)) conversation.reads[userId] = ago(minutes);
    return conversation;
  };

  const cAlice = makeConversation(alice, demo, ago(60 * 30), ago(28), { [demo.id]: 25, [alice.id]: 25 });
  const cBob = makeConversation(bob, demo, ago(60 * 20), ago(12), { [demo.id]: 120, [bob.id]: 10 });
  const cCarol = makeConversation(carol, demo, ago(60 * 48), ago(1470), { [demo.id]: 1460, [carol.id]: 1460 });
  const cDev = makeConversation(dev, demo, ago(60 * 12), ago(60 * 24 * 2), { [demo.id]: 60 * 24 * 2, [dev.id]: 60 * 24 * 2 });

  const message = (conversation, sender, minutes, kind, text, extra = {}) => ({
    id: id(),
    conversationId: conversation.id,
    senderId: sender.id,
    kind,
    text: text || '',
    attachment: extra.attachment || null,
    anonymous: false,
    ephemeral: false,
    reactions: extra.reactions || {},
    createdAt: ago(minutes),
  });

  const aliceImage = message(
    cAlice,
    alice,
    55,
    'image',
    'Perfect. Here are the wireframes we discussed — v2 with the new sidebar.',
    { attachment: assets.image },
  );

  const messages = [
    message(cAlice, alice, 200, 'text', 'Morning — the client moved our review to 2 PM.'),
    message(cAlice, demo, 190, 'text', "Thanks for the heads up. I'll have the updated deck ready by noon.", {
      reactions: { [alice.id]: '👍' },
    }),
    aliceImage,
    message(cAlice, demo, 50, 'text', 'This is much cleaner. The conversation list finally has room to breathe.', {
      reactions: { [alice.id]: '❤️' },
    }),
    message(cAlice, alice, 40, 'file', 'And the Q4 communications plan for reference.', { attachment: assets.file }),
    message(cAlice, demo, 31, 'text', 'Got it. Reviewing now — will flag anything before the review.'),
    message(cAlice, alice, 28, 'text', 'Appreciated. See you at 2.'),

    message(cBob, bob, 185, 'audio', '', { attachment: assets.audio }),
    message(cBob, demo, 180, 'text', "Listened — sounds good. Let's ship it."),
    message(cBob, bob, 12, 'text', "Deploying the staging build now. I'll ping you when the health checks pass."),

    message(cCarol, carol, 1500, 'text', 'Are we still on for the security review tomorrow?'),
    message(cCarol, demo, 1490, 'text', "Yes — 10 AM works. I'll bring the threat model."),
    message(cCarol, carol, 1480, 'text', "Great. I'll bring the privacy checklist."),
  ];

  messages.find((m) => m.id === aliceImage.id).reactions = { [demo.id]: '❤️' };

  return {
    version: 1,
    seededAt: new Date(now).toISOString(),
    users,
    conversations: [cAlice, cBob, cCarol, cDev],
    messages,
  };
}

export { ensureSeedAssets };
