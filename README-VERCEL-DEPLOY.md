# Deploy to Vercel (Web Dashboard)

Since CLI upload is failing, use this method:

## Step 1: Connect GitHub Repo to Vercel

1. Go to https://vercel.com/dashboard
2. Click **"Add New Project"**
3. Click **"Import Git Repository"**
4. Find and select: `mathewleon1999-blip/globerron-backend`
5. Click **"Import"**

## Step 2: Configure Build Settings

| Setting | Value |
|---------|-------|
| **Framework Preset** | Other |
| **Root Directory** | ./ (default) |
| **Build Command** | (leave empty) |
| **Output Directory** | (leave empty) |
| **Install Command** | `npm install` |

## Step 3: Add Environment Variables

Click **"Environment Variables"** and add ALL from your local `.env` file:

```
DATABASE_URL=your_neon_database_url_here
DB_PROVIDER=postgres
STRIPE_SECRET_KEY=your_stripe_test_key_here
SESSION_SECRET=your_generated_secret_here
ADMIN_EMAIL=your_admin_email_here
ADMIN_PASSWORD=your_admin_password_here
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_sendgrid_user_here
EMAIL_PASS=your_sendgrid_password_here
EMAIL_FROM=your_sender_email_here
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
AI_PROVIDER=gemini
SEMANTIC_EMBED_BATCH=64
```

**Note**: Copy the actual values from your local `.env` file

## Step 4: Deploy

Click **"Deploy"**

## Step 5: After First Deploy

1. Copy your Vercel URL (e.g., `https://globerron-backend.vercel.app`)
2. Go to Project Settings → Environment Variables
3. Add these with your actual Vercel URL:

```
PUBLIC_BASE_URL=https://your-project.vercel.app
GOOGLE_CALLBACK_URL=https://your-project.vercel.app/api/auth/google/callback
CORS_ORIGIN=https://strong-brioche-4d1099.netlify.app
```

4. Click **"Redeploy"**

## Your URLs

- **Frontend**: https://strong-brioche-4d1099.netlify.app
- **Backend**: https://your-project.vercel.app (after deploy)

## Important Notes

⚠️ **Vercel Limitations:**
- File uploads go to `/tmp` (temporary storage)
- Sessions may need Redis for persistence
- API timeout: 10-60 seconds on free tier
- Cold starts possible

## Alternative: Use Render Instead

If Vercel has issues, Render is easier for Express apps:
https://dashboard.render.com/ → "New Web Service" → Connect GitHub

See `README-DEPLOY.md` for Render instructions.
