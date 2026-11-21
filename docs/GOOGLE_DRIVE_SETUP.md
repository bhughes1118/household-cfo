# Google Drive sync: one-time setup (about 10 minutes)

The app saves its shared data to one file in your Google Drive:
**Household CFO / household-cfo-data.json**. Both phones read and write that file.
Google requires a free "OAuth client ID" so the app is allowed to sign you in. You create it once.

## 1. Create a Google Cloud project
1. Go to https://console.cloud.google.com/projectcreate (sign in with your Google account).
2. Project name: `Household CFO`. Click **Create**, and make sure the new project is selected at the top.

## 2. Turn on the Google Drive API
1. Go to https://console.cloud.google.com/apis/library/drive.googleapis.com
2. Click **Enable**.

## 3. Set up the sign-in screen
1. Go to https://console.cloud.google.com/auth/overview and click **Get started**.
2. App name `Household CFO`, pick your email as support email, **Next**.
3. Audience: **External**, **Next**. Contact email: yours. Agree, **Create**.
4. Open **Audience** in the left menu. Under **Test users**, click **Add users** and add
   your Google email **and your partner's** Google email. Save.
   (The app stays in "Testing" mode, which is fine for personal use. Only these accounts can sign in.)

## 4. Create the client ID
1. Open **Clients** in the left menu, click **Create client**.
2. Application type: **Web application**. Name: `Household CFO web`.
3. **Authorized JavaScript origins**: add `https://bhughes1118.github.io`
4. **Authorized redirect URIs**: add `https://bhughes1118.github.io/household-cfo/` (with the trailing slash)
5. Click **Create** and copy the **Client ID** (ends in `.apps.googleusercontent.com`).
   You don't need the client secret.

Send the Client ID to Claude to build it into the app (or paste it in the app under **More → Cloud sync**).

## 5. Connect your phone
1. Open the app, **More → Cloud sync → Connect Google Drive**.
2. Google shows "Google hasn't verified this app". That's expected for your own private app:
   tap **Continue** (sometimes under **Advanced**), then allow Drive access.
3. The app creates the **Household CFO** folder in your Drive and syncs.

## 6. Add your partner
1. In Google Drive, right-click the **Household CFO** folder → **Share** → add your partner as **Editor**.
2. On their phone: open the app, **More → Cloud sync → Connect Google Drive**, sign in with their account.
   Their sample data is replaced by your shared data.

## Good to know
- Each phone keeps a copy, so the app works offline and syncs when back online.
  Edits from both phones are merged record by record; if you both edit the same item, the later edit wins.
- Google sign-ins last an hour. When the app is reopened after that it re-signs in automatically (a quick flash).
- The app uses Google's narrowest Drive permission (`drive.file`): it can only see the files it created
  itself, nothing else in your Drive. Your sign-in token never leaves your device.
- Current setup: project "Household CFO" under the ellehaushomes.com Google Workspace, audience **Internal**
  (only @ellehaushomes.com accounts can sign in, no "unverified app" warning). To add a partner with a Gmail
  account later, switch Audience to External, add them as a test user, and share the folder with them.
- Download a backup any time under **More → Backup & data**.
