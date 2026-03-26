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

/**
 * style sheet access methods
 * 
 * @class StyleSheetManager
 */
class StyleSheetManager {
  /**
	 * Creates an instance of StyleSheetManager.
	 * 
	 * @param {Document} document 
	 * @package {String} sharedHighlightClassName optional name that the shared hightlight class should use. defaults to random string
	 * @package {String} styleElementId optional id that the style element will use. defaults to random string
	 * @memberof StyleSheetManager
	 */
	constructor(document, sharedHighlightClassName = StringUtils.newUUID(), styleElementId = StringUtils.newUUID()) {
		this.document = document

		// A random class name added to every mark element, that defines its colors ONLY
		// It is styled as 'ChromeHighlightStorage.SHARED_HIGHLIGHT_STYLE'
		this.sharedHighlightClassName = sharedHighlightClassName

		// As above, but defines the structure (padding, margin etc)
		this.sharedContentClassName = StringUtils.newUUID()
		
		// id of single <style> element
		this.styleElementId = styleElementId
  }

  /**
   * Prepare the document
   * 
	 * @returns {StyleSheetManager} this
   * @memberof StyleSheetManager
   */
  init() {
		// Every document needs a stylesheet inside its head element. It will contain the rules for animation and close button.
		// The shared highlight definition style, and each specific highlight definition style, are added later via the content script.
		
		// remove existint
		let elm = this.document.getElementById(this.styleElementId)

		if (elm) {
			this.document.head.removeChild(elm)
		}

		elm = /** @type {HTMLStyleElement} */ (this.document.createElement('style'))
		
		elm.type = 'text/css'
		elm.id = this.styleElementId

		// add to enable sheet property
		// console.assert(!this.document.querySelector(`#${elm.id}`))
		this.document.head.appendChild(elm)
	
		const rules = [
				// non-appearance styles common to highlights
				`.${this.sharedContentClassName} {
					${StyleSheetManager.DECLARATIONS.CONTENT}
				}`,

				`@media print {
					.${this.sharedHighlightClassName} {
						${StyleSheetManager.DECLARATIONS.MEDIA_PRINT__SHARED_HIGHLIGHT}
					}
				}`,

				`.${StyleSheetManager.CLASS_NAME.COMMENT_DOT} {
					${StyleSheetManager.DECLARATIONS.COMMENT_DOT}
				}`,
		]
		
		for (const rule of rules) {
				/** @type {CSSStyleSheet} */ (elm.sheet).insertRule(rule, (elm.sheet).cssRules.length)
		}
		// elm.appendChild(this.document.createTextNode(rules.join('\n')))

		return this
	}

  //

  /**
   * Insert or replace a style rule for a highlight definition
   * 
   * @param {HighlightDefinitionFactory.HighlightDefinition} highlightDefinition 
	 * @param {boolean} [important = false] true to make color & background-color rules important, which sometimes helps with -webkit-print*
	 * @returns {Promise}
   * @memberof StyleSheetManager
   */
  setRule(highlightDefinition, important = false) {
		// copy style (aka rules object)
		const rules = Object.assign({}, highlightDefinition.style)

		// account for styles defined before box-shadow was defined
		const backgroundColor = rules['background-color']
		
		const match = new RegExp("^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})", "ig").exec(backgroundColor)

		if (!match || match.length < 4) {
			return Promise.reject(new Error("highlight style background colour not in #RRGGBB format"))
		}

		if (!highlightDefinition.disableBoxShadow) {
			rules['box-shadow'] = `0 0 0.35em ${backgroundColor}`
		}

		if (highlightDefinition.inherit_style_color) {
			rules['color'] = 'inherit'
		}
		
		const suffix = important ? " !important" : ""
		
		if (rules['color']) {
			rules['color'] += suffix
		}

		return new ChromeStorage().get(ChromeStorage.KEYS.HIGHLIGHT_BACKGROUND_ALPHA).then(a => {
			// format CSS background color in rgba format
			rules['background-color'] = `rgba(${[
				match[1],
				match[2],
				match[3],
				a || 1
			].map(i => (typeof i === 'string' ? parseInt(i, 16) : i)).join(', ')})${suffix}`

			// delete existing rule, if it exists
			const idx = this.deleteRule(highlightDefinition.className)
			// format as cssRule
			const rule = `.${highlightDefinition.className}
				${JSON.stringify(rules, null, '\t')
					.replace(/"/g,'')
					.replace(/,\n/g,';')
					.replace(/\}/g, ';}')}
			`
			const styleElm = /** @type {HTMLStyleElement} */ (this.document.getElementById(this.styleElementId))
			const sheet = /** @type {CSSStyleSheet} */ (styleElm.sheet)

			// try to insert replacement rule at same index
			sheet.insertRule(rule, idx === -1 ? sheet.cssRules.length : idx)
		})
  }

  /**
   * Delete a rule in the single shared style element
   * 
   * @param {string} highlightDefinitionClassName 
   * @returns {number} index rule occupied in cssRules of the single sheet, or -1
   * @memberof StyleSheetManager
   */
  deleteRule(highlightDefinitionClassName) {
		// sheet of the single style element
		const elm = /** @type {HTMLStyleElement} */ (this.document.querySelector(`#${this.styleElementId}`))
		const sheet = /** @type {CSSStyleSheet} */ (elm.sheet)
		const selectorText = `.${highlightDefinitionClassName}`

		// find index of rule with selector consisting only of this class name
		for (let idx=0; idx < sheet.cssRules.length; idx++) {
			const rule = /** @type {CSSStyleRule} */ (sheet.cssRules[idx])

			if (rule.type === CSSRule.STYLE_RULE && rule.selectorText === selectorText) {
				sheet.deleteRule(idx)
				return idx
			}
		}

		return -1
	}
	
	//

	/**
	 * Convert the DOM representation of our single style element to its identical text form
	 * (so it can be saved)
	 * 
	 * @returns {string} text of element
	 * @memberof StyleSheetManager
	 */
	textualizeStyleElement() {
		const styleElm = /** @type {HTMLStyleElement} */ (this.document.getElementById(this.styleElementId))

		if (!styleElm) {
			return ""
		}

		const sheet = /** @type {CSSStyleSheet} */ (styleElm.sheet)
		const text = Array.from(sheet.cssRules).map(({cssText}) => cssText).join('\n\n')

		styleElm.textContent = text

		return text
	}
}// end class

// static properties

StyleSheetManager.CLASS_NAME = {
  COMMENT_DOT: 'ssh-comment-dot',
  COMMENT_TOOLTIP: 'ssh-comment-tooltip',
}

StyleSheetManager.DECLARATIONS = {
	// styles that all highlights should have, independent of highlight color
	// font: inherit !important;
	// position: relative needed because close button is a child of the mark, and positions itself relative to it
	CONTENT: `
		position: relative !important;
  	border-radius: 0.2em !important;
    padding: 0px !important;
    margin: 0px !important;
	`,

	MEDIA_PRINT__SHARED_HIGHLIGHT: `
		box-shadow: unset !important;
		-webkit-print-color-adjust: exact !important;
	`,

	COMMENT_DOT: `
		all: initial;
		position: absolute;
		top: -8px;
		right: -6px;
		font-size: 11px;
		line-height: 1;
		cursor: pointer;
		display: inline-block;
		user-select: none;
	`,

}
