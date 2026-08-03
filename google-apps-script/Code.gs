const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?access_token=';
const GOOGLE_CLIENT_ID = '120662687568-hbekineb2q7eah307s6ug5nlf65neija.apps.googleusercontent.com';
const DEFAULT_STUDENTS_SHEET = 'Distribution list';
const DEFAULT_PROGRESS_SHEET = 'Tutorial progress';
const DEFAULT_REGISTRATIONS_SHEET = 'Form Responses 1';
const REGISTRATION_STATUSES = ['New', 'Contacted', 'Enrolled', 'Closed'];

function doGet() {
  return jsonResponse_({ ok: true, service: 'gcs-tutorial-access', version: 11 });
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

    if (action === 'registration_verify') {
      return registrationIdentityResponse_(user, email);
    }

    if (action === 'registration_submit') {
      return submitRegistration_(user, email, event.parameter);
    }

    if (!isActiveStudent_(email)) {
      return jsonResponse_({ approved: false, code: 'not_registered' });
    }

    if (action === 'student_progress_set') {
      const videoId = normalizeYouTubeId_(event.parameter.videoId);
      const completed = String(event.parameter.completed || '').toLowerCase() === 'true';
      if (!videoId || !getTutorials_().some(function(tutorial) { return tutorial.id === videoId; })) {
        return jsonResponse_({ approved: false, code: 'video_not_found' });
      }
      return updateStudentProgress_(user, email, videoId, completed);
    }

    if (action !== 'student_library') {
      return jsonResponse_({ approved: false, code: 'unknown_student_action' });
    }

    return studentResponse_(user, email);
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

function registrationIdentityResponse_(user, email) {
  return jsonResponse_({
    approved: true,
    registration: true,
    user: {
      email: email,
      givenName: String(user.given_name || ''),
      picture: String(user.picture || '')
    },
    expiresIn: 3000
  });
}

function submitRegistration_(user, email, parameters) {
  const registration = validateRegistration_(parameters);
  if (!registration.ok) {
    return jsonResponse_({ approved: false, code: registration.code });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ approved: false, code: 'registration_list_busy' });
  }

  try {
    const sheet = getRegistrationSheet_();
    const rows = sheet.getDataRange().getValues();
    const headers = rows.length ? rows[0].map(normalizeHeader_) : [];
    const timestampColumn = findHeaderColumn_(headers, ['timestamp']);
    const participantColumn = findHeaderColumn_(headers, ['participant s full name', 'participant full name', 'full name of the participant', 'student name']);
    const emailColumn = findHeaderColumn_(headers, ['email address', 'email']);
    if (timestampColumn === -1 || participantColumn === -1 || emailColumn === -1) {
      return jsonResponse_({ approved: false, code: 'registration_sheet_invalid' });
    }

    const now = new Date();
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
    let recentCount = 0;
    let exactDuplicate = false;

    rows.slice(1).forEach(function(row) {
      if (normalizeEmail_(row[emailColumn]) !== email) return;
      const timestamp = row[timestampColumn] instanceof Date
        ? row[timestampColumn]
        : new Date(row[timestampColumn]);
      if (isNaN(timestamp.getTime())) return;
      if (timestamp.getTime() >= oneHourAgo) recentCount += 1;
      if (timestamp.getTime() >= oneDayAgo &&
          String(row[participantColumn] || '').trim().toLowerCase() === registration.participantName.toLowerCase()) {
        exactDuplicate = true;
      }
    });

    if (exactDuplicate) {
      return jsonResponse_({ approved: false, code: 'registration_duplicate' });
    }
    if (recentCount >= 3) {
      return jsonResponse_({ approved: false, code: 'registration_rate_limited' });
    }

    const newRow = new Array(headers.length).fill('');
    setRegistrationValue_(newRow, headers, ['timestamp'], now);
    setRegistrationValue_(newRow, headers, ['participant s full name', 'participant full name', 'full name of the participant', 'student name'], registration.participantName);
    setRegistrationValue_(newRow, headers, ['participant s age', 'participant age', 'age of the participant', 'age'], registration.age);
    setRegistrationValue_(newRow, headers, ['parent or guardian s name', 'parent or guardian name', 'guardian name'], registration.guardianName);
    setRegistrationValue_(newRow, headers, ['whatsapp number', 'phone number', 'mobile number'], registration.whatsapp);
    setRegistrationValue_(newRow, headers, ['email address', 'email'], email);
    setRegistrationValue_(newRow, headers, ['city country', 'city or country', 'location'], registration.location);
    setRegistrationValue_(newRow, headers, ['preferred format', 'preferred programme', 'programme'], registration.programme);
    setRegistrationValue_(newRow, headers, ['prior drawing or art experience', 'does the participant have any prior drawing or art experience', 'drawing experience', 'experience'], registration.experience);
    setRegistrationValue_(newRow, headers, ['what would the participant enjoy drawing', 'what subjects would the participant enjoy drawing most', 'drawing interests', 'subjects'], registration.subjects.join(', '));
    setRegistrationValue_(newRow, headers, ['questions or special requests for vivek', 'any questions or special requests for vivek', 'questions or special requests', 'special requests'], registration.requests);
    setRegistrationValue_(newRow, headers, ['consent'], registration.consentText);
    setRegistrationValue_(newRow, headers, ['follow up status', 'followup status', 'status'], 'New');
    sheet.appendRow(newRow);

    return jsonResponse_({
      approved: true,
      registration: true,
      submitted: true,
      user: {
        email: email,
        givenName: String(user.given_name || ''),
        picture: String(user.picture || '')
      }
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ approved: false, code: 'registration_submit_failed' });
  } finally {
    lock.releaseLock();
  }
}

function validateRegistration_(parameters) {
  const participantName = cleanRegistrationText_(parameters.participantName, 100);
  const age = Number(parameters.age);
  const guardianName = cleanRegistrationText_(parameters.guardianName, 100);
  const whatsapp = cleanRegistrationText_(parameters.whatsapp, 30);
  const location = cleanRegistrationText_(parameters.location, 100);
  const programme = cleanRegistrationText_(parameters.programme, 160);
  const experience = cleanRegistrationText_(parameters.experience, 120);
  const requests = cleanRegistrationText_(parameters.requests, 1000);
  const consentFees = String(parameters.consentFees || '').toLowerCase() === 'true';
  const consentAccuracy = String(parameters.consentAccuracy || '').toLowerCase() === 'true';
  let subjects = [];

  try {
    const parsedSubjects = JSON.parse(String(parameters.subjects || '[]'));
    if (Array.isArray(parsedSubjects)) {
      subjects = parsedSubjects.slice(0, 5).map(function(value) {
        return cleanRegistrationText_(value, 80);
      }).filter(Boolean);
    }
  } catch (error) {
    return { ok: false, code: 'registration_invalid_fields' };
  }

  const allowedProgrammes = [
    'Studio Access (video library)',
    'Studio Live (video library + community with two live doubt-clearing sessions every month)'
  ];
  const allowedExperience = [
    'None at all - complete beginner',
    'A little - school level or doodles at home',
    'Some hobby experience',
    'Has attended art classes before'
  ];
  const phoneDigits = whatsapp.replace(/\D/g, '');

  if (participantName.length < 2 || !Number.isInteger(age) || age < 3 || age > 100 ||
      !guardianName || phoneDigits.length < 8 || phoneDigits.length > 15 ||
      allowedProgrammes.indexOf(programme) === -1 ||
      allowedExperience.indexOf(experience) === -1 ||
      !consentFees || !consentAccuracy) {
    return { ok: false, code: 'registration_invalid_fields' };
  }

  return {
    ok: true,
    participantName: participantName,
    age: age,
    guardianName: guardianName,
    whatsapp: whatsapp,
    location: location,
    programme: programme,
    experience: experience,
    subjects: subjects,
    requests: requests,
    consentText: 'Verified Google email; fees and format consent confirmed; details confirmed accurate'
  };
}

function cleanRegistrationText_(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function setRegistrationValue_(row, headers, candidates, value) {
  const column = findHeaderColumn_(headers, candidates);
  if (column !== -1) row[column] = value;
}

function studentResponse_(user, email) {
  return jsonResponse_({
      approved: true,
      user: {
        email: email,
        givenName: String(user.given_name || ''),
        picture: String(user.picture || '')
      },
      expiresIn: 3000,
      tutorials: getTutorials_(),
      completedVideoIds: getCompletedVideoIds_(email)
    });
}

function updateStudentProgress_(user, email, videoId, completed) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ approved: false, code: 'progress_busy' });
  }

  try {
    const sheet = getProgressSheet_();
    const rows = sheet.getDataRange().getDisplayValues();
    const existingIndex = rows.slice(1).findIndex(function(row) {
      return normalizeEmail_(row[0]) === email && String(row[1] || '') === videoId;
    });

    if (completed && existingIndex === -1) {
      sheet.appendRow([email, videoId, new Date()]);
    } else if (completed) {
      sheet.getRange(existingIndex + 2, 3).setValue(new Date());
    } else if (existingIndex !== -1) {
      sheet.deleteRow(existingIndex + 2);
    }

    return studentResponse_(user, email);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ approved: false, code: 'progress_update_failed' });
  } finally {
    lock.releaseLock();
  }
}

function getCompletedVideoIds_(email) {
  const rows = getProgressSheet_().getDataRange().getDisplayValues();
  if (rows.length < 2) return [];
  const publishedIds = getTutorials_().map(function(tutorial) { return tutorial.id; });
  return rows.slice(1).filter(function(row) {
    return normalizeEmail_(row[0]) === email && publishedIds.indexOf(String(row[1] || '')) !== -1;
  }).map(function(row) {
    return String(row[1]);
  }).filter(function(videoId, index, list) {
    return list.indexOf(videoId) === index;
  });
}

function handleAdminAction_(action, parameters, user) {
  if (action === 'admin_list') {
    return adminDashboardResponse_(user, getTutorials_());
  }

  if (action === 'admin_registrations_list') {
    return adminRegistrationsResponse_(user);
  }

  if (action === 'admin_registration_status') {
    const rowNumber = Number(parameters.rowNumber);
    const status = String(parameters.status || '').trim();
    if (!Number.isInteger(rowNumber) || rowNumber < 2) {
      return jsonResponse_({ approved: false, code: 'registration_not_found' });
    }
    if (REGISTRATION_STATUSES.indexOf(status) === -1) {
      return jsonResponse_({ approved: false, code: 'invalid_registration_status' });
    }
    return updateRegistrationStatus_(user, rowNumber, status);
  }

  if (action === 'admin_student_add' || action === 'admin_student_remove') {
    const studentEmail = normalizeEmail_(parameters.studentEmail);
    if (!isValidEmail_(studentEmail)) {
      return jsonResponse_({ approved: false, code: 'invalid_student_email' });
    }
    return updateStudentAccess_(user, studentEmail, action === 'admin_student_add');
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
    return adminDashboardResponse_(user, normalized);
  } catch (error) {
    return jsonResponse_({
      approved: false,
      code: String(error && error.message ? error.message : 'catalog_update_failed')
    });
  } finally {
    lock.releaseLock();
  }
}

function adminDashboardResponse_(user, tutorials) {
  const students = getApprovedStudents_();
  const studentNames = getStudentNamesByEmail_();
  const payload = {
    approved: true,
    admin: true,
    user: {
      email: normalizeEmail_(user.email),
      givenName: String(user.given_name || ''),
      picture: String(user.picture || '')
    },
    tutorials: tutorials,
    students: students,
    studentProfiles: students.map(function(email) {
      return { email: email, name: studentNames[email] || '' };
    }),
    studentProgress: getStudentProgressSummary_(students, tutorials, studentNames)
  };
  return jsonResponse_(payload);
}

function adminRegistrationsResponse_(user) {
  try {
    return jsonResponse_({
      approved: true,
      admin: true,
      user: {
        email: normalizeEmail_(user.email),
        givenName: String(user.given_name || ''),
        picture: String(user.picture || '')
      },
      registrations: getRegistrations_()
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    const code = String(error && error.message ? error.message : 'registration_sheet_unavailable');
    return jsonResponse_({ approved: false, code: code });
  }
}

function getRegistrations_() {
  const sheet = getRegistrationSheet_();
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader_);
  const columns = {
    timestamp: findHeaderColumn_(headers, ['timestamp']),
    participantName: findHeaderColumn_(headers, ['participant s full name', 'participant full name', 'full name of the participant', 'student name']),
    age: findHeaderColumn_(headers, ['participant s age', 'participant age', 'age of the participant', 'age']),
    guardianName: findHeaderColumn_(headers, ['parent or guardian s name', 'parent or guardian name', 'guardian name']),
    whatsapp: findHeaderColumn_(headers, ['whatsapp number', 'phone number', 'mobile number']),
    email: findHeaderColumn_(headers, ['email address', 'email']),
    location: findHeaderColumn_(headers, ['city country', 'city or country', 'location']),
    programme: findHeaderColumn_(headers, ['preferred format', 'preferred programme', 'programme']),
    experience: findHeaderColumn_(headers, ['prior drawing or art experience', 'does the participant have any prior drawing or art experience', 'drawing experience', 'experience']),
    subjects: findHeaderColumn_(headers, ['what would the participant enjoy drawing', 'what subjects would the participant enjoy drawing most', 'drawing interests', 'subjects']),
    requests: findHeaderColumn_(headers, ['questions or special requests for vivek', 'any questions or special requests for vivek', 'questions or special requests', 'special requests']),
    status: findHeaderColumn_(headers, ['follow up status', 'followup status', 'status'])
  };

  return rows.slice(1).map(function(row, index) {
    const timestampValue = valueAt_(row, columns.timestamp);
    return {
      rowNumber: index + 2,
      timestamp: timestampValue instanceof Date ? timestampValue.toISOString() : String(timestampValue || ''),
      participantName: String(valueAt_(row, columns.participantName) || ''),
      age: String(valueAt_(row, columns.age) || ''),
      guardianName: String(valueAt_(row, columns.guardianName) || ''),
      whatsapp: String(valueAt_(row, columns.whatsapp) || ''),
      email: normalizeEmail_(valueAt_(row, columns.email)),
      location: String(valueAt_(row, columns.location) || ''),
      programme: String(valueAt_(row, columns.programme) || ''),
      experience: String(valueAt_(row, columns.experience) || ''),
      subjects: String(valueAt_(row, columns.subjects) || ''),
      requests: String(valueAt_(row, columns.requests) || ''),
      status: String(valueAt_(row, columns.status) || 'New').trim() || 'New'
    };
  }).filter(function(registration) {
    return registration.participantName || registration.email || registration.whatsapp;
  }).reverse();
}

function updateRegistrationStatus_(user, rowNumber, status) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ approved: false, code: 'registration_list_busy' });
  }

  try {
    const sheet = getRegistrationSheet_();
    if (rowNumber > sheet.getLastRow()) {
      return jsonResponse_({ approved: false, code: 'registration_not_found' });
    }
    const lastColumn = Math.max(1, sheet.getLastColumn());
    const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(normalizeHeader_);
    let statusColumn = findHeaderColumn_(headers, ['follow up status', 'followup status']);
    if (statusColumn === -1) {
      statusColumn = lastColumn;
      sheet.getRange(1, statusColumn + 1).setValue('Follow-up status');
    }
    sheet.getRange(rowNumber, statusColumn + 1).setValue(status);
    return adminRegistrationsResponse_(user);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ approved: false, code: 'registration_update_failed' });
  } finally {
    lock.releaseLock();
  }
}

function getRegistrationSheet_() {
  const spreadsheet = getStudentSpreadsheet_();
  const configuredName = PropertiesService.getScriptProperties()
    .getProperty('REGISTRATIONS_SHEET_NAME') || DEFAULT_REGISTRATIONS_SHEET;
  const configuredSheet = spreadsheet.getSheetByName(configuredName);
  if (configuredSheet) return configuredSheet;

  const detectedSheet = spreadsheet.getSheets().find(function(sheet) {
    if (sheet.getLastColumn() === 0) return false;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0].map(normalizeHeader_);
    return findHeaderColumn_(headers, ['participant s full name', 'participant full name', 'full name of the participant']) !== -1 &&
      findHeaderColumn_(headers, ['email address', 'email']) !== -1;
  });
  if (!detectedSheet) throw new Error('registration_sheet_missing');
  return detectedSheet;
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function findHeaderColumn_(headers, candidates) {
  const normalizedCandidates = candidates.map(normalizeHeader_);
  return headers.findIndex(function(header) {
    return normalizedCandidates.indexOf(header) !== -1 || normalizedCandidates.some(function(candidate) {
      return candidate.length > 5 && header.indexOf(candidate) === 0;
    });
  });
}

function valueAt_(row, column) {
  return column === -1 ? '' : row[column];
}

function getStudentNamesByEmail_() {
  try {
    const rows = getRegistrationSheet_().getDataRange().getValues();
    if (rows.length < 2) return {};
    const headers = rows[0].map(normalizeHeader_);
    const emailColumn = findHeaderColumn_(headers, ['email address', 'email']);
    const nameColumn = findHeaderColumn_(headers, ['participant s full name', 'participant full name', 'full name of the participant', 'student name']);
    if (emailColumn === -1 || nameColumn === -1) return {};

    const namesByEmail = {};
    rows.slice(1).forEach(function(row) {
      const email = normalizeEmail_(row[emailColumn]);
      const name = String(row[nameColumn] || '').trim();
      if (!email || !name) return;
      if (!namesByEmail[email]) namesByEmail[email] = [];
      if (namesByEmail[email].indexOf(name) === -1) namesByEmail[email].push(name);
    });

    Object.keys(namesByEmail).forEach(function(email) {
      namesByEmail[email] = namesByEmail[email].join(', ');
    });
    return namesByEmail;
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return {};
  }
}

function getStudentProgressSummary_(students, tutorials, studentNames) {
  const publishedIds = tutorials.map(function(tutorial) { return tutorial.id; });
  const progressRows = getProgressSheet_().getDataRange().getValues();
  const progressByEmail = {};

  progressRows.slice(1).forEach(function(row) {
    const email = normalizeEmail_(row[0]);
    const videoId = String(row[1] || '');
    if (!email || publishedIds.indexOf(videoId) === -1) return;
    if (!progressByEmail[email]) {
      progressByEmail[email] = { videoIds: {}, lastActivity: null };
    }
    progressByEmail[email].videoIds[videoId] = true;
    const activity = row[2] instanceof Date ? row[2] : new Date(row[2]);
    if (!isNaN(activity.getTime()) &&
        (!progressByEmail[email].lastActivity || activity > progressByEmail[email].lastActivity)) {
      progressByEmail[email].lastActivity = activity;
    }
  });

  return students.map(function(email) {
    const progress = progressByEmail[email];
    const completedCount = progress ? Object.keys(progress.videoIds).length : 0;
    const totalCount = tutorials.length;
    return {
      email: email,
      name: studentNames[email] || '',
      completedCount: completedCount,
      totalCount: totalCount,
      percent: totalCount ? Math.round(completedCount / totalCount * 100) : 0,
      lastActivity: progress && progress.lastActivity ? progress.lastActivity.toISOString() : ''
    };
  });
}

function updateStudentAccess_(user, studentEmail, shouldApprove) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ approved: false, code: 'student_list_busy' });
  }

  try {
    const sheet = getStudentSheet_();
    const rows = sheet.getDataRange().getDisplayValues();
    const headers = rows.length ? rows[0].map(function(value) {
      return String(value).trim().toLowerCase();
    }) : [];
    const emailColumn = headers.indexOf('email');
    const statusColumn = headers.indexOf('status');

    if (emailColumn !== -1 && statusColumn !== -1) {
      const existingIndex = rows.slice(1).findIndex(function(row) {
        return normalizeEmail_(row[emailColumn]) === studentEmail;
      });
      if (existingIndex !== -1) {
        sheet.getRange(existingIndex + 2, statusColumn + 1)
          .setValue(shouldApprove ? 'Active' : 'Inactive');
      } else if (shouldApprove) {
        const newRow = new Array(headers.length).fill('');
        newRow[emailColumn] = studentEmail;
        newRow[statusColumn] = 'Active';
        sheet.appendRow(newRow);
      }
    } else {
      let emails = parseEmailList_(rows.length ? rows[0][0] : '');
      if (shouldApprove && emails.indexOf(studentEmail) === -1) emails.push(studentEmail);
      if (!shouldApprove) emails = emails.filter(function(email) { return email !== studentEmail; });
      sheet.getRange('A1').setValue(emails.join(', '));
    }

    return adminDashboardResponse_(user, getTutorials_());
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ approved: false, code: 'student_update_failed' });
  } finally {
    lock.releaseLock();
  }
}

function getApprovedStudents_() {
  const sheet = getStudentSheet_();
  const rows = sheet.getDataRange().getDisplayValues();
  if (!rows.length) return [];
  const headers = rows[0].map(function(value) { return String(value).trim().toLowerCase(); });
  const emailColumn = headers.indexOf('email');
  const statusColumn = headers.indexOf('status');

  if (emailColumn !== -1 && statusColumn !== -1) {
    return rows.slice(1).filter(function(row) {
      return String(row[statusColumn]).trim().toLowerCase() === 'active';
    }).map(function(row) {
      return normalizeEmail_(row[emailColumn]);
    }).filter(Boolean).sort();
  }

  return parseEmailList_(rows[0][0]).sort();
}

function parseEmailList_(value) {
  return String(value || '')
    .split(',')
    .map(normalizeEmail_)
    .filter(Boolean);
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  const sheet = getStudentSheet_();
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

  return parseEmailList_(rows[0][0]).indexOf(email) !== -1;
}

function getStudentSheet_() {
  const spreadsheet = getStudentSpreadsheet_();
  const properties = PropertiesService.getScriptProperties();
  const sheetName = properties.getProperty('STUDENTS_SHEET_NAME') || DEFAULT_STUDENTS_SHEET;
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Student access sheet was not found: ' + sheetName);
  }
  return sheet;
}

function getProgressSheet_() {
  const spreadsheet = getStudentSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(DEFAULT_PROGRESS_SHEET);
  if (!sheet) {
    try {
      sheet = spreadsheet.insertSheet(DEFAULT_PROGRESS_SHEET);
    } catch (error) {
      sheet = spreadsheet.getSheetByName(DEFAULT_PROGRESS_SHEET);
      if (!sheet) throw error;
    }
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Email', 'Video ID', 'Completed At']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getStudentSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty('STUDENTS_SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('STUDENTS_SPREADSHEET_ID is not configured.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
