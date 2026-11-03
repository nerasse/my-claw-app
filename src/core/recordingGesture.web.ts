/// <reference lib="dom" />
import { useRef } from 'react';
import type { RecordingGesture } from './recordingGesture';
import { recordingGestureProps } from './webProps.web';

interface Pointer {
  pointerId: number;
  clientX: number;
  clientY: number;
  button: number;
  isPrimary: boolean;
  currentTarget: Pick<HTMLElement, 'setPointerCapture' | 'releasePointerCapture' | 'hasPointerCapture'>;
  preventDefault: () => void;
}

export function useRecordingGesture(callbacks: RecordingGesture) {
  const held = useRef<{ id: number; x: number; y: number } | null>(null);
  const keyboard = useRef(false);

  function move(event: Pointer) {
    const pointer = held.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    event.preventDefault();
    callbacks.move(event.clientX - pointer.x, event.clientY - pointer.y);
  }

  function terminate() {
    if (!held.current && !keyboard.current) return;
    held.current = null;
    keyboard.current = false;
    callbacks.terminate();
  }

  return {
    ...recordingGestureProps(),
    // Pointer capture keeps receiving moves outside the button, even beyond the composer.
    onPointerDown: (event: Pointer) => {
      if (event.button !== 0 || !event.isPrimary || held.current || !callbacks.canStart()) return;
      event.preventDefault();
      held.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      callbacks.begin();
    },
    onPointerMove: move,
    onPointerUp: (event: Pointer) => {
      if (held.current?.id !== event.pointerId) return;
      move(event);
      held.current = null;
      callbacks.release();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: (event: Pointer) => { if (held.current?.id === event.pointerId) terminate(); },
    onLostPointerCapture: (event: Pointer) => { if (held.current?.id === event.pointerId) terminate(); },
    onKeyDown: (event: { key: string; repeat: boolean; preventDefault: () => void }) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (event.repeat || keyboard.current || !callbacks.canStart()) return;
      keyboard.current = true;
      callbacks.begin();
    },
    onKeyUp: (event: { key: string; preventDefault: () => void }) => {
      if (!keyboard.current || (event.key !== ' ' && event.key !== 'Enter')) return;
      event.preventDefault();
      keyboard.current = false;
      callbacks.release();
    },
    onBlur: terminate,
  };
}
