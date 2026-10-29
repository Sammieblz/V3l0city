import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as repository from '../database/tripRepository';
import { createPersonalRecordingController, type RecordingEffects, type RecordingStore } from './controller';

export function usePersonalRecording(effects: RecordingEffects = {}, store: RecordingStore = repository) {
  const effectsRef = useRef(effects);
  effectsRef.current = effects;
  const controllerRef = useRef<ReturnType<typeof createPersonalRecordingController> | null>(null);
  if (!controllerRef.current) controllerRef.current = createPersonalRecordingController({
    store, now: Date.now, newId: () => Crypto.randomUUID(), effects: {
      started: (trip) => effectsRef.current.started?.(trip),
      sample: (sample) => effectsRef.current.sample?.(sample),
      completed: (trip) => effectsRef.current.completed?.(trip),
      failed: (error) => effectsRef.current.failed?.(error),
    },
  });
  const controller = controllerRef.current;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { void controller.hydrate(); }, [controller]);
  useEffect(() => {
    let previous = AppState.currentState;
    if (previous === 'background' || previous === 'inactive') controller.background();
    const subscription = AppState.addEventListener('change', (next) => {
      if (previous === 'active' && next !== 'active') controller.background();
      else if (previous !== 'active' && next === 'active') controller.foreground();
      previous = next;
    });
    return () => subscription.remove();
  }, [controller]);
  return { ...snapshot, controller,
    active: snapshot.session != null && snapshot.session.state !== 'completed',
    accumulating: snapshot.session?.state === 'recording' && !snapshot.error && !snapshot.busy,
  };
}
