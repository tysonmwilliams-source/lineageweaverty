# Firebase Setup Guide for Lineageweaver

This guide walks you through setting up Firebase for authentication and cloud storage. Estimated time: 10-15 minutes.

---

## What We're Setting Up

1. **Firebase Project** — A container for all Firebase services
2. **Authentication** — Google sign-in for users
3. **Firestore** — Cloud database for storing genealogy data
4. **Configuration** — Connecting Lineageweaver to your Firebase project

---

## Step 1: Create a Firebase Project

### 1.1 Go to Firebase Console
Open your browser and navigate to:
```
https://console.firebase.google.com/
```

Sign in with your Google account if prompted.

### 1.2 Create New Project
1. Click **"Create a project"** (or "Add project" if you have existing projects)
2. Enter project name: `lineageweaver` (or any name you prefer)
3. Click **Continue**

### 1.3 Google Analytics (Optional)
- You can disable Google Analytics for now (toggle it off)
- This keeps things simpler and you can add it later if needed
- Click **Create project**

Wait for the project to be created (takes about 30 seconds), then click **Continue**.

---

## Step 2: Enable Google Authentication

### 2.1 Navigate to Authentication
1. In the left sidebar, click **Build** to expand the menu
2. Click **Authentication**
3. Click **Get started**

### 2.2 Enable Google Sign-In
1. Click on the **Sign-in method** tab
2. Click on **Google** in the provider list
3. Toggle the **Enable** switch to ON
4. Enter a **Project support email** (use your email)
5. Click **Save**

You should now see Google listed as "Enabled" in green.

---

## Step 3: Create Firestore Database

### 3.1 Navigate to Firestore
1. In the left sidebar, click **Build** → **Firestore Database**
2. Click **Create database**

### 3.2 Choose Security Mode
Select **"Start in test mode"** for now.

> ⚠️ **Important**: Test mode allows anyone to read/write for 30 days. We'll add proper security rules later, but this lets us develop without restrictions initially.

Click **Next**.

### 3.3 Choose Location
Select a Cloud Firestore location closest to your users:
- For New Zealand: Choose **australia-southeast1 (Sydney)** or **australia-southeast2 (Melbourne)**
- For US: Choose **us-central1** or a region near you

> ⚠️ **Warning**: This location cannot be changed later, so choose wisely!

Click **Enable** and wait for the database to be created.

---

## Step 4: Register Your Web App

### 4.1 Add Web App to Project
1. Go to **Project Overview** (click the house icon in top-left)
2. Click the **web icon** (`</>`) to add a web app
   - It's in the center of the page under "Get started by adding Firebase to your app"
   - Or if you've already added apps, click the gear icon → Project settings → Your apps → Add app → Web

### 4.2 Register App
1. Enter app nickname: `Lineageweaver Web`
2. **Don't** check "Also set up Firebase Hosting" (not needed yet)
3. Click **Register app**

### 4.3 Copy Your Configuration
You'll see a code block that looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy.....................",
  authDomain: "lineageweaver-xxxxx.firebaseapp.com",
  projectId: "lineageweaver-xxxxx",
  storageBucket: "lineageweaver-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

**Copy these values!** You'll need them in the next step.

Click **Continue to console**.

---

## Step 5: Configure Lineageweaver

### 5.1 Create Environment File
In your `lineageweaver` folder (the root, same level as `package.json`), create a file called `.env.local`:

```bash
# In your terminal, from the lineageweaver folder:
touch .env.local
```

Or create it manually in your code editor.

### 5.2 Add Your Firebase Config
Open `.env.local` and add your Firebase configuration values:

```env
# Firebase Configuration
# Replace these values with YOUR config from Firebase Console

VITE_FIREBASE_API_KEY=AIzaSy...your-api-key...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

> **Why VITE_ prefix?** Vite (our build tool) only exposes environment variables to the browser if they start with `VITE_`. This is a security feature to prevent accidentally exposing server-side secrets.

### 5.3 Verify .gitignore
Make sure `.env.local` is in your `.gitignore` file so you don't accidentally commit your API keys:

```gitignore
# Local env files
.env.local
.env.*.local
```

This should already be there from Vite defaults.

---

## Step 6: Install Firebase SDK

In your terminal, from the `lineageweaver` folder, run:

```bash
npm install firebase
```

This adds the Firebase JavaScript SDK to your project.

---

## Step 7: Verify Setup

After completing all steps, you should have:

- [ ] Firebase project created at console.firebase.google.com
- [ ] Google Authentication enabled
- [ ] Firestore database created (in test mode)
- [ ] Web app registered and config copied
- [ ] `.env.local` file created with your config values
- [ ] Firebase SDK installed (`npm install firebase`)
- [ ] `.env.local` is in `.gitignore`

---

## Troubleshooting

### "Firebase: Error (auth/configuration-not-found)"
- Double-check your `.env.local` values match exactly what Firebase gave you
- Make sure there are no extra spaces or quotes around the values
- Restart your dev server (`npm run dev`) after changing `.env.local`

### "Firebase: Error (auth/unauthorized-domain)"
- Go to Firebase Console → Authentication → Settings → Authorized domains
- Add `localhost` if it's not there
- If deploying, add your production domain

### "Missing or insufficient permissions" (Firestore)
- You're in test mode, so this shouldn't happen yet
- If it does, check that Firestore was created successfully
- Verify the project ID in your config matches

### Google Sign-In popup blocked
- Disable popup blockers for localhost
- Try a different browser
- Make sure you're accessing via `http://localhost:5173` not `127.0.0.1`

---

## What's Next?

Once you've completed this setup:
1. Let me know and I'll provide the authentication code files
2. We'll create the AuthContext and LoginPage
3. Test that Google sign-in works
4. Then move on to Firestore data sync

---

## Quick Reference: Your Firebase Console URLs

After setup, bookmark these:
- **Project Overview**: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/overview`
- **Authentication Users**: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/authentication/users`
- **Firestore Data**: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/firestore/data`

Replace `YOUR-PROJECT-ID` with your actual project ID (e.g., `lineageweaver-12345`).
