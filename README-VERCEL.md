# Deploy to Vercel

## Setup

1. Install Vercel CLI globally:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel --prod
   ```

## Alternative: Git Integration

1. Push code to GitHub
2. Go to https://vercel.com/dashboard
3. Click "Add New Project"
4. Import your GitHub repository
5. Configure:
   - **Framework Preset**: Other
   - **Build Command**: (leave empty or `npm install`)
   - **Output Directory**: (leave empty)
   - **Install Command**: `npm install`

## Environment Variables

Set in Vercel Dashboard → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Neon PostgreSQL URL |
| `STRIPE_SECRET_KEY` | sk_test_... |
| `SESSION_SECRET` | (generate random string) |
| `ADMIN_EMAIL` | admin@example.com |
| `ADMIN_PASSWORD` | YourPassword123 |
| `EMAIL_HOST` | smtp.sendgrid.net |
| `EMAIL_USER` | apikey |
| `EMAIL_PASS` | SG.xxx... |
| `EMAIL_FROM` | noreply@example.com |
| `GEMINI_API_KEY` | AIza... |
| `GOOGLE_CLIENT_ID` | xxx.apps.googleusercontent.com |
| `GOOGLE_CLIENT_SECRET` | GOCSPX-... |
| `PUBLIC_BASE_URL` | https://your-project.vercel.app |
| `CORS_ORIGIN` | https://your-frontend.netlify.app |

## Important Notes

- **Vercel uses serverless functions** - File uploads won't persist (use `/tmp` for temp files)
- **Sessions**: Configure Redis for production (connect-redis already installed)
- **Database**: Already using PostgreSQL (Neon) ✓
- **API Routes**: All `/api/*` routes handled by `api/index.js`
- **Static files**: Served from `/public` directory

## Limitations

1. **File uploads**: Images uploaded to `/tmp` are lost after request ends
   - Solution: Use cloud storage (AWS S3, Cloudinary) for production
2. **WebSocket**: Not supported on Vercel
3. **Long-running processes**: 10s-60s timeout on free tier

## Troubleshooting

If deploy fails:
```bash
# Check project size (Vercel has limits)
du -sh .

# Try with git push instead
vercel --git

# Or use Vercel web dashboard
```
