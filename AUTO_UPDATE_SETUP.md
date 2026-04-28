# GitHub Auto-Release & Auto-Update Setup

## How It Works

1. **You push to GitHub** (`main` branch)
2. **GitHub Actions automatically:**
   - Builds the app for macOS (DMG installer + ZIP)
   - Increments the version number in `package.json`
   - Creates a GitHub Release with the built app
   - Publishes release notes and files
3. **Client machines** (your Mac installation) automatically:
   - Check for updates every 30 minutes
   - Download the new version
   - Prompt you to restart and install

## To Use

### 1. First Time Setup - Grant GitHub Token Access
Nothing additional needed! GitHub Actions uses `GITHUB_TOKEN` automatically.

### 2. Push Code to GitHub
```bash
git add .
git commit -m "Your changes"
git push origin main
```

### 3. Monitor the Build
- Go to your repo: https://github.com/sarathy21/billing-software
- Click **Actions** tab
- Watch the workflow run
- When complete, you'll see a new **Release** in the repo

### 4. Auto-Update on Client Mac
- Your installed client checks for updates every 30 minutes
- A dialog appears: "Version X.X.X has been downloaded"
- Click "Restart now" to install, or "Later" to skip

## Version Management

The workflow automatically increments versions:
- **1.0.0** → **1.0.1** → **1.0.2** (for each push)

To manually set version, edit `package.json`:
```json
{
  "version": "1.2.0"
}
```

## Files Modified

- **`.github/workflows/build.yml`** - GitHub Actions workflow
- **`package.json`** - Added macOS build configuration
- **`main.js`** - Already has auto-updater configured

## Troubleshooting

### Client doesn't auto-update?
1. Make sure it's packaged (`app.isPackaged`)
2. Check internet connection
3. Check app logs for errors
4. Try **manually checking**: Look for an "Check for Updates" menu option

### Release not appearing?
- Check GitHub Actions workflow status
- Ensure you pushed to `main` branch (not another branch)
- Check repository settings have GitHub Token available

### Version keeps failing to increment?
- Ensure git config is set:
  ```bash
  git config --local user.email "your@email.com"
  git config --local user.name "Your Name"
  ```
