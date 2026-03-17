# Floating Selection Toolbar — Design Spec

**Date:** 2026-03-17
**Project:** Super Simple Highlighter (Chrome Extension MV3)
**Feature:** Diigo-style floating toolbar for highlighting and commenting on selected text

---

## Overview

When a user selects text on any web page, a small floating toolbar appears above the selection. It offers two actions: highlight with the active style (pen), or highlight and add a comment (chat bubble). Comments are stored alongside highlights in PouchDB and surfaced as hover tooltips with a blue dot indicator on the highlight.

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `js/content_script/selection_toolbar.js` | `SelectionToolbar` class — selection detection, toolbar DOM lifecycle, comment input state |
| `css/selection_toolbar.css` | Toolbar styles, injected as content script CSS |

### Modified Files

| File | Change |
|------|--------|
| `js/content_script/main.js` | Instantiate and init `SelectionToolbar` |
| `js/shared/db.js` | Add optional `comment` field to `putCreateDocument()` and `updateCreateDocument()` |
| `js/content_script/chrome_runtime_handler.js` | Pass `comment` value through `createHighlight()`, set `data-comment` attribute on first `<mark>` element |
| `js/content_script/dom_events_handler.js` | On hover, read `data-comment` from mark element and show tooltip if present |
| `manifest.json` | Register `css/selection_toolbar.css` as content script CSS |

### Message Flow

```
SelectionToolbar (content script)
  │
  ├─ pen click ──────────────────────────────────────────────────────┐
  │                                                                   ▼
  └─ comment save ──► chrome.runtime.sendMessage(CREATE_HIGHLIGHT)  background
                         {id, range, highlightId, className,         │
                          comment (optional)}                         ▼
                                                               db.putCreateDocument(
                                                                 ..., {comment})
```

The background's existing `CREATE_HIGHLIGHT` handler is extended to accept an optional `comment` field and pass it to `db.putCreateDocument()`. No new message type is needed for creation.

For updating a comment on an existing highlight, a new `UPDATE_HIGHLIGHT_COMMENT` message routes through background to `db.updateCreateDocument(id, {comment})`.

---

## Data Model

The existing PouchDB `create` document gains one optional field:

```js
{
  verb: 'create',
  match: 'https://example.com/article',
  range: { ... },        // XPath range
  className: 'default-yellow-...',
  text: 'lazy dog near the river bank',
  comment: 'This is interesting because...',  // NEW — optional string
  date: 1710000000000,
  v: 4
}
```

`DB.DOCUMENT.NAME` gains: `COMMENT: 'comment'`

`updateCreateDocument()` is extended to accept `comment` alongside `className` and `title`.

---

## UI & Behavior

### Toolbar States

**State 1 — Text selected:**
A compact dark pill toolbar appears centered above the selection with a caret pointing down to the text. Contains:
- Pen button (colored with active highlight style background)
- Vertical divider
- Chat bubble button (neutral)

**State 2 — Comment mode (after chat bubble click):**
The text is immediately highlighted. The toolbar expands in-place to show:
- Chat bubble icon
- Vertical divider
- Auto-focused text input (`placeholder: "Add a comment…"`)
- Save button (disabled until ≥1 non-whitespace character)
- × close button

Pressing Enter or clicking Save commits the comment. × dismisses the input; the highlight remains but without a comment.

**State 3 — Hover on commented highlight:**
A blue dot (8px, border: 1.5px white) appears at the top-right of the first `<mark>` element. On hover, a dark tooltip appears above the highlight showing the comment text. Implemented in `DOMEventsHandler` by reading `data-comment` from the mark element.

### Toolbar Positioning

- Positioned using `Selection.getRangeAt(0).getBoundingClientRect()` + `window.scrollX/Y`
- Centered horizontally above the selection
- Falls back to bottom-of-selection if insufficient space above (< 60px from viewport top)
- `position: fixed` to avoid scroll drift

### Dismissal

The toolbar is removed when:
- User clicks outside it (captured `mousedown` listener, removed after first trigger)
- Selection collapses (via `selectionchange` event)
- Page navigates

---

## CSS Isolation

All toolbar elements use the class prefix `ssh-toolbar-` and rely on inline styles for critical layout properties. The stylesheet uses `all: initial` on the root element to prevent page style inheritance. This mirrors the approach used by existing close buttons, which work correctly across arbitrary sites without Shadow DOM.

---

## Edge Cases

| Scenario | Behavior |
|----------|---------|
| Click outside toolbar | Toolbar dismissed, no highlight created |
| Empty comment submitted | Save button disabled; no action |
| Comment cancelled (×) | Highlight stays, no comment stored |
| Selection inside existing highlight | New highlight created over selection (existing behavior) |
| Multi-element selection | `Marker.mark()` handles; no special casing needed |
| Page scroll while toolbar open | Toolbar dismissed (selectionchange fires) |

---

## Testing

New Playwright test file: `tests/selection-toolbar.spec.js`

### Test Cases

1. Select text → toolbar appears above selection
2. Click pen → highlight created with active style, toolbar dismissed
3. Click comment → toolbar expands, type text, press Enter → highlight created with comment, blue dot visible
4. Hover commented highlight → tooltip shows correct comment text
5. Click × in comment mode → highlight stays, no comment in DB
6. Click outside toolbar → toolbar dismissed, no highlight created
7. Save button disabled when comment input is empty

### Regression

No changes to existing highlight creation/deletion paths. Existing Playwright tests should pass without modification.

---

## Out of Scope

- Editing an existing comment (deferred)
- Comments visible in the extension popup (deferred)
- Multiple highlight color selection from the toolbar (deferred — uses active style only)
- Comment threading or replies
