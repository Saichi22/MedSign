import React from 'react';
import { AuthProvider } from './src/features/auth/services/AuthContext';
import { ThemeProvider } from './src/styles/services/themeProvider';
import AppNavigator from './src/features/navigation/AppNavigator';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}