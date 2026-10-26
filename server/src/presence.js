/** In-memory presence registry (per-process, resets on restart). */
const socketsByUser = new Map(); // userId -> Set<socketId>

export function addSocket(userId, socketId) {
  let set = socketsByUser.get(userId);
  if (!set) {
    set = new Set();
    socketsByUser.set(userId, set);
  }
  set.add(socketId);
  return set.size === 1;
}

export function removeSocket(userId, socketId) {
  const set = socketsByUser.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    socketsByUser.delete(userId);
    return true;
  }
  return false;
}

export function isOnline(userId) {
  return socketsByUser.has(userId);
}

export function onlineUserIds() {
  return [...socketsByUser.keys()];
}

export function socketIdsFor(userId) {
  return [...(socketsByUser.get(userId) || [])];
}

export function presenceSnapshot() {
  return onlineUserIds();
}
