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

Registration management reads the existing Google Form response tab named `Form Responses 1`. The admin page adds a `Follow-up status` column when the first status is saved. If that tab is renamed later, add the optional `REGISTRATIONS_SHEET_NAME` property with the new tab name. Renaming the overall spreadsheet file does not affect the service because it uses the spreadsheet ID.

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

The `Registrations` tab securely loads Google Form responses for the owner only. It supports search, status filtering, pagination and the follow-up states `New`, `Contacted`, `Enrolled` and `Closed`.

The `Approve student` action adds the registration's verified email to the active student list, marks the response as `Enrolled`, and sends one welcome email with the Student Login link. Welcome messages are sent strictly from `hello@universeofvivek.in`. The account that owns the Apps Script deployment must either be that Google Workspace account or have that address configured and verified under Gmail `Send mail as`. If the sender is unavailable, student access is still granted and the admin page reports that the welcome email was not sent.

Public registration also uses verified Google identity. The website makes the verified email read-only, and the Apps Script independently validates the Google access token before writing a response to `Form Responses 1`. An exact repeat for the same participant and verified email is blocked for 24 hours, and each verified account is limited to three registrations per hour. This still allows a parent to register siblings without permitting rapid anonymous spam.

## Student progress

Signed-in students can mark tutorials complete from the library or video player. The backend automatically creates a `Tutorial progress` tab in the student spreadsheet and stores completion by verified Google email and YouTube video ID. Progress follows the student across devices and can be undone at any time.

The private admin page summarizes this data for every approved student, including completed tutorials, completion percentage and the most recent completion activity. Revoked students keep their stored history in the Sheet so progress can resume if access is approved again later.
