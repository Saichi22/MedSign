// hooks/useProfilePhoto.js
// Profile picture stored ON THE DEVICE (app documents folder), one file per user.
// - choosePhoto(): asks Take photo / Choose from gallery / Remove, then saves the result.
// - uri: file:// path of the current photo, or null (show the default icon).
// All screens using this hook update together (Settings + Home avatar).
//
// Needs:  npm i react-native-image-picker   (react-native-fs is already in the app)
// Android: add to AndroidManifest.xml (camera permission is already there for VisionCamera):
//   <queries><intent><action android:name="android.media.action.IMAGE_CAPTURE" /></intent></queries>
import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import RNFS from 'react-native-fs';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

const DIR = RNFS.DocumentDirectoryPath;
const safeKey = uid => String(uid || 'guest').replace(/[^A-Za-z0-9_-]/g, '_');
const prefix = key => `profile-${key}-`;

const cache = {};          // key -> 'file://...' | null
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

async function listMine(key) {
  const items = await RNFS.readDir(DIR);
  return items
    .filter(i => i.isFile() && i.name.startsWith(prefix(key)))
    .sort((a, b) => b.name.localeCompare(a.name)); // newest first (timestamp in the name)
}

async function loadPhoto(key) {
  try {
    const mine = await listMine(key);
    cache[key] = mine.length ? `file://${mine[0].path}` : null;
  } catch (e) {
    cache[key] = null;
  }
  notify();
}

async function savePhoto(key, srcUri) {
  // New file name each time so the <Image> never shows a stale cached picture.
  const dest = `${DIR}/${prefix(key)}${Date.now()}.jpg`;
  await RNFS.copyFile(srcUri.replace(/^file:\/\//, ''), dest);
  try {
    const mine = await listMine(key);
    await Promise.all(mine.filter(i => i.path !== dest).map(i => RNFS.unlink(i.path)));
  } catch (e) {
    // old files are only clutter; ignore
  }
  cache[key] = `file://${dest}`;
  notify();
}

async function removePhotoFiles(key) {
  try {
    const mine = await listMine(key);
    await Promise.all(mine.map(i => RNFS.unlink(i.path)));
  } catch (e) {
    // ignore
  }
  cache[key] = null;
  notify();
}

const PICK_OPTIONS = {
  mediaType: 'photo',
  selectionLimit: 1,
  maxWidth: 512,   // avatars don't need full-size photos
  maxHeight: 512,
  quality: 0.8,
  saveToPhotos: false,
};

export default function useProfilePhoto(uid) {
  const key = safeKey(uid);
  const [uri, setUri] = useState(cache[key] ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => setUri(cache[key] ?? null);
    listeners.add(sync);
    if (cache[key] === undefined) loadPhoto(key);
    else sync();
    return () => {
      listeners.delete(sync);
    };
  }, [key]);

  const pick = useCallback(
    async launcher => {
      try {
        const res = await launcher(PICK_OPTIONS);
        if (res.didCancel) return;
        if (res.errorCode) {
          Alert.alert(
            'Photo unavailable',
            res.errorCode === 'permission'
              ? 'Please allow camera / photo access in your phone settings.'
              : res.errorMessage || 'Could not get the photo.',
          );
          return;
        }
        const asset = res.assets && res.assets[0];
        if (!asset?.uri) return;
        setBusy(true);
        await savePhoto(key, asset.uri);
      } catch (e) {
        console.warn('[useProfilePhoto] failed', e);
        Alert.alert('Photo unavailable', 'Something went wrong saving your photo. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [key],
  );

  const choosePhoto = useCallback(() => {
    const buttons = [
      { text: 'Take Photo', onPress: () => pick(launchCamera) },
      { text: 'Choose from Gallery', onPress: () => pick(launchImageLibrary) },
    ];
    if (cache[key]) {
      buttons.push({ text: 'Remove Photo', style: 'destructive', onPress: () => removePhotoFiles(key) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile Photo', undefined, buttons);
  }, [key, pick]);

  return { uri, busy, choosePhoto };
}