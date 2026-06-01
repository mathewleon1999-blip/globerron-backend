# Deploy to Render

## Quick Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## Manual Deploy Steps

1. Go to https://dashboard.render.com/
2. Click "New Web Service"
3. Connect your GitHub repo or use "Deploy from Git repository"
4. Configure:
   - **Name**: globerron-backend
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

## Required Environment Variables

Set these in Render Dashboard → Environment:

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | postgresql://neondb_owner... | Your Neon DB |
| `STRIPE_SECRET_KEY` | sk_test_... | Stripe Dashboard |
| `SESSION_SECRET` | (generate random) | openssl rand -hex 32 |
| `ADMIN_EMAIL` | your-email@example.com | Your choice |
| `ADMIN_PASSWORD` | StrongPassword123 | Your choice |
| `EMAIL_HOST` | smtp.sendgrid.net | SendGrid |
| `EMAIL_USER` | apikey | SendGrid |
| `EMAIL_PASS` | SG.xxx... | SendGrid API Key |
| `EMAIL_FROM` | noreply@yourdomain.com | Verified sender |
| `GEMINI_API_KEY` | AIza... | Google AI Studio |
| `GOOGLE_CLIENT_ID` | xxx.apps.googleusercontent.com | Google Cloud |
| `GOOGLE_CLIENT_SECRET` | GOCSPX-... | Google Cloud |
| `GOOGLE_CALLBACK_URL` | https://your-app.onrender.com/api/auth/google/callback | After deploy |
| `PUBLIC_BASE_URL` | https://your-app.onrender.com | After deploy |
| `CORS_ORIGIN` | https://your-frontend.netlify.app | Your frontend URL |

## After Deployment

1. Update `GOOGLE_CALLBACK_URL` with your actual Render URL
2. Update `PUBLIC_BASE_URL` with your actual Render URL
3. Update `CORS_ORIGIN` with your Netlify frontend URL
4. Redeploy if needed
