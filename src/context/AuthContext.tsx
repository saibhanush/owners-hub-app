import React, { createContext, useContext, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  sendPasswordResetEmail,
  deleteUser,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { auth, db } from '@/integrations/firebase/client';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { authAPI } from '@/services/api';

interface UserProfile {
  fullName: string;
  email: string;
  phoneNumber?: string;
  phoneVerified?: boolean;
  createdAt: string;
  role?: 'owner' | 'resident' | 'guest';
  referralCode?: string;
}

interface AuthContextType {
  user: User | null;
  isGuest: boolean;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role?: 'owner' | 'resident',
    referralCode?: string,
    phoneNumber?: string
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<UserProfile | null>;
  signInAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  userProfile: UserProfile | null;
  // OTP functions
  sendOTP: (phoneNumber: string) => Promise<ConfirmationResult>;
  verifyOTP: (confirmationResult: ConfirmationResult, otp: string) => Promise<void>;
  linkPhoneNumber: (phoneNumber: string) => Promise<ConfirmationResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const isGuest = user?.isAnonymous || false;

  // Auth state listener
  useEffect(() => {
    let mounted = true;
    try {
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (!mounted) return;
        setUser(currentUser);

        if (currentUser && !currentUser.isAnonymous) {
          // fetch profile
          try {
            const profileDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (profileDoc.exists()) {
              setUserProfile(profileDoc.data() as UserProfile);
            } else {
              setUserProfile(null);
            }
          } catch (e) {
            console.error('Failed to fetch user profile', e);
            setUserProfile(null);
          }
        } else {
          setUserProfile(null);
        }

        setLoading(false);
      });

      return () => {
        mounted = false;
        unsubscribe();
      };
    } catch (error) {
      console.error('Auth error:', error);
      setAuthError('Authentication failed to initialize');
      setLoading(false);
    }
  }, []);

  // Ensure a hidden recaptcha container exists & cleanup recaptcha verifier on unmount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (!document.getElementById('recaptcha-container')) {
        const container = document.createElement('div');
        container.id = 'recaptcha-container';
        container.style.display = 'none';
        document.body.appendChild(container);
      }
    }

    return () => {
      if (recaptchaVerifier) {
        try {
          (recaptchaVerifier as any).clear?.();
        } catch {
          // ignore
        }
      }
    };
    // we intentionally do not include recaptchaVerifier in deps to avoid clearing/recreating frequently
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: 'owner' | 'resident' = 'resident',
    referralCode?: string,
    phoneNumber?: string
  ) => {
    const { user: createdUser } = await createUserWithEmailAndPassword(auth, email, password);

    const profile: UserProfile = {
      fullName,
      email,
      role,
      createdAt: new Date().toISOString(),
      ...(referralCode && { referralCode }),
      ...(phoneNumber && { phoneNumber, phoneVerified: false }),
    };

    await setDoc(doc(db, 'users', createdUser.uid), profile);
    setUserProfile(profile);
  };

  const signIn = async (email: string, password: string): Promise<UserProfile | null> => {
    const { user: signedInUser } = await signInWithEmailAndPassword(auth, email, password);

    const profileDoc = await getDoc(doc(db, 'users', signedInUser.uid));
    if (profileDoc.exists()) {
      const profile = profileDoc.data() as UserProfile;
      setUserProfile(profile);
      return profile;
    }
    setUserProfile(null);
    return null;
  };

  const signInAsGuest = async () => {
    await signInAnonymously(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    await signOut(auth);
    setUserProfile(null);
  };

  const deleteUserCollection = async (collectionName: string, userId: string) => {
    try {
      const q = query(collection(db, collectionName), where('user_id', '==', userId));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
      await Promise.all(deletePromises);
    } catch (e) {
      console.warn(`Failed to delete ${collectionName} data:`, e);
    }
  };

  const deleteAccount = async () => {
    if (!user) {
      throw new Error('No user logged in');
    }

    try {
      if (!user.isAnonymous) {
        // Delete user profile
        await deleteDoc(doc(db, 'users', user.uid));

        // Delete user's subscriptions and chat conversations
        await deleteUserCollection('subscriptions', user.uid);
        await deleteUserCollection('chats', user.uid);
      }
      await deleteUser(user);
      setUserProfile(null);
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        throw new Error('For security reasons, please sign out and sign in again before deleting your account.');
      }
      throw error;
    }
  };

  // Helper to determine if we're running in a native mobile environment (Capacitor Android/iOS WebView)
  const isRunningInNativeWebView = (): boolean => {
    try {
      if (Capacitor && typeof Capacitor.getPlatform === 'function' && (Capacitor as any).isNative) {
        const p = Capacitor.getPlatform();
        return p === 'android' || p === 'ios';
      }

      const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '').toLowerCase() : '';
      // Generic WebView heuristics (Android/iOS)
      if (ua.includes('android')) {
        if (ua.includes('; wv') || /version\/\d+/i.test(ua) || !/chrome\/[\d]+/i.test(ua)) {
          return true;
        }
      }
      if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
        // iOS WebViews often don't include 'safari' token
        if (!ua.includes('safari') || ua.includes('version/')) {
          return true;
        }
      }
    } catch (e) {
      // ignore and assume not webview
    }
    return false;
  };

  // protect: in-flight initialization lock to avoid creating multiple RecaptchaVerifier instances simultaneously
  const recaptchaInitPromiseRef = React.useRef<Promise<RecaptchaVerifier> | null>(null);
  // Guard to avoid concurrent OTP sends which can be interpreted as abuse
  const otpSendingRef = React.useRef<boolean>(false);

  // Helper to create / get the RecaptchaVerifier instance (invisible)
  const getOrCreateRecaptchaVerifier = async (): Promise<RecaptchaVerifier> => {
    if (recaptchaVerifier) return recaptchaVerifier;

    // If another call is creating the verifier, wait for it
    if (recaptchaInitPromiseRef.current) {
      return recaptchaInitPromiseRef.current;
    }

    // Safe guard: only run on DOM environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('Recaptcha requires a browser environment');
    }

    // Detect native WebView and prevent using web reCAPTCHA there
    if (isRunningInNativeWebView()) {
      throw new Error(
        'reCAPTCHA-based phone auth is unsupported inside native WebViews. Use native Firebase phone auth (e.g., @capacitor-firebase/authentication) or your backend SMS flow when running on mobile.'
      );
    }

    // Initialize once and store promise so concurrent callers reuse it
    recaptchaInitPromiseRef.current = (async () => {
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          /* noop: handled by signInWithPhoneNumber flow */
        },
        'expired-callback': () => {
          console.warn('reCAPTCHA expired');
        },
      });

      try {
        // render may be required by some firebase versions
        // render returns a promise/number depending on version; we ignore returned value
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await verifier.render?.();
      } catch (e) {
        // render can fail if already rendered; ignore and continue with verifier
        console.warn('recaptcha render warning', e);
      }

      setRecaptchaVerifier(verifier);
      recaptchaInitPromiseRef.current = null;
      return verifier;
    })();

    return recaptchaInitPromiseRef.current;
  };

  // sendOTP returns a ConfirmationResult which must be confirmed with confirmationResult.confirm(code)
const sendOTP = async (phoneNumber: string): Promise<ConfirmationResult> => {
  const formattedPhone = phoneNumber.startsWith('+')
    ? phoneNumber
    : `+${phoneNumber.replace(/\D/g, '')}`;

  // Prevent concurrent requests — Firebase treats rapid repeated verification attempts as abuse
  if (otpSendingRef.current) {
    throw new Error('OTP request already in progress');
  }
  otpSendingRef.current = true;

  // Native WebView: prefer native plugin / server flow instead of web reCAPTCHA
  if (isRunningInNativeWebView()) {
    try {
          // Use typed adapter that centralizes plugin import & errors
          const adapter = await import('@/integrations/firebase/capacitorAuth').then((m) => m.default || m);
          const adp = adapter as any;

          const available = await adp.isPluginAvailable?.();
          if (!available) {
            // If plugin missing, *fallback to server-side SMS* if available (avoids triggering web reCAPTCHA)
            console.warn('Native phone auth plugin not installed; attempting server-side SMS fallback');
            try {
              const resp = await authAPI.sendOTP(formattedPhone);
              // adapter: server-based confirmation
              return {
                confirm: async (code: string) => {
                  const verification = await authAPI.verifyOTP(formattedPhone, code);
                  if (!verification || (verification as any).error) {
                    throw new Error((verification as any).error || 'Server-side verification failed');
                  }

                  // Apply phoneVerified to Firebase user profile if signed in
                  if (auth.currentUser) {
                    const profileRef = doc(db, 'users', auth.currentUser.uid);
                    await updateDoc(profileRef, { phoneVerified: true, phoneNumber: formattedPhone });
                    setUserProfile((prev) => (prev ? { ...prev, phoneVerified: true, phoneNumber: formattedPhone } : prev));
                  }

                  return { user: auth.currentUser || { phoneNumber: formattedPhone } };
                },
              } as unknown as ConfirmationResult;
            } catch (srvErr: any) {
              console.warn('Server-side SMS fallback failed', srvErr);
              throw new Error('Native plugin missing and server SMS fallback failed. Install the native plugin or configure a server SMS provider.');
            }
          }

          // Try adapter's sign-in variants
          const verification: any = await (adp.signInWithPhoneNumberNative?.({ phoneNumber: formattedPhone }) || adp.startPhoneNumberVerificationNative?.({ phoneNumber: formattedPhone }));
          const verificationId = verification?.verificationId || verification?.id || verification?.verification_id || verification?.session;

          if (verificationId) {
            return {
              confirm: async (code: string) => {
                const res = await (adapter.verifyPhoneNumberNative?.({ verificationId, verificationCode: code }) || adapter.verifyPhoneNumberNative?.({ verificationId, verificationCode: code }));
                return { user: auth.currentUser || res?.user };
              },
            } as unknown as ConfirmationResult;
          }

          // Some plugins provide signInWithVerificationCode directly
          if (adp.signInWithVerificationCodeNative) {
            return {
              confirm: async (code: string) => {
                const res = await adp.signInWithVerificationCodeNative({ verificationId: verification?.id || verification?.verificationId, verificationCode: code });
                return { user: auth.currentUser || res?.user };
              },
            } as unknown as ConfirmationResult;
          }

          throw new Error('Native phone auth plugin found but did not return a verification session.');
        } catch (nativeErr: any) {
          console.warn('Native phone auth attempt failed', nativeErr?.message || nativeErr);
          throw new Error(
            'Phone authentication on Android failed with native plugin. Ensure plugin is installed/configured, `google-services.json` exists, and SHA-256 fingerprints are added in Firebase console.'
          );
        }
      }

  try {
    const verifier = await getOrCreateRecaptchaVerifier();
    const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier);
    return confirmationResult;
  } catch (error: any) {
    // inspect Firebase error details — log them to console (also surface user-friendly message)
    const webview = isRunningInNativeWebView();
    console.error('sendOTP error:', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
      // Some SDKs put extra details in error.customData
      customData: error?.customData || error?.custom_data,
      isAndroidWebView: webview,
      recaptchaInitialized: !!recaptchaVerifier,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });

    // Common error mappings
    if (error?.code === 'auth/invalid-phone-number' || (error?.message || '').includes('INVALID_PHONE_NUMBER')) {
      throw new Error('Invalid phone number. Ensure E.164 format (e.g. +919876543210).');
    } else if (error?.code === 'auth/too-many-requests') {
      if (webview) {
        throw new Error('Too many requests — reCAPTCHA-based web verification is blocked or unreliable inside Android WebView. Install a native Firebase Auth plugin (see /docs/android-phone-auth.md) or use the server-side SMS fallback.');
      }
      throw new Error('Too many requests. Please try again later.');
    } else if (error?.code === 'auth/quota-exceeded') {
      throw new Error('SMS quota exceeded for this project. Consider enabling billing or using a test device.');
    } else if ((error?.message || '').toLowerCase().includes('recaptcha')) {
      // Handle reCAPTCHA-specific failures (401, unauthorized)
      throw new Error(
        'reCAPTCHA initialization failed. Possible causes: adblocker blocking Google, wrong reCAPTCHA site key (Enterprise vs v2 mismatch), or API key restrictions. Try disabling extensions and verifying your site key in the reCAPTCHA admin console.'
      );
    }

    // Otherwise rethrow original error so caller can inspect
    throw error;
  } finally {
    otpSendingRef.current = false;
  }
};

  // verifyOTP expects the ConfirmationResult returned by sendOTP + the OTP code
  const verifyOTP = async (confirmationResult: ConfirmationResult, otp: string): Promise<void> => {
    try {
      const result = await confirmationResult.confirm(otp);

      // Native plugin adapters may not return a Firebase user object. Prefer Firebase `auth.currentUser` where possible.
      const firebaseUser = (result && (result as any).user) || auth.currentUser;

      if (firebaseUser) {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileDoc = await getDoc(profileRef);

        const phoneNumberToUse = firebaseUser.phoneNumber || '';

        if (profileDoc.exists()) {
          const profileData = profileDoc.data() as UserProfile;
          await updateDoc(profileRef, {
            phoneVerified: true,
            phoneNumber: profileData.phoneNumber || phoneNumberToUse,
          });

          setUserProfile({
            ...profileData,
            phoneVerified: true,
            phoneNumber: profileData.phoneNumber || phoneNumberToUse,
          });
        } else {
          const newProfile: UserProfile = {
            fullName: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            phoneNumber: phoneNumberToUse,
            phoneVerified: true,
            createdAt: new Date().toISOString(),
            role: 'resident',
          };
          await setDoc(profileRef, newProfile);
          setUserProfile(newProfile);
        }
      }
    } catch (error: any) {
      if (error?.code === 'auth/invalid-verification-code' || error?.message?.includes('Invalid code')) {
        throw new Error('Invalid OTP code. Please try again.');
      } else if (error?.code === 'auth/code-expired') {
        throw new Error('OTP code has expired. Please request a new one.');
      } else if (error?.code === 'auth/session-expired') {
        throw new Error('Session expired. Please start the verification process again.');
      }
      throw error;
    }
  };

  const linkPhoneNumber = async (phoneNumber: string): Promise<ConfirmationResult> => {
    return await sendOTP(phoneNumber);
  };

  if (authError) {
    return <div>Authentication Error: {authError}</div>;
  }

  const value: AuthContextType = {
    user,
    isGuest,
    loading,
    signUp,
    signIn,
    signInAsGuest,
    resetPassword,
    logout,
    deleteAccount,
    userProfile,
    sendOTP,
    verifyOTP,
    linkPhoneNumber,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
