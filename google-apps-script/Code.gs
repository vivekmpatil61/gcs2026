const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?access_token=';
const GOOGLE_CLIENT_ID = '120662687568-hbekineb2q7eah307s6ug5nlf65neija.apps.googleusercontent.com';
const DEFAULT_STUDENTS_SHEET = 'Distribution list';

function doGet() {
  return jsonResponse_({ ok: true, service: 'gcs-tutorial-access', version: 4 });
}

function doPost(event) {
  try {
    const accessToken = String((event && event.parameter && event.parameter.accessToken) || '').trim();
    const action = String((event && event.parameter && event.parameter.action) || 'student_library').trim();
    if (!accessToken) {
      return jsonResponse_({ approved: false, code: 'missing_token' });
    }

    const user = verifyGoogleToken_(accessToken);
    if (!user.email || user.emailVerified !== true) {
      return jsonResponse_({ approved: false, code: 'unverified_email' });
    }

    const email = normalizeEmail_(user.email);

    if (action.indexOf('admin_') === 0) {
      if (!isAdmin_(email)) {
        return jsonResponse_({ approved: false, code: 'admin_forbidden' });
      }
      return handleAdminAction_(action, event.parameter, user);
    }

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
    const safeCodes = [
      'google_token_rejected',
      'wrong_token_audience',
      'google_email_unverified',
      'catalog_unavailable'
    ];
    const errorCode = String(error && error.message ? error.message : 'authorization_failed');
    return jsonResponse_({
      approved: false,
      code: safeCodes.indexOf(errorCode) !== -1 ? errorCode : 'authorization_failed'
    });
  }
}

function handleAdminAction_(action, parameters, user) {
  if (action === 'admin_list') {
    return adminResponse_(user, getTutorials_());
  }

  if (action === 'admin_add') {
    const videoId = normalizeYouTubeId_(parameters.videoId);
    if (!videoId) return jsonResponse_({ approved: false, code: 'invalid_video_id' });

    return mutateTutorials_(user, function(tutorials) {
      if (tutorials.some(function(tutorial) { return tutorial.id === videoId; })) {
        throw new Error('duplicate_video');
      }
      tutorials.push({ id: videoId, title: fetchYouTubeTitle_(videoId) });
      return tutorials;
    });
  }

  if (action === 'admin_refresh') {
    const videoId = normalizeYouTubeId_(parameters.videoId);
    return mutateTutorials_(user, function(tutorials) {
      const tutorial = tutorials.find(function(item) { return item.id === videoId; });
      if (!tutorial) throw new Error('video_not_found');
      tutorial.title = fetchYouTubeTitle_(videoId);
      return tutorials;
    });
  }

  if (action === 'admin_move') {
    const videoId = normalizeYouTubeId_(parameters.videoId);
    const direction = String(parameters.direction || '');
    return mutateTutorials_(user, function(tutorials) {
      const index = tutorials.findIndex(function(item) { return item.id === videoId; });
      if (index === -1) throw new Error('video_not_found');
      const target = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : index;
      if (target >= 0 && target < tutorials.length && target !== index) {
        const moved = tutorials.splice(index, 1)[0];
        tutorials.splice(target, 0, moved);
      }
      return tutorials;
    });
  }

  if (action === 'admin_delete') {
    const videoId = normalizeYouTubeId_(parameters.videoId);
    return mutateTutorials_(user, function(tutorials) {
      const remaining = tutorials.filter(function(item) { return item.id !== videoId; });
      if (remaining.length === tutorials.length) throw new Error('video_not_found');
      return remaining;
    });
  }

  return jsonResponse_({ approved: false, code: 'unknown_admin_action' });
}

function mutateTutorials_(user, mutation) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ approved: false, code: 'catalog_busy' });
  }

  try {
    const tutorials = mutation(getTutorials_());
    const normalized = renumberTutorials_(tutorials);
    PropertiesService.getScriptProperties()
      .setProperty('TUTORIAL_CATALOG_JSON', JSON.stringify(normalized));
    return adminResponse_(user, normalized);
  } catch (error) {
    return jsonResponse_({
      approved: false,
      code: String(error && error.message ? error.message : 'catalog_update_failed')
    });
  } finally {
    lock.releaseLock();
  }
}

function adminResponse_(user, tutorials) {
  return jsonResponse_({
    approved: true,
    admin: true,
    user: {
      email: normalizeEmail_(user.email),
      givenName: String(user.given_name || ''),
      picture: String(user.picture || '')
    },
    tutorials: tutorials
  });
}

function isAdmin_(email) {
  const adminEmail = normalizeEmail_(
    PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL')
  );
  return Boolean(adminEmail && adminEmail === email);
}

function normalizeYouTubeId_(value) {
  const input = String(value || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  const queryMatch = input.match(/[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)/);
  if (queryMatch) return queryMatch[1];
  const pathMatch = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed|shorts)\/)([A-Za-z0-9_-]{11})(?:[?&#/]|$)/);
  return pathMatch ? pathMatch[1] : '';
}

function fetchYouTubeTitle_(videoId) {
  const oembedUrl = 'https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent('https://www.youtube.com/watch?v=' + videoId);
  const response = UrlFetchApp.fetch(oembedUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('youtube_video_not_found');
  const metadata = JSON.parse(response.getContentText());
  const title = String(metadata.title || '').trim();
  if (!title) throw new Error('youtube_title_unavailable');
  return title;
}

function renumberTutorials_(tutorials) {
  return tutorials.map(function(tutorial, index) {
    return {
      id: String(tutorial.id || ''),
      number: 'Episode ' + String(index + 1).padStart(2, '0'),
      title: String(tutorial.title || '')
    };
  });
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
  const tokenResponse = UrlFetchApp.fetch(
    GOOGLE_TOKENINFO_URL + encodeURIComponent(accessToken),
    { muteHttpExceptions: true }
  );

  if (tokenResponse.getResponseCode() !== 200) {
    throw new Error('google_token_rejected');
  }

  const tokenInfo = JSON.parse(tokenResponse.getContentText());
  if (String(tokenInfo.aud || '') !== GOOGLE_CLIENT_ID) {
    throw new Error('wrong_token_audience');
  }
  if (!tokenInfo.email || String(tokenInfo.email_verified).toLowerCase() !== 'true') {
    throw new Error('google_email_unverified');
  }

  let profile = {};
  const profileResponse = UrlFetchApp.fetch(GOOGLE_USERINFO_URL, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true
  });
  if (profileResponse.getResponseCode() === 200) {
    profile = JSON.parse(profileResponse.getContentText());
  }

  return {
    email: String(tokenInfo.email),
    emailVerified: true,
    given_name: String(profile.given_name || ''),
    picture: String(profile.picture || '')
  };
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
