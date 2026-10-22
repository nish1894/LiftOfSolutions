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
- RAG health: `http://localhost:8010/health`
- Firebase Emulator UI: `http://localhost:4000`

The Docker setup uses local Firebase Auth and Firestore emulators. It builds the
sibling `../LiftOff-Sol-Rag` repository as a read-only source dependency and
connects Node to its FastAPI service. Local RAG data uses the RAG service's test
chunk store; no Pinecone key is required for this mode.

The backend owns the integration adapter. The RAG repository is not modified by
this project.

## Local development

Node 18 is too old for this project. Use Node 24:

```bash
nvm install 24
nvm use 24
docker compose up -d firebase-emulator redis rag-service rag-files
```

Run the API:

```bash
cd platform-api
npm ci
FIREBASE_PROJECT_ID=liftofsolutions-123 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
AI_SERVICE_MODE=rag \
AI_SERVICE_URL=http://127.0.0.1:8010 \
AI_SERVICE_SERVER_ID=chatbot-platform \
AI_SERVICE_API_KEY=replace-with-the-rag-server-secret \
AI_SERVICE_DOCUMENT_BASE_URL=http://127.0.0.1:8081 \
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
