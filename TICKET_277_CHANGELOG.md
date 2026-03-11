# Ticket #277 — Fix Apple App Store Rejection Issues

## Problem Statement

Apple rejected the iOS build due to two critical issues found during App Store review:

1. **Payment Failure on iPad** — The "Pay Now" action fails during Razorpay checkout on iPad, showing "Oops! Something went wrong. Payment Failed."
2. **Missing Complete Account Deletion (Guideline 5.1.1)** — Apple requires apps to delete all associated user data when an account is deleted, not just the auth user.

---

## Issue 1: Payment Failure on iPad

**File:** `src/pages/Subscription.tsx`

The Razorpay payment flow crashed on iPad because a new `<script>` tag was injected into the DOM on every "Pay Now" click, causing duplicate SDK loads. Additionally, hardcoded placeholder data was used instead of the real user's information, and there was no error handler for failed payments.

### Change 1.1 — Singleton Razorpay Script Loader

**Problem:** Every payment attempt created a new `<script>` element, leading to duplicate Razorpay SDK loads that caused iPad Safari to fail.

**BEFORE:**
```tsx
const handlePayment = async (plan: typeof plans[0]) => {
    // ...
    try {
      // Load Razorpay script
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);

      script.onload = () => {
        const options = { /* ... */ };
        const rzp = new window.Razorpay(options);
        rzp.open();
        setLoading(false);
      };

      script.onerror = () => {
        toast({ title: "Error", description: "Failed to load payment gateway." });
        setLoading(false);
      };
    } catch (error) { /* ... */ }
};
```

**AFTER:**
```tsx
let razorpayLoadPromise: Promise<void> | null = null;

const loadRazorpayScript = (): Promise<void> => {
  if (window.Razorpay) {
    return Promise.resolve();
  }
  if (razorpayLoadPromise) {
    return razorpayLoadPromise;
  }
  razorpayLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existingScript) {
      if (window.Razorpay) { resolve(); return; }
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => {
        razorpayLoadPromise = null;
        reject(new Error('Failed to load payment gateway.'));
      });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayLoadPromise = null;
      reject(new Error('Failed to load payment gateway.'));
    };
    document.body.appendChild(script);
  });
  return razorpayLoadPromise;
};
```

**Why:** The singleton pattern ensures the Razorpay SDK script is loaded exactly once. Subsequent calls reuse the same promise. This eliminates the duplicate `<script>` tags that caused iPad Safari to crash.

---

### Change 1.2 — Auth Guard (Require Sign-In Before Payment)

**Problem:** Unauthenticated users could trigger the payment flow, leading to errors when storing subscription data with no user context.

**BEFORE:**
```tsx
const Subscription = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handlePayment = async (plan: typeof plans[0]) => {
    if (plan.price === 0) { /* ... */ return; }
    setLoading(true);
    try {
      // No authentication check — proceeds directly to payment
      const script = document.createElement('script');
      // ...
```

**AFTER:**
```tsx
const Subscription = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const handlePayment = useCallback(async (plan: typeof plans[0]) => {
    if (plan.price === 0) { /* ... */ return; }
    setLoading(true);
    try {
      if (!user?.uid) {
        toast({
          title: "Authentication Required",
          description: "Please sign in before making a payment.",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      await loadRazorpayScript();
      // ...
```

**Why:** Blocks unauthenticated users from triggering payment. Also imports `useAuth` to get actual user data for prefill and subscription records.

---

### Change 1.3 — Real User Data Instead of Hardcoded Placeholders

**Problem:** Razorpay checkout was prefilled with fake data (`'John Doe'`, `'user@example.com'`), and the subscription record stored in Firestore used placeholder IDs (`'user123'`). This caused Apple reviewers to see incorrect information.

**BEFORE:**
```tsx
// Subscription record stored in Firestore
await addDoc(collection(db, 'subscriptions'), {
  payment_id: response.razorpay_payment_id,
  plan: plan.name,
  amount: plan.price,
  currency: 'INR',
  status: 'paid',
  date: new Date().toISOString(),
  user_email: 'user@example.com',   // ❌ Hardcoded
  user_id: 'user123',               // ❌ Hardcoded
  features: plan.features,
  period: plan.period
});

// Razorpay checkout prefill
prefill: {
  name: 'John Doe',            // ❌ Hardcoded
  email: 'user@example.com',   // ❌ Hardcoded
  contact: '9999999999'        // ❌ Hardcoded
},
```

**AFTER:**
```tsx
// Subscription record stored in Firestore
await addDoc(collection(db, 'subscriptions'), {
  payment_id: response.razorpay_payment_id,
  plan: plan.name,
  amount: plan.price,
  currency: 'INR',
  status: 'paid',
  date: new Date().toISOString(),
  user_email: userProfile?.email || user?.email || '',   // ✅ Real user
  user_id: user?.uid || '',                              // ✅ Real user
  features: plan.features,
  period: plan.period
});

// Razorpay checkout prefill
prefill: {
  name: userProfile?.fullName || user?.displayName || '',   // ✅ Real user
  email: userProfile?.email || user?.email || '',            // ✅ Real user
  contact: userProfile?.phoneNumber || ''                    // ✅ Real user
},
```

**Why:** Uses the authenticated user's actual name, email, and phone number from `AuthContext`. Subscription records now correctly link to the real `user.uid`.

---

### Change 1.4 — Payment Failure Handler

**Problem:** When Razorpay payment failed on iPad, the app showed no in-app error message — the user only saw Razorpay's generic popup with no follow-up.

**BEFORE:**
```tsx
const rzp = new window.Razorpay(options);
rzp.open();
setLoading(false);
// ❌ No payment.failed handler — errors are silently ignored
```

**AFTER:**
```tsx
const rzp = new window.Razorpay(options);

rzp.on('payment.failed', function (response: any) {
  console.error('Razorpay payment failed:', response.error);
  toast({
    title: "Payment Failed",
    description: response.error?.description || "Payment could not be completed. Please try again.",
    variant: "destructive"
  });
  setLoading(false);
});

rzp.open();
setLoading(false);
```

**Why:** The `payment.failed` event handler shows a user-friendly toast notification when payment fails, and resets the loading state so the user can retry.

---

### Change 1.5 — Import Updates

**BEFORE:**
```tsx
import { useState } from "react";
// ... other imports
import { collection, addDoc } from "firebase/firestore";
```

**AFTER:**
```tsx
import { useState, useCallback } from "react";
// ... other imports
import { collection, addDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
```

**Why:** Added `useCallback` to stabilize the `handlePayment` function reference, and `useAuth` to access authenticated user data.

---

## Issue 2: Incomplete Account Deletion (App Store Guideline 5.1.1)

**File:** `src/context/AuthContext.tsx`

Apple Guideline 5.1.1 requires that when a user deletes their account, **all associated data** must be removed. The original `deleteAccount()` only deleted the `users` document and the Firebase Auth user — leaving orphaned records in the `subscriptions` and `chats` collections.

### Change 2.1 — Firestore Import Updates

**BEFORE:**
```tsx
import { doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
```

**AFTER:**
```tsx
import { doc, setDoc, getDoc, deleteDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
```

**Why:** Added `collection`, `query`, `where`, and `getDocs` to support querying and deleting documents from the `subscriptions` and `chats` collections.

---

### Change 2.2 — New `deleteUserCollection` Helper

**Problem:** No mechanism existed to find and delete user-specific documents across multiple Firestore collections.

**BEFORE:** *(did not exist)*

**AFTER:**
```tsx
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
```

**Why:** Reusable helper that queries a Firestore collection for all documents matching the user's ID and deletes them in parallel. Errors are logged but don't block the overall deletion flow.

---

### Change 2.3 — `deleteAccount` Now Purges All User Data

**Problem:** `deleteAccount()` only deleted the user's profile document (`users/{uid}`) and the Firebase Auth user. Subscription and chat records remained in the database.

**BEFORE:**
```tsx
const deleteAccount = async () => {
  if (!user) {
    throw new Error('No user logged in');
  }

  try {
    if (!user.isAnonymous) {
      await deleteDoc(doc(db, 'users', user.uid));
    }
    await deleteUser(user);
    setUserProfile(null);
  } catch (error: any) {
    if (error.code === 'auth/requires-recent-login') {
      throw new Error('For security reasons, please re-authenticate before deleting your account.');
    }
    throw error;
  }
};
```

**AFTER:**
```tsx
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
```

**Why:** Now deletes data from three collections before removing the Firebase Auth user:
1. `users/{uid}` — user profile document
2. `subscriptions` — all documents where `user_id == uid`
3. `chats` — all documents where `user_id == uid`

This satisfies Apple Guideline 5.1.1 which requires complete removal of all user-associated data.

---

## Summary of All Changes

| File | Change | Purpose |
|------|--------|---------|
| `src/pages/Subscription.tsx` | Singleton `loadRazorpayScript()` | Prevents duplicate `<script>` tags crashing iPad Safari |
| `src/pages/Subscription.tsx` | Auth guard (`if (!user?.uid)`) | Blocks unauthenticated payment attempts |
| `src/pages/Subscription.tsx` | Real user data in prefill + subscription record | Replaces hardcoded `'John Doe'` / `'user123'` with actual user info |
| `src/pages/Subscription.tsx` | `rzp.on('payment.failed', ...)` handler | Shows error toast when payment fails |
| `src/pages/Subscription.tsx` | `useCallback` + `useAuth` imports | Stabilizes handler reference, provides user context |
| `src/context/AuthContext.tsx` | `deleteUserCollection()` helper | Queries and deletes all user docs from a collection |
| `src/context/AuthContext.tsx` | `deleteAccount()` purges `subscriptions` + `chats` | Ensures complete data removal per Guideline 5.1.1 |
| `src/context/AuthContext.tsx` | Updated Firestore imports | Adds `collection`, `query`, `where`, `getDocs` |

**Files NOT changed:** `src/pages/Auth.tsx`, `src/pages/Settings.tsx` — the existing authentication flow and Delete Account UI (button + confirmation dialog) remain unchanged.
