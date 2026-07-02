/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { LogBox } from 'react-native';

LogBox.ignoreLogs([
  'This method is deprecated (as well as all React Native Firebase namespaced API)',
  'InteractionManager has been deprecated'
]);

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerComponent(appName, () => App);
