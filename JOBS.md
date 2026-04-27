# Jobs Architecture

This document is the specification for background jobs in the notes app.

Jobs are asynchronous actions that run against a note. Each job is executed as a
separate process, has a dedicated working directory, and reports its state
through a required `status.json` file.

## Storage Layout

Jobs are stored under `data/jobs/`.

```text
data/jobs/
  active/
    20260427_121500-youtube-thumbnails/
      status.json
      tmp/
  finished/
  failed/
  confirmed/
```

Each job run gets its own directory. The directory name is the job `uid`.

Suggested `uid` format:

```text
<timestamp>-<job_name>
```

Example:

```text
20260427_121500-youtube-thumbnails
```

## Job Status File

`status.json` is special and required. Every job directory must contain it.

Example:

```json
{
  "pid": 12345,
  "uid": "20260427_121500-youtube-thumbnails",
  "note_uid": "20260427_120000",
  "job_name": "youtube-thumbnails",
  "status": "running",
  "user_friendly_status": "Connecting...",
  "created_at": "2026-04-27T12:15:00.000Z",
  "started_at": "2026-04-27T12:16:00.000Z",
  "finished_at": null
}
```

Fields:

- `pid`: operating system process id for the running job process.
- `uid`: unique id for this job run.
- `note_uid`: note id the job is working on.
- `job_name`: name of the job handler.
- `status`: machine-readable status.
- `user_friendly_status`: short status text suitable for the UI.
- `created_at`: timestamp when the job was created.
- `started_at`: timestamp when the process started.
- `finished_at`: timestamp when the process finished, or `null`.

## Status Values

Initial status values:

- `queued`: job directory exists, but the process has not started yet.
- `running`: job process is active.
- `finished`: job process completed successfully.
- `failed`: job process failed.

## Handler Layout

Job handlers live under:

```text
src/jobs/<job_name>/
```

Each handler is self-contained and exposes an executable:

```text
src/jobs/<job_name>/bin/run
```

Example:

```text
src/jobs/youtube-thumbnails/bin/run
```

## Handler Execution Contract

The app executes a job handler as a separate process.

Working directory:

```text
data/jobs/active/<job_uid>/
```

Command:

```text
src/jobs/<job_name>/bin/run <note_path>
```

The only argument is the path to the note.

Example:

```text
src/jobs/youtube-thumbnails/bin/run data/notes/20260427_120000
```

The note path will always look like:

```text
data/notes/<note_uid>
```

## Job Lifecycle

New jobs are created under:

```text
data/jobs/active/
```

When a job process exits successfully, its directory is moved to:

```text
data/jobs/finished/
```

When a job process fails, its directory is moved to:

```text
data/jobs/failed/
```

After the user reviews a completed or failed job, the job can be manually marked
as confirmed. Confirmed jobs are moved to:

```text
data/jobs/confirmed/
```

This manual confirmation step exists so the user has a chance to see whether a
job completed or failed before it disappears from active attention.

## Polling

The first version uses polling.

The UI should poll job directories and show discovered jobs grouped by status.
The backend can implement this by scanning:

```text
data/jobs/active/*/status.json
data/jobs/finished/*/status.json
data/jobs/failed/*/status.json
```

Each returned job should include both the parsed `status.json` fields and the
current lifecycle bucket: `active`, `finished`, or `failed`.

Confirmed jobs are intentionally not returned to the frontend.

## Temporary Files

Each job may create temporary files inside its own working directory.

Suggested layout:

```text
data/jobs/active/<job_uid>/tmp/
```

Temporary files must not be written outside the job directory.

## Note Output Files

Final user-visible files produced by a job should be written into the note's
`files/` directory.

Example:

```text
data/notes/<note_uid>/files/youtube/<video_id>.jpg
```

## First Job: YouTube Thumbnails

Job name:

```text
youtube-thumbnails
```

Handler:

```text
src/jobs/youtube-thumbnails/bin/run
```

Behavior:

1. Read the note body from `README.md`.
2. Extract YouTube video ids from links.
3. Download thumbnails into the job working directory.
4. Validate downloaded files as images.
5. Write final thumbnails into the note's `files/` directory.

Suggested final layout:

```text
data/notes/<note_uid>/files/youtube/<video_id>.jpg
```

Suggested temporary layout:

```text
data/jobs/active/<job_uid>/tmp/<video_id>.jpg
```

The job should be idempotent at the output-file level. If the final thumbnail
already exists, the job should skip it instead of creating a duplicate.

## Second Job: YouTube MP3

Job name:

```text
youtube-mp3
```

Handler:

```text
src/jobs/youtube-mp3/bin/run
```

Behavior:

1. Read the note body from `README.md`.
2. Extract YouTube video ids from links.
3. Use `yt-dlp` and `ffmpeg` to extract MP3 audio.
4. Write temporary downloads into the job working directory.
5. Write final MP3 files into the note's `files/` directory.

Required external commands:

```text
yt-dlp
ffmpeg
```

Suggested final layout:

```text
data/notes/<note_uid>/files/youtube/<video_id>.mp3
```

Suggested temporary layout:

```text
data/jobs/active/<job_uid>/tmp/<video_id>.mp3
```

The job should be idempotent at the output-file level. If the final MP3 already
exists, the job should skip it instead of creating a duplicate.

## Safety Rules

- Every job must have `status.json`.
- Each job run must have its own directory.
- Job handlers must run as separate processes.
- A handler receives only the note path as an argument.
- Temporary files must stay inside the job working directory.
- Final user-visible artifacts must go under the note's `files/` directory.
- Failed jobs should keep their directory for debugging.
- Jobs must be moved through lifecycle buckets instead of being deleted
  automatically.
