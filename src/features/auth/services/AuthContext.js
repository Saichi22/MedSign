import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from '@react-native-firebase/auth';
import { getApp } from '@react-native-firebase/app';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(undefined);

  const auth = getAuth(getApp());

  useEffect(() => {
    GoogleSignin.configure({
      webClientId:
        '591167185308-1sb2lkdat2n1sspbpum752s82dan9uar.apps.googleusercontent.com',
    });

    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser);
    });

    return unsubscribe;
  }, [auth]);

  const logout = async () => {
    try {
      await GoogleSignin.signOut();
      await signOut(auth);
    } catch (e) {
      console.error('Logout Error:', e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, auth, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
