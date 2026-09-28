![Notes — a minimal note-taking app backed by the file system](img/cover-light.png)

A minimal note-taking app backed by the file system.

Supports creating, editing, deleting, and listing notes.
Each note is stored as a directory with associated files.

## Demo

https://github.com/user-attachments/assets/15b29105-69e5-49c8-892c-4da7226dec2d

## Authentication

Natively supports [authwall](https://github.com/vbarbarosh/authwall) — a minimal login
gateway for protecting internal apps. Authwall sits in front of the app as a reverse
proxy, handles sign-in, and forwards each authenticated request with an `X-Auth-User`
header, which the app picks up as the current user.

The bundled `docker-compose.yaml` runs this setup out of the box:

    docker compose up
    # http://localhost:3000 — sign in via authwall (seed user foo, password foo)

## YouTube downloads

Add a YouTube link to a note, then open its **⋯** menu and choose **Download
YouTube video** (best quality, video and audio in one file) or **Extract YouTube
MP3**. Files appear as attachments
under `files/youtube/`. A downloaded video also brings its thumbnail, and its
title is added at the end of the note. Repeating a job skips existing files. A
running job shows live progress with speed and ETA.

See [YouTube setup and VPS troubleshooting](docs/youtube.md) for installation,
proxy/cookie configuration, and diagnosing downloads that work on a PC but fail
on a server.

## Facebook reels

Add a Facebook reel link (`facebook.com/reel/<id>`, a `facebook.com/share/r/…`
share link or `fb.watch/…`) to a note, then choose **Download Facebook reel** in
its **⋯** menu. The reel and its thumbnail land under `files/facebook/`, and its
caption is added at the end of the note; a reel without a caption gives its
title instead, without the view and reaction counters. The job uses yt-dlp with
the same proxy, cookie and config settings as the YouTube jobs.
