# Secure tutorial access service

This Apps Script replaces the current email-only approval endpoint.

## Sheet setup

The current `Distribution list` tab is supported as-is. Its cell A1 can contain the comma-separated approved email list.

For easier management later, the script also supports a tab with these headers:

| Email | Status |
| --- | --- |
| student@example.com | Active |

Only rows whose status is exactly `Active` receive the tutorial catalogue.

## Script property

In Apps Script, open Project Settings and add:

- Property: `STUDENTS_SPREADSHEET_ID`
- Value: the ID between `/d/` and `/edit` in the Google Sheet URL
- Property: `TUTORIAL_CATALOG_JSON`
- Value: the complete JSON array from the local `tutorial-catalog.private.json` file
- Property: `ADMIN_EMAIL`
- Value: the Google account allowed to manage tutorials, currently `vivekmpatil61@gmail.com`

Set `STUDENTS_SHEET_NAME` to `Distribution list` for the current Sheet. It can point to a different tab name later.

## Deployment

1. Replace the existing Apps Script code with `Code.gs`.
2. Enable the manifest file and replace it with `appsscript.json`.
3. Deploy as a web app.
4. Execute as yourself.
5. Allow access to anyone, because identity is verified from the Google token inside the script.
6. Copy the new `/exec` URL into the website's `SCRIPT_URL` value.

Do not activate the matching website change until this endpoint is deployed and tested.

The private catalogue file is ignored by Git and must never be committed to the public website repository.

## Tutorial admin

The website includes an unlinked `admin.html` page. The owner signs in with Google and submits only a YouTube ID or full YouTube link. The Apps Script verifies the owner email, fetches the title from YouTube, derives the thumbnail, assigns the next episode number, and updates `TUTORIAL_CATALOG_JSON`.

The admin can also move tutorials up or down, refresh a YouTube title, and delete a tutorial. Episode numbers are recalculated after every change.

The same admin page lists approved student emails. Adding or revoking an email updates the existing `Distribution list` Sheet immediately, so the owner no longer needs to edit the Sheet manually.
