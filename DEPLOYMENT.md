# PowerBuilder Modern Docs Deployment

This project is deployed from the GitHub repository:

```text
https://github.com/kick56820/moderndoc.git
```

The app is a Node.js server that serves the modern PowerBuilder documentation browser.

## Requirements

- Node.js 20 or newer
- npm
- git
- PM2 on the Ubuntu host

Check the Node.js version:

```bash
node -v
```

If the version is older than `v20`, upgrade first. Old Ubuntu packages such as Node 12 cannot run the current app.

## Local One-Command Deploy

Run this on the Windows development machine after editing `pbdocs-node`:

```powershell
cd "C:\Users\User\Documents\Codex\2026-05-09\c-users-user-downloads-powerbuilder-10\pbdocs-deploy"; npm run deploy -- "Your commit message"
```

The command does the full local release flow:

1. Sync `pbdocs-node` into `pbdocs-deploy`
2. Install dependencies
3. Run release checks
4. Stage changes
5. Commit changes
6. Push to `origin/main`

If you only want to deploy the current `pbdocs-deploy` folder without syncing from `pbdocs-node`, run:

```powershell
cd "C:\Users\User\Documents\Codex\2026-05-09\c-users-user-downloads-powerbuilder-10\pbdocs-deploy"; npm run deploy -- "Your commit message" -SkipSync
```

## First-Time Ubuntu Setup

Install Node.js 20, git, and PM2:

```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2
node -v
npm -v
pm2 -v
```

Clone the app:

```bash
cd /var/www
sudo git clone https://github.com/kick56820/moderndoc.git pbdocs
sudo chown -R $USER:$USER /var/www/pbdocs
cd /var/www/pbdocs
```

Install and check:

```bash
npm install
npm run check
```

Start with PM2:

```bash
pm2 start server.js --name pbdocs -- 8787
pm2 save
pm2 startup
```

After `pm2 startup`, PM2 prints a `sudo env PATH=...` command. Copy and run that command once so the service starts after reboot.

The app should be available at:

```text
http://YOUR_SERVER_IP:8787
```

## Normal Ubuntu Update

After pushing from the Windows machine, update the Ubuntu host:

```bash
cd /var/www/pbdocs
git pull origin main
npm install
npm run check
pm2 restart pbdocs --update-env
```

Verify the server:

```bash
pm2 status
curl -s http://127.0.0.1:8787/ | grep -E "app.js|styles.css"
```

The asset version in the HTML should match the latest pushed version, for example:

```html
/styles.css?v=20260509-47
/app.js?v=20260509-47
```

## If The Host Still Shows The Old Version

Check whether the host has the newest commit:

```bash
cd /var/www/pbdocs
git log --oneline -3
git status
```

Force the host to match GitHub:

```bash
cd /var/www/pbdocs
git fetch origin
git reset --hard origin/main
npm install
npm run check
pm2 restart pbdocs --update-env
```

Confirm PM2 is running the expected folder:

```bash
pm2 describe pbdocs
```

If PM2 is running an old process or old path, recreate it:

```bash
pm2 delete pbdocs
cd /var/www/pbdocs
pm2 start server.js --name pbdocs -- 8787
pm2 save
```

Open the Ubuntu host URL, not the local Windows URL:

```text
http://YOUR_SERVER_IP:8787/?fresh=latest
```

`http://127.0.0.1:8787` in a Windows browser points to the Windows machine, not the Ubuntu host.

## Node.js Upgrade Troubleshooting

If installing Node.js 20 fails and `node -v` still shows an old version, clean old packages first:

```bash
sudo apt remove -y nodejs npm libnode-dev nodejs-doc
sudo apt autoremove -y
sudo apt clean
sudo dpkg --configure -a
sudo apt --fix-broken install -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

If it still fails, copy the apt error lines above:

```text
Errors were encountered while processing:
```

The real cause is usually listed a few lines before that message.

## Useful PM2 Commands

```bash
pm2 status
pm2 logs pbdocs
pm2 restart pbdocs --update-env
pm2 stop pbdocs
pm2 delete pbdocs
pm2 save
```
