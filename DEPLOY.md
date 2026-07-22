# Deploying Taaffeite Origin on NameHero cPanel

The server never builds the React application. Build `dist/` on your computer, then upload the already-built application.

## 1. Create the database

In cPanel, open **MySQL Databases** and create a database and database user. Add the user to the database with **All Privileges**. cPanel normally prefixes both names with your cPanel username; use the full prefixed names in `.env`.

## 2. Import the schema

Open **phpMyAdmin**, select the new database, choose **Import**, and import `schema.sql`. The import creates the tables, indexes, seed categories, sample gemstones, and sample auctions.

## 3. Build locally and upload

On your own computer, from this folder, run:

```bash
npm install
npm run build
```

Upload the complete project to a folder outside `public_html` when cPanel permits it. Include `app.js`, `server/`, `package.json`, `package-lock.json`, and the generated `dist/` folder. Do not upload `src/` if you prefer a smaller deployment; it is not used at runtime.

In cPanel File Manager, create an upload directory outside `public_html`, for example `/home/YOUR_CPANEL_USER/taaffeite_uploads`.

Create `.env` from `.env.example`, enter the database credentials, a random `JWT_SECRET` of at least 32 characters, the absolute upload directory, your public `APP_URL`, and a long one-time `SETUP_TOKEN`. Never put `.env` inside `dist/` or `public_html`.

If NameHero's Node.js application screen offers **Run NPM Install**, use it once after uploading. This installs the pure-JavaScript runtime packages from `package.json`; it does not build the frontend and does not require SSH.

## 4. Create the Node.js application

Open cPanel **Setup Node.js App** and choose:

- Node.js version: **20**
- Application mode: **Production**
- Application root: the folder you uploaded
- Application URL: your domain or subdomain
- Application startup file: **app.js**

Passenger supplies `process.env.PORT`; do not hard-code a production port. Add the `.env` values in the cPanel environment-variable interface as well if your host does not load `.env` files.

## 5. Restart and initialize

Click **Restart** in cPanel. Visit `/api/health`; a working install returns `{"status":"ok","database":"connected"}`.

The imported schema includes a temporary administrator so you can sign in without terminal access:

- Admin URL: `/admin/login`
- Email: `admin@taaffeiteorigin.com`
- Password: `ChangeMeNow!2026`

Open **Admin > Security** and change this temporary password immediately. The dashboard warns until it has been changed.

If you remove the seeded administrator before first login, visit `/setup`, enter your `SETUP_TOKEN`, and create the first administrator. After success, remove `SETUP_TOKEN` from cPanel or replace it with a new random value, then click **Restart** again.

## Updating the site

Run `npm run build` locally, replace the server's `dist/` folder through File Manager, upload any changed server files, and click **Restart**. Never run Vite on the server.

## Payments and scheduled settlement

The included checkout uses a manual payment reference and never stores card numbers. Connect a PCI-compliant hosted payment provider before accepting cards. Expired auctions are settled whenever the API receives traffic; for guaranteed exact-time settlement, configure a cPanel Cron Job to call the documented admin settlement endpoint through an authenticated integration.
