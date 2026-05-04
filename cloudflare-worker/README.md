# PopAuraStream Chatbot - Optional Cloudflare Worker

This folder contains an optional Cloudflare Worker template that can proxy requests to the Gemini API.

The deployed PopAuraStream GitHub Pages site does not require this worker. AuraBot currently works directly in the Angular app with TMDB-powered critic-style recommendations, comparisons, and lookups.

The worker template uses `gemini-2.5-pro` for stronger comparison and critic-style reasoning when you choose to connect a private API key through Cloudflare.

## Deployment Instructions

### Option 1: Cloudflare Dashboard (Recommended for quick setup)

1. Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com/)
2. Sign up or log in to your account
3. Click "Workers & Pages" → "Create Worker"
4. Name your worker: `popaurastream-chatbot`
5. Copy the contents of `worker.js` and paste it into the editor
6. Click "Save and Deploy"
7. Your endpoint will be: `https://popaurastream-chatbot.<your-subdomain>.workers.dev`

### Option 2: Using Wrangler CLI

1. Install Wrangler:
   ```bash
   npm install -g wrangler
   ```

2. Authenticate:
   ```bash
   wrangler login
   ```

3. Create wrangler.toml:
   ```toml
   name = "popaurastream-chatbot"
   main = "worker.js"
   compatibility_date = "2024-01-01"
   ```

4. Deploy:
   ```bash
   wrangler deploy
   ```

## Configuration

After deploying, paste your worker endpoint into `src/environments/environment.ts` if you want Gemini-powered responses:

```typescript
chatbotWorkerUrl: 'https://popaurastream-chatbot.<your-subdomain>.workers.dev'
```

## Security Notes

- The API key is stored in the worker, not exposed to the client
- CORS is configured to allow requests from any origin (adjust as needed)
- Rate limiting can be added through Cloudflare's dashboard

## API Reference

**POST /**

Request body:
```json
{
  "systemPrompt": "You are AuraBot...",
  "messages": [
    { "role": "user", "parts": [{ "text": "Compare Inception and Interstellar" }] }
  ]
}
```

Response:
```json
{
  "response": "**Verdict:** Interstellar wins for emotional scale..."
}
```
