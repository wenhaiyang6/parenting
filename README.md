# BabyWise App

## Development Setup

1. Install dependencies:
```bash
npm run install:all
```

2. Set up environment variables:
   - Copy `.env.example` to `.env` in both client and server directories
   - Fill in the required values

3. Start development servers:
```bash
npm run dev
```

## Production Deployment

### Frontend (Vercel/Netlify)
1. Set environment variables in your hosting platform:
   - `REACT_APP_API_URL`: Your production API URL

2. Deploy the `client` directory

### Backend (Heroku/Railway)
1. Set environment variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `FRONTEND_URL`: Your production frontend URL

2. Deploy the `server` directory 