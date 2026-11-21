# Glasshouse POS (Vercel + Supabase)

Files in this folder: `index.html` (the POS), `api/` (the server: PIN login and database access), `setup.sql` (database setup), `package.json`.

## 1. Supabase: set up the database (once)
1. Open your project at supabase.com -> **SQL Editor** -> **New query**.
2. Open `setup.sql`, copy everything, paste it in, press **Run**. It should say "Success".
3. **Project Settings -> API Keys**: copy the **secret key** (starts with `sb_secret_`). Keep it private.

## 2. GitHub: hold the files
1. Sign up at github.com, click **New repository**, name it `glasshouse-pos`, choose **Private**, create it.
2. Click **uploading an existing file**. Drag in the CONTENTS of this folder (`index.html`, the `api` folder, `package.json`, `setup.sql`, `README.md`). Press **Commit changes**.

## 3. Vercel: put it online
1. At vercel.com choose **Add New -> Project**, import `glasshouse-pos`.
2. Framework Preset: **Other**. Leave build settings empty.
3. Open **Environment Variables** and add these five (exact names):
   - `SUPABASE_URL` = your project URL (https://....supabase.co)
   - `SUPABASE_SERVICE_KEY` = the secret key from step 1.3
   - `STAFF_PIN` = 4 to 8 digits for staff
   - `OWNER_PIN` = 6 to 8 digits for you (different from the staff PIN)
   - `SESSION_SECRET` = any long random text (30+ characters)
4. Press **Deploy**. Vercel gives you a link like `https://glasshouse-pos.vercel.app`.

## 4. First use
1. Open the link, enter the OWNER PIN. Settings -> **Import earlier orders** -> choose your Excel file.
2. Staff open the same link and enter the STAFF PIN (Sell and Orders screens only).
3. To change a PIN: Vercel -> Settings -> Environment Variables, edit, then Redeploy. Old sessions of a changed PIN keep working until they expire (staff 30 days, owner 3 days); change `SESSION_SECRET` too to sign everyone out.
