import { test, expect } from './fixtures';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Render the production component with the app's TSX runtime; Playwright's own
// JSX transform creates component-test descriptors instead of React elements.
const markup = execFileSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    `
  import React from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { createDeck } from './src/cards.ts';
  import { Face } from './web/ui.tsx';
  const cards = [...new Map(createDeck().map(card => [card.name, card])).values()];
  console.log(['small', 'normal', 'played'].map(size => '<div class="samples">' +
    cards.map(card => {
      const face = renderToStaticMarkup(React.createElement(Face, {card, small: size === 'small'}));
      return size === 'played' ? '<div class="played-card">' + face + '</div>' : face;
    }).join('') + '</div>').join(''));
`,
  ],
  { encoding: 'utf8' },
);
const css = ['web/style.css', 'web/upgrade.css']
  .map((path) => readFileSync(path, 'utf8').replace(/@import[^;]+;/g, ''))
  .join('\n');

for (const width of [1440, 390]) {
  test(`卡牌中文：${width}px 下所有牌名完整、逐字分开且位于牌面内`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    // No remote font: exercise Chinese fallback fonts with missing vertical metrics.
    await page.setContent(
      `<style>${css} body{padding:20px}.samples{display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin-bottom:30px}.played-card{transform:none}</style>` +
        markup,
    );
    await page.evaluate(() => document.fonts.ready);
    const violations = await page.locator('.card-face').evaluateAll((faces) => {
      const failures: string[] = [];
      for (const face of faces) {
        const name = face.querySelector('strong')!;
        const bounds = face.getBoundingClientRect();
        const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT);
        let text: Node | null;
        let previousBottom = -Infinity;
        while ((text = walker.nextNode())) {
          for (let i = 0; i < (text.textContent?.length ?? 0); i++) {
            const range = document.createRange();
            range.setStart(text, i);
            range.setEnd(text, i + 1);
            const glyph = range.getBoundingClientRect();
            if (
              glyph.width < 1 ||
              glyph.height < 1 ||
              glyph.top < previousBottom - 1 ||
              glyph.top < bounds.top ||
              glyph.bottom > bounds.bottom ||
              glyph.left < bounds.left ||
              glyph.right > bounds.right
            ) {
              failures.push(`${name.textContent}: glyph ${i} overlaps or leaves its card`);
            }
            previousBottom = glyph.bottom;
          }
        }
      }
      return failures;
    });
    expect(violations).toEqual([]);
    mkdirSync('artifacts', { recursive: true });
    await page.screenshot({ path: `artifacts/card-names-${width}.png`, fullPage: true });
  });
}
