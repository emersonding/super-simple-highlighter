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
- Make color blocks display 4-per-row: change `.token` in `options.css` from `display: block` to `display: inline-block` at ~25% width with reduced padding/font-size so 4 tokens fit per row.
- Wrap the "Pen button default style" row in a new `<h3>Comment setting</h3>` subheading.
- Add `margin-top: 2em` (or equivalent spacing) before the "Reset to default styles" button row.

---

## Section 3 — Merge feature

**Files:** `options.html`, `js/options/controllers/advanced.js`, `js/options/merge_utils.js` (new), `tests/unit/merge_utils.test.js` (new)

### UI layout (in the Advanced/Backups pane)

Add a new panel below "Restore" titled **"Merge"**:

1. **Warning text** (always visible): *"Warning: back up your data before merging. Merging imports highlights from a backup file while keeping your existing highlights."*
2. **File picker button** (`#mergeFiles` input, styled like the existing import button).

### Controller flow (`advanced.js`)

1. Warning is always visible in the UI panel (step 0 — no interaction needed).
2. User selects a `.ldjson` file via `#mergeFiles`.
3. Validate header (same magic/version check as import).
4. Parse backup: extract `storageItems` and backup DB stream from ldjson.
5. Load backup DB stream into a temporary in-memory structure to extract `backupDocs` (CREATE docs only).
6. Dump current DB → parse to get `currentDocs` (CREATE docs only).
7. Call `mergeHighlightDocs(currentDocs, backupDocs)` → `mergedDocs`.
8. Show confirmation dialog: *"Merge will grow from X → Y highlights. Continue?"* (X = current CREATE count, Y = merged CREATE count).
9. On confirm: reconstruct ldjson (header + current `storageItems` + merged DB stream) → call `new DB().loadDB(mergedLdjson)` → `location.reload()`.
10. On cancel: do nothing.

### Pure function (`merge_utils.js`)

```js
/**
 * Merge backup CREATE docs into current docs, deduplicating by content.
 * @param {Object[]} currentDocs - CREATE docs from current DB
 * @param {Object[]} backupDocs  - CREATE docs from backup DB
 * @returns {Object[]} merged array (currentDocs + non-duplicate backupDocs)
 */
function mergeHighlightDocs(currentDocs, backupDocs) { ... }
```

**Dedup key** per CREATE doc: `match + "\0" + text + "\0" + JSON.stringify(range)`

**Rules:**
- Output = all `currentDocs` + any `backupDoc` whose key is not already present.
- DELETE docs from backup are excluded entirely (they have no meaning outside their original DB).
- `storageItems` (style definitions) are NOT merged — current DB's styles are preserved.

### Unit tests (`tests/unit/merge_utils.test.js`)

Test cases (no browser or PouchDB required):

| Case | Expected |
|------|----------|
| Backup has doc with same match+text+range as current | Skipped (not added) |
| Backup has doc with same match+text but different range | Added |
| Backup has doc on a URL not in current DB | Added |
| Backup has a DELETE doc | Excluded |
| Empty current DB | All backup CREATE docs added |
| Empty backup | Current docs unchanged |

---

## Section 4 — About page

**File:** `options.html`

- Replace changelog link `href` from `https://www.dexterouslogic.com/assets/supersimplehighlighter/changelog.txt` to `https://github.com/emersonding/super-simple-highlighter`.
- Remove the `<p>` block containing `©2010-19 Dexterous Logic` (the `<small>&copy;...</small>` paragraph).
