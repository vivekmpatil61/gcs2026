const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const DEFAULT_STUDENTS_SHEET = 'Distribution list';

function doGet() {
  return jsonResponse_({ ok: true, service: 'gcs-tutorial-access', version: 2 });
}

function doPost(event) {
  try {
    const accessToken = String((event && event.parameter && event.parameter.accessToken) || '').trim();
    if (!accessToken) {
      return jsonResponse_({ approved: false, code: 'missing_token' });
    }

    const user = verifyGoogleToken_(accessToken);
    if (!user.email || user.email_verified !== true) {
      return jsonResponse_({ approved: false, code: 'unverified_email' });
    }

    const email = normalizeEmail_(user.email);
    if (!isActiveStudent_(email)) {
      return jsonResponse_({ approved: false, code: 'not_registered' });
    }

    return jsonResponse_({
      approved: true,
      user: {
        email: email,
        givenName: String(user.given_name || ''),
        picture: String(user.picture || '')
      },
      expiresIn: 3000,
      tutorials: getTutorials_()
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ approved: false, code: 'authorization_failed' });
  }
}

function getTutorials_() {
  const rawCatalog = PropertiesService.getScriptProperties().getProperty('TUTORIAL_CATALOG_JSON');
  if (!rawCatalog) {
    throw new Error('TUTORIAL_CATALOG_JSON is not configured.');
  }

  const tutorials = JSON.parse(rawCatalog);
  if (!Array.isArray(tutorials) || tutorials.length === 0) {
    throw new Error('The tutorial catalogue is empty or invalid.');
  }

  return tutorials.map(function(tutorial) {
    return {
      id: String(tutorial.id || ''),
      number: String(tutorial.number || ''),
      title: String(tutorial.title || '')
    };
  }).filter(function(tutorial) {
    return tutorial.id && tutorial.number && tutorial.title;
  });
}

function verifyGoogleToken_(accessToken) {
  const response = UrlFetchApp.fetch(GOOGLE_USERINFO_URL, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('Google rejected the access token.');
  }

  return JSON.parse(response.getContentText());
}

function isActiveStudent_(email) {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('STUDENTS_SPREADSHEET_ID');
  const sheetName = properties.getProperty('STUDENTS_SHEET_NAME') || DEFAULT_STUDENTS_SHEET;

  if (!spreadsheetId) {
    throw new Error('STUDENTS_SPREADSHEET_ID is not configured.');
  }

  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Student access sheet was not found: ' + sheetName);
  }

  const rows = sheet.getDataRange().getDisplayValues();
  if (rows.length === 0) return false;

  const headers = rows[0].map(function(value) { return String(value).trim().toLowerCase(); });
  const emailColumn = headers.indexOf('email');
  const statusColumn = headers.indexOf('status');

  if (emailColumn !== -1 && statusColumn !== -1) {
    return rows.slice(1).some(function(row) {
      return normalizeEmail_(row[emailColumn]) === email &&
        String(row[statusColumn]).trim().toLowerCase() === 'active';
    });
  }

  const approvedEmails = String(rows[0][0] || '')
    .split(',')
    .map(normalizeEmail_)
    .filter(Boolean);

  return approvedEmails.indexOf(email) !== -1;
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
