# RawNotes – Browser Extension
> **Mục tiêu:** Highlight text trên bất kỳ trang web → lưu vào Collector → quản lý, search, export. Kèm sidebar ghi chú Markdown liên kết trực tiếp với Obsidian vault.
> **Style:** Claude.ai design system – chữ to, dễ đọc, học liệu làm chính.

---

## 1. TỔNG QUAN KIẾN TRÚC

```
┌──────────────────────────────────────────────────────────────┐
│                      BROWSER EXTENSION                       │
│                                                              │
│  content_script.js   ←── inject vào mọi tab                 │
│  service_worker.js   ←── message hub, file I/O              │
│  sidepanel.html      ←── Obsidian-style sidebar (Chrome API) │
│  manager.html        ←── trang quản lý full                  │
│  popup.html          ←── quick action bar                    │
│                                                              │
│  storage/                                                    │
│    chrome.storage.local  ← MiniSearch index + metadata      │
│    File System API       ← lưu file .json và .md ra disk    │
└──────────────────────────────────────────────────────────────┘
```

### Stack kỹ thuật
| Layer | Tech | Lý do |
|---|---|---|
| Extension | Manifest V3 (Chrome 114+ / Edge / Brave) | Standard hiện tại, có sidePanel API |
| UI | Vanilla JS + CSS Variables | Nhẹ, không cần build tool |
| Storage metadata | `chrome.storage.local` | Sync nhanh, offline |
| Storage file | File System Access API (`showDirectoryPicker`) | Lưu thư mục người dùng chọn, không giới hạn |
| Search | **MiniSearch** (inverted index, 7KB) | Full-text thực sự, <10ms cho 50k items, hỗ trợ tiếng Việt |
| Markdown editor | **Milkdown** (ProseMirror-based) | WYSIWYG như Notion, auto-render khi gõ `##`, `**bold**` |
| Link detection | URL heuristics + DOM traversal | Xử lý blog, social feed, SPA |
| Sidebar | `chrome.sidePanel` API | Native browser sidebar, giống Edge |

---

## 2. CẤU TRÚC THƯ MỤC DỰ ÁN

```
text-collector/
├── manifest.json
├── background/
│   └── service_worker.js          # message hub, file I/O, schema migration
├── content/
│   ├── content_script.js          # detect selection, inject tooltip (Shadow DOM)
│   └── content_style.css
├── sidepanel/
│   ├── sidepanel.html             # Obsidian-style sidebar
│   ├── sidepanel.js               # file tree + Milkdown editor
│   └── sidepanel.css
├── manager/
│   ├── manager.html               # trang quản lý collector
│   ├── manager.js
│   └── manager.css
├── popup/
│   ├── popup.html
│   └── popup.js
├── shared/
│   ├── storage.js                 # wrapper chrome.storage + File System API
│   ├── search.js                  # MiniSearch wrapper
│   ├── link_resolver.js           # detect & resolve URL
│   ├── schema_migration.js        # version + migrate data model
│   ├── logger.js                  # log system
│   └── constants.js
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── vendor/
│   ├── minisearch.min.js          # local copy
│   └── milkdown/                  # local bundle
└── tests/
    ├── unit/
    │   ├── storage.test.js
    │   ├── search.test.js
    │   ├── link_resolver.test.js
    │   ├── schema_migration.test.js
    │   └── logger.test.js
    └── e2e/
        └── flow.test.js           # Playwright
```

---

## 3. DATA MODEL

### Schema Version
```json
{ "schemaVersion": 2 }
```
> Lưu trong `chrome.storage.local`. Mỗi lần extension update có thay đổi model → chạy migration script tương ứng.

### Collector
```json
{
  "id": "uuid-v4",
  "name": "Machine Learning Notes",
  "description": "...",
  "color": "#7C3AED",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "itemCount": 42
}
```

### Item (Entry)
```json
{
  "id": "uuid-v4",
  "collectorId": "uuid-v4",
  "text": "nội dung highlight hoặc nhập tay (đã sanitize HTML)",
  "note": "ghi chú thêm (optional)",
  "source": {
    "url": "https://...",
    "title": "Page title",
    "savedAt": "ISO8601",
    "type": "blog | social | unknown"
  },
  "tags": ["ml", "gradient"],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### File layout – Collector data (thư mục người dùng chọn)
```
/RawNotes/
  schema.json              ← { schemaVersion: 2 }
  collectors.json          ← danh sách tất cả collectors
  /Machine Learning Notes/
    items.json
  /English Vocab/
    items.json
```

### File layout – Obsidian Vault (thư mục vault người dùng chọn riêng)
```
/MyVault/                  ← thư mục Obsidian bất kỳ
  /RawNotes Notes/    ← subfolder extension tạo (có thể đổi tên)
    Getting Started.md
    ML Notes.md
    Daily Log.md
```
> Hai thư mục hoàn toàn độc lập – người dùng có thể chọn cùng thư mục hoặc khác nhau.

---

## 4. CÁC MODULE CHÍNH

### 4.1 Content Script – Highlight Detection

```
Luồng:
1. User tô chữ → mouseup event
2. Lấy window.getSelection() + sanitize HTML entities
3. Tính bounding rect của selection
4. Inject save icon qua Shadow DOM (tránh CSS conflict + CSP)
5. User click icon → mini popup chọn Collector + toggle "Lưu kèm link"
6. Gửi message tới service_worker.js kèm { text, url, title, saveLink }
7. Background lưu → xác nhận → hiển thị toast "Saved!"
```

**Shadow DOM cho tooltip (quan trọng):**
```javascript
const host = document.createElement('div');
const shadow = host.attachShadow({ mode: 'closed' });
// Inject icon vào shadow root → tránh bị CSP của trang chặn style
// Hoạt động trên GitHub, Notion, banking sites
```

**Link resolution khi highlight:**
- **Blog/News** (URL tĩnh, `pathname !== '/'`): dùng `window.location.href`
- **Social feed (Facebook, LinkedIn, Twitter/X):**
  - Traverse DOM từ selection lên: tìm `<article>`, `<div[data-id]>`, `<a[href*="/posts/"]>`
  - Lấy URL bài viết gần nhất chứa selection
  - Fallback: `window.location.href` + `scrollY`
- **SPA (React/Vue):** patch `history.pushState` + listen `popstate` để luôn có URL mới nhất

**Sanitize text trước khi lưu:**
```javascript
// Loại bỏ HTML tags, decode entities (&nbsp; → space, &amp; → &)
function sanitizeSelection(text) {
  return text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&').replace(/&lt;/g, '<').trim();
}
```

### 4.2 Storage Module

```javascript
// storage.js
class StorageService {
  // chrome.storage.local: index MiniSearch (text, note, tags, source.title)
  // File System API: nội dung thực tế + .md files
  // IndexedDB: lưu FileSystemDirectoryHandle để reuse sau restart

  async saveItem(item)              // sanitize → ghi file → update index
  async deleteItems(ids[])          // xóa batch + soft-delete 30s (undo)
  async getCollectors()
  async createCollector(data)
  async exportCollector(id)         // JSON blob
  async importCollector(file, conflictMode)  // 'overwrite' | 'skip' | 'duplicate'
  async searchAll(query)            // MiniSearch cross-collector
  async checkAndMigrateSchema()     // chạy khi extension khởi động
  async requestFSPermission()       // showDirectoryPicker + lưu handle vào IndexedDB
  async restoreFSHandle()           // lấy lại handle từ IndexedDB sau restart
}
```

**Xử lý File System permission sau restart:**
```javascript
// IndexedDB lưu FileSystemDirectoryHandle
// Khi extension load: thử queryPermission() trước
const permission = await handle.queryPermission({ mode: 'readwrite' });
if (permission !== 'granted') {
  // Hiện banner nhắc user click để restore quyền (cần user gesture)
  showPermissionBanner();
}
```

**Conflict resolution khi import:**
```javascript
// Trước khi import → scan id overlap → hỏi user
{
  conflictMode: 'overwrite' // ghi đè item trùng id
              | 'skip'      // giữ nguyên item hiện tại
              | 'duplicate' // tạo id mới, lưu cả hai
}
```

**Soft delete (undo 30 giây):**
```javascript
// deleteItems() → move sang pendingDelete[] + start countdown
// Hiện toast: "Đã xóa 3 items [Undo]"
// Sau 30s hoặc user đóng toast → xóa thật
```

### 4.3 Search Module (MiniSearch)

```javascript
// search.js
import MiniSearch from './vendor/minisearch.min.js';

const miniSearch = new MiniSearch({
  fields: ['text', 'note', 'tags', 'sourceTitle'],
  storeFields: ['id', 'collectorId', 'text', 'sourceTitle', 'createdAt'],
  searchOptions: {
    boost: { text: 2, note: 1.5, tags: 1 },
    fuzzy: 0.2,           // fuzzy nhẹ cho typo
    prefix: true,         // tìm prefix: "grad" → "gradient"
  }
});

// Build index một lần khi load, search sau đó < 10ms dù 50k items
// Kết quả trả về kèm collectorId + matched terms để highlight
await miniSearch.addAllAsync(allItems);

// Search cross-collector
const results = miniSearch.search(query);
// results[i].terms → dùng để highlight match trong UI
```

**So sánh với Fuse.js (đã loại khỏi plan):**
- Fuse.js: scan toàn bộ array mỗi lần → lag khi >5,000 items
- MiniSearch: inverted index → O(1) lookup, 7KB bundle, hỗ trợ tiếng Việt Unicode

### 4.4 Schema Migration Module

```javascript
// schema_migration.js
const MIGRATIONS = {
  1: (data) => data,                         // v1 → baseline
  2: (data) => ({                            // v2 → thêm field `tags`
    ...data,
    items: data.items.map(i => ({ tags: [], ...i }))
  }),
};

async function migrate(currentVersion, targetVersion, data) {
  for (let v = currentVersion + 1; v <= targetVersion; v++) {
    data = MIGRATIONS[v](data);
  }
  return data;
}
// Chạy tự động khi extension load, trước mọi thao tác storage
```

### 4.5 Obsidian Sidebar Module (chrome.sidePanel)

```
Luồng mở sidebar:
1. Extension inject nút ⊞ fixed bên phải màn hình (content script)
2. User click → chrome.sidePanel.open({ windowId })
3. sidepanel.html load → kiểm tra vault handle trong IndexedDB
4. Nếu chưa có → hiện btn "Chọn thư mục Obsidian vault"
5. Nếu đã có → kiểm tra permission → hiện file tree

Luồng tạo file mới:
1. User click [+ New Note]
2. Tạo file .md với tên mặc định "Untitled YYYY-MM-DD HH:mm"
3. Tên file trở thành editable inline ngay lập tức
4. User đổi tên → Enter hoặc blur → rename file thực tế trên disk
5. Editor (Milkdown) focus vào body
6. Mỗi keystroke → debounce 500ms → write file .md ra disk
7. Obsidian detect file change → sync tự động

File tree behavior:
- Hiển thị cây thư mục dạng phân cấp (giống Obsidian left sidebar)
- Click file → mở trong editor
- Right-click → Rename / Delete / Move
- Drag & drop để tổ chức thư mục
```

**Milkdown editor config:**
```javascript
// Auto-format khi gõ:
// ## → Heading 2, **text** → bold, - → bullet list
// [[ ]] → Obsidian wikilink (future feature)
// Mỗi keystroke → debounce 500ms → writeFile()

import { Editor } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
// Bundle local vào vendor/milkdown/ để không phụ thuộc CDN
```

### 4.6 Logger Module

```javascript
// logger.js
class Logger {
  log(level, module, message, data)  // INFO | WARN | ERROR
  getLogs(filter)
  clearLogs()
  copyLogs()  // JSON → clipboard
}
// chrome.storage.local, max 500 entries (FIFO)
// Entry: { id, timestamp, level, module, message, data }
```

---

## 5. UI / UX

### Design System (Claude.ai-inspired)

```css
:root {
  --bg-primary:    #0f0f0f;
  --bg-secondary:  #1a1a1a;
  --bg-tertiary:   #262626;
  --border:        #333333;
  --accent:        #d97706;      /* amber */
  --accent-purple: #7c3aed;
  --text-primary:  #f5f5f5;
  --text-secondary:#a3a3a3;
  --text-muted:    #737373;

  --font-base:   'Inter', system-ui, sans-serif;
  --text-sm:     14px;
  --text-md:     16px;
  --text-lg:     18px;
  --text-xl:     22px;
  --line-height: 1.7;
  --radius:      10px;
  --radius-lg:   16px;
}
```

### Layout Manager Page

```
┌──────────────────────────────────────────────────────────┐
│  🔍 [Search toàn bộ...]              [+ New Collector]   │
├──────────────────┬───────────────────────────────────────┤
│  COLLECTORS      │  ITEMS LIST                           │
│                  │                                       │
│  📁 ML Notes 42  │  ☐  [select all]   [🗑 Delete sel]   │
│  📁 English  18  │  ─────────────────────────────────── │
│  📁 Quotes   7   │  ☐  "Gradient descent là..."         │
│                  │     medium.com · 2h ago               │
│  [+ Add]         │                                       │
│  [Import]        │  ☐  "The learning rate..."            │
│  [Export]        │     arxiv.org · 1d ago               │
│                  │                                       │
│  ── TOOLS ──     │  ☐  [+ Manual entry]                 │
│  [View Logs]     │     No source · 3d ago               │
│  [Settings]      │                                       │
└──────────────────┴───────────────────────────────────────┘
```

### Layout Obsidian Sidebar (chrome.sidePanel)

```
┌──────────────────────────────┐
│  📝 RawNotes Notes  [+] │  ← new note button
├──────────────────────────────┤
│  🔍 [Search notes...]        │
├──────────────────────────────┤
│  📁 Daily                    │
│    📄 2024-01-15.md          │
│    📄 2024-01-14.md          │
│  📁 ML                       │
│    📄 Gradient Descent.md ←active
│    📄 Transformers.md        │
│  📄 Getting Started.md       │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │ # Gradient Descent     │  │  ← Milkdown WYSIWYG
│  │                        │  │     auto-save 500ms
│  │ Là thuật toán tối ưu   │  │
│  │ hóa bằng cách...       │  │
│  │                        │  │
│  └────────────────────────┘  │
│  💾 Saved · 2s ago           │
└──────────────────────────────┘
```

### Log Viewer Panel

```
┌─────────────────────────────────────────────────────┐
│  SYSTEM LOGS          [🗑 Clear All]  [📋 Copy All] │
│  Filter: [All ▼]  [INFO] [WARN] [ERROR]             │
├─────────────────────────────────────────────────────┤
│  14:32:01  [INFO]  storage   Saved item abc123      │
│  14:31:58  [ERROR] fs        Dir permission denied  │
│  14:30:00  [INFO]  search    Indexed 42 items       │
└─────────────────────────────────────────────────────┘
```

---

## 6. MANIFEST V3

```json
{
  "manifest_version": 3,
  "name": "RawNotes",
  "version": "1.0.0",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "contextMenus",
    "sidePanel"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background/service_worker.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/content_script.js"],
    "css": ["content/content_style.css"],
    "run_at": "document_idle"
  }],
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": { "48": "assets/icon48.png" }
  },
  "options_page": "manager/manager.html"
}
```

> **Lưu ý:** `sidePanel` permission yêu cầu Chrome 114+. Edge Chromium hỗ trợ từ version tương đương.

---

## 7. MOSCOW – PHÂN TÍCH ƯU TIÊN

### Must Have (bắt buộc cho v1)
- Highlight → save icon (Shadow DOM) → chọn collector → lưu
- CRUD collector
- Full-text search cross-collector (MiniSearch)
- File System API: lưu data ra thư mục chọn + restore handle sau restart
- Import / export collector JSON (có conflict resolution)
- Select & xóa nhiều items + soft-delete 30s (undo)
- Log viewer: xem / xóa / copy
- Link resolver: blog + social feed + SPA
- Option lưu có/không kèm link
- Schema versioning + auto migration
- Sanitize HTML khi highlight

### Should Have (quan trọng nhưng không block launch)
- Manual entry (nhập tay)
- Ghi chú (note) thêm vào item
- Tags cho item
- Toast notification sau khi save
- Filter search theo collector
- Settings page: đổi thư mục, theme
- Conflict resolution UI rõ ràng khi import
- Obsidian sidebar: file tree + Milkdown editor + auto-save

### Could Have (nice to have)
- Keyboard shortcut `Ctrl+Shift+S` để save nhanh
- Duplicate item sang collector khác
- Sort items (mới nhất / A-Z / độ dài)
- Export sang Markdown / CSV
- Highlight match text trong search results
- Đếm từ / ký tự của item
- Popup quick-add mini bar
- Wikilink `[[ ]]` trong Milkdown (Obsidian syntax)

---

## 8. CÁC BƯỚC THỰC HIỆN

### Phase 1 – Core Foundation
- [ ] 1.1 Setup project structure + manifest.json
- [ ] 1.2 Viết `constants.js`, `logger.js`
- [ ] 1.3 Viết `storage.js` – chrome.storage CRUD + IndexedDB cho FSHandle
- [ ] 1.4 Viết `schema_migration.js` + unit test
- [ ] 1.5 Test storage unit tests

### Phase 2 – File System & Collectors
- [ ] 2.1 File System Access API: pick folder, persist handle, restore sau restart
- [ ] 2.2 Permission banner khi handle bị revoke
- [ ] 2.3 UI Manager: sidebar collectors list
- [ ] 2.4 CRUD collector
- [ ] 2.5 Import / Export JSON + conflict resolution dialog

### Phase 3 – Content Script (Highlight & Save)
- [ ] 3.1 Inject save icon qua Shadow DOM
- [ ] 3.2 Mini popup chọn collector + toggle lưu link
- [ ] 3.3 Sanitize HTML selection text
- [ ] 3.4 Implement `link_resolver.js`
  - 3.4a Blog/News URL
  - 3.4b Social feed (Facebook, LinkedIn, Twitter)
  - 3.4c SPA history patch
- [ ] 3.5 Message passing content ↔ service_worker ↔ storage

### Phase 4 – Manager Page Full
- [ ] 4.1 Items list với checkbox + select all
- [ ] 4.2 Soft-delete + undo toast
- [ ] 4.3 Manual entry form
- [ ] 4.4 Item detail / edit note / tags

### Phase 5 – Search (MiniSearch)
- [ ] 5.1 Tích hợp MiniSearch local (`vendor/minisearch.min.js`)
- [ ] 5.2 Build index async khi load
- [ ] 5.3 Search bar full-text cross-collector
- [ ] 5.4 Highlight matched terms trong kết quả
- [ ] 5.5 Filter theo collector

### Phase 6 – Log System
- [ ] 6.1 Log viewer UI trong manager
- [ ] 6.2 Clear logs
- [ ] 6.3 Copy logs to clipboard (JSON)
- [ ] 6.4 Filter logs by level

### Phase 7 – Obsidian Sidebar
- [ ] 7.1 Manifest: thêm `sidePanel` permission + `side_panel` config
- [ ] 7.2 Inject trigger button bên phải màn hình (content script)
- [ ] 7.3 `chrome.sidePanel.open()` khi click
- [ ] 7.4 File System pick cho vault + persist handle (IndexedDB riêng)
- [ ] 7.5 Render file tree phân cấp từ vault directory
- [ ] 7.6 Bundle Milkdown vào `vendor/milkdown/`
- [ ] 7.7 Editor: create file, rename inline, auto-save debounce 500ms
- [ ] 7.8 "Saved · Xs ago" indicator

### Phase 8 – Polish & Settings
- [ ] 8.1 Settings page: chọn/đổi thư mục collector, thư mục vault, theme
- [ ] 8.2 Toast notifications toàn cục
- [ ] 8.3 Keyboard shortcut `Ctrl+Shift+S`
- [ ] 8.4 Responsive + accessibility

---

## 9. QUY TRÌNH TEST

### Unit Tests (Jest)
```bash
npm run test:unit
```

| File | Test case |
|---|---|
| `storage.test.js` | CRUD collector/item, import conflict modes, soft-delete, restore FSHandle |
| `search.test.js` | Full-text match, prefix, fuzzy, cross-collector, tiếng Việt |
| `link_resolver.test.js` | Blog URL, FB post, Twitter, SPA, iframe, fallback |
| `schema_migration.test.js` | v1→v2, v1→v3 (skip version), data không bị mất |
| `logger.test.js` | Log levels, FIFO 500 entries, clear, copy JSON |

### Integration Tests (Chrome Extension)
Load unpacked → chạy checklist Section 10

### E2E Tests (Playwright)
```bash
npm run test:e2e
```
- Highlight → save → verify item trong manager
- Search keyword → verify highlight match
- Export → xóa → import `overwrite` mode → verify data đúng
- Sidebar: tạo file → gõ → đợi 600ms → verify file .md xuất hiện trên disk

---

## 10. CHECKLIST THỦ CÔNG

### Highlight & Save
- [ ] Tô text trên blog → icon hiện ra (không bị CSP chặn)
- [ ] Click icon → mini popup mở
- [ ] Chọn collector → Save → toast "Saved!"
- [ ] Tô text trên Facebook newsfeed → lưu kèm link bài viết đúng
- [ ] Option "Lưu không kèm link" hoạt động
- [ ] Tô text rất dài (>2000 ký tự) → vẫn save
- [ ] Text có HTML entities (`&amp;`, `&nbsp;`) → lưu dạng plain text sạch
- [ ] Trang có CSP strict (GitHub, Notion) → icon vẫn hiện (Shadow DOM)

### Collector Management
- [ ] Tạo / Rename / Delete collector
- [ ] Delete → confirm → soft-delete → undo trong 30s → restore
- [ ] Export → file JSON hợp lệ
- [ ] Import → conflict dialog → chọn overwrite/skip/duplicate → kết quả đúng

### Search
- [ ] Search keyword → highlight match trong text
- [ ] Search cross-collector → hiển thị đúng collector nguồn
- [ ] Search không có kết quả → "No results"
- [ ] Search tiếng Việt có dấu (MiniSearch Unicode)
- [ ] Prefix search: "grad" → tìm thấy "gradient"

### Obsidian Sidebar
- [ ] Nút trigger hiện bên phải màn hình
- [ ] Click → sidebar mở
- [ ] Chưa chọn vault → hiện btn chọn thư mục
- [ ] Sau chọn → file tree render đúng cấu trúc thư mục
- [ ] Tạo file mới → tên editable ngay lập tức
- [ ] Gõ trong editor → 500ms → file .md cập nhật trên disk
- [ ] Obsidian mở cùng vault → thấy file mới ngay
- [ ] Restart Chrome → sidebar nhớ vault cũ, hỏi quyền lại nếu cần
- [ ] Format Markdown: `##` → heading, `**text**` → bold, `-` → list

### Log System
- [ ] Xóa log → list trống
- [ ] Tái hiện lỗi → log xuất hiện
- [ ] Copy log → clipboard JSON hợp lệ
- [ ] Filter ERROR → chỉ hiện lỗi

---

## 11. QUY TRÌNH DEBUG VỚI AI

```
BƯỚC 1: Manager Page → Log Viewer → [Clear All]

BƯỚC 2: Tái hiện lỗi

BƯỚC 3: Log Viewer → [Copy All] → paste cho AI:
  "Lỗi: [mô tả ngắn]
   Log: [paste JSON]
   File liên quan: [tên file]"
```

---

## 12. EDGE CASES CẦN XỬ LÝ

| Tình huống | Xử lý |
|---|---|
| Chưa chọn thư mục lưu | Prompt chọn ngay khi save lần đầu |
| File System handle bị revoke | Banner nhắc click để restore quyền (cần user gesture) |
| Tab ẩn danh (Incognito) | Thông báo extension không hoạt động |
| Trang `chrome://` | Content script không inject → silent fail |
| Trang CSP strict (GitHub, Notion) | Shadow DOM cho tooltip → bypass restriction |
| Import JSON sai format | Validate schema, reject với lỗi rõ ràng |
| Import có id trùng | Dialog conflict resolution: overwrite / skip / duplicate |
| Schema cũ sau update extension | Auto-migrate khi khởi động, log kết quả |
| MiniSearch index >10MB | Lazy load: chỉ index collector đang active, load thêm khi cần |
| Selection trong iframe | Xử lý `iframe.contentDocument` riêng |
| Social site thay đổi DOM | Link resolver fallback sang `window.location.href + scrollY` |
| Milkdown mất kết nối vault | Hiện banner, lưu tạm vào `chrome.storage.local`, sync lại khi có quyền |
| Tên file .md chứa ký tự không hợp lệ | Sanitize: loại bỏ `/ \ : * ? " < > \|` |

---

## 13. SCALABILITY NOTES

- **Multi-profile:** mỗi Chrome profile có `chrome.storage` riêng → tự scale
- **Storage không giới hạn:** File System API ghi trực tiếp ra disk → không bị cap 10MB
- **Search performance:** MiniSearch inverted index → <10ms cho 50k items; nếu >100k items → chuyển sang Web Worker
- **Obsidian sync:** Ghi file .md trực tiếp → Obsidian Sync / iCloud / Dropbox tự pick up
- **Export formats tương lai:** CSV, Anki deck (học từ vựng)
- **Future:** Wikilink `[[ ]]` trong sidebar → link giữa các note

---

## 14. DEPENDENCIES

```json
{
  "devDependencies": {
    "jest": "^29",
    "jest-chrome": "^0.8",
    "@playwright/test": "^1.40"
  },
  "vendored": {
    "minisearch": "6.x",
    "milkdown": "7.x (preset-commonmark + core)"
  }
}
```

> Extension không dùng bundler để giữ đơn giản. MiniSearch và Milkdown được copy thủ công vào `vendor/` — không phụ thuộc CDN khi runtime.
> Milkdown cần bundle step một lần (rollup/esbuild) để tạo file UMD single-file trong `vendor/milkdown/`.
