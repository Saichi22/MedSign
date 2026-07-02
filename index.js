/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Suppress in terminal/console
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    /InteractionManager|setLayoutAnimationEnabledExperimental|This method is deprecated \(as well as all React Native Firebase namespaced API\)/i.test(args[0])
  ) {
    return;
  }
  originalWarn(...args);
};

// Suppress in-app LogBox overlay
LogBox.ignoreLogs([
  /This method is deprecated \(as well as all React Native Firebase namespaced API\)/i,
  /InteractionManager/i,
  /setLayoutAnimationEnabledExperimental/i,
]);

AppRegistry.registerComponent(appName, () => App);