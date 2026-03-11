# Owners Hub App — Comprehensive Repository Summary

## Project Overview

**Project Name:** CoHub — Property Management  
**Version:** 1.0.9  
**Type:** Full-stack property management platform with mobile support  

CoHub is a comprehensive property management platform for property owners and residents. It enables users to manage rental properties, handle tenant communications, process payments, and track maintenance issues. The application supports both web and native mobile (Android/iOS via Capacitor) deployment.

---

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| **Language** | TypeScript | 5.8.3 |
| **Frontend Framework** | React | 18.3.1 |
| **Build Tool** | Vite | 5.4.19 |
| **Styling** | Tailwind CSS + shadcn/ui | 3.4.17 |
| **Routing** | React Router DOM | 6.30.1 |
| **State Management** | React Context + TanStack React Query | 5.83.0 |
| **Authentication** | Firebase Auth + Supabase SMS fallback | 12.2.1 |
| **Payments** | Razorpay | 2.9.4 |
| **AI / Chatbot** | Google Gemini API + Genkit | 1.18.0 |
| **Mobile** | Capacitor | 7.4.3 |
| **Form Handling** | React Hook Form + Zod | 7.61.1 / 3.25.76 |
| **Charts** | Recharts | 2.15.4 |

---

## Source Directory Structure

```
src/
├── main.tsx                    # React entry point (wraps app with AuthProvider)
├── App.tsx                     # Root router with lazy-loaded routes & React Query
├── index.css                   # Global styles & Tailwind theme variables
│
├── components/                 # Reusable UI components
│   ├── Header.tsx              # Top navigation bar
│   ├── BottomNavigation.tsx    # Mobile bottom nav
│   ├── PhoneOTPAuth.tsx        # Phone OTP authentication flow
│   ├── OTPVerificationDialog.tsx
│   ├── ProtectedRoute.tsx      # Auth guard wrapper for routes
│   ├── IssueCard.tsx           # Issue display card
│   ├── StatsCards.tsx          # Dashboard statistics display
│   ├── AddPropertyModal.tsx    # Property creation form
│   ├── AddResidentModal.tsx    # Resident addition form
│   ├── ReferralModal.tsx       # Referral code modal
│   └── ui/                    # 52 shadcn/ui primitive components
│
├── pages/                      # Page-level route components
│   ├── Auth.tsx                # Authentication (email, phone OTP, guest)
│   ├── Dashboard.tsx           # Main dashboard with stats & issues
│   ├── Residents.tsx           # Resident management
│   ├── Payments.tsx            # Payment history & transactions
│   ├── Chatbot.tsx             # AI chatbot interface (Gemini API)
│   ├── Settings.tsx            # User preferences & theme toggle
│   ├── Profile.tsx             # User profile & phone verification
│   ├── Notifications.tsx       # Notification center
│   ├── NotificationList.tsx    # Detailed notifications view
│   ├── Subscription.tsx        # Subscription plan management
│   ├── Index.tsx               # Landing page
│   └── NotFound.tsx            # 404 page
│
├── context/
│   └── AuthContext.tsx          # Authentication state (Firebase, OTP, roles)
│
├── services/
│   ├── api.ts                  # Centralized backend API client
│   └── notificationService.ts  # Notification handling
│
├── integrations/
│   ├── firebase/
│   │   ├── client.ts           # Firebase initialization (Firestore, Auth)
│   │   └── capacitorAuth.ts    # Native mobile auth adapter
│   └── supabase/
│       ├── client.ts           # Supabase client (deprecated stub)
│       └── types.ts            # Type definitions
│
├── hooks/
│   ├── use-mobile.tsx          # Mobile viewport detection
│   └── use-toast.ts            # Toast notification hook
│
├── lib/
│   └── utils.ts                # Shared utility functions
│
├── styles/
│   └── mobile.css              # Mobile-specific styles
│
└── assets/
    ├── logo.png                # App logo
    └── assets.d.ts             # Asset type declarations
```

---

## Core Feature Domains

### 1. Authentication & Authorization
- Firebase Auth supporting email/password, phone OTP, and guest login
- Phone OTP with Firebase reCAPTCHA and Supabase Edge Function fallback
- Native mobile auth via Capacitor Firebase plugin
- Role-based access control: **owner**, **resident**, **guest**
- User profiles stored in Firestore
- Password reset and account deletion support

### 2. Property Management
- Full CRUD operations for properties
- Property listing with details and occupancy tracking
- Occupancy rate and property statistics on the dashboard

### 3. Resident Management
- Resident profiles with lease and contact information
- Firestore-based queries for resident data
- Status tracking per resident

### 4. Payment Processing
- Razorpay integration for payment collection
- Payment history and transaction tracking
- Monthly revenue calculations and payment statistics

### 5. Issue / Maintenance Tracking
- Issue creation, assignment, and status management
- Statuses: Pending → In Progress → Resolved
- Priority levels and category classification
- Filterable issue list on the dashboard

### 6. AI-Powered Chatbot
- Google Gemini API integration for natural-language assistance
- Context-aware responses using payment and resident data
- Persistent chat history stored in Firestore
- Quick-navigation helpers to app sections

### 7. Notifications
- Notification center with categorized alerts
- Issue and payment notification support

### 8. User Settings & Profile
- Theme toggling (dark mode via `next-themes`)
- Phone verification from profile page
- Account management (update, delete)

---

## API Layer (`src/services/api.ts`)

All backend communication flows through a centralized `apiCall()` helper that:
- Injects Firebase ID tokens as Bearer authorization headers
- Handles validation error formatting
- Uses environment-based URL configuration (`VITE_API_URL`)

**Domain endpoints:**

| Domain | Operations |
|--------|-----------|
| **Users** | getAll, getProfile, getMe, update, delete |
| **Payments** | getAll, getById, create, update, delete, getStats |
| **Issues** | getAll, getById, create, update, updateStatus, delete, getStats |
| **Properties** | getAll, getById, create, update, delete, getStats |
| **Dashboard** | getStats, getDashboardData (parallel fetch) |
| **Auth** | register, login, verifyToken, sendOTP, verifyOTP |

---

## Build & Development Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (port 8081) |
| `npm run build` | Production build |
| `npm run build:dev` | Development-mode build |
| `npm run lint` | Run ESLint checks |
| `npm run preview` | Preview production build locally |
| `npm run cap:sync` | Sync Capacitor plugins |
| `npm run prepare:android` | Build + sync Android project |
| `npm run build:android` | Full Android APK build (Gradle) |
| `npm run distribute:android` | Distribute via Firebase App Distribution |

---

## Deployment Targets

| Platform | Configuration | Notes |
|----------|--------------|-------|
| **Web (Vercel)** | `vercel.json` | SPA routing to `index.html` |
| **Android** | `capacitor.config.ts` + Gradle | APK via Firebase App Distribution |
| **iOS** | `capacitor.config.ts` + Fastlane | Native build via Xcode |
| **Firebase Hosting** | `firebase.json` | Testing group distribution |

---

## Environment Variables

The app requires the following environment variables (see `env.example`):

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend REST API endpoint |
| `VITE_RAZORPAY_KEY_ID` | Razorpay payment gateway key |
| `VITE_GEMINI_API_KEY` | Google Gemini chatbot API key |
| `VITE_FIREBASE_API_KEY` | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Analytics measurement ID |

---

## Performance Optimizations

- **Code splitting** — All page components are lazy-loaded via `React.lazy()`
- **Bundle chunking** — Rollup manual chunks separate vendor, Firebase, and UI libraries
- **Minification** — esbuild used for production minification
- **Caching** — React Query with 5-minute stale time and single retry
- **Responsive design** — Mobile-first layout via Tailwind CSS

---

## Testing & CI/CD

- **Testing:** No automated test framework is currently configured (linting only via ESLint)
- **CI/CD:** No GitHub Actions workflows; deployment relies on manual scripts and Vercel/Firebase CLI

---

## Application Flow

```
User Visit
    ↓
Auth Check (Firebase)
    ↓
Sign In / Sign Up / Guest Mode
    ├── Email + Password
    ├── Phone OTP (Firebase / Supabase fallback)
    └── Anonymous Guest
    ↓
Protected Routes (ProtectedRoute wrapper)
    ├── Owner: Dashboard, Properties, Residents, Payments
    ├── Resident: Dashboard, Profile, Notifications
    └── Common: Chatbot, Settings
    ↓
API Calls → Backend REST API
    ├── User management
    ├── Payment processing (Razorpay)
    ├── Property / Resident CRUD
    ├── Issue tracking
    └── Analytics / Dashboard stats
    ↓
Responsive UI (Desktop / Tablet / Mobile via Capacitor)
```

---

## Documentation

| File | Content |
|------|---------|
| `README.md` | Setup instructions, tech stack, deployment |
| `CI-CD-SETUP.md` | Android build troubleshooting & Capacitor Gradle solutions |
| `docs/android-phone-auth.md` | Native Android phone auth setup guide |
| `FIREBASE-APP-DISTRIBUTION-SETUP.md` | Firebase distribution configuration |
| `SECURITY.md` | Security best practices |
| `ENVIRONMENT_CLEANUP.md` | Environment variable cleanup procedures |
| `env.example` | Environment variable reference |
