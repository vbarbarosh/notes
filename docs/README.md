# API

The server listens on port `3000` by default.

## Notes

| Method | Path | Input | Description |
| --- | --- | --- | --- |
| `GET` | `/api/v1/notes` | — | List notes. |
| `GET` | `/api/v1/notes/:note_uid` | — | Get a note and its files. |
| `POST` | `/api/v1/notes` | JSON `{body}` | Create a note. |
| `PATCH` | `/api/v1/notes/:note_uid` | JSON `{body}` | Replace the note body. |
| `DELETE` | `/api/v1/notes/:note_uid` | — | Move a note to trash. |
| `POST` | `/api/v1/notes/:note_uid/files` | Multipart `file`; optional `?overwrite=1` | Upload a file. |
| `DELETE` | `/api/v1/notes/:note_uid/files/*` | — | Move a file to trash. |

## Chunked uploads

| Method | Path | Input | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/files/upload/start` | JSON `{filename, total_chunks, total_size}` | Start an upload. |
| `POST` | `/api/v1/files/upload/:upload_id/chunk/:chunk_index` | Multipart `chunk` | Upload one chunk. |
| `POST` | `/api/v1/files/upload/:upload_id/assemble` | JSON `{note_uid, overwrite}` | Assemble and store the file. |

## Jobs

| Method | Path | Input | Description |
| --- | --- | --- | --- |
| `GET` | `/api/v1/jobs` | — | List active, finished, and failed jobs. |
| `GET` | `/api/v1/jobs/events` | — | Subscribe to job events using SSE. |
| `POST` | `/api/v1/jobs/:job_name` | JSON `{note_uid}` | Start a job. |
| `POST` | `/api/v1/jobs/:job_uid/confirm` | — | Confirm a finished or failed job. |
| `WS` | `/api/v1/jobs/:job_uid/tty` | JSON messages | Connect to an interactive terminal job. |

## Resource routes

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/r/*.meta` | Get stored-file metadata. |
| `GET` | `/r/:note_uid` | Open the single-note page. |
| `GET` | `/r/*` | Read note resources and files. |
| `GET` | `/t/:size/*` | Get an image thumbnail (`size`: 32–2048). |
