# PeopleShift Design Portal — Panduan Deploy

**Deploy oleh:** luqman@peopleshift.id  
**Platform:** Google Apps Script Web App  
**Estimasi waktu setup:** 30–45 menit

---

## Langkah 1 — Buat Google Sheet

1. Buka [sheets.google.com](https://sheets.google.com) dengan akun `luqman@peopleshift.id`
2. Buat spreadsheet baru → beri nama: **"Design Portal DB"**
3. Salin **Spreadsheet ID** dari URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_ADA_DI_SINI/edit
   ```
4. Sheet pertama (Sheet1) bisa dibiarkan dulu — akan otomatis dibuat ulang saat `setupSheets()` dijalankan

---

## Langkah 2 — Buat Google Drive Folder

1. Buka [drive.google.com](https://drive.google.com)
2. Buat folder baru → beri nama: **"Design Portal Uploads"**
3. Klik kanan folder → **Get link** → salin **Folder ID** dari URL:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID_ADA_DI_SINI
   ```
4. Share folder ini ke `nashihulwan@peopleshift.id` dengan akses **Editor**

---

## Langkah 3 — Buat Project Apps Script

1. Buka [script.google.com](https://script.google.com)
2. Klik **New project**
3. Beri nama project: **"PeopleShift Design Portal"**

---

## Langkah 4 — Masukkan Semua File

Di panel kiri Apps Script, tambahkan file-file berikut (dalam urutan ini):

### 4a. Edit `appsscript.json`
- Klik ikon ⚙️ (Project Settings) → centang **"Show appsscript.json manifest file"**
- Kembali ke editor → klik `appsscript.json`
- Ganti seluruh isinya dengan konten file `appsscript.json` yang sudah disiapkan

### 4b. File `Code.gs`
- File ini sudah ada secara default (bernama `Code.gs` atau `Untitled`)
- Hapus semua isinya → paste seluruh konten `Code.gs`

### 4c. File `Index.html`
- Klik **+** di panel kiri → **HTML file** → beri nama `Index`
- Paste seluruh konten `Index.html`

### 4d. File `Style.css.html`
- Klik **+** → **HTML file** → beri nama `Style.css`
- Paste seluruh konten `Style.css.html`

### 4e. File `App.js.html`
- Klik **+** → **HTML file** → beri nama `App.js`
- Paste seluruh konten `App.js.html`

Struktur akhir di panel kiri harus terlihat seperti:
```
📄 appsscript.json
📄 Code.gs
📄 Index.html
📄 Style.css.html
📄 App.js.html
```

---

## Langkah 5 — Isi CONFIG di Code.gs

Buka `Code.gs` dan update bagian `CONFIG` di baris paling atas:

```javascript
const CONFIG = {
  SHEET_ID: 'GANTI_DENGAN_SPREADSHEET_ID_LANGKAH_1',
  DRIVE_FOLDER_ID: 'GANTI_DENGAN_FOLDER_ID_LANGKAH_2',
  // ... sisanya biarkan
};
```

**Contoh:**
```javascript
SHEET_ID: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
DRIVE_FOLDER_ID: '1A2B3C4D5E6F7G8H9I0J',
```

---

## Langkah 6 — Jalankan Setup Awal

1. Di editor Apps Script, pilih function `setupSheets` dari dropdown di toolbar
2. Klik **Run** (▶️)
3. Akan muncul dialog izin → klik **Review permissions** → pilih `luqman@peopleshift.id` → klik **Allow**
4. Tunggu hingga eksekusi selesai (cek log di bawah: "Setup complete!")

Ini akan membuat 4 sheet otomatis di Spreadsheet:
- `REQUESTS` — Data semua design request
- `CAROUSEL_SLIDES` — Data per slide carousel
- `COMMENTS` — Komentar & revisi
- `STATUS_HISTORY` — Riwayat perubahan status

---

## Langkah 7 — Deploy sebagai Web App

1. Di toolbar Apps Script, klik **Deploy** → **New deployment**
2. Klik ikon ⚙️ di sebelah "Select type" → pilih **Web app**
3. Isi konfigurasi:
   - **Description:** `PeopleShift Design Portal v1.0`
   - **Execute as:** `User accessing the web app`
   - **Who has access:** `Anyone within peopleshift.id`
4. Klik **Deploy**
5. Salin **Web app URL** yang muncul (format: `https://script.google.com/macros/s/XXXXX/exec`)

---

## Langkah 8 — Update URL di Email Notifications (Otomatis)

URL portal sudah otomatis diambil via `ScriptApp.getService().getUrl()` di `Code.gs` — tidak perlu input manual.

---

## Langkah 9 — Verifikasi

Buka URL web app dari langkah 7. Pastikan:

- [ ] Splash screen muncul dengan logo PeopleShift
- [ ] Dashboard tampil setelah loading
- [ ] Sidebar menampilkan nama dan role yang benar
- [ ] Form "Buat Request" berjalan multi-step
- [ ] Submit brief → email masuk ke designer dan PM

### Test per role:
| Email | Role yang seharusnya muncul |
|---|---|
| spvclass@peopleshift.id | PM |
| arrabbani@peopleshift.id | PM |
| nashihulwan@peopleshift.id | Designer |
| luqman@peopleshift.id | Designer + PM |
| [email lain]@peopleshift.id | Requester |

---

## Langkah 10 — Share URL ke Tim

Kirim URL web app ke seluruh tim `@peopleshift.id`. Contoh pesan WA/Discord:

> 🎨 **PeopleShift Design Portal sudah live!**
> 
> Mulai sekarang semua request design ke Mas Ulwan & Luqman lewat portal ini ya:
> 👉 [URL_PORTAL_DI_SINI]
> 
> Login otomatis pakai Google account @peopleshift.id kalian.
> Tidak perlu download app apapun, buka di browser biasa.

---

## Update & Re-deploy

Setiap ada perubahan code:
1. Edit file yang diinginkan
2. Klik **Deploy** → **Manage deployments**
3. Klik ✏️ (Edit) di deployment yang ada → ubah version ke **"New version"**
4. Klik **Deploy**

> ⚠️ URL tidak berubah saat re-deploy — aman dibagikan sebagai bookmark.

---

## Troubleshooting

### "Akses Ditolak" saat buka portal
- Pastikan buka dengan akun `@peopleshift.id`
- Cek pengaturan **"Who has access"** di deployment → harus "Anyone within peopleshift.id"

### Email notifikasi tidak terkirim
- Pastikan OAuth scope `gmail.send` sudah diapprove
- Jalankan `setupSheets()` sekali lagi untuk refresh authorization

### Data tidak muncul di Sheet
- Cek `SHEET_ID` di CONFIG sudah benar
- Pastikan `luqman@peopleshift.id` punya akses **Editor** ke Sheet

### Error "Drive folder not found"
- Cek `DRIVE_FOLDER_ID` di CONFIG sudah benar
- Cek folder tidak dihapus atau dipindahkan

### Reset data (development)
- Buka Google Sheet → hapus semua baris data (bukan header)
- Atau jalankan `setupSheets()` sekali lagi (akan skip jika sheet sudah ada)

---

## Struktur Sheets (Referensi)

### REQUESTS (39 kolom)
`request_id | timestamp | brief_date | nama_project | project_code | divisi | brand | nama_client | pic_name | pic_email | deadline_output | priority | goals | platform | uploaded_to | key_messages | headline | tagline | narasumber | event_date | event_time | lokasi | info_tambahan | color_primary | color_secondary | color_custom | mood_feeling | link_referensi | catatan_designer | photo_source | butuh_multiple_versi | versi_brand | status | assigned_to | output_link | submitted_at | completed_at | deliverables | drive_files`

### CAROUSEL_SLIDES (7 kolom)
`request_id | slide_number | slide_type | headline | body_text | visual_direction | benchmark`

### COMMENTS (7 kolom)
`comment_id | request_id | timestamp | author_email | author_name | content | is_revision`

### STATUS_HISTORY (6 kolom)
`history_id | request_id | timestamp | changed_by | old_status | new_status | notes`

---

*Setup guide ini dibuat untuk PeopleShift Design Portal v1.0 — Juli 2026*
