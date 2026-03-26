/*
 * This file is part of Super Simple Highlighter.
 *
 * Super Simple Highlighter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Super Simple Highlighter is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
 */

class DOMEventsHandler {
  constructor(styleSheetManager, document = window.document) {
    this.styleSheetManager = styleSheetManager
    this.document = document
    this._popupElm = null
    this._dismissListeners = []
  }

  init() {
    this.document.addEventListener('click', this._onClick.bind(this), { capture: true, passive: true })

    const listenerOptions = { capture: true, passive: true }
    for (const type of ['mouseenter', 'focusin']) {
      this.document.addEventListener(type, this._onEnter.bind(this), listenerOptions)
    }
    for (const type of ['mouseleave', 'focusout']) {
      this.document.addEventListener(type, this._onLeave.bind(this), listenerOptions)
    }

    return this
  }

  _onClick(event) {
    const target = event.target
    if (this._popupElm && !this._popupElm.contains(target)) {
      this._dismissPopup()
    }
    if (!target.id || !target.classList.contains(this.styleSheetManager.sharedHighlightClassName)) {
      return
    }
    const sel = this.document.getSelection()
    if (sel && !sel.isCollapsed) return

    const elms = new Marker(this.document).getMarkElements(target.id)
    if (elms.length === 0) return

    const firstElm = elms[0]
    const rect = target.getBoundingClientRect()
    this._showActionPopup(firstElm.id, rect, firstElm.dataset.comment)
  }

  _showActionPopup(highlightId, anchorRect, existingComment) {
    this._dismissPopup()

    const popup = this.document.createElement('div')
    popup.className = 'ssh-highlight-popup'

    const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M8 10h16M13 10V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M10 10v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10" stroke="#e5e5ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    const COMMENT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><rect x="3" y="2" width="26" height="21" rx="7" fill="${existingComment ? '#4a90d9' : '#e5e5ea'}"/><path d="M10 23 L9 30 L18 23" fill="${existingComment ? '#4a90d9' : '#e5e5ea'}"/></svg>`

    const deleteBtn = this.document.createElement('button')
    deleteBtn.className = 'ssh-highlight-popup-btn'
    deleteBtn.title = 'Delete highlight'
    deleteBtn.innerHTML = TRASH_SVG
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      ChromeRuntimeHandler.deleteHighlight(highlightId).catch(console.error)
      this._dismissPopup()
    }, { once: true })

    const divider = this.document.createElement('span')
    divider.className = 'ssh-highlight-popup-divider'

    const commentBtn = this.document.createElement('button')
    commentBtn.className = 'ssh-highlight-popup-btn'
    commentBtn.title = existingComment ? 'Edit comment' : 'Add comment'
    commentBtn.innerHTML = COMMENT_SVG
    commentBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const markElm = this.document.getElementById(highlightId)
      this.document.dispatchEvent(new CustomEvent('ssh-edit-comment', {
        detail: {
          highlightId,
          comment: markElm ? markElm.dataset.comment || '' : '',
          anchorRect: anchorRect,
        }
      }))
      this._dismissPopup()
    }, { once: true })

    const caret = this.document.createElement('span')
    caret.className = 'ssh-highlight-popup-caret'

    popup.append(deleteBtn, divider, commentBtn, caret)

    this.document.body.appendChild(popup)
    const popupRect = popup.getBoundingClientRect()
    const verticalOffset = 8
    const top = anchorRect.top < popupRect.height + verticalOffset
      ? anchorRect.bottom + verticalOffset
      : anchorRect.top - popupRect.height - verticalOffset
    const maxLeft = Math.max(0, window.innerWidth - popupRect.width - 8)
    const left = Math.min(Math.max(0, anchorRect.left), maxLeft)
    popup.style.left = `${Math.round(left)}px`
    popup.style.top = `${Math.round(top)}px`

    this._popupElm = popup
    this._attachDismissListeners()
  }

  _attachDismissListeners() {
    this._detachDismissListeners()
    const onKeyDown = (e) => { if (e.key === 'Escape') this._dismissPopup() }
    const onScroll = () => this._dismissPopup()
    this.document.addEventListener('keydown', onKeyDown, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    this._dismissListeners.push(
      () => this.document.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('scroll', onScroll),
    )
  }

  _detachDismissListeners() {
    for (const fn of this._dismissListeners) fn()
    this._dismissListeners = []
  }

  _dismissPopup() {
    this._detachDismissListeners()
    if (this._popupElm) {
      this._popupElm.remove()
      this._popupElm = null
    }
  }

  _onEnter(event) {
    const target = event.target
    if (!target.id || !target.classList.contains(this.styleSheetManager.sharedHighlightClassName)) return
    const elms = new Marker(this.document).getMarkElements(target.id)
    if (elms.length === 0) return
    const firstElm = elms[0]
    if (firstElm.dataset.comment) {
      this._showCommentTooltip(firstElm)
    }
  }

  _onLeave(event) {
    const target = event.target
    if (!target.id || !target.classList.contains(this.styleSheetManager.sharedHighlightClassName)) return
    this._hideCommentTooltip()
  }

  _showCommentTooltip(markElm) {
    this._hideCommentTooltip()
    const tooltip = this.document.createElement('div')
    tooltip.classList.add(StyleSheetManager.CLASS_NAME.COMMENT_TOOLTIP)
    tooltip.textContent = markElm.dataset.comment
    const rect = markElm.getBoundingClientRect()
    tooltip.style.cssText = `
      all: initial;
      position: fixed;
      background: #2c2c2c;
      color: #fff;
      border-radius: 8px;
      padding: 7px 12px;
      font: 13px/1.5 -apple-system, sans-serif;
      max-width: 260px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35);
      pointer-events: none;
      z-index: 2147483647;
      white-space: normal;
      word-break: break-word;
      left: ${Math.round(rect.left)}px;
      top: ${Math.round(rect.top - 48)}px;
    `
    this.document.body.appendChild(tooltip)
    this._commentTooltip = tooltip
  }

  _hideCommentTooltip() {
    if (this._commentTooltip) {
      this._commentTooltip.remove()
      this._commentTooltip = null
    }
  }
}
