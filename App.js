import React from 'react';
import { AuthProvider } from './src/features/auth/services/AuthContext';
import { ThemeProvider } from './src/styles/services/themeProvider';
import AppNavigator from './src/features/navigation/AppNavigator';
import { LogBox } from 'react-native';

LogBox.ignoreLogs([
  // This handles the Firebase Namespaced warning
  'This method is deprecated (as well as all React Native Firebase namespaced API)',
  // This handles the React Native 0.84 internal InteractionManager warning
  'InteractionManager has been deprecated',
]);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
