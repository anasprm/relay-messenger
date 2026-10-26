import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';

export function createSocket(token: string): Socket {
  return io(API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}
