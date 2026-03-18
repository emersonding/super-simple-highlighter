# Options Page Improvements — Design Spec

**Date:** 2026-03-19
**Method:** Claude Code superpowers brainstorming

---

## Overview

Six targeted improvements to the extension's options page: navbar cleanup, styles pane compaction, comment setting grouping, a new merge-backup feature with unit-tested pure logic, and About page branding cleanup.

---

## Section 1 — Navbar changes

**File:** `options.html`

- Replace the brand link `ng-href` (currently points to `extension_webstore_url` i18n key) with a hardcoded `href="https://github.com/emersonding/super-simple-highlighter"`.
- Delete the entire `<ul class="nav navbar-nav navbar-right">` block (contains FAQ link and copyright link).

---

## Section 2 — Styles pane layout

**Files:** `options.html`, `css/options.css`

- Change the styles pane heading from `<h2>` to `<h3>`.
- Make color blocks display 4-per-row:
  - Change the outer `<ul class="list-unstyled">` to use `display: flex; flex-wrap: wrap;`.
  - Change `.token` to `width: calc(25% - 8px); margin: 4px; display: inline-flex; align-items: center; font-size: 1.2rem;` (reduced from `2rem`). The `.close` button stays inside the flex item at `margin-left: auto`.
- Wrap the "Pen button default style" row in a new `<h3>Comment setting</h3>` subheading placed immediately before it.
- Add `margin-top: 2em` before the "Reset to default styles" button row.

---

## Section 3 — Merge feature

**Files:** `options.html`, `js/options/controllers/advanced.js`, `js/options/merge_utils.js` (new), `tests/unit/merge_utils.test.js` (new), `package.json`, `js/shared/db.js` (add one public method)

### New public method on DB class

Add to `db.js`:

```js
/**
 * Get all documents in the database
 * @returns {Promise<Object[]>} array of all documents
 */
getAllDocuments() {
  return this.getDB().then(db => db.allDocs({ include_docs: true })).then(({rows}) =>
    rows.map(r => r.doc).filter(Boolean)
  )
}
```

This avoids the controller needing the private `getDB()` method.

### UI layout (in the Advanced/Backups pane)

Add a new panel below "Restore" titled **"Merge"**:

1. **Warning text** (always visible, no interaction required): *"Warning: back up your data before merging. Merging imports highlights from a backup file while keeping your existing highlights."*
2. **File picker button** (`#mergeFiles` input, same `btn-file` style as the existing import button).

### Controller flow (`advanced.js`)

Wire in constructor:
```js
document.querySelector('#mergeFiles').addEventListener('change', this.onMergeFilesChange)
```
Expose on `$scope`:
```js
this.scope[this.onMergeFilesChange.name] = this.onMergeFilesChange.bind(this)
```

Flow inside `onMergeFilesChange()`:

1. Warning is statically visible in the panel.
2. User selects a `.ldjson` file via `#mergeFiles`.
3. Validate header (same magic/version check as existing `onFilesChange`).
4. Parse backup ldjson: extract `storageItems` from line 2, and the DB stream (remaining lines joined).
5. Load backup DB stream into a fresh temporary PouchDB to extract backup CREATE docs:
   ```js
   const tmpDB = new PouchDB('_mergetmpdb', { storage: 'temporary' })
   await tmpDB.load(backupStream)
   const allBackupDocs = (await tmpDB.allDocs({ include_docs: true })).rows.map(r => r.doc).filter(Boolean)
   const backupDocs = allBackupDocs.filter(d => d.verb === DB.DOCUMENT.VERB.CREATE)
   await tmpDB.destroy()
   ```
6. Read current DB directly using the new public method, then derive net-active CREATE docs (excluding those with a paired DELETE):
   ```js
   const allCurrentDocs = await new DB().getAllDocuments()
   const deletedIds = new Set(
     allCurrentDocs
       .filter(d => d.verb === DB.DOCUMENT.VERB.DELETE)
       .map(d => d[DB.DOCUMENT.NAME.CORRESPONDING_DOC_ID])
   )
   const currentDocs = allCurrentDocs.filter(
     d => d.verb === DB.DOCUMENT.VERB.CREATE && !deletedIds.has(d._id)
   )
   ```
7. Fetch current storage items (style definitions) for use in the reconstructed ldjson:
   ```js
   const currentStorageItems = await new ChromeHighlightStorage().getAll({ defaults: false })
   ```
8. Call `mergeHighlightDocs(currentDocs, backupDocs)` → `mergedDocs`.
9. Show confirmation: *"Merge will grow from X → Y highlights. Continue?"*
   - X = `currentDocs.length` (net active highlights)
   - Y = `mergedDocs.length`
10. On cancel: do nothing.
11. On confirm: reconstruct ldjson and load:
    ```js
    // Load merged docs into a fresh tmpDB, dump to stream
    const mergeOutDB = new PouchDB('_mergeout', { storage: 'temporary' })
    await mergeOutDB.bulkDocs(mergedDocs.map(d => { const c = {...d}; delete c._rev; return c }))
    const stream = new window.memorystream()
    let mergedStream = ''
    stream.on('data', chunk => { mergedStream += chunk.toString() })
    await mergeOutDB.dump(stream)
    await mergeOutDB.destroy()

    const mergedLdjson = [
      JSON.stringify({ magic: Controller.MAGIC, version: 1 }),
      JSON.stringify(currentStorageItems),
      mergedStream
    ].join('\n')

    await new DB().loadDB(mergedLdjson)
    location.reload()
    ```
12. Error handling: catch any error in the entire flow, destroy any in-flight tmpDBs (`_mergetmpdb`, `_mergeout`), then `alert('Error merging backup\n\nStatus: ...\nMessage: ...')` (same pattern as existing import). No scope variables are mutated on the error path, so no `$scope.$apply()` is needed.

### Pure function (`merge_utils.js`)

Loaded as a global via `<script src="js/options/merge_utils.js"></script>` in `options.html`, placed before `advanced.js`. Same pattern as all other options JS files — no module format, plain global function.

```js
/**
 * Merge backup CREATE docs into current active docs, deduplicating by content.
 * Caller is responsible for passing only CREATE docs (DELETE docs are not handled here).
 * @param {Object[]} currentDocs - net-active CREATE docs from current DB
 * @param {Object[]} backupDocs  - CREATE docs from backup DB (DELETE docs must be pre-filtered by caller)
 * @returns {Object[]} currentDocs + non-duplicate backupDocs
 */
function mergeHighlightDocs(currentDocs, backupDocs) {
  const key = doc => [doc.match, doc.text, String(doc.range)].join('\0')
  // range is stored as a stringified xrange object, so String() avoids double-serialization
  const existing = new Set(currentDocs.map(key))
  const toAdd = backupDocs.filter(d => !existing.has(key(d)))
  return [...currentDocs, ...toAdd]
}

if (typeof module !== 'undefined') module.exports = { mergeHighlightDocs }
```

**Dedup key:** `match + "\0" + text + "\0" + String(range)`.
`range` is stored as a stringified xrange object (confirmed by `DB.DOCUMENT.NAME.RANGE` = `'range'`, docs say "stringifyed xrange object"), so `String()` is safe and avoids double-serialization.

**Rules:**
- Output = all `currentDocs` + any `backupDoc` whose key is not already present.
- The function does NOT filter DELETE docs — caller must pre-filter (see controller step 5).
- `storageItems` are NOT merged — current DB's styles are preserved.

### Unit tests (`tests/unit/merge_utils.test.js`)

**Framework:** Jest. Changes to `package.json`:
- `devDependencies`: add `"jest": "^29"`
- `scripts`: add `"test:unit": "jest tests/unit"`

Test cases (no browser or PouchDB needed):

| Case | Expected |
|------|----------|
| Backup has doc with same match+text+range as current | Not added |
| Backup has doc with same match+text but different range | Added |
| Backup has doc on a URL not in current DB | Added |
| Empty current DB | All backup docs returned |
| Empty backup | Current docs returned unchanged |
| Backup doc with a comment field, no content match in current | Added |
| DELETE doc accidentally passed in `backupDocs` | Included in output (no guard in function; caller must pre-filter) |

---

## Section 4 — About page

**File:** `options.html`

- Replace changelog link `href` from `https://www.dexterouslogic.com/assets/supersimplehighlighter/changelog.txt` to `https://github.com/emersonding/super-simple-highlighter`.
- Remove the `<p>` block containing `©2010-19 Dexterous Logic` (the `<small>&copy;...</small>` paragraph with the author link).
