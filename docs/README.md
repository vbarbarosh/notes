# API

The server listens on port `3000` by default.

List endpoints respond with `{items, limit, offset, filters}`. `limit` and
`offset` are the applied values (`limit: 0` means unlimited), and `filters`
contains the normalized filters that were actually applied — not the raw
query input.

## Notes

```
GET /api/v1/notes                       List notes; optional ?q=, ?uid=, ?created_after=, ?created_before=, ?limit=, ?offset=
GET /api/v1/notes/:note_uid             Get a note and its files
POST /api/v1/notes {body}               Create a note
PATCH /api/v1/notes/:note_uid {body}    Replace the note body
DELETE /api/v1/notes/:note_uid          Move a note to trash
```

## Files

```
GET /api/v1/notes/:note_uid/files                  List files; optional ?q=, ?mime=, ?limit=, ?offset=
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
GET /api/v1/jobs                            List active, finished, and failed jobs; optional ?status=, ?bucket=, ?job_name=, ?note_uid=, ?limit=, ?offset=
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

# Adding standalone apps

Apps such as `pdf.html` and `api.html` are standalone pages, not iframes. Files
under `src/static/` are served from the site root, and the app launchers create
ordinary links from entries in `src/static/apps/apps.json`.

## Add a local app

1. Create the page. Use a root-level HTML file for a substantial standalone app:

   ```text
   src/static/my-app.html  ->  /my-app.html
   ```

   A small app may instead use its own directory:

   ```text
   src/static/apps/my-app/index.html  ->  /apps/my-app/
   ```

2. Register it in `src/static/apps/apps.json`:

   ```json
   {
     "id": "my-app",
     "name": "My App",
     "desc": "What the app does.",
     "icon": "ti ti-apps",
     "emoji": "🧩",
     "url": "/my-app.html"
   }
   ```

   - `id` must be a stable, unique slug.
   - `name` and `desc` are displayed on the app card.
   - `icon` is a Tabler Icons class used by `/apps2/`.
   - `emoji` is used by `/apps/`.
   - `url` should normally be an absolute site path beginning with `/`.
   - Catalog order controls card order.

3. Open `/apps/` or `/apps2/` and select the new card. No server route is needed for a static page.

A minimal page looks like this:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My App</title>
</head>
<body>
  <a href="/">Back to Notes</a>
  <main id="app"></main>
  <script>
    // The Notes APIs are available at same-origin /api/v1/* URLs.
  </script>
</body>
</html>
```

## Make an app note-aware

Pass the note UID in the URL, as the PDF app does:

```text
/my-app.html?note=20260718_120000
```

Read it and load the note with the API:

```js
const params = new URLSearchParams(location.search);
const note_uid = params.get('note');
if (!note_uid) throw new Error('Missing ?note=<note_uid>');

const response = await fetch(`/api/v1/notes/${note_uid}`);
if (!response.ok) throw new Error(`Could not load note: ${response.status}`);
const note = await response.json();
```

An app-catalog entry only launches the app; it cannot supply a particular note
UID. If the Notes page needs a per-note app button, add a link where that note
is rendered. The PDF link in `src/static/js/components/note-card.js` is the
current example.

`src/static/demo-browser.html` is a minimal working integration example. It
treats the note-root `README.md` as the note body and demonstrates listing,
uploading, editing, moving, and deleting files below `files/`. Uploads above
50 MB automatically use the chunked multipart upload API.

## Store app state in a note

Apps may store their settings and other private state under `apps/<app-name>/*`
in the note's file namespace. Use the app's stable catalog `id` as `<app-name>`
so different apps do not collide.

For example, the API file path:

```text
apps/my-app/settings.json
```

is stored on disk as `<note>/files/apps/my-app/settings.json`. The PDF app
follows this convention with paths such as `apps/pdf/_session.json` and
`apps/pdf/<pdf-path>.bookmarks.json`.

Use `PUT` when the app owns an exact path:

```js
function encode_path(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

const path = 'apps/my-app/settings.json';
const form = new FormData();
form.append('file', new Blob([JSON.stringify(state)], {
  type: 'application/json',
}), 'settings.json');

const response = await fetch(
  `/api/v1/notes/${note_uid}/files/${encode_path(path)}`,
  {method: 'PUT', body: form},
);
if (!response.ok) throw new Error(`Could not save state: ${response.status}`);
```

Read the state through the file API or resource route:

```js
const response = await fetch(
  `/r/${note_uid}/files/${encode_path(path)}`,
);
if (!response.ok) throw new Error(`Could not load state: ${response.status}`);
const state = await response.json();
```

## Link to a remotely hosted app

The catalog also accepts an absolute URL:

```json
{
  "id": "remote-app",
  "name": "Remote App",
  "desc": "Hosted outside Notes.",
  "icon": "ti ti-external-link",
  "emoji": "↗️",
  "url": "https://example.com/app/"
}
```

This navigates to the remote site; it does not embed it. A remote app cannot
use the same-origin Notes APIs unless the server explicitly permits its origin.
If API access is required, hosting the page under `src/static/` is the simplest
option.

## Checklist

- The page works at its direct URL.
- The catalog contains a unique `id` and the correct absolute `url`.
- Both `/apps/` and `/apps2/` show a usable card.
- Note UIDs are used directly; arbitrary file path segments are URL-encoded.
- App settings and state use `apps/<app-name>/*` file paths.
- The app handles API errors and missing note or file data.
- The layout remains usable on a narrow screen.
