    const LIVE_ADMIN_URL = 'https://universeofvivek.in/admin.html';
    const GOOGLE_CLIENT_ID = '120662687568-hbekineb2q7eah307s6ug5nlf65neija.apps.googleusercontent.com';
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyKiL-qYGP5t-Fg7-IdtNUHsWGtrFJTHHQeDwIocM7iKf3WTDr0ztkrpwpT3Fk9o3andQ/exec';

    if (window.location.protocol === 'file:') {
      window.location.replace(LIVE_ADMIN_URL);
    }

    let googleClient;
    let adminExpiryTimer;
    const libraryFilter = document.getElementById('libraryFilter');
    libraryFilter.addEventListener('change', () => { pages.tutorials = 1; renderTutorials(); });
    document.getElementById('refreshDashboard').addEventListener('click', refreshDashboard);
    let activeAccessToken = '';
    let currentTutorials = [];
    let currentStudents = [];
    let currentStudentProfiles = [];
    let currentProgress = [];
    let currentRegistrations = [];
    let registrationsLoaded = false;
    let registrationsLoading = false;
    const PAGE_SIZE = 10;
    const pages = { tutorials: 1, students: 1, progress: 1, registrations: 1 };

    const loginPanel = document.getElementById('loginPanel');
    const dashboard = document.getElementById('dashboard');
    const loginStatus = document.getElementById('loginStatus');
    const adminStatus = document.getElementById('adminStatus');
    const addForm = document.getElementById('addForm');
    const videoIdInput = document.getElementById('videoId');
    const tutorialLibraryInput = document.getElementById('tutorialLibrary');
    const tutorialList = document.getElementById('tutorialList');
    const studentForm = document.getElementById('studentForm');
    const studentEmailInput = document.getElementById('studentEmail');
    const studentStatus = document.getElementById('studentStatus');
    const studentList = document.getElementById('studentList');
    const progressList = document.getElementById('progressList');
    const registrationList = document.getElementById('registrationList');
    const registrationStatus = document.getElementById('registrationStatus');
    const tutorialSearch = document.getElementById('tutorialSearch');
    const studentSearch = document.getElementById('studentSearch');
    const progressSearch = document.getElementById('progressSearch');
    const registrationSearch = document.getElementById('registrationSearch');
    const registrationFilter = document.getElementById('registrationFilter');
    const tabButtons = Array.from(document.querySelectorAll('.admin-tab'));
    const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));

    document.getElementById('googleSignIn').addEventListener('click', signInWithGoogle);
    document.getElementById('signOut').addEventListener('click', signOut);
    addForm.addEventListener('submit', addTutorial);
    studentForm.addEventListener('submit', addStudent);
    tabButtons.forEach(button => {
      button.addEventListener('click', () => switchAdminTab(button.dataset.tab));
      button.addEventListener('keydown', handleTabKeydown);
    });
    tutorialSearch.addEventListener('input', () => { pages.tutorials = 1; renderTutorials(); });
    studentSearch.addEventListener('input', () => { pages.students = 1; renderStudents(); });
    progressSearch.addEventListener('input', () => { pages.progress = 1; renderProgress(); });
    registrationSearch.addEventListener('input', () => { pages.registrations = 1; renderRegistrations(); });
    registrationFilter.addEventListener('change', () => { pages.registrations = 1; renderRegistrations(); });

    function switchAdminTab(tabName, moveFocus = true) {
      tabButtons.forEach(button => {
        const active = button.dataset.tab === tabName;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        if (active && moveFocus) button.focus();
      });
      tabPanels.forEach(panel => {
        const active = panel.id === `${tabName}Panel`;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
      if (tabName === 'registrations' && !registrationsLoaded && !registrationsLoading) {
        loadRegistrations();
      }
    }

    function handleTabKeydown(event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const index = tabButtons.indexOf(event.currentTarget);
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabButtons[(index + offset + tabButtons.length) % tabButtons.length];
      switchAdminTab(next.dataset.tab);
    }

    function signInWithGoogle() {
      setStatus(loginStatus, 'Opening Google sign-in...');
      if (!window.google || !google.accounts || !google.accounts.oauth2) {
        setStatus(loginStatus, 'Google sign-in is still loading. Please try again.', 'error');
        return;
      }
      if (!googleClient) {
        googleClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          callback: handleGoogleResponse
        });
      }
      googleClient.requestAccessToken();
    }

    async function handleGoogleResponse(response) {
      if (response.error || !response.access_token) {
        setStatus(loginStatus, 'Google sign-in was cancelled. Please try again.', 'error');
        return;
      }
      activeAccessToken = response.access_token;
      setStatus(loginStatus, 'Checking owner access...');
      try {
        const data = await adminRequest('admin_list');
        showDashboard(data);
        clearTimeout(adminExpiryTimer);
        adminExpiryTimer = setTimeout(expireAdminSession, Math.max(60, Number(response.expires_in) || 3000) * 1000);
      } catch (error) {
        activeAccessToken = '';
        setStatus(loginStatus, error.message, 'error');
      }
    }

    async function adminRequest(action, extra) {
      if (!activeAccessToken) throw new Error('Please sign in again.');
      const body = new URLSearchParams(Object.assign({
        action: action,
        accessToken: activeAccessToken
      }, extra || {}));
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body
      });
      if (!response.ok) throw new Error('The admin service is unavailable. Please try again.');
      const data = await response.json();
      if (!data.approved || !data.admin) {
        if (['google_token_rejected', 'authorization_failed', 'missing_token'].includes(data.code)) expireAdminSession();
        throw new Error(messageForCode(data.code));
      }
      return data;
    }

    function showDashboard(data) {
      loginPanel.style.display = 'none';
      dashboard.style.display = 'block';
      document.getElementById('adminAvatar').src = data.user.picture || '';
      document.getElementById('adminEmail').textContent = data.user.email || '';
      updateDashboardData(data);
      renderTutorials();
      renderStudents();
      renderProgress();
      switchAdminTab('tutorials', false);
      loadRegistrations();
      videoIdInput.focus();
    }

    function updateDashboardData(data) {
      document.getElementById('dashboardUpdated').textContent = `Library and students updated ${new Date().toLocaleTimeString()}`;
      if (Array.isArray(data.tutorials)) currentTutorials = data.tutorials;
      if (Array.isArray(data.students)) currentStudents = data.students;
      if (Array.isArray(data.studentProfiles)) {
        currentStudentProfiles = data.studentProfiles;
      } else if (Array.isArray(data.students)) {
        currentStudentProfiles = data.students.map(email => ({ email: email, name: '' }));
      }
      if (Array.isArray(data.studentProgress)) currentProgress = data.studentProgress;
      document.getElementById('tutorialTabCount').textContent = String(currentTutorials.length);
      document.getElementById('studentTabCount').textContent = String(currentStudents.length);
      document.getElementById('progressTabCount').textContent = String(currentProgress.length);
    }

    function updateRegistrationData(data) {
      if (Array.isArray(data.registrations)) currentRegistrations = data.registrations;
      registrationsLoaded = true;
      document.getElementById('registrationTabCount').textContent = String(currentRegistrations.length);
      document.getElementById('registrationCount').textContent = `${currentRegistrations.length} total`;
    }

    async function loadRegistrations() {
      registrationsLoading = true;
      setStatus(registrationStatus, 'Loading registration responses...');
      try {
        const data = await adminRequest('admin_registrations_list');
        updateRegistrationData(data);
        renderRegistrations();
        setStatus(registrationStatus, '');
      } catch (error) {
        setStatus(registrationStatus, error.message, 'error');
      } finally {
        registrationsLoading = false;
      }
    }

    async function addStudent(event) {
      event.preventDefault();
      const email = studentEmailInput.value.trim().toLowerCase();
      if (!email) return;
      setBusy(true);
      setStatus(studentStatus, 'Approving student access...');
      try {
        const data = await adminRequest('admin_student_add', { studentEmail: email });
        updateDashboardData(data);
        studentSearch.value = '';
        pages.students = 1;
        renderStudents();
        renderProgress();
        studentForm.reset();
        studentEmailInput.focus();
        setStatus(studentStatus, `${email} can now access the tutorial library.`, 'success');
      } catch (error) {
        setStatus(studentStatus, error.message, 'error');
      } finally {
        setBusy(false);
      }
    }

    async function removeStudent(email) {
      if (!window.confirm(`Revoke tutorial access for ${email}?`)) return;
      setBusy(true);
      setStatus(studentStatus, 'Revoking student access...');
      try {
        const data = await adminRequest('admin_student_remove', { studentEmail: email });
        updateDashboardData(data);
        renderStudents();
        renderProgress();
        setStatus(studentStatus, `${email} no longer has tutorial access.`, 'success');
      } catch (error) {
        setStatus(studentStatus, error.message, 'error');
      } finally {
        setBusy(false);
      }
    }

    function renderStudents() {
      studentList.replaceChildren();
      document.getElementById('studentCount').textContent = `${currentStudentProfiles.length} approved`;
      const query = studentSearch.value.trim().toLowerCase();
      const filtered = currentStudentProfiles.filter(student =>
        `${student.name || ''} ${student.email || ''}`.toLowerCase().includes(query)
      );
      const page = getPage(filtered, 'students');
      document.getElementById('studentResultCount').textContent = resultCount(filtered.length, currentStudentProfiles.length);

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = currentStudentProfiles.length ? 'No approved students match that search.' : 'No students are currently approved.';
        studentList.append(empty);
        renderPagination(document.getElementById('studentPagination'), 'students', 0, renderStudents);
        return;
      }

      page.items.forEach(student => {
        const row = document.createElement('div');
        row.className = 'student-row';
        const identity = document.createElement('div');
        identity.className = 'student-identity';
        identity.classList.toggle('email-only', !student.name);
        if (student.name) {
          const name = document.createElement('p');
          name.className = 'student-name';
          name.textContent = student.name;
          identity.append(name);
        }
        const address = document.createElement('p');
        address.className = 'student-email';
        address.textContent = student.email;
        identity.append(address);
        const revoke = document.createElement('button');
        revoke.type = 'button';
        revoke.className = 'revoke-btn';
        revoke.textContent = 'Revoke';
        revoke.addEventListener('click', () => removeStudent(student.email));
        row.append(identity, revoke);
        studentList.append(row);
      });
      renderPagination(document.getElementById('studentPagination'), 'students', filtered.length, renderStudents);
    }

    function renderProgress() {
      progressList.replaceChildren();
      const started = currentProgress.filter(student => Number(student.completedCount) > 0).length;
      const completed = currentProgress.filter(student => Number(student.totalCount) > 0 && Number(student.completedCount) >= Number(student.totalCount)).length;
      const average = currentProgress.length
        ? Math.round(currentProgress.reduce((sum, student) => sum + Number(student.percent || 0), 0) / currentProgress.length)
        : 0;

      document.getElementById('progressCount').textContent = `${started} of ${currentProgress.length} started`;
      document.getElementById('startedStudents').textContent = String(started);
      document.getElementById('averageProgress').textContent = `${average}%`;
      document.getElementById('completedStudents').textContent = String(completed);
      const query = progressSearch.value.trim().toLowerCase();
      const filtered = currentProgress.filter(student =>
        `${student.name || ''} ${student.email || ''}`.toLowerCase().includes(query)
      );
      const page = getPage(filtered, 'progress');
      document.getElementById('progressResultCount').textContent = resultCount(filtered.length, currentProgress.length);

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = currentProgress.length ? 'No student progress matches that search.' : 'Approve a student to begin tracking progress.';
        progressList.append(empty);
        renderPagination(document.getElementById('progressPagination'), 'progress', 0, renderProgress);
        return;
      }

      page.items.forEach(student => {
        const row = document.createElement('article');
        row.className = 'progress-row';
        const head = document.createElement('div');
        head.className = 'progress-row-head';
        const identity = document.createElement('div');
        identity.className = 'progress-identity';
        identity.classList.toggle('email-only', !student.name);
        if (student.name) {
          const name = document.createElement('p');
          name.className = 'progress-name';
          name.textContent = student.name;
          identity.append(name);
        }
        const email = document.createElement('p');
        email.className = 'progress-email';
        email.textContent = student.email;
        identity.append(email);
        const total = document.createElement('p');
        total.className = 'progress-total';
        total.textContent = `${student.completedCount} of ${student.totalCount}`;
        head.append(identity, total);

        const track = document.createElement('div');
        track.className = 'progress-track';
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', `${student.email} tutorial progress`);
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(student.percent || 0));
        const fill = document.createElement('div');
        fill.className = 'progress-fill';
        fill.style.width = `${Math.max(0, Math.min(100, Number(student.percent) || 0))}%`;
        track.append(fill);

        const meta = document.createElement('p');
        meta.className = 'progress-meta';
        meta.textContent = student.lastActivity
          ? `Last activity: ${formatActivity(student.lastActivity)}`
          : 'Not started yet';
        row.append(head, track, meta);
        progressList.append(row);
      });
      renderPagination(document.getElementById('progressPagination'), 'progress', filtered.length, renderProgress);
    }

    function renderRegistrations() {
      registrationList.replaceChildren();
      const summary = document.getElementById('registrationSummary');
      summary.replaceChildren();
      ['New', 'Contacted', 'Enrolled', 'Closed'].forEach(status => {
        const pill = document.createElement('span');
        pill.className = 'status-pill';
        pill.textContent = `${status}: ${currentRegistrations.filter(item => item.status === status).length}`;
        summary.append(pill);
      });

      const query = registrationSearch.value.trim().toLowerCase();
      const statusFilter = registrationFilter.value;
      const filtered = currentRegistrations.filter(registration => {
        const searchable = [
          registration.participantName,
          registration.guardianName,
          registration.email,
          registration.whatsapp,
          registration.location,
          registration.programme,
          registration.subjects
        ].join(' ').toLowerCase();
        return (!query || searchable.includes(query)) &&
          (statusFilter === 'All' || registration.status === statusFilter);
      });
      const page = getPage(filtered, 'registrations');
      document.getElementById('registrationResultCount').textContent = resultCount(filtered.length, currentRegistrations.length);

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = currentRegistrations.length
          ? 'No registrations match the current search and status filter.'
          : 'No registration responses have been received yet.';
        registrationList.append(empty);
        renderPagination(document.getElementById('registrationPagination'), 'registrations', 0, renderRegistrations);
        return;
      }

      page.items.forEach(registration => {
        const card = document.createElement('article');
        card.className = 'registration-card';

        const head = document.createElement('div');
        head.className = 'registration-head';
        const identity = document.createElement('div');
        const name = document.createElement('p');
        name.className = 'registration-name';
        name.textContent = `${registration.participantName || 'Unnamed participant'}${registration.age ? ` - Age ${registration.age}` : ''}`;
        const date = document.createElement('p');
        date.className = 'registration-date';
        date.textContent = registration.timestamp ? `Submitted ${formatRegistrationDate(registration.timestamp)}` : 'Submission date unavailable';
        identity.append(name, date);

        const status = document.createElement('select');
        status.className = 'status-select';
        status.setAttribute('aria-label', `Follow-up status for ${registration.participantName || 'registration'}`);
        ['New', 'Contacted', 'Enrolled', 'Closed'].forEach(value => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          option.selected = value === registration.status;
          status.append(option);
        });
        status.addEventListener('change', () => updateRegistrationStatus(registration.rowNumber, status.value));
        const actions = document.createElement('div');
        actions.className = 'registration-actions';
        actions.append(status);
        const hasAccess = currentStudents.includes(String(registration.email || '').toLowerCase());
        if (hasAccess) {
          const badge = document.createElement('span');
          badge.className = 'access-granted';
          badge.textContent = 'Access granted';
          actions.append(badge);
          if (registration.email) {
            const resend = document.createElement('button');
            resend.type = 'button';
            resend.className = 'resend-welcome-btn';
            resend.textContent = 'Resend welcome email';
            resend.addEventListener('click', () => resendWelcomeEmail(registration));
            actions.append(resend);
          }
        } else if (registration.email) {
          const approve = document.createElement('button');
          approve.type = 'button';
          approve.className = 'approve-registration-btn';
          approve.textContent = 'Approve student';
          approve.addEventListener('click', () => approveRegistration(registration));
          actions.append(approve);
        }
        head.append(identity, actions);

        const details = document.createElement('dl');
        details.className = 'registration-details';
        appendRegistrationDetail(details, 'Parent or guardian', registration.guardianName);
        appendRegistrationDetail(details, 'Preferred format', registration.programme);
        appendRegistrationDetail(details, 'Email', registration.email, 'email');
        appendRegistrationDetail(details, 'WhatsApp', registration.whatsapp, 'phone');
        appendRegistrationDetail(details, 'City / Country', registration.location);
        appendRegistrationDetail(details, 'Experience', registration.experience);
        appendRegistrationDetail(details, 'Enjoys drawing', registration.subjects, '', true);
        appendRegistrationDetail(details, 'Questions or requests', registration.requests, '', true);
        appendRegistrationDetail(details, 'Recorded consent', registration.consent, '', true);
        card.append(head, details);
        registrationList.append(card);
      });
      renderPagination(document.getElementById('registrationPagination'), 'registrations', filtered.length, renderRegistrations);
    }

    function appendRegistrationDetail(container, label, value, linkType, wide) {
      if (!value) return;
      const item = document.createElement('div');
      item.className = `registration-detail${wide ? ' wide' : ''}`;
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      if (linkType === 'email') {
        const link = document.createElement('a');
        link.href = `mailto:${value}`;
        link.textContent = value;
        description.append(link);
      } else if (linkType === 'phone') {
        const digits = String(value).replace(/\D/g, '');
        const link = document.createElement('a');
        link.href = `https://wa.me/${digits}`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = value;
        description.append(link);
      } else {
        description.textContent = value;
      }
      item.append(term, description);
      container.append(item);
    }

    async function updateRegistrationStatus(rowNumber, status) {
      setBusy(true);
      setStatus(registrationStatus, 'Saving follow-up status...');
      try {
        const data = await adminRequest('admin_registration_status', {
          rowNumber: String(rowNumber),
          status: status
        });
        updateRegistrationData(data);
        renderRegistrations();
        setStatus(registrationStatus, 'Follow-up status saved.', 'success');
      } catch (error) {
        setStatus(registrationStatus, error.message, 'error');
        registrationsLoaded = false;
      } finally {
        setBusy(false);
      }
    }

    async function approveRegistration(registration) {
      const email = String(registration.email || '').trim().toLowerCase();
      const name = registration.participantName || email;
      if (!window.confirm(`Grant tutorial access to ${name} (${email}) and send the welcome email?`)) return;

      setBusy(true);
      setStatus(registrationStatus, `Granting access to ${email}...`);
      try {
        const data = await adminRequest('admin_registration_approve', {
          rowNumber: String(registration.rowNumber)
        });
        updateDashboardData(data);
        updateRegistrationData(data);
        renderRegistrations();
        renderStudents();
        renderProgress();
        if (data.welcomeEmailSent) {
          setStatus(registrationStatus, `Access granted and welcome email sent from hello@universeofvivek.in to ${email}.`, 'success');
        } else {
          const alreadyActive = data.welcomeEmailCode === 'student_already_active';
          const reason = alreadyActive
            ? 'This email already had access, so no duplicate welcome email was sent.'
            : data.welcomeEmailCode === 'welcome_sender_unavailable'
              ? 'Configure hello@universeofvivek.in as a verified Gmail Send mail as address for the Apps Script owner.'
              : 'The welcome email could not be sent.';
          setStatus(registrationStatus, `Access granted and registration marked Enrolled. ${reason}`, alreadyActive ? 'success' : 'error');
        }
      } catch (error) {
        setStatus(registrationStatus, error.message, 'error');
      } finally {
        setBusy(false);
      }
    }

    async function resendWelcomeEmail(registration) {
      const email = String(registration.email || '').trim().toLowerCase();
      const name = registration.participantName || email;
      if (!window.confirm(`Send the welcome email to ${name} (${email})?`)) return;

      setBusy(true);
      setStatus(registrationStatus, `Sending welcome email to ${email}...`);
      try {
        const data = await adminRequest('admin_registration_welcome_resend', {
          rowNumber: String(registration.rowNumber)
        });
        updateDashboardData(data);
        updateRegistrationData(data);
        renderRegistrations();
        setStatus(registrationStatus, `Welcome email sent from hello@universeofvivek.in to ${email}.`, 'success');
      } catch (error) {
        setStatus(registrationStatus, error.message, 'error');
      } finally {
        setBusy(false);
      }
    }

    function formatRegistrationDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(date);
    }

    function formatActivity(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'Date unavailable';
      return new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(date);
    }

    async function addTutorial(event) {
      event.preventDefault();
      const value = videoIdInput.value.trim();
      if (!value) return;
      setBusy(true);
      setStatus(adminStatus, 'Fetching the YouTube title and adding the tutorial...');
      try {
        const data = await adminRequest('admin_add', { videoId: value, library: tutorialLibraryInput.value });
        updateDashboardData(data);
        tutorialSearch.value = '';
        pages.tutorials = Math.max(1, Math.ceil(currentTutorials.length / PAGE_SIZE));
        renderTutorials();
        renderProgress();
        addForm.reset();
        videoIdInput.focus();
        setStatus(adminStatus, 'Tutorial added and published automatically.', 'success');
      } catch (error) {
        setStatus(adminStatus, error.message, 'error');
      } finally {
        setBusy(false);
      }
    }

    async function updateTutorial(action, videoId, direction) {
      if (action === 'admin_delete' && !window.confirm('Remove this tutorial from the student library?')) return;
      setBusy(true);
      setStatus(adminStatus, action === 'admin_refresh' ? 'Refreshing the YouTube title...' : 'Updating the tutorial library...');
      try {
        const data = await adminRequest(action, { videoId: videoId, direction: direction || '', library: libraryFilter.value });
        updateDashboardData(data);
        renderTutorials();
        renderProgress();
        setStatus(adminStatus, 'Tutorial library updated automatically.', 'success');
      } catch (error) {
        setStatus(adminStatus, error.message, 'error');
      } finally {
        setBusy(false);
      }
    }

    async function updateTutorialLibrary(videoId, library) {
      setBusy(true);
      setStatus(adminStatus, 'Updating the tutorial library...');
      try {
        const data = await adminRequest('admin_library', { videoId: videoId, library: library });
        updateDashboardData(data);
        renderTutorials();
        renderProgress();
        setStatus(adminStatus, 'Tutorial library updated automatically.', 'success');
      } catch (error) {
        setStatus(adminStatus, error.message, 'error');
      } finally {
        setBusy(false);
      }
    }

    function renderTutorials() {
      tutorialList.replaceChildren();
      document.getElementById('tutorialCount').textContent = `${currentTutorials.length} tutorial${currentTutorials.length === 1 ? '' : 's'}`;
      const query = tutorialSearch.value.trim().toLowerCase();
      const libraryTutorials = libraryFilter.value === 'all' ? currentTutorials :
        currentTutorials.filter(t => (t.libraries || ['core-studio']).includes(libraryFilter.value));
      const numbered = libraryTutorials.map((tutorial, index) => ({ ...tutorial,
        displayNumber: libraryFilter.value === 'all' ? `Catalogue ${tutorial.number}` : `Episode ${String(index + 1).padStart(2, '0')}` }));
      const filtered = numbered.filter(tutorial =>
        `${tutorial.displayNumber} ${tutorial.title} ${tutorial.id}`.toLowerCase().includes(query)
      );
      const page = getPage(filtered, 'tutorials');
      document.getElementById('tutorialResultCount').textContent = resultCount(filtered.length, currentTutorials.length);

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = currentTutorials.length ? 'No tutorials match that search.' : 'No tutorials yet. Add your first YouTube ID above.';
        tutorialList.append(empty);
        renderPagination(document.getElementById('tutorialPagination'), 'tutorials', 0, renderTutorials);
        return;
      }

      page.items.forEach(tutorial => {
        const index = libraryTutorials.findIndex(item => item.id === tutorial.id);
        const row = document.createElement('article');
        row.className = 'tutorial';

        const thumbnail = document.createElement('img');
        thumbnail.src = `https://img.youtube.com/vi/${tutorial.id}/mqdefault.jpg?v=20260923`;
        thumbnail.alt = `${tutorial.number} thumbnail`;
        thumbnail.loading = 'lazy';

        const details = document.createElement('div');
        const episode = document.createElement('p');
        episode.className = 'episode';
        episode.textContent = tutorial.displayNumber;
        const title = document.createElement('p');
        title.className = 'title';
        title.textContent = tutorial.title;
        const id = document.createElement('p');
        id.className = 'video-id';
        id.textContent = tutorial.id;
        const library = document.createElement('select');
        library.className = 'tutorial-library-select';
        library.setAttribute('aria-label', `Library for ${tutorial.title}`);
        [
          ['core-studio', 'Core Studio Library'],
          ['young-artists', 'Young Artists Foundations'],
          ['both', 'Both libraries']
        ].forEach(([value, label]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          library.append(option);
        });
        const libraries = Array.isArray(tutorial.libraries) ? tutorial.libraries : ['core-studio'];
        library.value = libraries.includes('core-studio') && libraries.includes('young-artists')
          ? 'both'
          : libraries.includes('young-artists') ? 'young-artists' : 'core-studio';
        library.addEventListener('change', () => updateTutorialLibrary(tutorial.id, library.value));
        details.append(episode, title, id, library, createPreviewEditor(tutorial));

        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.append(
          actionButton('Up', 'admin_move', tutorial.id, 'up', index === 0),
          actionButton('Down', 'admin_move', tutorial.id, 'down', index === libraryTutorials.length - 1),
          actionButton('Refresh', 'admin_refresh', tutorial.id),
          actionButton('Delete', 'admin_delete', tutorial.id, '', false, true)
        );

        row.append(thumbnail, details, actions);
        tutorialList.append(row);
      });
      renderPagination(document.getElementById('tutorialPagination'), 'tutorials', filtered.length, renderTutorials);
    }

    function getPage(items, type) {
      const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
      pages[type] = Math.max(1, Math.min(pages[type], totalPages));
      const start = (pages[type] - 1) * PAGE_SIZE;
      return { items: items.slice(start, start + PAGE_SIZE), totalPages: totalPages };
    }

    function resultCount(filteredCount, totalCount) {
      return filteredCount === totalCount
        ? `${totalCount} total`
        : `${filteredCount} of ${totalCount} matches`;
    }

    function renderPagination(container, type, totalItems, renderFunction) {
      container.replaceChildren();
      const totalPages = Math.ceil(totalItems / PAGE_SIZE);
      if (totalPages <= 1) return;

      const previous = document.createElement('button');
      previous.type = 'button';
      previous.className = 'page-btn';
      previous.textContent = 'Previous';
      previous.disabled = pages[type] === 1;
      if (previous.disabled) previous.dataset.locked = 'true';
      previous.addEventListener('click', () => {
        pages[type] -= 1;
        renderFunction();
      });

      const info = document.createElement('span');
      info.className = 'page-info';
      info.textContent = `Page ${pages[type]} of ${totalPages}`;

      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'page-btn';
      next.textContent = 'Next';
      next.disabled = pages[type] === totalPages;
      if (next.disabled) next.dataset.locked = 'true';
      next.addEventListener('click', () => {
        pages[type] += 1;
        renderFunction();
      });

      container.append(previous, info, next);
    }

    function actionButton(label, action, videoId, direction, disabled, danger) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `action-btn${danger ? ' delete-btn' : ''}`;
      button.textContent = label;
      button.disabled = Boolean(disabled);
      button.dataset.locked = String(Boolean(disabled));
      if (disabled) button.dataset.locked = 'true';
      button.addEventListener('click', () => updateTutorial(action, videoId, direction));
      return button;
    }

    function setBusy(isBusy) {
      document.querySelectorAll('button,input,select').forEach(element => {
        element.disabled = isBusy || element.dataset.locked === 'true';
      });
    }

    function setStatus(element, message, type) {
      element.textContent = message || '';
      element.className = `status${type ? ` ${type}` : ''}`;
    }

    function messageForCode(code) {
      const messages = {
        invalid_preview: 'Enter a display title, topic and an order from 1 to 99.',
        admin_forbidden: 'This Google account is not the studio owner account.',
        authorization_failed: 'Google authorization failed. Please sign in again.',
        google_token_rejected: 'Google rejected this sign-in session. Sign out of Google, reopen this page, and try again.',
        wrong_token_audience: 'This sign-in was not issued for the studio website. Reopen the live admin page and try again.',
        google_email_unverified: 'This Google account does not have a verified email address.',
        invalid_video_id: 'Enter a valid 11-character YouTube ID or YouTube link.',
        duplicate_video: 'That tutorial is already in the library.',
        invalid_tutorial_library: 'Choose a valid tutorial library.',
        youtube_video_not_found: 'YouTube could not find that video. Check the ID and its visibility.',
        youtube_title_unavailable: 'YouTube did not return a title for that video.',
        video_not_found: 'That tutorial is no longer in the library. Refresh and try again.',
        catalog_busy: 'Another update is in progress. Please try again in a moment.',
        invalid_student_email: 'Enter a valid student email address.',
        student_list_busy: 'Another access update is in progress. Please try again in a moment.',
        student_update_failed: 'Student access could not be updated. Please try again.',
        registration_sheet_missing: 'The Google Form response tab could not be found in the studio spreadsheet.',
        registration_sheet_unavailable: 'Registration responses could not be loaded. Please try again.',
        invalid_registration_status: 'Choose a valid follow-up status.',
        registration_not_found: 'That registration row could not be found. Reload the list and try again.',
        registration_list_busy: 'Another registration update is in progress. Please try again in a moment.',
        registration_update_failed: 'The follow-up status could not be saved. Please try again.',
        registration_email_missing: 'This registration does not contain a valid verified email address.',
        registration_approval_failed: 'Student access could not be granted from this registration. Please try again.',
        registration_not_enrolled: 'Grant this registration tutorial access before sending a welcome email.',
        welcome_gmail_authorization_required: 'Gmail permission is not authorized yet. Run authorizeGmail once in the Apps Script editor, approve the permission, and try again.',
        welcome_sender_unavailable: 'Configure hello@universeofvivek.in as a verified Gmail Send mail as address for the Apps Script owner.',
        welcome_email_quota_exceeded: 'Google has temporarily reached the email sending limit. Please try again later.',
        welcome_email_failed: 'Google could not send the welcome email. Please try again.'
      };
      return messages[code] || 'The update could not be completed. Please try again.';
    }

    function signOut() {
      clearTimeout(adminExpiryTimer);
      const token = activeAccessToken;
      activeAccessToken = '';
      currentTutorials = [];
      currentStudents = [];
      currentStudentProfiles = [];
      currentProgress = [];
      currentRegistrations = [];
      registrationsLoaded = false;
      registrationsLoading = false;
      tutorialSearch.value = '';
      studentSearch.value = '';
      progressSearch.value = '';
      registrationSearch.value = '';
      registrationFilter.value = 'All';
      pages.tutorials = 1;
      pages.students = 1;
      pages.progress = 1;
      pages.registrations = 1;
      tutorialList.replaceChildren();
      studentList.replaceChildren();
      progressList.replaceChildren();
      registrationList.replaceChildren();
      document.getElementById('registrationSummary').replaceChildren();
      document.getElementById('registrationTabCount').textContent = '0';
      document.getElementById('registrationCount').textContent = 'Not loaded';
      dashboard.style.display = 'none';
      loginPanel.style.display = 'block';
      switchAdminTab('tutorials', false);
      setStatus(loginStatus, 'Signed out.', 'success');
      setStatus(adminStatus, '');
      setStatus(studentStatus, '');
      setStatus(registrationStatus, '');
      if (token && window.google && google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(token, function() {});
      }
    }

    function expireAdminSession() {
      clearTimeout(adminExpiryTimer);
      activeAccessToken = '';
      dashboard.style.display = 'none';
      loginPanel.style.display = 'block';
      setStatus(loginStatus, 'Your session expired. Sign in again to reload the latest data.', 'error');
      document.getElementById('googleSignIn').focus();
    }

    async function refreshDashboard() {
      setBusy(true);
      const label = document.getElementById('dashboardUpdated');
      label.textContent = 'Refreshing…';
      try {
        const data = await adminRequest('admin_list');
        updateDashboardData(data);
        renderTutorials(); renderStudents(); renderProgress();
        const registrations = await adminRequest('admin_registrations_list');
        updateRegistrationData(registrations);
        renderRegistrations();
        label.textContent = `All data updated ${new Date().toLocaleTimeString()}`;
      } catch (error) {
        label.textContent = `Refresh incomplete: ${error.message}`;
      } finally { setBusy(false); }
    }

    function createPreviewEditor(tutorial) {
      const box = document.createElement('details');
      box.className = 'preview-editor';
      const summary = document.createElement('summary');
      const preview = tutorial.preview;
      summary.textContent = `Website preview · ${preview?.visibility || 'unavailable'}`;
      box.append(summary);
      if (!preview) {
        const note = document.createElement('p');
        note.textContent = 'Deploy the updated Apps Script to manage public previews.';
        box.append(note);
        return box;
      }
      const fields = {};
      function field(key, labelText, type, value) {
        const label = document.createElement('label');
        label.textContent = labelText;
        const input = document.createElement(type === 'select' ? 'select' : 'input');
        if (type !== 'select') input.type = type;
        if (type === 'select') [['private','Members only (no public card)'],['free','Free full lesson'],['teaser','Locked teaser']].forEach(([value,text]) => {
          const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option);
        });
        input.value = value;
        if (type === 'number') { input.min = '1'; input.max = '99'; input.step = '1'; }
        if (type === 'text') input.maxLength = key === 'label' ? 50 : 160;
        input.required = true;
        fields[key] = input;
        label.append(input); box.append(label);
      }
      field('visibility', 'Public visibility', 'select', preview.visibility);
      field('title', 'Display title', 'text', preview.title);
      field('label', 'Topic label', 'text', preview.label);
      field('order', 'Preview order (lowest first)', 'number', preview.order);
      const note = document.createElement('p');
      note.textContent = 'Free lessons play without sign-in. Selecting a locked teaser replaces the previous teaser. Changes appear after visitors reload.';
      box.append(note);
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save preview';
      save.addEventListener('click', async () => {
        if (!Object.values(fields).every(input => input.reportValidity())) return;
        setBusy(true);
        try {
          const values = Object.fromEntries(Object.entries(fields).map(([key,input]) => [key,input.value]));
          const data = await adminRequest('admin_preview', {videoId:tutorial.id, ...values});
          updateDashboardData(data); renderTutorials();
          setStatus(adminStatus, 'Website preview saved.', 'success');
        } catch (error) { setStatus(adminStatus, error.message, 'error'); }
        finally { setBusy(false); }
      });
      box.append(save);
      return box;
    }
