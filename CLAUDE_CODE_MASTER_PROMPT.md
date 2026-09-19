# MASTER PROMPT — PeopleShift Design Portal
# Untuk digunakan di Claude Code (claude.ai/code atau CLI `claude`)

---

## CONTEXT & IDENTITAS PROJECT

Kamu adalah engineer yang membangun **PeopleShift Design Portal** — sebuah web aplikasi internal berbasis **Google Apps Script (GAS)** untuk perusahaan training & L&D bernama Peopleshift, Jakarta.

Aplikasi ini menggantikan workflow manual (Discord + Google Docs) untuk request design ke tim kreatif. Ini bukan project baru dari nol — semua file sudah ditulis. Tugasmu adalah **verifikasi, debug, dan polish** hingga siap deploy.

---

## ARSITEKTUR SISTEM

```
Platform      : Google Apps Script Web App
Database      : Google Sheets (4 sheet)
Storage       : Google Drive (file upload)
Auth          : Email detection — Session.getActiveUser().getEmail()
Notifikasi    : MailApp (email only, no Slack/Discord)
Deploy oleh   : luqman@peopleshift.id
Access        : @peopleshift.id domain only
```

### Role System
| Email | Role |
|---|---|
| `nashihulwan@peopleshift.id` | designer |
| `luqman@peopleshift.id` | **designer_pm** (dual role) |
| `spvclass@peopleshift.id` | pm |
| `arrabbani@peopleshift.id` | pm |
| `[lain]@peopleshift.id` | requester |
| Email domain lain | unauthorized |

---

## STRUKTUR FILE PROJECT

```
design-portal/
├── appsscript.json        ← Manifest (executeAs, scopes, Drive advanced service)
├── Code.gs                ← Backend GAS (~480 baris)
├── Index.html             ← HTML shell (include CSS + JS)
├── Style.css.html         ← CSS design system lengkap (~620 baris)
└── App.js.html            ← Frontend SPA (~800 baris)
```

> Semua file GAS HTML partial menggunakan tag `<script>` atau `<style>` langsung.
> TIDAK ada `import`, TIDAK ada ES modules. Semua fungsi global scope.
> Include di Index.html menggunakan GAS template syntax: `<?!= include('Style.css'); ?>`

---

## SPESIFIKASI LENGKAP: Code.gs (Backend)

### CONFIG Object (wajib diisi setelah setup)
```javascript
const CONFIG = {
  SHEET_ID: 'YOUR_GOOGLE_SHEET_ID_HERE',
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE',
  DESIGNER_EMAILS: ['nashihulwan@peopleshift.id', 'luqman@peopleshift.id'],
  PM_EMAILS: ['spvclass@peopleshift.id', 'arrabbani@peopleshift.id', 'luqman@peopleshift.id'],
  BRANDS: ['Peopleshift', 'HR Stories', 'Shift Academy', 'Squadgames'],
  DOMAIN: '@peopleshift.id',
  STATUS: { TODO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Done', REVISION: 'Revision' },
  SHEET_NAMES: { REQUESTS: 'REQUESTS', CAROUSEL_SLIDES: 'CAROUSEL_SLIDES', COMMENTS: 'COMMENTS', STATUS_HISTORY: 'STATUS_HISTORY' }
};
```

### Fungsi-fungsi yang HARUS ada di Code.gs
```
doGet(e)                          → Routing utama, serve Index.html
include(filename)                 → Helper untuk HtmlService include
getUserInfo()                     → Return {email, name, role, isDesigner, isPM, portalUrl}
submitBrief(formData, uploadedFiles) → Upload ke Drive + append ke Sheet + kirim email
getMyRequests()                   → Role-aware list (requester hanya lihat miliknya)
getRequestDetail(requestId)       → Return request + comments + history + slides
updateStatus(requestId, status, notes) → Designer/PM only
submitOutput(requestId, link, notes) → Set status Done + email ke requester
addComment(requestId, content, isRevision) → Jika isRevision=true, set status Revision
saveCarouselSlides(requestId, slides)
getCarouselSlides(requestId)
logStatusChange(requestId, oldStatus, newStatus, notes)
getStatusHistory(requestId)
getPMAnalytics()                  → {total, byStatus, byDesigner, byDivisi, overdue, recent}
generateRequestId(divisi)         → Format: CTN-2607-0001 (prefix dari divisi)
sendNewBriefEmail(request)        → Ke semua designer + PM-only PMs
sendStatusUpdateEmail(request)    → Ke requester
sendOutputReadyEmail(request, outputLink) → Ke requester
sendRevisionEmail(request, comment)  → Ke semua designer
sendCommentEmail(request, comment, fromRole) → Ke pihak lain
setupSheets()                     → One-time setup, buat 4 sheet dengan header orange
```

### REQUESTS Sheet — 39 Kolom (urutan penting!)
```
request_id | timestamp | brief_date | nama_project | project_code | divisi | brand |
nama_client | pic_name | pic_email | deadline_output | priority | goals | platform |
uploaded_to | key_messages | headline | tagline | narasumber | event_date | event_time |
lokasi | info_tambahan | color_primary | color_secondary | color_custom | mood_feeling |
link_referensi | catatan_designer | photo_source | butuh_multiple_versi | versi_brand |
status | assigned_to | output_link | submitted_at | completed_at | deliverables | drive_files
```

Data yang berupa array disimpan sebagai JSON string (brand, platform, deliverables, dll).

### generateRequestId — Prefix Mapping
```javascript
const DIVISI_PREFIX = {
  'Content': 'CTN', 'Marketing': 'MKT', 'Operation': 'OPS',
  'Account Executive': 'AE', 'Learning Design': 'LD',
  'HR': 'HR', 'Finance': 'FIN', 'HR Stories': 'HRS',
  'Squadgames': 'SQD', 'Shift Academy': 'SA'
};
// Format: PREFIX-YYMM-NNNN (e.g., CTN-2607-0001)
```

### File Upload Pattern (GAS)
```javascript
// Frontend (browser): FileReader → base64
// Backend (GAS):
var blob = Utilities.newBlob(
  Utilities.base64Decode(file.data),
  file.mimeType,
  file.name
);
var driveFile = folder.createFile(blob);
driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
// Return: { name, url: driveFile.getUrl(), id: driveFile.getId() }
```

---

## SPESIFIKASI LENGKAP: App.js.html (Frontend SPA)

### State Management
```javascript
var APP = {
  user: null,          // dari getUserInfo()
  requests: [],        // dari getMyRequests()
  currentPage: 'dashboard',
  currentRequest: null,
  form: { step: 0, data: {}, slides: [], files: [] },
  filters: { status: 'all', search: '' },
  analytics: null,
  loading: false
};
```

### Router — 6 Pages
```
dashboard       → Tabel semua request + stats cards + filter chips
new-request     → Form multi-step 5 langkah
designer-queue  → Khusus designer: unassigned + in-progress + done
pm-analytics    → Khusus PM: stats, bar charts, overdue table
brand-assets    → Brand kit 4 brand + link asset
request-detail  → Detail lengkap + komentar + status update
```

### Form Multi-Step — 5 Step
```
Step 0: Informasi Proyek
  - Brand checkboxes (Peopleshift/HR Stories/Shift Academy/Squadgames)
  - Toggle multiple versi + version selector
  - Nama project*, project code, divisi*, client, deadline*, priority*, goals*

Step 1: Kebutuhan Visual
  - Deliverables checkboxes (23 pilihan)
  - Platform checkboxes
  - Upload targets checkboxes
  - Carousel slide builder (muncul jika "Carousel IG" dipilih)

Step 2: Detail Konten
  - Headline, tagline, key messages, info tambahan
  - Event date/time/lokasi
  - Narasumber dynamic list (tambah/hapus)
  - Photo source link
  - File upload (multi-file, base64)

Step 3: Arahan Desain
  - Color picker (primary + secondary + custom) — color input + hex text sync
  - Mood & feeling chips
  - Link referensi
  - Catatan untuk designer

Step 4: Review & Submit
  - Summary semua field penting
  - Info email recipients
  - Tombol "Kirim Brief" → encode files → call submitBrief()
```

### Deliverables List (23 item)
```javascript
var DELIVERABLES_LIST = [
  'Poster Landscape','Poster Portrait','Banner Digital','Brosur/Flyer A5',
  'Brosur/Flyer A4','Carousel IG','Story/Reel Frame','Video Reels',
  'Video Panjang','Virtual Background','Merchandise','Header Email',
  'Logo','Video Intro','Banner','Kartu Ucapan','Template Project Report',
  'Video Bumper','Thumbnail YouTube','Short Video','Sertifikat','Flyer',
  'Bumper Slide PPT','Desain Digital Ads'
];
```

### google.script.run Pattern (GAS constraint)
```javascript
// BENAR — gunakan withSuccessHandler dan withFailureHandler
google.script.run
  .withSuccessHandler(function(result) { /* handle result */ })
  .withFailureHandler(function(error) { showToast(error.message, 'error'); })
  .namaFungsiDiCodeGs(param1, param2);

// SALAH — tidak bisa pakai Promise atau async/await
// const result = await google.script.run.namaFungsi(); // ERROR!
```

---

## SPESIFIKASI: Style.css.html

### CSS Variables (Design Tokens)
```css
:root {
  --orange: #FF5E14;
  --dark: #1A1A1A;
  --bg: #F4F4F6;
  --white: #FFFFFF;
  --sidebar-w: 240px;
  --border: #E8E8E8;
  --text: #1A1A1A;
  --text-muted: #999999;
  --radius: 10px;
  --shadow: 0 2px 12px rgba(0,0,0,.08);
  --todo: #718096;
  --inprogress: #3182CE;
  --done: #38A169;
  --revision: #D69E2E;
}
```

### Komponen CSS yang WAJIB ada
```
Layout       : .app, .sidebar, .main, .topbar, .page-content
Sidebar      : .sidebar-logo, .sidebar-user, .sidebar-nav, .nav-item, .nav-icon
              .sidebar-avatar, .sidebar-user-info, .sidebar-user-role
              .role-requester, .role-designer, .role-pm, .role-designer_pm
Cards        : .card, .card-header, .card-title, .card-body
Stats        : .stats-grid, .stat-card, .stat-card-todo/ip/done/rev, .stat-icon, .stat-value, .stat-label
Table        : .request-table, .table-id, .table-project-name, .table-brand, .brand-pill
Badges       : .badge, .badge-todo, .badge-inprogress, .badge-done, .badge-revision
Priority     : .priority-badge, .priority-normal, .priority-urgent, .priority-super_urgent
Buttons      : .btn, .btn-primary, .btn-secondary, .btn-outline, .btn-danger, .btn-sm, .btn-lg, .btn-block
Forms        : .form-group, .form-label, .form-control, .form-row, .form-nav, .req
Checkboxes   : .checkbox-group, .check-item, .check-item.checked
Filter       : .filter-chip, .filter-chip.active
Stepper      : .form-stepper, .step-item, .step-item.active, .step-item.done, .step-num, .step-label, .step-connector
Slides       : .slide-builder, .slide-card, .slide-header, .slide-header-left, .slide-number, .slide-title, .slide-actions, .slide-body
Color        : .color-input-wrap, .color-swatch
Version      : .version-grid, .version-item, .version-item.selected
Upload       : .file-upload-zone, .file-upload-icon, .file-upload-label, .file-list, .file-chip
Detail       : .detail-layout, .detail-sidebar, .detail-field, .detail-section-title, .detail-grid
Timeline     : .status-timeline, .timeline-item, .timeline-dot, .timeline-content, .timeline-title, .timeline-meta
              .timeline-dot.orange, .blue, .green, .yellow
Comments     : .comment-thread, .comment-item, .comment-item.revision, .comment-header, .comment-avatar
              .comment-author, .comment-revision-tag, .comment-time, .comment-body
              .comment-form, .comment-input, .comment-actions
Designer     : .status-select-grid, .status-option, .output-submit
Charts       : .chart-wrap, .chart-title, .bar-chart, .bar-row, .bar-label, .bar-track, .bar-fill, .bar-val
Splash       : .splash-screen, .splash-logo, .splash-title, .splash-loader, .splash-bar, .fade-out
Toast        : .toast-container, .toast, .toast.success, .toast.error
Search       : .search-bar, .search-icon
Loading      : .loading-wrap, .spinner
Empty        : .empty-state, .empty-icon, .empty-title, .empty-desc
```

---

## TUGAS CLAUDE CODE

### Priority 1 — Verifikasi Konsistensi CSS ↔ JS
Cek setiap CSS class yang dipanggil di `App.js.html` ada di `Style.css.html`.
Class yang paling berisiko belum ada:
- `.status-select-grid`, `.status-option`
- `.output-submit`
- `.detail-grid`
- `.version-grid`, `.version-item`
- `.loading-wrap`, `.spinner`
- `.timeline-dot.orange`, `.blue`, `.green`, `.yellow`
- `.priority-super_urgent` (note: underscore bukan dash)

Jika ada yang missing, tambahkan ke `Style.css.html`.

### Priority 2 — Verifikasi Backend Functions
Pastikan semua fungsi yang dipanggil dari frontend via `google.script.run` memang ada di `Code.gs`:
```
getUserInfo, getMyRequests, getRequestDetail, updateStatus,
submitOutput, addComment, submitBrief, getPMAnalytics
```

### Priority 3 — Cek GAS Constraints
- Tidak ada `import` / `export` / `require`
- Tidak ada `async/await` di file GAS (`.gs`)
- Tidak ada ES6 modules
- `google.script.run` hanya bisa dipakai di browser (HTML file), bukan di `.gs`
- File size limit GAS: ~1MB per file
- MailApp limit: 100 email/hari (akun personal) atau 1500/hari (Workspace)

### Priority 4 — Test Scenario (setelah deploy)
```
[ ] Login sebagai requester → hanya lihat request sendiri
[ ] Login sebagai designer → lihat semua, bisa update status
[ ] Login sebagai pm → lihat analytics, tidak bisa ubah status dari designer controls
[ ] Login sebagai luqman → lihat semua (designer + PM tabs)
[ ] Submit brief dengan carousel → slide tersimpan di CAROUSEL_SLIDES sheet
[ ] Upload file → muncul di Drive folder yang ditentukan
[ ] Update status ke Done + submit output link → email terkirim ke requester
[ ] Tambah komentar dengan flag revisi → status berubah ke Revision
```

### Priority 5 — Enhancement (jika semua di atas sudah OK)
- Tambah assign designer dari PM dashboard (dropdown pilih designer)
- Tambah filter by divisi di designer queue
- Tambah pagination jika request sudah > 50
- Export data ke CSV dari PM Analytics
- Tambah foto narasumber upload (base64 → Drive → URL disimpan di narasumber JSON)

---

## CARA BEKERJA DI CLAUDE CODE

### Setup Awal
```bash
# Buat folder project
mkdir peopleshift-design-portal
cd peopleshift-design-portal

# Salin semua file yang sudah ada ke folder ini:
# Code.gs, Index.html, Style.css.html, App.js.html, appsscript.json, SETUP.md

# Untuk deploy ke GAS, gunakan clasp (Google Apps Script CLI)
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "PeopleShift Design Portal"
# Ini akan buat .clasp.json dengan scriptId
```

### Deploy dengan clasp
```bash
# Push semua file ke GAS
clasp push

# Buka editor GAS di browser
clasp open

# Deploy sebagai web app
clasp deploy --description "v1.0"
```

### File yang perlu rename untuk clasp
clasp menggunakan ekstensi `.html` untuk semua HTML file di GAS.
Pastikan nama file di folder lokal:
```
Code.gs           → Code.gs
Index.html        → Index.html
Style.css.html    → Style.css.html   (GAS akan baca nama file tanpa .html terakhir: "Style.css")
App.js.html       → App.js.html      (GAS akan baca: "App.js")
appsscript.json   → appsscript.json
```

---

## PENTING: GAS-SPECIFIC GOTCHAS

### 1. HtmlService Include
```javascript
// Di Code.gs
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
// Di Index.html
<?!= include('Style.css'); ?>   // Note: nama file tanpa .html
<?!= include('App.js'); ?>
```

### 2. CORS & External Resources
GAS web app tidak bisa fetch external API dari frontend JS karena CSP.
Semua external calls harus lewat `google.script.run` → backend GAS.

### 3. Session & Auth
```javascript
// Di GAS backend — ini return email user yang login
var email = Session.getActiveUser().getEmail();
// Ini HANYA bekerja jika executeAs = 'USER_ACCESSING'
// Jika executeAs = 'USER_DEPLOYING' → selalu return email deployer
```

### 4. Return Values dari google.script.run
Hanya bisa return: string, number, boolean, array, object biasa.
TIDAK bisa return: Date objects (jadikan string), undefined (jadikan null), functions.

### 5. Payload Size Limit
File upload via base64: Apps Script punya limit ~6MB per request.
Untuk file besar, pertimbangkan chunked upload atau direct Drive API.

### 6. SpreadsheetApp.flush()
Setelah batch write ke Sheet, panggil `SpreadsheetApp.flush()` untuk memastikan data tersimpan sebelum function return.

---

## EMAIL TEMPLATES (Design Reference)

### New Brief Email
- Header: logo PeopleShift + judul "Brief Design Baru"
- Info: request_id, nama_project, brand, deadline, priority, divisi
- Deliverables list
- Link ke portal (ScriptApp.getService().getUrl())
- Tombol CTA "Buka Design Portal"
- Footer: warna orange #FF5E14, font Poppins

### Output Ready Email (ke requester)
- Subject: "✅ Design Selesai — [nama_project]"
- Output link sebagai tombol besar
- Timeline singkat (tanggal request → tanggal selesai)

---

## KONFIGURASI YANG HARUS DIUPDATE SEBELUM DEPLOY

File `Code.gs`, baris CONFIG:
```javascript
SHEET_ID: '',        // ← Isi dengan Google Sheets ID
DRIVE_FOLDER_ID: '', // ← Isi dengan Google Drive Folder ID
```

Cara dapat ID:
- Sheet ID: dari URL `https://docs.google.com/spreadsheets/d/**[ID INI]**/edit`
- Folder ID: dari URL `https://drive.google.com/drive/folders/**[ID INI]**`

---

## CHECKLIST SEBELUM HANDOVER KE TIM

```
[ ] Semua file tersimpan dan push via clasp
[ ] CONFIG.SHEET_ID dan DRIVE_FOLDER_ID sudah diisi
[ ] setupSheets() sudah dijalankan — 4 sheet terbentuk
[ ] Test submit brief → data masuk ke REQUESTS sheet
[ ] Test email notification → diterima oleh nashihulwan dan luqman
[ ] Test upload file → file muncul di Drive folder
[ ] Deploy sebagai Web App dengan access "Anyone within peopleshift.id"
[ ] URL sudah dishare ke tim
[ ] SETUP.md dibaca oleh luqman sebagai deployer
```

---

*File ini adalah master brief untuk Claude Code session. Copy-paste sebagai opening prompt.*
*Project: PeopleShift Design Portal | Engineer: Tim Ops Peopleshift | July 2026*
