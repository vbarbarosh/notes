# API

The server listens on port `3000` by default.

## Notes

```
GET /api/v1/notes                       List notes
GET /api/v1/notes/:note_uid             Get a note and its files
POST /api/v1/notes {body}               Create a note
PATCH /api/v1/notes/:note_uid {body}    Replace the note body
DELETE /api/v1/notes/:note_uid          Move a note to trash
```

## Files

```
GET /api/v1/notes/:note_uid/files                  List files
POST /api/v1/notes/:note_uid/files {file}          Upload a multipart file; optional ?overwrite=1
HEAD /api/v1/notes/:note_uid/files/*               Get file headers
GET /api/v1/notes/:note_uid/files/*                Read a file
PUT /api/v1/notes/:note_uid/files/* {file}         Create or replace an exact path
PATCH /api/v1/notes/:note_uid/files/* {path}       Rename or move a file
DELETE /api/v1/notes/:note_uid/files/*             Move a file to trash
```

## Chunked uploads

```
Start an upload
POST /api/v1/files/upload/start {filename, total_chunks, total_size}

Upload a multipart chunk
POST /api/v1/files/upload/:upload_id/chunk/:chunk_index {chunk}

Assemble and store the file
POST /api/v1/files/upload/:upload_id/assemble {note_uid, overwrite}
```

## Jobs

```
GET /api/v1/jobs                            List active, finished, and failed jobs
GET /api/v1/jobs/events                     Subscribe to job events using SSE
POST /api/v1/jobs/:job_name {note_uid}      Start a job
POST /api/v1/jobs/:job_uid/confirm          Confirm a finished or failed job
WS /api/v1/jobs/:job_uid/tty                Connect to an interactive terminal job
```

## Resource routes

```
GET /r/*.meta       Get stored-file metadata
GET /r/:note_uid    Open the single-note page
GET /t/:size/*      Get an image thumbnail; size must be 32–2048
GET /r/*            Read note resources and files
```
