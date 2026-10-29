/** In-memory presence registry (per-process, resets on restart). */
const socketsByUser = new Map(); // userId -> Set<socketId>
const activeSocketByUser = new Map(); // userId -> socketId of the focused tab

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
  if (activeSocketByUser.get(userId) === socketId) activeSocketByUser.delete(userId);
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

/** Remembers the tab the person is looking at, so calls ring only there. */
export function markActiveSocket(userId, socketId) {
  const set = socketsByUser.get(userId);
  if (!set?.has(socketId)) return;
  activeSocketByUser.set(userId, socketId);
}

/** The focused tab when known, otherwise the most recently connected one. */
export function activeSocketFor(userId) {
  const active = activeSocketByUser.get(userId);
  if (active && socketsByUser.get(userId)?.has(active)) return active;
  const sockets = socketIdsFor(userId);
  return sockets.length > 0 ? sockets[sockets.length - 1] : null;
}

export function presenceSnapshot() {
  return onlineUserIds();
}
