# Instagram AI DM Reply Backend

A modular Node.js/Express backend starter using MongoDB/Mongoose, Instagram API with Instagram Login, Instagram webhooks, and Google Gemini.

## What it does

1. Starts Instagram Login at `GET /api/instagram/connect`.
2. Handles OAuth callback and stores the connected Instagram account in MongoDB.
3. Verifies Meta webhook subscriptions at `GET /api/instagram/webhook`.
4. Receives Instagram messaging events at `POST /api/instagram/webhook`.
5. Generates a concise answer with Gemini using `business.config.js`.
6. Sends the answer through Instagram's messaging endpoint.
7. Stores incoming and outgoing message records and prevents duplicate inbound event processing.

## Important requirements

- Use an Instagram **Professional** account (Business or Creator).
- Create/configure a Meta app for **Instagram API with Instagram Login**.
- Configure the exact OAuth redirect URI from `.env`.
- Request the permissions required by your use case, including `instagram_business_basic` and `instagram_business_manage_messages`.
- Configure the webhook `messages` field and subscribe the Instagram professional account.
- Meta app roles / testers and App Review / Advanced Access may be required before serving accounts outside your app roles.
- Instagram messaging is subject to Meta's messaging eligibility and messaging-window policies. This starter replies only to incoming message events; it is not for unsolicited outreach.
- Verify the current API version and endpoint requirements in Meta's official documentation before production. The `.env.example` version is a configurable starting value, not a guarantee that Meta will keep that version available.

Official docs:
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- https://developers.facebook.com/docs/graph-api/webhooks/

## 1. Install

Use Node.js 20+.

```bash
npm install
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill every required `.env` value. Never commit `.env`.

## 2. Configure MongoDB

Set `MONGO_URI` to your local MongoDB URI or MongoDB Atlas connection string.

## 3. Configure Gemini

Set `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-2.5-flash`.

Test Gemini independently:

```bash
npm run test:ai -- "Bhai, aap kya services provide karte ho?"
```

## 4. Configure Meta / Instagram

In Meta Developer Dashboard:
1. Create or open your app and add/configure Instagram API with Instagram Login.
2. Add the exact `IG_REDIRECT_URI` to the valid OAuth redirect URI list.
3. Add the permissions needed for login and messaging.
4. Configure the webhook callback URL:
   `https://YOUR_PUBLIC_HTTPS_HOST/api/instagram/webhook`
5. Set the webhook verify token to the exact `IG_WEBHOOK_VERIFY_TOKEN`.
6. Subscribe to the `messages` webhook field and subscribe the connected Instagram account where the dashboard/API flow requires it.
7. Add tester roles and complete required review/access steps for your intended users.

The OAuth redirect URI and webhook callback URL are different URLs:
- OAuth: `/api/instagram/callback`
- Webhook: `/api/instagram/webhook`

For local testing, expose port 3000 with ngrok and update both URLs in Meta and `.env`. Ngrok URLs can change; update Meta settings and `.env` whenever the URL changes.

## 5. Start

```bash
npm run dev
```

Health check:

```text
http://localhost:3000/health
```

Start OAuth by opening the **ngrok host** (not localhost) so the OAuth state cookie is set on the same host that receives the callback:

```text
https://YOUR_PUBLIC_HTTPS_HOST/api/instagram/connect
```

For this local starter, use the same ngrok hostname for `/api/instagram/connect` and `/api/instagram/callback`. If you start OAuth on `localhost` but Meta returns to the ngrok hostname, the session cookie will not match and OAuth state validation will fail.

This starter stores OAuth state in an in-memory Express session store for local development. Before production, configure a persistent session store and HTTPS cookies.

## 6. Webhook local testing

Meta must be able to reach the public HTTPS webhook URL. Configure the callback URL in Meta as:

```text
https://YOUR_PUBLIC_HTTPS_HOST/api/instagram/webhook
```

Verify token must match `IG_WEBHOOK_VERIFY_TOKEN`.

## Security / production checklist

- Replace Express MemoryStore with a persistent session store.
- Use HTTPS and secure cookies in production.
- Restrict CORS to the exact frontend origin.
- Store access tokens encrypted; set `TOKEN_ENCRYPTION_KEY`.
- Implement account ownership/authentication before exposing account-management endpoints.
- Add token expiry/refresh handling and reconnect flows.
- Add queue/retry handling for Gemini and Meta API transient failures.
- Monitor webhook failures and preserve raw event IDs for deduplication.
- Confirm the exact API version, permission names, webhook subscription steps, and response payload fields against Meta's current docs.
- Do not expose tokens, secrets, or raw provider errors to the browser.

## Business configuration

Edit `src/config/business.config.js` with verified business details. Do not add guesses. Empty product/pricing arrays intentionally cause the AI to ask the customer for details or offer human follow-up.

## Notes

This is a backend starter, not a Meta-approved app or a guarantee of account eligibility. OAuth credentials, webhook subscription, app roles, permissions, and Meta review are external setup steps.
