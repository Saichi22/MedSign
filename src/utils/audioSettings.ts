// utils/audioSettings.ts
// App-wide "ASL Audio Output" setting (Settings screen). Saved on the device, shared by every screen.
//  - useAslSoundEnabled(): [value, setValue] for React components
//  - importing this file also installs a gate on Speech.speak, so NOTHING reads translations aloud
//    while the setting is off (static translator, motion translator, lessons...).
import { useEffect, useState } from 'react';
import RNFS from 'react-native-fs';
import Speech from '@mhpdev/react-native-speech';

const FILE = `${RNFS.DocumentDirectoryPath}/app_settings.json`;

type Settings = { aslSound: boolean };
let state: Settings = { aslSound: true };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

// load the saved value once at startup
(async () => {
  try {
    if (await RNFS.exists(FILE)) {
      const saved = JSON.parse(await RNFS.readFile(FILE, 'utf8'));
      if (typeof saved?.aslSound === 'boolean') {
        state = { ...state, aslSound: saved.aslSound };
        if (!state.aslSound) Speech.stop().catch(() => {});
        emit();
      }
    }
  } catch (e) {
    console.warn('[audioSettings] could not load settings:', e);
  }
})();

export function getAslSoundEnabled(): boolean {
  return state.aslSound;
}

export async function setAslSoundEnabled(value: boolean): Promise<void> {
  state = { ...state, aslSound: value };
  if (!value) Speech.stop().catch(() => {}); // cut off anything being spoken right now
  emit();
  try {
    await RNFS.writeFile(FILE, JSON.stringify(state), 'utf8');
  } catch (e) {
    console.warn('[audioSettings] could not save settings:', e);
  }
}

export function useAslSoundEnabled(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(state.aslSound);
  useEffect(() => {
    const l = () => setValue(state.aslSound);
    listeners.add(l);
    l(); // pick up a value loaded after first render
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [value, (v: boolean) => { setAslSoundEnabled(v); }];
}

// ─── Gate: speaking does nothing while the setting is off ────────────────────
// Speech is a class with static methods, so patching it here applies to every screen that imports it.
try {
  const anySpeech = Speech as any;
  if (!anySpeech.__aslGateInstalled) {
    for (const name of ['speak', 'speakWithOptions']) {
      if (typeof anySpeech[name] !== 'function') continue;
      const original = anySpeech[name].bind(anySpeech);
      anySpeech[name] = (...args: any[]) => (state.aslSound ? original(...args) : Promise.resolve());
    }
    anySpeech.__aslGateInstalled = true;
  }
} catch (e) {
  console.warn('[audioSettings] could not install the speech gate:', e);
}
