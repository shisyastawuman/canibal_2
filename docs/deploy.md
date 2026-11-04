# Deploying Caníbal

The match lives on the server. Phones only send commands and receive the view they are allowed to see. Fifty people in one room is a small load. What has to hold up is a shared match, concurrent votes, and coming back after a phone drops.

One Cloud Run service serves both the site and the API. Firestore stores the match, so a restarted instance does not forget it. The facilitator id and the player email are the way back in. Both are kept in the browser's `localStorage`.

## Run it on this computer

```powershell
npm install
npm start
```

The API listens on port 8080 and, after `npm run build`, also serves `dist/`. For development, `npm run dev` starts the API and Vite together. Vite proxies `/api` to port 8080.

Local data is `data/session.json` (`STORE=file`). Set `STORE=memory` for a process that forgets everything on exit.

## Stress test

With the server already running:

```powershell
npm run stress
```

That drives 50 players against `http://127.0.0.1:8080`: they join together, bid together, and vote together. The run fails if a bid or a vote disappears, if a phone can see someone else's vote or the facilitator id, or if the same email or facilitator id cannot re-enter. `npm test` runs the same scenario against an in-memory server.

`STRESS_URL` points the script at another host. `STRESS_PLAYERS` changes the roster (7 to 60).

## First-time Google Cloud setup

Do this once per project. Replace `PROJECT_ID`. The Firestore location cannot be changed later; `southamerica-east1` is the right region for a room in Argentina.

```powershell
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com firestore.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
gcloud firestore databases create --location=southamerica-east1 --type=firestore-native
```

If the database already exists, skip the last command.

Cloud Run's default service account needs to read and write Firestore. `PROJECT_NUMBER` is on the project's welcome page, or from `gcloud projects describe PROJECT_ID --format="value(projectNumber)"`.

```powershell
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/datastore.user"
```

## Deploy and redeploy

From the repository root, the same command creates the service and ships later versions:

```powershell
gcloud run deploy canibal --source . --region southamerica-east1 --allow-unauthenticated --min-instances 1 --max-instances 4 --memory 512Mi --timeout 60 --set-env-vars STORE=firestore
```

`--min-instances 1` keeps one instance warm so the first tap of the evening is not a cold start. That instance is billed while it exists. `--max-instances 4` is plenty for one room. Firestore transactions, not the instance memory, are what keep two votes from erasing each other.

The command prints an `https://canibal-....run.app` URL. Open that URL. It is the facilitator home, the player links, and the public screen.

To ship a code change, run the same `gcloud run deploy` command again.

Useful follow-ups, still from Cloud Run:

- Custom domain: `gcloud run domain-mappings` or a load balancer in front of the service.
- Logs: `gcloud run services logs read canibal --region southamerica-east1`.

## Environment variables

| Name | Meaning |
| --- | --- |
| `PORT` | Set by Cloud Run. Local default is 8080. |
| `STORE` | `firestore` in production, `file` locally, `memory` for tests. |
| `DATA_FILE` | Path for `STORE=file`. Default `data/session.json`. |
| `CORS_ORIGIN` | Comma-separated origins allowed to call the API from another host. Leave unset when the site and the API share the Cloud Run URL. |
| `VITE_API_URL` | Baked into the frontend at build time. Leave unset for same-origin. Set it to the Cloud Run URL only when the site is hosted somewhere else. |

## Hosting the site somewhere else

The supported setup is the single Cloud Run URL. A separate static host (FTP, a bucket, Firebase Hosting) has to do three things the Cloud Run service already does:

1. Serve the site over HTTPS.
2. Serve `index.html` for `/j/CODE`, `/m/CODE`, and `/p/CODE`.
3. Call the API on another origin.

Build with the API URL set, then upload the contents of `dist/`:

```powershell
$env:VITE_API_URL = "https://canibal-XXXX.run.app"
npm run build
```

Redeploy the API with `CORS_ORIGIN` set to the site's origin, for example `https://training.example.com`. Rebuild the site whenever `VITE_API_URL` changes.

## Coming back after a drop

- A player reopens `/j/CODE`. The browser still has their email. If it does not, they enter the same email on the "already registered" form. The email is the identity. Anyone who knows it can re-enter as that player.
- The facilitator reopens `/m/CODE` on the same browser, or pastes the facilitator id shown on the console. Deadlines still close if that phone is gone. Starting the next clock, the bonus, and the next round wait until the facilitator is back.
- The public screen is only `/p/CODE`. A refresh is enough.

The server clock is the one that closes a phase. Phones display the deadline and catch up when they can see the server again.
