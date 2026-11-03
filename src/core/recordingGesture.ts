import { useMemo, useRef } from 'react';
import { PanResponder, type ViewProps } from 'react-native';

export interface RecordingGesture {
  canStart: () => boolean;
  begin: () => void;
  move: (dx: number, dy: number) => void;
  release: () => void;
  terminate: () => void;
}

export function useRecordingGesture(callbacks: RecordingGesture): Partial<ViewProps> {
  const current = useRef(callbacks);
  current.current = callbacks;
  return useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => current.current.canStart(),
    onMoveShouldSetPanResponder: () => false,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => current.current.begin(),
    onPanResponderMove: (_event, { dx, dy }) => current.current.move(dx, dy),
    onPanResponderRelease: (_event, { dx, dy }) => {
      current.current.move(dx, dy);
      current.current.release();
    },
    onPanResponderTerminate: () => current.current.terminate(),
  }).panHandlers, []);
}
