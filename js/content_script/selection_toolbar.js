/**
 * Floating selection toolbar
 * Appears above text selections with pen (highlight) and comment buttons.
 *
 * @class SelectionToolbar
 */
class SelectionToolbar {
  /**
   * @param {StyleSheetManager} styleSheetManager
   * @param {Document} [doc=window.document]
   */
  constructor(styleSheetManager, doc = window.document) {
    this.styleSheetManager = styleSheetManager
    this.document = doc
    this._toolbarElm = null
    this._activeClassName = null
    this._activeBgColor = null
    this._state = 'hidden' // 'hidden' | 'idle' | 'comment'
    this._dismissListeners = []
  }

  /**
   * Initialize: inject styles, resolve active style, attach selection listener
   * @returns {SelectionToolbar}
   */
  init() {
    this._injectStyles()
    this._resolveActiveClassName()
    this.document.addEventListener('mouseup', this._onMouseUp.bind(this), { passive: true })
    return this
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Inject toolbar CSS as a <style> element */
  _injectStyles() {
    const style = this.document.createElement('style')
    style.textContent = `
      .ssh-toolbar-root {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        background: #2c2c2c;
        border-radius: 20px;
        padding: 6px 10px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        font-family: -apple-system, sans-serif;
        white-space: nowrap;
        transform: translateX(-50%);
      }
      .ssh-toolbar-root * { box-sizing: border-box; }
      .ssh-toolbar-pen, .ssh-toolbar-comment, .ssh-toolbar-save, .ssh-toolbar-cancel {
        all: initial;
        cursor: pointer;
        border-radius: 14px;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        border: none;
      }
      .ssh-toolbar-comment { background: transparent; color: #ccc; }
      .ssh-toolbar-save {
        all: initial;
        background: #4a90d9;
        border: none;
        border-radius: 10px;
        padding: 5px 14px;
        color: #fff;
        font-size: 12px;
        cursor: pointer;
        font-family: -apple-system, sans-serif;
      }
      .ssh-toolbar-save:disabled { opacity: 0.4; cursor: default; }
      .ssh-toolbar-cancel {
        all: initial;
        background: transparent;
        border: none;
        color: #888;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        font-family: -apple-system, sans-serif;
      }
      .ssh-toolbar-divider {
        all: initial;
        display: inline-block;
        width: 1px;
        height: 18px;
        background: #555;
      }
      .ssh-toolbar-input {
        all: initial;
        background: #1a1a1a;
        border: 1px solid #444;
        border-radius: 10px;
        padding: 5px 12px;
        color: #fff;
        font-size: 12px;
        width: 200px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-toolbar-input::placeholder { color: #666; }
      .ssh-toolbar-caret {
        all: initial;
        display: block;
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #2c2c2c;
      }
    `
    this.document.head.appendChild(style)
  }

  /** Load and cache the active highlight class name */
  _resolveActiveClassName() {
    new ChromeHighlightStorage().getAll().then(({ highlightDefinitions }) => {
      if (highlightDefinitions && highlightDefinitions.length > 0) {
        this._activeClassName = highlightDefinitions[0].className
        this._activeBgColor = (highlightDefinitions[0].style || {})['background-color'] || '#ffffaa'
      }
    }).catch(() => {})
  }

  /** mouseup handler — show toolbar if selection is non-empty */
  _onMouseUp(event) {
    // Ignore clicks inside the toolbar itself
    if (this._toolbarElm && this._toolbarElm.contains(event.target)) return

    const sel = this.document.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this._dismiss()
      return
    }

    const range = sel.getRangeAt(0)
    if (range.collapsed) {
      this._dismiss()
      return
    }

    this._showIdle(range)
  }

  /** Show State 1: pen + comment buttons */
  _showIdle(range) {
    this._dismiss()
    this._state = 'idle'

    const rect = range.getBoundingClientRect()
    const toolbar = this.document.createElement('div')
    toolbar.className = 'ssh-toolbar-root'

    // Pen button
    const pen = this.document.createElement('button')
    pen.className = 'ssh-toolbar-pen'
    pen.title = 'Highlight'
    pen.textContent = '\u270F\uFE0F'
    pen.style.background = this._activeBgColor || '#ffffaa'
    pen.addEventListener('click', () => this._onPenClick(range), { once: true })

    // Divider
    const divider = this.document.createElement('span')
    divider.className = 'ssh-toolbar-divider'

    // Comment button
    const comment = this.document.createElement('button')
    comment.className = 'ssh-toolbar-comment'
    comment.title = 'Comment & Highlight'
    comment.textContent = '\uD83D\uDCAC'
    comment.addEventListener('click', () => this._onCommentClick(range), { once: true })

    // Caret
    const caret = this.document.createElement('span')
    caret.className = 'ssh-toolbar-caret'

    toolbar.append(pen, divider, comment, caret)
    this._position(toolbar, rect)
    this.document.body.appendChild(toolbar)
    this._toolbarElm = toolbar

    this._attachDismissListeners()
  }

  /** Expand toolbar to State 2: comment input */
  _showCommentInput(highlightId) {
    if (!this._toolbarElm) return
    this._state = 'comment'

    // Remove dismiss listeners while in comment mode (selection collapses on input focus)
    this._detachDismissListeners()

    this._toolbarElm.innerHTML = ''

    const icon = this.document.createElement('span')
    icon.textContent = '\uD83D\uDCAC'
    icon.style.cssText = 'font-size:13px'

    const divider = this.document.createElement('span')
    divider.className = 'ssh-toolbar-divider'

    const input = this.document.createElement('input')
    input.className = 'ssh-toolbar-input'
    input.placeholder = 'Add a comment\u2026'
    input.maxLength = 1000
    input.type = 'text'

    const save = this.document.createElement('button')
    save.className = 'ssh-toolbar-save'
    save.textContent = 'Save'
    save.disabled = true

    const cancel = this.document.createElement('button')
    cancel.className = 'ssh-toolbar-cancel'
    cancel.textContent = '\u00D7'

    const caret = this.document.createElement('span')
    caret.className = 'ssh-toolbar-caret'

    input.addEventListener('input', () => {
      save.disabled = input.value.trim().length === 0
    })

    const doSave = () => {
      const comment = input.value.trim()
      if (!comment) return
      ChromeRuntimeHandler.sendMessage({
        id: ChromeRuntimeHandler.MESSAGE_ID.UPDATE_HIGHLIGHT_COMMENT,
        highlightId: highlightId,
        comment: comment,
      }).catch(console.error)
      this._dismiss()
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSave()
      if (e.key === 'Escape') this._dismiss()
    })
    save.addEventListener('click', doSave)
    cancel.addEventListener('click', () => this._dismiss())

    this._toolbarElm.append(icon, divider, input, save, cancel, caret)

    // Re-attach scroll/outside-click dismiss (but not selectionchange)
    this._attachDismissListeners({ skipSelectionChange: true })

    requestAnimationFrame(() => input.focus())
  }

  /** Pen click: highlight with active style */
  _onPenClick(range) {
    if (!this._activeClassName) {
      this._dismiss()
      return
    }
    const xrange = RangeUtils.toObject(range)
    const text = range.toString()
    ChromeRuntimeHandler.sendMessage({
      id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
      xrange: xrange,
      text: text,
      className: this._activeClassName,
    }).catch(console.error)
    this._dismiss()
  }

  /** Comment click: highlight immediately, then expand to comment input */
  _onCommentClick(range) {
    if (!this._activeClassName) {
      this._dismiss()
      return
    }
    const xrange = RangeUtils.toObject(range)
    const text = range.toString()

    ChromeRuntimeHandler.sendMessage({
      id: ChromeRuntimeHandler.MESSAGE_ID.CREATE_HIGHLIGHT_FROM_PAGE,
      xrange: xrange,
      text: text,
      className: this._activeClassName,
    }).then(highlightId => {
      if (highlightId) {
        this._showCommentInput(highlightId)
      } else {
        this._dismiss()
      }
    }).catch(() => this._dismiss())
  }

  /** Position toolbar centered above rect using fixed coords */
  _position(toolbar, rect) {
    const top = rect.top < 60
      ? rect.bottom + 10
      : rect.top - 46

    toolbar.style.left = `${Math.round(rect.left + rect.width / 2)}px`
    toolbar.style.top = `${Math.round(top)}px`
  }

  /** Attach dismiss listeners */
  _attachDismissListeners({ skipSelectionChange = false } = {}) {
    this._detachDismissListeners()

    const onMouseDown = (e) => {
      if (this._toolbarElm && !this._toolbarElm.contains(e.target)) {
        this._dismiss()
      }
    }
    const onScroll = () => this._dismiss()

    this.document.addEventListener('mousedown', onMouseDown, { capture: true, passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    this._dismissListeners.push(
      () => this.document.removeEventListener('mousedown', onMouseDown, { capture: true }),
      () => window.removeEventListener('scroll', onScroll),
    )

    if (!skipSelectionChange) {
      const onSelectionChange = () => {
        const sel = this.document.getSelection()
        if (sel && sel.isCollapsed) this._dismiss()
      }
      this.document.addEventListener('selectionchange', onSelectionChange, { passive: true })
      this._dismissListeners.push(
        () => this.document.removeEventListener('selectionchange', onSelectionChange)
      )
    }
  }

  _detachDismissListeners() {
    for (const fn of this._dismissListeners) fn()
    this._dismissListeners = []
  }

  /** Remove toolbar and clean up */
  _dismiss() {
    this._detachDismissListeners()
    if (this._toolbarElm) {
      this._toolbarElm.remove()
      this._toolbarElm = null
    }
    this._state = 'hidden'

    // Refresh active style for next show
    this._resolveActiveClassName()
  }
}
