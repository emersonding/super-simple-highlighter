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

const CHAT_AI_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 32 32" fill="none"><path d="M16 3 18.8 10.2 26 13 18.8 15.8 16 23 13.2 15.8 6 13l7.2-2.8L16 3Z" fill="#e5e5ea"/><path d="M24.5 19 25.8 22.2 29 23.5 25.8 24.8 24.5 28 23.2 24.8 20 23.5 23.2 22.2 24.5 19Z" fill="#e5e5ea" opacity="0.8"/><circle cx="10" cy="23" r="2" fill="#e5e5ea" opacity="0.75"/></svg>`
const SEND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M4 16l24-12-8 12 8 12L4 16z" fill="#e5e5ea"/></svg>`

class ChatPanel {
  constructor(doc = window.document) {
    this.document = doc
    this._panelElm = null
    this._tabElm = null
    this._messagesElm = null
    this._inputElm = null
    this._isOpen = false
    this._messages = [] // { role: 'user'|'assistant', content: string }
    this._port = null
    this._pendingText = ''
    this._selectedContext = null
    this._chatProvider = 'gemini'
  }

  init() {
    this._injectStyles()
    this._createTab()
    this._loadChatProvider()

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      if (changes[ChromeStorage.KEYS.CHAT_PROVIDER]) {
        this._chatProvider = changes[ChromeStorage.KEYS.CHAT_PROVIDER].newValue || 'gemini'
      }
    })

    return this
  }

  _loadChatProvider() {
    new ChromeStorage('local').get([ChromeStorage.KEYS.CHAT_PROVIDER]).then(items => {
      this._chatProvider = items[ChromeStorage.KEYS.CHAT_PROVIDER] || 'gemini'
    }).catch(() => {})
  }

  _injectStyles() {
    const style = this.document.createElement('style')
    style.textContent = `
      .ssh-chat-tab {
        all: initial;
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 12px;
        height: 40px;
        background: #2c2c2c;
        border-radius: 6px 0 0 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483646;
        box-shadow: -2px 0 8px rgba(0,0,0,0.3);
        transition: width 0.15s ease;
      }
      .ssh-chat-tab:hover { width: 16px; }
      .ssh-chat-panel {
        all: initial;
        position: fixed;
        right: 0;
        top: 0;
        width: 350px;
        height: 100vh;
        background: #2c2c2c;
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        box-shadow: -4px 0 20px rgba(0,0,0,0.4);
        font-family: -apple-system, sans-serif;
        transition: transform 0.2s ease;
      }
      .ssh-chat-panel.ssh-chat-hidden { transform: translateX(100%); }
      .ssh-chat-panel * { box-sizing: border-box; }
      .ssh-chat-header {
        all: initial;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #444;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-title {
        all: initial;
        color: #e5e5ea;
        font-size: 14px;
        font-weight: 600;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-provider-badge {
        all: initial;
        color: #888;
        font-size: 11px;
        margin-left: 8px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-close {
        all: initial;
        color: #888;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-messages {
        all: initial;
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-msg {
        all: initial;
        max-width: 85%;
        padding: 8px 12px;
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.5;
        word-break: break-word;
        white-space: pre-wrap;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-msg-user {
        align-self: flex-end;
        background: #4a90d9;
        color: #fff;
      }
      .ssh-chat-msg-assistant {
        align-self: flex-start;
        background: #3a3a3c;
        color: #e5e5ea;
      }
      .ssh-chat-msg-error {
        align-self: center;
        background: #5a2020;
        color: #ff9090;
        font-size: 12px;
      }
      .ssh-chat-context-badge {
        all: initial;
        align-self: center;
        background: #3a3a3c;
        color: #888;
        font-size: 11px;
        padding: 4px 10px;
        border-radius: 8px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-input-bar {
        all: initial;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #444;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-input {
        all: initial;
        flex: 1;
        background: #1a1a1a;
        border: 1px solid #444;
        border-radius: 10px;
        padding: 8px 12px;
        color: #fff;
        font-size: 13px;
        font-family: -apple-system, sans-serif;
      }
      .ssh-chat-input::placeholder { color: #666; }
      .ssh-chat-send {
        all: initial;
        background: #4a90d9;
        border: none;
        border-radius: 10px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .ssh-chat-send:disabled { opacity: 0.4; cursor: default; }
    `
    this.document.head.appendChild(style)
  }

  _createTab() {
    const tab = this.document.createElement('div')
    tab.className = 'ssh-chat-tab'
    tab.title = 'Chat with AI'
    tab.innerHTML = CHAT_AI_SVG_SMALL
    tab.addEventListener('click', () => this.toggle())
    this.document.body.appendChild(tab)
    this._tabElm = tab
  }

  toggle(selectedText) {
    if (this._isOpen) {
      this.close()
    } else {
      this.open(selectedText)
    }
  }

  open(selectedText) {
    if (this._isOpen) return
    this._isOpen = true
    this._selectedContext = selectedText || null
    this._messages = []

    if (this._tabElm) {
      this._tabElm.innerHTML = '\u00D7'
      this._tabElm.style.color = '#888'
      this._tabElm.style.fontSize = '14px'
    }

    this._createPanel()
  }

  close() {
    this._isOpen = false
    this._selectedContext = null
    this._messages = []
    this._pendingText = ''

    if (this._port) {
      this._port.disconnect()
      this._port = null
    }

    if (this._panelElm) {
      this._panelElm.remove()
      this._panelElm = null
      this._messagesElm = null
      this._inputElm = null
    }

    if (this._tabElm) {
      this._tabElm.innerHTML = CHAT_AI_SVG_SMALL
      this._tabElm.style.color = ''
      this._tabElm.style.fontSize = ''
    }
  }

  _createPanel() {
    if (this._panelElm) this._panelElm.remove()

    const panel = this.document.createElement('div')
    panel.className = 'ssh-chat-panel'

    // Header
    const header = this.document.createElement('div')
    header.className = 'ssh-chat-header'

    const titleWrap = this.document.createElement('span')
    const title = this.document.createElement('span')
    title.className = 'ssh-chat-title'
    title.textContent = 'Chat with AI'
    const badge = this.document.createElement('span')
    badge.className = 'ssh-chat-provider-badge'
    badge.textContent = this._chatProvider === 'gpt' ? 'GPT' : 'Gemini'
    titleWrap.append(title, badge)

    const closeBtn = this.document.createElement('span')
    closeBtn.className = 'ssh-chat-close'
    closeBtn.textContent = '\u00D7'
    closeBtn.addEventListener('click', () => this.close())

    header.append(titleWrap, closeBtn)

    // Messages
    const messages = this.document.createElement('div')
    messages.className = 'ssh-chat-messages'

    // Context badge
    const contextBadge = this.document.createElement('div')
    contextBadge.className = 'ssh-chat-context-badge'
    if (this._selectedContext) {
      const preview = this._selectedContext.length > 60
        ? this._selectedContext.substring(0, 60) + '...'
        : this._selectedContext
      contextBadge.textContent = `Selected: "${preview}"`
    } else {
      contextBadge.textContent = 'Page context'
    }
    messages.appendChild(contextBadge)

    this._messagesElm = messages

    // Input bar
    const inputBar = this.document.createElement('div')
    inputBar.className = 'ssh-chat-input-bar'

    const input = this.document.createElement('input')
    input.className = 'ssh-chat-input'
    input.placeholder = 'Ask about this page...'
    input.type = 'text'

    const sendBtn = this.document.createElement('button')
    sendBtn.className = 'ssh-chat-send'
    sendBtn.innerHTML = SEND_SVG
    sendBtn.disabled = true

    input.addEventListener('input', () => {
      sendBtn.disabled = input.value.trim().length === 0
    })

    const doSend = () => {
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      sendBtn.disabled = true
      this._sendMessage(text)
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSend()
    })
    sendBtn.addEventListener('click', doSend)

    inputBar.append(input, sendBtn)
    this._inputElm = input

    panel.append(header, messages, inputBar)
    this.document.body.appendChild(panel)
    this._panelElm = panel

    requestAnimationFrame(() => input.focus())
  }

  _sendMessage(text) {
    this._messages.push({ role: 'user', content: text })
    this._appendBubble('user', text)

    // Create assistant bubble for streaming
    const assistantBubble = this._appendBubble('assistant', '')
    this._pendingText = ''

    // Get page context
    const pageContext = this.document.body.innerText

    // Open port for streaming
    const port = chrome.runtime.connect({ name: 'chat-stream' })
    this._port = port

    port.postMessage({
      messages: this._messages.map(m => ({ role: m.role, content: m.content })),
      provider: this._chatProvider,
      pageContext: pageContext,
      selectedText: this._selectedContext || undefined,
    })

    port.onMessage.addListener((msg) => {
      if (msg.type === 'chunk') {
        this._pendingText += msg.text
        assistantBubble.textContent = this._pendingText
        this._scrollToBottom()
      } else if (msg.type === 'done') {
        this._messages.push({ role: 'assistant', content: this._pendingText })
        this._pendingText = ''
        this._port = null
      } else if (msg.type === 'error') {
        assistantBubble.textContent = msg.message
        assistantBubble.classList.add('ssh-chat-msg-error')
        assistantBubble.classList.remove('ssh-chat-msg-assistant')
        this._port = null
      }
    })

    port.onDisconnect.addListener(() => {
      this._port = null
    })
  }

  _appendBubble(role, text) {
    const bubble = this.document.createElement('div')
    bubble.className = `ssh-chat-msg ssh-chat-msg-${role}`
    bubble.textContent = text
    this._messagesElm.appendChild(bubble)
    this._scrollToBottom()
    return bubble
  }

  _scrollToBottom() {
    if (this._messagesElm) {
      this._messagesElm.scrollTop = this._messagesElm.scrollHeight
    }
  }
}
