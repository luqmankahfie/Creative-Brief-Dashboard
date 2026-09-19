// ============================================================
// PEOPLESHIFT DESIGN PORTAL — Code.gs
// Backend Google Apps Script
// Deploy: luqman@peopleshift.id
// ============================================================

// ---- CONFIGURATION (EDIT BEFORE DEPLOY) --------------------
const CONFIG = {
  SHEET_ID: 'YOUR_GOOGLE_SHEET_ID_HERE',       // Ganti dengan ID Google Sheet kamu
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE', // Ganti dengan ID folder Drive untuk uploads

  DESIGNER_EMAILS: [
    'nashihulwan@peopleshift.id',
    'luqman@peopleshift.id'
  ],
  PM_EMAILS: [
    'spvclass@peopleshift.id',
    'arrabbani@peopleshift.id',
    'luqman@peopleshift.id'  // dual role: designer + PM
  ],
  BRANDS: ['Peopleshift', 'HR Stories', 'Shift Academy', 'Squadgames'],
  DOMAIN: '@peopleshift.id',

  STATUS: {
    TODO: 'To Do',
    IN_PROGRESS: 'In Progress',
    DONE: 'Done',
    REVISION: 'Revision'
  },

  SHEET_NAMES: {
    REQUESTS: 'REQUESTS',
    CAROUSEL_SLIDES: 'CAROUSEL_SLIDES',
    COMMENTS: 'COMMENTS',
    STATUS_HISTORY: 'STATUS_HISTORY'
  }
};

// ---- ROUTING ------------------------------------------------
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('PeopleShift Design Portal')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---- USER MANAGEMENT ----------------------------------------
function getUserInfo() {
  const email = Session.getActiveUser().getEmail();
  const isDesigner = CONFIG.DESIGNER_EMAILS.includes(email);
  const isPM = CONFIG.PM_EMAILS.includes(email);
  const isDomain = email.endsWith(CONFIG.DOMAIN);

  let role = 'unauthorized';
  if (isDesigner && isPM) role = 'designer_pm';
  else if (isDesigner) role = 'designer';
  else if (isPM) role = 'pm';
  else if (isDomain) role = 'requester';

  // Derive display name from email local part
  const localPart = email.split('@')[0];
  const name = localPart.charAt(0).toUpperCase() + localPart.slice(1).replace(/\./g, ' ');

  return {
    email,
    name,
    role,
    isDesigner,
    isPM,
    portalUrl: ScriptApp.getService().getUrl()
  };
}

// ---- SHEET HELPERS ------------------------------------------
function getSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SHEET_ID);
}

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    let val = row[i];
    if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
      try { val = JSON.parse(val); } catch (_) {}
    }
    obj[h] = val !== undefined ? val : '';
  });
  return obj;
}

// ---- REQUEST SUBMISSION -------------------------------------
function submitBrief(formData, uploadedFiles) {
  const user = getUserInfo();
  if (!['requester', 'pm', 'designer', 'designer_pm'].includes(user.role)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const requestId = generateRequestId(formData.divisi);
    const timestamp = new Date().toISOString();

    // Handle file uploads to Drive
    const driveLinks = [];
    if (uploadedFiles && uploadedFiles.length > 0) {
      const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
      const reqFolder = folder.createFolder(requestId + ' - ' + (formData.nama_project || 'Brief'));

      uploadedFiles.forEach(f => {
        if (f && f.data && f.name) {
          try {
            const blob = Utilities.newBlob(
              Utilities.base64Decode(f.data),
              f.mimeType || 'application/octet-stream',
              f.name
            );
            const driveFile = reqFolder.createFile(blob);
            driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            driveLinks.push({ name: f.name, url: driveFile.getUrl() });
          } catch (fe) {
            Logger.log('File upload error: ' + f.name + ' - ' + fe.message);
          }
        }
      });
    }

    const sheet = getSheet(CONFIG.SHEET_NAMES.REQUESTS);
    const row = [
      requestId,
      timestamp,
      Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy'),
      formData.nama_project || '',
      formData.project_code || '',
      formData.divisi || '',
      JSON.stringify(formData.brand || []),
      formData.nama_client || '',
      user.name,
      user.email,
      formData.deadline_output || '',
      formData.priority || 'Normal',
      formData.goals || '',
      JSON.stringify(formData.platform || []),
      JSON.stringify(formData.uploaded_to || []),
      formData.key_messages || '',
      formData.headline || '',
      formData.tagline || '',
      JSON.stringify(formData.narasumber || []),
      formData.event_date || '',
      formData.event_time || '',
      formData.lokasi || '',
      formData.info_tambahan || '',
      formData.color_primary || '#FF5E14',
      formData.color_secondary || '#1A1A1A',
      formData.color_custom || '',
      JSON.stringify(formData.mood_feeling || []),
      formData.link_referensi || '',
      formData.catatan_designer || '',
      formData.photo_source || '',
      formData.butuh_multiple_versi ? 'true' : 'false',
      JSON.stringify(formData.versi_brand || []),
      CONFIG.STATUS.TODO,
      '',  // assigned_to
      '',  // output_link
      '',  // submitted_at
      '',  // completed_at
      JSON.stringify(formData.deliverables || []),
      JSON.stringify(driveLinks)
    ];

    sheet.appendRow(row);

    // Save carousel slides
    if (formData.carousel_slides && formData.carousel_slides.length > 0) {
      saveCarouselSlides(requestId, formData.carousel_slides);
    }

    // Log initial status
    logStatusChange(requestId, '', CONFIG.STATUS.TODO, user.email, 'Brief submitted');

    // Send email to all designers
    sendNewBriefEmail(requestId, formData, user, driveLinks);

    return { success: true, requestId };

  } catch (e) {
    Logger.log('submitBrief error: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ---- REQUEST QUERIES ----------------------------------------
function getMyRequests() {
  const user = getUserInfo();
  const sheet = getSheet(CONFIG.SHEET_NAMES.REQUESTS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const picEmailIdx = headers.indexOf('pic_email');
  const requests = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    // Designers and PMs see all; requesters see only their own
    if (user.isDesigner || user.isPM || row[picEmailIdx] === user.email) {
      requests.push(rowToObject(headers, row));
    }
  }

  return requests;
}

function getRequestDetail(requestId) {
  const user = getUserInfo();
  const sheet = getSheet(CONFIG.SHEET_NAMES.REQUESTS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const picEmailIdx = headers.indexOf('pic_email');

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === requestId) {
      // Access control: requester can only see own requests
      if (!user.isDesigner && !user.isPM && data[i][picEmailIdx] !== user.email) {
        return { error: 'Access denied' };
      }
      const request = rowToObject(headers, data[i]);
      request.comments = getComments(requestId);
      request.status_history = getStatusHistory(requestId);
      request.carousel_slides = getCarouselSlides(requestId);
      return request;
    }
  }
  return null;
}

// ---- STATUS MANAGEMENT (Designer/PM only) -------------------
function updateStatus(requestId, newStatus, notes) {
  const user = getUserInfo();
  if (!user.isDesigner && !user.isPM) {
    return { success: false, error: 'Unauthorized' };
  }

  const sheet = getSheet(CONFIG.SHEET_NAMES.REQUESTS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const statusIdx = headers.indexOf('status') + 1;
  const assignedIdx = headers.indexOf('assigned_to') + 1;
  const completedIdx = headers.indexOf('completed_at') + 1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === requestId) {
      const oldStatus = data[i][statusIdx - 1];
      sheet.getRange(i + 1, statusIdx).setValue(newStatus);
      if (!data[i][assignedIdx - 1]) {
        sheet.getRange(i + 1, assignedIdx).setValue(user.email);
      }
      if (newStatus === CONFIG.STATUS.DONE) {
        sheet.getRange(i + 1, completedIdx).setValue(new Date().toISOString());
      }

      logStatusChange(requestId, oldStatus, newStatus, user.email, notes || '');

      const request = rowToObject(headers, data[i]);
      sendStatusUpdateEmail(request, oldStatus, newStatus, notes, user);

      return { success: true };
    }
  }
  return { success: false, error: 'Request not found' };
}

function submitOutput(requestId, outputLink, notes) {
  const user = getUserInfo();
  if (!user.isDesigner && !user.isPM) {
    return { success: false, error: 'Unauthorized' };
  }

  const sheet = getSheet(CONFIG.SHEET_NAMES.REQUESTS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const outputIdx = headers.indexOf('output_link') + 1;
  const submittedIdx = headers.indexOf('submitted_at') + 1;
  const statusIdx = headers.indexOf('status') + 1;
  const assignedIdx = headers.indexOf('assigned_to') + 1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === requestId) {
      const oldStatus = data[i][statusIdx - 1];
      sheet.getRange(i + 1, outputIdx).setValue(outputLink);
      sheet.getRange(i + 1, submittedIdx).setValue(new Date().toISOString());
      sheet.getRange(i + 1, statusIdx).setValue(CONFIG.STATUS.DONE);
      sheet.getRange(i + 1, assignedIdx).setValue(user.email);

      logStatusChange(requestId, oldStatus, CONFIG.STATUS.DONE, user.email,
        'Output submitted: ' + outputLink + (notes ? ' | ' + notes : ''));

      const request = rowToObject(headers, data[i]);
      sendOutputReadyEmail(request, outputLink, notes);

      return { success: true };
    }
  }
  return { success: false, error: 'Request not found' };
}

// ---- COMMENTS & REVISION ------------------------------------
function addComment(requestId, content, isRevision) {
  const user = getUserInfo();

  const sheet = getSheet(CONFIG.SHEET_NAMES.COMMENTS);
  const commentId = 'CMT-' + Date.now();

  sheet.appendRow([
    commentId,
    requestId,
    new Date().toISOString(),
    user.email,
    user.name,
    user.role,
    content,
    isRevision ? 'true' : 'false'
  ]);

  if (isRevision) {
    // Update request status to Revision
    const reqSheet = getSheet(CONFIG.SHEET_NAMES.REQUESTS);
    const data = reqSheet.getDataRange().getValues();
    const headers = data[0];
    const statusIdx = headers.indexOf('status') + 1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === requestId) {
        const oldStatus = data[i][statusIdx - 1];
        reqSheet.getRange(i + 1, statusIdx).setValue(CONFIG.STATUS.REVISION);
        logStatusChange(requestId, oldStatus, CONFIG.STATUS.REVISION, user.email, content);

        const request = rowToObject(headers, data[i]);
        sendRevisionEmail(request, content, user);
        break;
      }
    }
  } else {
    // Regular comment — notify the other party
    const reqSheet = getSheet(CONFIG.SHEET_NAMES.REQUESTS);
    const data = reqSheet.getDataRange().getValues();
    const headers = data[0];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === requestId) {
        const request = rowToObject(headers, data[i]);
        sendCommentEmail(request, content, user);
        break;
      }
    }
  }

  return { success: true, commentId };
}

function getComments(requestId) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.COMMENTS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(r => r[1] === requestId)
    .map(r => rowToObject(headers, r));
}

// ---- CAROUSEL SLIDES ----------------------------------------
function saveCarouselSlides(requestId, slides) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.CAROUSEL_SLIDES);
  slides.forEach((slide, i) => {
    sheet.appendRow([
      'SLD-' + requestId + '-' + (i + 1),
      requestId,
      slide.deliverable_type || 'Carousel IG',
      slide.slide_number || i + 1,
      slide.slide_type || '',
      slide.headline || '',
      slide.body_text || '',
      slide.visual_direction || '',
      slide.benchmark_url || ''
    ]);
  });
}

function getCarouselSlides(requestId) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.CAROUSEL_SLIDES);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(r => r[1] === requestId)
    .map(r => rowToObject(headers, r));
}

// ---- STATUS HISTORY -----------------------------------------
function logStatusChange(requestId, oldStatus, newStatus, changedBy, notes) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.STATUS_HISTORY);
  sheet.appendRow([
    'STH-' + Date.now(),
    requestId,
    new Date().toISOString(),
    oldStatus,
    newStatus,
    changedBy,
    notes || ''
  ]);
}

function getStatusHistory(requestId) {
  const sheet = getSheet(CONFIG.SHEET_NAMES.STATUS_HISTORY);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(r => r[1] === requestId)
    .map(r => rowToObject(headers, r));
}

// ---- PM ANALYTICS -------------------------------------------
function getPMAnalytics() {
  const user = getUserInfo();
  if (!user.isPM) return { error: 'Unauthorized' };

  const sheet = getSheet(CONFIG.SHEET_NAMES.REQUESTS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { total: 0, byStatus: {}, byDesigner: {}, overdue: [], recent: [] };
  }

  const headers = data[0];
  const cols = {
    status: headers.indexOf('status'),
    assigned: headers.indexOf('assigned_to'),
    deadline: headers.indexOf('deadline_output'),
    project: headers.indexOf('nama_project'),
    picName: headers.indexOf('pic_name'),
    picEmail: headers.indexOf('pic_email'),
    divisi: headers.indexOf('divisi'),
    submitted: headers.indexOf('timestamp')
  };

  const now = new Date();
  const analytics = {
    total: data.length - 1,
    byStatus: { 'To Do': 0, 'In Progress': 0, 'Done': 0, 'Revision': 0 },
    byDesigner: {},
    byDivisi: {},
    overdue: [],
    recent: []
  };

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[cols.status] || 'To Do';
    const assigned = row[cols.assigned];
    const deadlineStr = row[cols.deadline];
    const divisi = row[cols.divisi] || 'Unknown';

    analytics.byStatus[status] = (analytics.byStatus[status] || 0) + 1;

    if (assigned) {
      const shortName = assigned.split('@')[0];
      analytics.byDesigner[shortName] = (analytics.byDesigner[shortName] || 0) + 1;
    }

    analytics.byDivisi[divisi] = (analytics.byDivisi[divisi] || 0) + 1;

    // Check overdue (deadline passed & not done)
    if (deadlineStr && status !== 'Done') {
      const deadline = new Date(deadlineStr);
      if (deadline < now) {
        analytics.overdue.push({
          request_id: row[0],
          nama_project: row[cols.project],
          deadline: deadlineStr,
          status,
          pic_name: row[cols.picName]
        });
      }
    }
  }

  // Recent 10 requests
  analytics.recent = data.slice(Math.max(1, data.length - 10))
    .reverse()
    .map(r => rowToObject(headers, r));

  return analytics;
}

// ---- ID GENERATOR -------------------------------------------
function generateRequestId(divisi) {
  const map = {
    'Content': 'CTN', 'Marketing': 'MKT', 'Operation': 'OPS',
    'Account Executive': 'AE', 'Learning Design': 'LD',
    'HR Stories': 'HRS', 'Squadgames': 'SG', 'Shift Academy': 'SA',
    'HR': 'HR', 'Finance': 'FIN'
  };
  const prefix = map[divisi] || 'GEN';
  const mm = ('0' + (new Date().getMonth() + 1)).slice(-2);
  const yy = String(new Date().getFullYear()).slice(-2);
  const sheet = getSheet(CONFIG.SHEET_NAMES.REQUESTS);
  const count = Math.max(1, sheet.getLastRow()); // includes header
  return prefix + '-' + yy + mm + '-' + String(count).padStart(4, '0');
}

// ---- EMAIL NOTIFICATIONS ------------------------------------
function getPortalUrl() {
  try { return ScriptApp.getService().getUrl(); }
  catch (_) { return 'https://script.google.com'; }
}

function emailHeader(title, subtitle, bgColor) {
  bgColor = bgColor || '#FF5E14';
  return `
    <div style="background:${bgColor};color:#fff;padding:28px 36px;border-radius:12px 12px 0 0;text-align:center;">
      <div style="font-size:11px;letter-spacing:2px;opacity:.7;text-transform:uppercase;margin-bottom:6px;">PeopleShift Design Portal</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;">${title}</h1>
      ${subtitle ? `<p style="margin:6px 0 0;opacity:.85;font-size:14px;">${subtitle}</p>` : ''}
    </div>`;
}

function emailFooter() {
  return `
    <div style="text-align:center;margin-top:28px;">
      <a href="${getPortalUrl()}" style="display:inline-block;background:#FF5E14;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Buka Design Portal →</a>
    </div>
    <p style="text-align:center;margin-top:16px;font-size:11px;color:#bbb;">Email dikirim otomatis oleh PeopleShift Design Portal.</p>`;
}

function sendNewBriefEmail(requestId, formData, user, driveLinks) {
  const brandArr = Array.isArray(formData.brand) ? formData.brand : [formData.brand];
  const brandStr = brandArr.filter(Boolean).join(' + ') || 'Peopleshift';
  const delivArr = Array.isArray(formData.deliverables) ? formData.deliverables : [];
  const delivStr = delivArr.map(d => typeof d === 'object' ? d.type : d).join(', ') || '-';

  const priorityColors = { 'Super Urgent': '#e53e3e', 'Urgent': '#dd6b20', 'Normal': '#38a169' };
  const pColor = priorityColors[formData.priority] || '#38a169';

  const driveSection = driveLinks && driveLinks.length > 0
    ? `<div style="background:#f0f8ff;border-left:4px solid #3182ce;padding:12px 16px;border-radius:0 8px 8px 0;margin-top:16px;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#2b6cb0;">📎 File yang diupload requester:</p>
        <ul style="margin:8px 0 0;padding-left:20px;">${driveLinks.map(f => `<li><a href="${f.url}" style="color:#3182ce;">${f.name}</a></li>`).join('')}</ul>
       </div>`
    : '';

  const multiVersiSection = (formData.butuh_multiple_versi && formData.versi_brand && formData.versi_brand.length)
    ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;width:38%;">Versi yang dibutuhkan</td>
        <td style="padding:6px 0;font-weight:600;color:#FF5E14;">${formData.versi_brand.join(' + ')}</td></tr>`
    : '';

  const body = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:20px;">
    ${emailHeader('🎨 Creative Brief Baru', formData.nama_project, '#FF5E14')}
    <div style="background:#fff;padding:28px 36px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,.06);">

      <div style="background:#fff8f5;border-left:4px solid #FF5E14;padding:14px 18px;margin-bottom:24px;border-radius:0 10px 10px 0;">
        <p style="margin:0;font-size:12px;color:#888;">Request ID</p>
        <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:#FF5E14;">${requestId}</p>
        <span style="background:${pColor};color:#fff;padding:2px 12px;border-radius:20px;font-size:12px;font-weight:700;">${formData.priority || 'Normal'}</span>
      </div>

      <h3 style="color:#FF5E14;border-bottom:2px solid #FF5E14;padding-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">📋 INFORMASI PROYEK</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:6px 0;color:#888;font-size:13px;width:38%;">Nama Project</td><td style="padding:6px 0;font-weight:700;font-size:15px;">${formData.nama_project || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Project Code</td><td style="padding:6px 0;">${formData.project_code || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Brand</td><td style="padding:6px 0;font-weight:700;color:#FF5E14;">${brandStr}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Divisi/Tim</td><td style="padding:6px 0;">${formData.divisi || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Nama Client</td><td style="padding:6px 0;">${formData.nama_client || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">PIC Requester</td><td style="padding:6px 0;">${user.name} &lt;${user.email}&gt;</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Deadline Output</td><td style="padding:6px 0;font-weight:700;color:#e53e3e;">${formData.deadline_output || '-'}</td></tr>
        ${multiVersiSection}
      </table>

      <h3 style="color:#FF5E14;border-bottom:2px solid #FF5E14;padding-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">🎯 GOALS & KEBUTUHAN VISUAL</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:6px 0;color:#888;font-size:13px;width:38%;">Goals</td><td style="padding:6px 0;font-weight:600;">${formData.goals || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Platform</td><td style="padding:6px 0;">${Array.isArray(formData.platform) ? formData.platform.join(', ') : (formData.platform || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Uploaded to</td><td style="padding:6px 0;">${Array.isArray(formData.uploaded_to) ? formData.uploaded_to.join(', ') : (formData.uploaded_to || '-')}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Deliverables</td><td style="padding:6px 0;font-weight:600;">${delivStr}</td></tr>
      </table>

      <h3 style="color:#FF5E14;border-bottom:2px solid #FF5E14;padding-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">💡 DETAIL KONTEN</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:6px 0;color:#888;font-size:13px;width:38%;">Headline/Judul</td><td style="padding:6px 0;font-weight:600;">${formData.headline || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Tagline</td><td style="padding:6px 0;">${formData.tagline || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Key Messages</td><td style="padding:6px 0;">${formData.key_messages || '-'}</td></tr>
        ${formData.photo_source ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;">Photo Source</td><td style="padding:6px 0;"><a href="${formData.photo_source}" style="color:#3182ce;">Buka Folder Drive ↗</a></td></tr>` : ''}
      </table>

      <h3 style="color:#FF5E14;border-bottom:2px solid #FF5E14;padding-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">🎨 PALET WARNA</h3>
      <div style="display:flex;gap:10px;margin-bottom:20px;">
        <div style="flex:1;background:${formData.color_primary||'#FF5E14'};padding:14px;border-radius:8px;color:#fff;text-align:center;font-weight:700;font-size:13px;">${formData.color_primary||'#FF5E14'}<br><span style="font-size:11px;opacity:.8;">Primary</span></div>
        <div style="flex:1;background:${formData.color_secondary||'#1A1A1A'};padding:14px;border-radius:8px;color:#fff;text-align:center;font-weight:700;font-size:13px;">${formData.color_secondary||'#1A1A1A'}<br><span style="font-size:11px;opacity:.8;">Secondary</span></div>
        ${formData.color_custom ? `<div style="flex:1;background:${formData.color_custom};padding:14px;border-radius:8px;color:#fff;text-align:center;font-weight:700;font-size:13px;">${formData.color_custom}<br><span style="font-size:11px;opacity:.8;">Custom</span></div>` : ''}
      </div>

      ${formData.mood_feeling && formData.mood_feeling.length ? `
      <p style="font-size:13px;color:#888;margin-bottom:6px;">Mood & Feeling</p>
      <div style="margin-bottom:20px;">${(Array.isArray(formData.mood_feeling) ? formData.mood_feeling : [formData.mood_feeling]).map(m => `<span style="background:#f0f0f0;padding:4px 12px;border-radius:20px;font-size:12px;margin:2px;display:inline-block;">${m}</span>`).join('')}</div>` : ''}

      ${formData.catatan_designer ? `
      <div style="background:#fffbf0;border-left:4px solid #d69e2e;padding:14px 18px;border-radius:0 10px 10px 0;margin-bottom:16px;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#b7791f;">📝 Catatan untuk Designer:</p>
        <p style="margin:8px 0 0;font-size:14px;">${formData.catatan_designer}</p>
      </div>` : ''}

      ${formData.link_referensi ? `<p style="font-size:13px;margin-bottom:16px;"><strong>Link Referensi:</strong> <a href="${formData.link_referensi}" style="color:#3182ce;">${formData.link_referensi}</a></p>` : ''}

      ${driveSection}
      ${emailFooter()}
    </div>
  </div>`;

  const subject = `🎨 [NEW BRIEF] ${requestId} — ${formData.nama_project}`;
  CONFIG.DESIGNER_EMAILS.forEach(to => {
    MailApp.sendEmail({ to, subject, htmlBody: body, name: 'PeopleShift Design Portal' });
  });
  // Also CC the PM list (excluding designers who already received it)
  CONFIG.PM_EMAILS.forEach(to => {
    if (!CONFIG.DESIGNER_EMAILS.includes(to)) {
      MailApp.sendEmail({ to, subject, htmlBody: body, name: 'PeopleShift Design Portal' });
    }
  });
}

function sendStatusUpdateEmail(request, oldStatus, newStatus, notes, designer) {
  const picEmail = request.pic_email;
  if (!picEmail) return;

  const statusColors = {
    'To Do': '#718096', 'In Progress': '#3182ce',
    'Done': '#38a169', 'Revision': '#d69e2e'
  };

  const body = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:20px;">
    ${emailHeader('Update Status Design', request.request_id + ' — ' + request.nama_project)}
    <div style="background:#fff;padding:28px 36px;border-radius:0 0 12px 12px;">
      <p style="font-size:15px;">Halo <strong>${request.pic_name}</strong>,</p>
      <p>Tim kreatif telah memperbarui status design request kamu:</p>
      <div style="text-align:center;padding:28px;background:#f7fafc;border-radius:12px;margin:20px 0;">
        <p style="margin:0 0 16px;font-size:13px;color:#888;">${request.request_id} — ${request.nama_project}</p>
        <div style="display:flex;align-items:center;justify-content:center;gap:16px;">
          <span style="padding:6px 18px;border-radius:20px;background:#e8e8e8;font-size:14px;color:#666;">${oldStatus}</span>
          <span style="font-size:22px;">→</span>
          <span style="padding:8px 24px;border-radius:20px;background:${statusColors[newStatus]||'#718096'};color:#fff;font-size:16px;font-weight:700;">${newStatus}</span>
        </div>
        ${notes ? `<p style="margin:14px 0 0;font-size:13px;color:#666;font-style:italic;">"${notes}"</p>` : ''}
        <p style="margin:10px 0 0;font-size:12px;color:#aaa;">oleh: ${designer.name}</p>
      </div>
      ${emailFooter()}
    </div>
  </div>`;

  MailApp.sendEmail({
    to: picEmail,
    subject: `📋 [STATUS] ${request.request_id} → ${newStatus}`,
    htmlBody: body,
    name: 'PeopleShift Design Portal'
  });
}

function sendOutputReadyEmail(request, outputLink, notes) {
  const picEmail = request.pic_email;
  if (!picEmail) return;

  const body = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:20px;">
    ${emailHeader('✅ Design Selesai!', request.nama_project + ' sudah siap dikerjakan', '#38a169')}
    <div style="background:#fff;padding:28px 36px;border-radius:0 0 12px 12px;">
      <p>Halo <strong>${request.pic_name}</strong>,</p>
      <p>Design request kamu <strong>${request.request_id}</strong> sudah selesai dikerjakan oleh tim kreatif. Yuk cek hasilnya!</p>
      <div style="text-align:center;background:#f0fff4;border:2px solid #68d391;border-radius:12px;padding:28px;margin:24px 0;">
        <p style="font-size:13px;color:#888;margin:0 0 16px;">Hasil Design:</p>
        <a href="${outputLink}" style="display:inline-block;background:#38a169;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:800;font-size:16px;">Buka Hasil Design ↗</a>
        ${notes ? `<p style="margin:14px 0 0;font-size:13px;color:#666;">${notes}</p>` : ''}
      </div>
      <p style="font-size:13px;color:#666;background:#fffbf0;padding:12px 16px;border-radius:8px;">💡 Jika ada revisi, buka Design Portal dan tambahkan komentar di halaman detail request. Tim kreatif akan segera merespons.</p>
      ${emailFooter()}
    </div>
  </div>`;

  MailApp.sendEmail({
    to: picEmail,
    subject: `✅ [DONE] ${request.request_id} — ${request.nama_project} sudah siap!`,
    htmlBody: body,
    name: 'PeopleShift Design Portal'
  });
}

function sendRevisionEmail(request, revisionNote, user) {
  const body = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:20px;">
    ${emailHeader('🔄 Ada Permintaan Revisi', request.request_id + ' — ' + request.nama_project, '#d69e2e')}
    <div style="background:#fff;padding:28px 36px;border-radius:0 0 12px 12px;">
      <p>Revisi diterima untuk request <strong>${request.request_id}</strong> — <strong>${request.nama_project}</strong></p>
      <p><strong>Dari:</strong> ${user.name} (${user.email})</p>
      <div style="background:#fffbf0;border-left:4px solid #d69e2e;padding:16px 18px;border-radius:0 10px 10px 0;margin:20px 0;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#b7791f;">Catatan Revisi:</p>
        <p style="margin:8px 0 0;font-size:15px;">${revisionNote}</p>
      </div>
      ${emailFooter()}
    </div>
  </div>`;

  CONFIG.DESIGNER_EMAILS.forEach(to => {
    MailApp.sendEmail({
      to,
      subject: `🔄 [REVISI] ${request.request_id} — ${request.nama_project}`,
      htmlBody: body,
      name: 'PeopleShift Design Portal'
    });
  });
}

function sendCommentEmail(request, content, author) {
  // Notify the other party (if requester commented → notify designer, and vice versa)
  const recipients = author.isDesigner
    ? [request.pic_email].filter(Boolean)
    : CONFIG.DESIGNER_EMAILS;

  const body = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:20px;">
    ${emailHeader('💬 Komentar Baru', request.request_id + ' — ' + request.nama_project, '#3182ce')}
    <div style="background:#fff;padding:28px 36px;border-radius:0 0 12px 12px;">
      <p><strong>${author.name}</strong> menambahkan komentar:</p>
      <div style="background:#f0f8ff;border-left:4px solid #3182ce;padding:16px;border-radius:0 10px 10px 0;margin:16px 0;font-size:15px;">${content}</div>
      ${emailFooter()}
    </div>
  </div>`;

  recipients.forEach(to => {
    MailApp.sendEmail({
      to,
      subject: `💬 [KOMENTAR] ${request.request_id} — ${request.nama_project}`,
      htmlBody: body,
      name: 'PeopleShift Design Portal'
    });
  });
}

// ---- INITIAL SETUP (run once in Apps Script editor) --------
function setupSheets() {
  const ss = getSpreadsheet();

  const schemas = {
    REQUESTS: [
      'request_id','timestamp','brief_date','nama_project','project_code',
      'divisi','brand','nama_client','pic_name','pic_email',
      'deadline_output','priority','goals','platform','uploaded_to',
      'key_messages','headline','tagline','narasumber',
      'event_date','event_time','lokasi','info_tambahan',
      'color_primary','color_secondary','color_custom',
      'mood_feeling','link_referensi','catatan_designer','photo_source',
      'butuh_multiple_versi','versi_brand',
      'status','assigned_to','output_link','submitted_at','completed_at',
      'deliverables','drive_files'
    ],
    CAROUSEL_SLIDES: [
      'slide_id','request_id','deliverable_type','slide_number',
      'slide_type','headline','body_text','visual_direction','benchmark_url'
    ],
    COMMENTS: [
      'comment_id','request_id','timestamp','author_email',
      'author_name','author_role','content','is_revision'
    ],
    STATUS_HISTORY: [
      'id','request_id','timestamp','old_status','new_status','changed_by','notes'
    ]
  };

  Object.entries(schemas).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      const range = sheet.getRange(1, 1, 1, headers.length);
      range.setBackground('#FF5E14').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });

  Logger.log('✅ Sheets setup complete! Sheets created: ' + Object.keys(schemas).join(', '));
}
