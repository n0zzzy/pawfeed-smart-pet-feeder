// Renders the PawFeed app icons (PNG) used by the PWA manifest.  Run: node scripts/make-icons.js
const { chromium } = require('@playwright/test');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'icons');

// Paw print over a food bowl. `pad` shrinks the artwork for maskable icons (safe zone).
function svg(pad, rounded) {
  const s = 1 - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#1f2a63"/>
    <g transform="translate(${256 - 256 * s} ${256 - 256 * s}) scale(${s})" fill="#fff">
      <ellipse cx="256" cy="250" rx="78" ry="66"/>
      <ellipse cx="160" cy="168" rx="34" ry="44"/>
      <ellipse cx="226" cy="128" rx="34" ry="46"/>
      <ellipse cx="290" cy="128" rx="34" ry="46"/>
      <ellipse cx="354" cy="168" rx="34" ry="44"/>
      <path d="M96 330h320l-34 92a28 28 0 0 1-26 18H156a28 28 0 0 1-26-18z" fill="#12857f"/>
      <rect x="86" y="314" width="340" height="28" rx="14" fill="#2bb3a9"/>
    </g>
  </svg>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  const shots = [
    ['icon-512.png', 512, svg(0.06, true), true],
    ['icon-192.png', 192, svg(0.06, true), true],
    ['icon-maskable-512.png', 512, svg(0.16, false), false],
    ['apple-touch-icon.png', 180, svg(0.1, false), false],
  ];
  for (const [name, size, markup, transparent] of shots) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${markup}`);
    await page.screenshot({ path: path.join(OUT, name), omitBackground: transparent });
  }
  await browser.close();
  console.log('icons written to public/icons');
})();
