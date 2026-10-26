import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { seedDatabase } from './seed.js';

const DB_FILE = path.join(DATA_DIR, 'db.json');
let state = null;

function load() {
  try {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Basic shape guard — reseed if the file is corrupt or from an older shape.
    if (!Array.isArray(state.users) || !Array.isArray(state.conversations) || !Array.isArray(state.messages)) {
      throw new Error('Invalid database shape');
    }
  } catch {
    state = seedDatabase();
    saveDb();
  }
}

export function getDb() {
  if (!state) load();
  return state;
}

export function saveDb() {
  if (!state) return;
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function resetDb() {
  state = seedDatabase();
  saveDb();
  return state;
}

export function findUserById(id) {
  return getDb().users.find((user) => user.id === id) || null;
}

export function findUserByUsername(username) {
  const needle = String(username || '').trim().toLowerCase();
  return getDb().users.find((user) => user.username === needle) || null;
}

export function findConversation(id) {
  return getDb().conversations.find((conversation) => conversation.id === id) || null;
}

export function conversationFor(userId, conversationId) {
  const conversation = findConversation(conversationId);
  if (!conversation) return null;
  return conversation.participantIds.includes(userId) ? conversation : null;
}

export function isParticipant(conversation, userId) {
  return !!conversation && conversation.participantIds.includes(userId);
}

export function otherParticipantIds(conversation, userId) {
  return conversation.participantIds.filter((id) => id !== userId);
}

export function messagesFor(conversationId) {
  return getDb()
    .messages.filter((message) => message.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function lastMessageFor(conversationId) {
  const messages = messagesFor(conversationId);
  return messages.length ? messages[messages.length - 1] : null;
}
