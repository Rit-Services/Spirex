# Storage (attachments & uploads)

SPIREX stores issue attachments and inline media through one pluggable adapter, selected by `STORAGE_DRIVER`.

| `STORAGE_DRIVER` | Backend |
|---|---|
| `local` (default) | Files on disk under `UPLOADS_DIR` |
| `minio` | S3-compatible object store (MinIO) |
| `s3` | AWS S3 (same code path as MinIO) |

Files are always streamed **through the app** (`/api/attachments/...`) — SPIREX does not hand out direct/presigned bucket URLs, so the bucket can stay private.

## Local disk (default)

```bash
STORAGE_DRIVER=local
UPLOADS_DIR=./uploads     # persisted on the `server_uploads` docker volume
```

Nothing else to configure. Good for single-node deployments.

## MinIO

Run MinIO (the compose file ships an optional `minio` service — `docker compose --profile minio up -d`), then:

```bash
STORAGE_DRIVER=minio
MINIO_ENDPOINT=http://minio:9000      # or your MinIO URL
MINIO_BUCKET=spirex                   # must already exist
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_REGION=us-east-1
MINIO_FORCE_PATH_STYLE=true           # keep true for MinIO
```

**Create the bucket first** (the app does not create it). With the MinIO client:

```bash
mc alias set local http://localhost:9000 <access> <secret>
mc mb local/spirex
```

## AWS S3

The same adapter talks to AWS S3 — set a real region and switch off path-style:

```bash
STORAGE_DRIVER=s3
MINIO_ENDPOINT=https://s3.eu-central-1.amazonaws.com
MINIO_BUCKET=my-spirex-bucket
MINIO_ACCESS_KEY=AKIA...
MINIO_SECRET_KEY=...
MINIO_REGION=eu-central-1
MINIO_FORCE_PATH_STYLE=false          # vhost-style for AWS
```

> The env vars keep the `MINIO_` prefix even for AWS — they're the shared S3 client settings, not MinIO-specific.

The server verifies the bucket is reachable at startup (see the "Storage" line in the boot health check).
