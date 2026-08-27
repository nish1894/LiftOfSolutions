# ERP-CHATBOT

Multi-tenant AI customer-service platform using React/Vite, Node.js/Fastify, Firebase Authentication, and Cloud Firestore.

Node owns organization permissions, business logic, persistence, usage, billing metadata, audit, and the external Python AI/RAG boundary. The browser uses Firebase only to authenticate.

## Run with Docker

Start Docker Desktop, then run:

```bash
cp .env.example .env
docker compose up --build
```

Open:

- Platform: `http://localhost:5173`
- API health: `http://localhost:8000/health`
- Firebase Emulator UI: `http://localhost:4000`

The Docker setup uses local Firebase Auth and Firestore emulators. Create an email/password account in the app. The default AI adapter is deterministic and requires no Python service.

## Local development

Node 18 is too old for this project. Use Node 24:

```bash
nvm install 24
nvm use 24
docker compose up -d firebase-emulator redis
```

Run the API:

```bash
cd platform-api
npm ci
FIREBASE_PROJECT_ID=liftofsolutions-123 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
npm run dev
```

Run the frontend in another terminal:

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

See [the original platform design](./AI_Customer_Service_Platform_System_Design_Updated.md)
for the product and system design this implements.

Detailed setup notes, the Firestore schema, the migration map, and the current
project status live in `untracked/`, which is git-ignored and local to each
machine.
