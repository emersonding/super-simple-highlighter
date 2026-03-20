const fs = require('fs')
const path = require('path')

const BOOTSTRAP_CSS_PATH = path.resolve(__dirname, '..', '..', 'src', 'vendor', 'css', 'bootstrap.min.css')

function extractGlyphiconFontUrls(css) {
  const fontFaceStart = css.indexOf('@font-face')
  const glyphiconClassStart = css.indexOf('.glyphicon{')

  if (fontFaceStart === -1 || glyphiconClassStart === -1) {
    throw new Error('Could not locate Bootstrap glyphicon @font-face block')
  }

  const fontFaceBlock = css.slice(fontFaceStart, glyphiconClassStart)
  return Array.from(fontFaceBlock.matchAll(/url\(([^)]+glyphicons-halflings-regular[^)]*)\)/g))
    .map((match) => match[1].replace(/['"#?].*$/g, '').replace(/^['"]|['"]$/g, ''))
}

describe('bootstrap glyphicon assets', () => {
  test('bootstrap css only references glyphicon font files that exist', () => {
    const css = fs.readFileSync(BOOTSTRAP_CSS_PATH, 'utf8')
    const fontUrls = extractGlyphiconFontUrls(css)

    expect(fontUrls.length).toBeGreaterThan(0)

    for (const fontUrl of fontUrls) {
      const resolvedPath = path.resolve(path.dirname(BOOTSTRAP_CSS_PATH), fontUrl)
      expect(fs.existsSync(resolvedPath)).toBe(true)
    }
  })
})
