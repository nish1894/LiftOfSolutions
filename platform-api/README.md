# Node Platform API

Fastify/TypeScript modular monolith for ERP-CHATBOT. Node 24 or newer is required.

```bash
npm ci
FIREBASE_PROJECT_ID=liftofsolutions-123 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
npm run dev
```

Important scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run with TypeScript watch mode |
| `npm run build` | Strict TypeScript compilation |
| `npm start` | Run compiled API |
| `npm test` | Run Vitest |

Main compatible route groups:

- `/api/v1/auth`
- `/api/v1/businesses/:businessId/assistants`
- `/api/v1/businesses/:businessId/customers`
- `/api/v1/businesses/:businessId/conversations`
- `/api/v1/businesses/:businessId/channels`
- `/api/v1/businesses/:businessId/knowledge`
- `/api/v1/businesses/:businessId/tools`
- `/api/v1/businesses/:businessId/analytics`
- `/api/v1/businesses/:businessId/integrations`
- `/api/v1/businesses/:businessId/billing`
- `/api/v1/widget/:publicChannelId`

`/organizations` aliases `/businesses`, and `/agents` aliases `/assistants`, allowing gradual frontend vocabulary migration.

Errors use:

```json
{
  "error": {
    "code": "permission_denied",
    "message": "You do not have permission to perform this action.",
    "request_id": "...",
    "details": {}
  }
}
```

Never add RAG algorithms here. Extend `src/ai-gateway` when the external Python service contract changes.

Firebase Authentication owns identity. Cloud Firestore owns persistence. All
Firestore access uses Admin SDK after the API verifies a bearer ID token and
loads the organization membership.
