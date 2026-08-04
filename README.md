# Graphite & Charcoal Studio

This repository contains the public studio website, the private owner dashboard, and the Google Apps Script backend used for registration and tutorial access.

## Main components

### Website

`index.html` contains the public website. It uses:

- HTML for the page content and registration form
- CSS for the visual design and responsive layouts
- JavaScript for Google Sign-In, registration, tutorial access, video playback and progress controls

The website is hosted as a static site on GitHub Pages. It does not store passwords or make access decisions by itself.

### Admin dashboard

`admin.html` is the owner dashboard. It provides tools for:

- Adding, refreshing, reordering and removing YouTube tutorials
- Approving or revoking student access
- Reviewing registrations and changing their follow-up status
- Approving a registration with one action
- Viewing tutorial progress by student
- Searching and paginating longer lists

The page can be opened publicly, but its data and actions are protected by Google Sign-In. The backend permits only the configured owner account.

### Google Sign-In

Google Sign-In verifies the identity of students and the owner. Google gives the website a temporary access token after sign-in. The website sends that token to Apps Script, which independently verifies it with Google and obtains the verified email address.

The website never receives or stores a Google password.

### Google Apps Script

`google-apps-script/Code.gs` is the secure backend. It runs on Google's servers and:

- Verifies Google access tokens
- Validates and stores registrations
- Blocks duplicate and excessive registration attempts
- Checks whether a student is approved
- Reads and updates the approved student list
- Manages the tutorial catalogue
- Stores tutorial completion progress
- Restricts admin actions to the configured owner
- Sends welcome emails after approval

The accompanying `appsscript.json` file defines the permissions required by the backend.

### Google Sheets

The Google Sheet acts as the database. The main tabs are:

- `Form Responses 1` - registration details and follow-up status
- `Distribution list` - approved student email addresses
- `Tutorial progress` - student name, verified email, episode number, video ID, title and completion date

Apps Script uses the spreadsheet ID rather than its visible filename. Renaming the spreadsheet file does not break the integration.

### YouTube

Tutorial videos are hosted as unlisted YouTube videos. The owner enters a YouTube ID in the admin dashboard. Apps Script retrieves the title, adds the video to the catalogue and calculates its episode number.

Unlisted YouTube videos provide reasonable privacy, but they are not DRM. Someone with a video link can still share it or record their screen.

### Gmail

Welcome emails are sent only from `hello@universeofvivek.in`. The Apps Script owner account must have this address configured and verified under Gmail `Send mail as`.

If email delivery fails, student access remains active and the admin dashboard displays a warning.

## Registration flow

1. The participant signs in with Google.
2. Google provides a temporary identity token.
3. Apps Script verifies the token and verified email.
4. The participant completes the registration form.
5. Apps Script validates the submitted information.
6. The response is added to `Form Responses 1`.
7. The response becomes available in the Registrations tab of the admin dashboard.

Exact repeated registrations are blocked for 24 hours. A verified account is limited to three registrations per hour so a parent can register siblings without allowing rapid anonymous spam.

## Approval flow

1. The owner opens the Registrations tab.
2. The owner selects `Approve student`.
3. Apps Script adds the verified email to `Distribution list` as Active.
4. The registration is marked `Enrolled`.
5. The student receives access to the tutorial library.
6. One welcome email is sent with the Student Login link.

Repeated approval does not create duplicate access or send a duplicate welcome email.

## Student access flow

1. The student opens Student Login and signs in with Google.
2. Apps Script verifies the temporary token.
3. Apps Script checks the verified email against `Distribution list`.
4. Active students receive the current tutorial catalogue and saved progress.
5. Other accounts are denied access.

The tutorial catalogue is returned only after successful server-side approval. It is not stored directly in the public website HTML.

## Progress flow

1. An approved student marks a tutorial complete.
2. Apps Script confirms that the video belongs to the published catalogue.
3. The student name, verified email, episode number, video ID, title and completion time are stored in `Tutorial progress`. The verified email is shown as the student label when no registration name is available.
4. The saved progress follows the student across devices.
5. The admin dashboard calculates completion totals and percentages.

Revoking access does not delete progress. It becomes available again if access is restored later.

## Security model

- Google verifies identities.
- Apps Script makes all access decisions.
- Only verified and active student emails receive the tutorial catalogue.
- Only the configured owner email can use admin operations.
- Registration input is validated again on the server.
- Private catalogue data and configuration values must not be committed to the public repository.

## Private configuration

Apps Script deployment IDs, spreadsheet IDs, private catalogue data and other sensitive operational values should not be added to this README.

The ignored file `google-apps-script/tutorial-catalog.private.json` is local configuration and must never be committed.

More detailed backend setup and deployment instructions are available in [google-apps-script/README.md](google-apps-script/README.md).
