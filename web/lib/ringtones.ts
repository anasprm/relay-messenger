'use client';

/**
 * Lightweight ringtones synthesized with the Web Audio API, so no audio asset
 * has to be downloaded and the tone still works offline. One engine is shared
 * by one-to-one and group calls; starting a new tone always stops the old one.
 */

export type RingtoneKind = 'incoming' | 'outgoing';

const INCOMING_PERIOD_MS = 2600;
const OUTGOING_PERIOD_MS = 3000;

let context: AudioContext | null = null;
let currentKind: RingtoneKind | null = null;
let patternTimer: number | null = null;
let vibrationTimer: number | null = null;
const activeOscillators = new Set<OscillatorNode>();

type AudioContextConstructor = typeof AudioContext;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;

  const Constructor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Constructor) return null;

  try {
    context = new Constructor();
  } catch {
    context = null;
  }
  return context;
}

/** Call from a user gesture so the browser lets the ringtone play later. */
export function unlockRingtoneAudio(): void {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === 'suspended') {
    void audio.resume().catch(() => undefined);
  }
}

/** Unlocks audio on the first tap or key press, then removes itself. */
export function installRingtoneUnlock(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const unlock = () => {
    unlockRingtoneAudio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });

  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
}

function playTone(
  frequency: number,
  offset: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
): void {
  const audio = getContext();
  if (!audio || audio.state !== 'running') return;

  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;

  const start = audio.currentTime + offset;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);

  activeOscillators.add(oscillator);
  oscillator.onended = () => {
    activeOscillators.delete(oscillator);
    try {
      oscillator.disconnect();
      gain.disconnect();
    } catch {
      /* already disconnected */
    }
  };
}

/** Gentle two-note chime, twice, then silence — an original ring pattern. */
function incomingPattern(): void {
  playTone(880, 0, 0.24, 0.09, 'triangle');
  playTone(1174.66, 0.26, 0.24, 0.08, 'triangle');
  playTone(880, 1.0, 0.24, 0.09, 'triangle');
  playTone(1174.66, 1.26, 0.24, 0.08, 'triangle');
}

/** Soft ringback: one second of tone followed by two seconds of silence. */
function outgoingPattern(): void {
  playTone(425, 0, 0.85, 0.045, 'sine');
  playTone(480, 0, 0.85, 0.018, 'sine');
}

function startVibration(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

  const buzz = () => {
    try {
      navigator.vibrate([350, 180, 350]);
    } catch {
      /* vibration is best-effort */
    }
  };

  buzz();
  vibrationTimer = window.setInterval(buzz, INCOMING_PERIOD_MS);
}

function stopVibration(): void {
  if (vibrationTimer !== null) {
    window.clearInterval(vibrationTimer);
    vibrationTimer = null;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(0);
    } catch {
      /* ignore */
    }
  }
}

export function stopRingtone(): void {
  if (typeof window !== 'undefined' && patternTimer !== null) {
    window.clearInterval(patternTimer);
  }
  patternTimer = null;
  stopVibration();
  currentKind = null;

  for (const oscillator of activeOscillators) {
    try {
      oscillator.stop();
    } catch {
      /* already stopped */
    }
  }
  activeOscillators.clear();
}

function beginPattern(kind: RingtoneKind): void {
  if (kind === 'incoming') {
    incomingPattern();
    patternTimer = window.setInterval(incomingPattern, INCOMING_PERIOD_MS);
  } else {
    outgoingPattern();
    patternTimer = window.setInterval(outgoingPattern, OUTGOING_PERIOD_MS);
  }
}

export function startRingtone(kind: RingtoneKind): void {
  if (typeof window === 'undefined') return;
  if (currentKind === kind) return;

  stopRingtone();

  const audio = getContext();
  if (!audio) return;

  currentKind = kind;
  if (kind === 'incoming') startVibration();

  const begin = () => {
    if (currentKind !== kind) return;
    beginPattern(kind);
  };

  // A ringtone can arrive before the first tap (for example a call shortly
  // after reload). Browsers start the context suspended, so resume it and only
  // then play; vibration has already started for mobile.
  if (audio.state === 'suspended') {
    audio
      .resume()
      .then(begin)
      .catch(() => {
        if (currentKind === kind) stopRingtone();
      });
    return;
  }

  if (audio.state === 'running') begin();
}

/** Short two-note confirmation when a call connects. */
export function playConnectedTone(): void {
  if (typeof window === 'undefined') return;
  stopRingtone();

  const audio = getContext();
  if (!audio) return;

  const play = () => {
    playTone(660, 0, 0.12, 0.05, 'sine');
    playTone(880, 0.13, 0.16, 0.05, 'sine');
  };

  if (audio.state === 'suspended') {
    void audio
      .resume()
      .then(play)
      .catch(() => undefined);
    return;
  }

  if (audio.state === 'running') play();
}
