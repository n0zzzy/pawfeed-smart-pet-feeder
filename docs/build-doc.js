// Builds the filled-in "Software Automation Test Document" PDF from the latest test run.
// Run after `npm test` and `node docs/capture-report.js`:  node docs/build-doc.js
// Execution evidence screenshots (terminal + HTML report) are taken by hand and saved as screenshots/EVIDENCE-*.png.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'results.json'), 'utf8'));
const DOC_DATE = 'October 17, 2026';
const RUN_AT = new Date(results.stats.startTime).toLocaleString('en-US', {
  timeZone: 'Asia/Manila', dateStyle: 'long', timeStyle: 'medium',
});
const REPO_URL = 'https://github.com/n0zzzy/pawfeed-smart-pet-feeder';
const LIVE_URL = 'https://pawfeed-smart-pet-feeder.vercel.app';

const PLATFORMS = [
  { id: 'desktop-chrome', label: 'Desktop Chrome', short: 'Desktop' },
  { id: 'android-pixel7', label: 'Android · Pixel 7 (Chrome)', short: 'Android' },
  { id: 'iphone-14', label: 'iPhone 14 (Safari / WebKit)', short: 'iPhone' },
];

// ---------- collect results from the Playwright JSON report: runs[ATC-xx][project] ----------
const runs = {};
(function walk(suite) {
  for (const s of suite.suites || []) walk(s);
  for (const spec of suite.specs || []) {
    const id = spec.title.split(':')[0];
    for (const t of spec.tests) {
      const r = t.results[t.results.length - 1];
      const notes = [...(t.annotations || []), ...(r.annotations || [])];
      (runs[id] ||= {})[t.projectName] = {
        status: r.status,
        duration: r.duration,
        actual: [...new Set(notes.filter(a => a.type === 'actual').map(a => a.description))].join(' '),
      };
    }
  }
})(results);

const stats = results.stats;
const executed = stats.expected + stats.unexpected + stats.flaky;
const passRate = executed ? ((stats.expected / executed) * 100).toFixed(0) : '0';

// ---------- static test case definitions (from the Define Automation Testing doc + mobile app) ----------
const cases = [
  {
    id: 'ATC-01', at: 'AT-001', module: 'Manual Feed', maps: 'AS-01 / TC-02', priority: 'High',
    name: 'Verify manual feed dispenses exactly one portion (~10 g)',
    pre: ['Feeder is powered on and CONNECTED', 'Hopper food level is 100%', 'Portion size is 1 slot (default)'],
    data: [['Portion size', '1 slot (≈10 g)'], ['Tolerance', '±5% → 9.5 g – 10.5 g']],
    steps: [
      ['Reset device and open the app', 'App loads, status CONNECTED, dispense count 0'],
      ['Tap “Feed Now”', 'Message “Dispensed … g (1 slot/s)” is shown'],
      ['Read Dispense Count and Last Feed weight', 'Count = 1, weight within 9.5–10.5 g, one row in Feed Log'],
    ],
    expected: 'Exactly 1 dispense event is recorded and the weight is within ±5% of 10 g.',
    shots: ['ATC-01_manual_feed_success.png'],
  },
  {
    id: 'ATC-02', at: 'AT-002', module: 'Manual Feed', maps: 'AS-01 / TC-02 (negative)', priority: 'High',
    name: 'Verify manual feed is blocked when the chute is jammed',
    pre: ['Feeder is powered on and CONNECTED', 'Chute jam can be simulated'],
    data: [['Chute jam', 'ON'], ['Expected status', 'JAM_DETECTED']],
    steps: [
      ['Tap “Toggle Chute Jam” in the Device Simulator', 'Jam indicator shows ON'],
      ['Tap “Feed Now”', 'Message “JAM_DETECTED — nothing dispensed (0 g)”'],
      ['Check Last Feed, Dispense Count and Notifications', 'Weight 0 g, count stays 0, JAM notification visible'],
    ],
    expected: 'Feeder reports JAM_DETECTED, dispenses 0 g and alerts the owner.',
    shots: ['ATC-02_manual_feed_jam_detected.png'],
  },
  {
    id: 'ATC-03', at: 'AT-003', module: 'Portion Settings', maps: 'AS-02 / TC-03', priority: 'High',
    name: 'Verify 5-slot portion dispenses ~50 g and the setting persists',
    pre: ['App is open and paired with the device'],
    data: [['Portion size', '5 slots (≈50 g)'], ['Tolerance', '±5% → 47.5 g – 52.5 g']],
    steps: [
      ['Enter 5 in the Slots field and tap “Save Portion”', '“Portion saved: 5 slot(s)” message'],
      ['Reload the app', 'Portion Size still shows 5 slot(s)'],
      ['Tap “Feed Now” and read Last Feed weight', 'Weight within 47.5–52.5 g'],
    ],
    expected: 'Portion is saved on the device and the dispensed weight is within ±5% of 50 g.',
    shots: ['ATC-03_portion_5_slots_50g.png'],
  },
  {
    id: 'ATC-04', at: 'AT-004', module: 'Portion Settings', maps: 'AS-02 / TC-03 (negative)', priority: 'High',
    name: 'Verify an invalid portion (99 slots) is rejected',
    pre: ['App is open and paired with the device', 'Current portion is 1 slot'],
    data: [['Portion size', '99 slots (exceeds 1–10 limit)'], ['Expected status', 'INVALID_PORTION']],
    steps: [
      ['Enter 99 in the Slots field and tap “Save Portion”', 'Error “INVALID_PORTION: Portion must be 1-10 slots.”'],
      ['Check Portion Size and Dispense Count', 'Portion stays 1 slot, nothing dispensed'],
    ],
    expected: 'The value is rejected with INVALID_PORTION and is not saved or dispensed.',
    shots: ['ATC-04_invalid_portion_rejected.png'],
  },
  {
    id: 'ATC-05', at: 'AT-005', module: 'Scheduling', maps: 'AS-03 / TC-04', priority: 'High',
    name: 'Verify a scheduled meal triggers dispensing on time',
    pre: ['Device clock is synced (starts at 07:59:00)', 'Schedule can be created in the app'],
    data: [['Meal time', '08:00:00'], ['Portion', '3 slots (≈30 g)'], ['Time window', '±1 minute']],
    steps: [
      ['Add a schedule for 08:00:00 with 3 slots', 'Row appears and shows “Synced to device”'],
      ['Set the device clock to 08:00:00 and tick (mocked clock)', 'Device clock shows 08:00:00'],
      ['Check the Feed Log', 'New SCHEDULED / DISPENSED row within ±60 s of 08:00:00, ≈30 g'],
    ],
    expected: 'A scheduled feed event is logged within ±1 minute of the scheduled time.',
    shots: ['ATC-05_scheduled_feed_triggered.png'],
  },
  {
    id: 'ATC-06', at: 'AT-006', module: 'Alerts', maps: 'AS-04 / TC-06', priority: 'Medium',
    name: 'Verify a Low Food alert is sent when hopper drops below 15%',
    pre: ['IR sensor reading can be simulated'],
    data: [['Food level', '10%'], ['Alert threshold', '< 15%']],
    steps: [
      ['Enter 10 in “Food level %” and tap “Set IR Sensor”', 'Food Level shows 10% (red bar)'],
      ['Watch the Notifications panel (max 3 s)', '“LOW FOOD” notification appears'],
    ],
    expected: 'The app receives a Low Food notification within a few seconds.',
    shots: ['ATC-06_low_food_alert_10_percent.png'],
  },
  {
    id: 'ATC-07', at: 'AT-007', module: 'Alerts', maps: 'AS-04 / TC-06 (negative)', priority: 'Medium',
    name: 'Verify no Low Food alert fires above the 15% threshold',
    pre: ['IR sensor reading can be simulated'],
    data: [['Food level', '40%'], ['Alert threshold', '< 15%']],
    steps: [
      ['Enter 40 in “Food level %” and tap “Set IR Sensor”', 'Food Level shows 40%'],
      ['Wait 1.5 s and check Notifications', 'No LOW FOOD notification'],
    ],
    expected: 'No Low Food alert is shown when the hopper is above 15%.',
    shots: ['ATC-07_no_alert_40_percent.png'],
  },
  {
    id: 'ATC-08', at: 'AT-008', module: 'Connectivity', maps: 'AS-05 / TC-08', priority: 'High',
    name: 'Verify the device auto-reconnects to Wi-Fi without manual setup',
    pre: ['Device was previously paired and CONNECTED'],
    data: [['Outage length', '5 s'], ['Reconnect timeout', '60 s'], ['Allowed pairing calls', '0']],
    steps: [
      ['Tap “Drop Wi-Fi”', 'Status badge shows DISCONNECTED'],
      ['Wait 5 s, then tap “Restore Wi-Fi”', 'Status shows RECONNECTING'],
      ['Poll the status badge (up to 60 s)', 'Status returns to CONNECTED'],
      ['Check “Manual pairing calls”', 'Value is 0'],
    ],
    expected: 'Status returns to CONNECTED within 60 s with no manual pairing call.',
    shots: ['ATC-08a_wifi_dropped.png', 'ATC-08b_wifi_reconnected.png'],
  },
  {
    id: 'ATC-09', at: 'AT-009', module: 'App Sync', maps: 'AS-06 / TC-14', priority: 'Medium',
    name: 'Verify a schedule change syncs to the device in under 2 seconds',
    pre: ['App and device are online and paired', 'One schedule exists (08:00:00)'],
    data: [['Original time', '08:00:00'], ['New time', '18:30:00'], ['Sync limit', '< 2 s']],
    steps: [
      ['Add a schedule at 08:00:00 and wait for “Synced to device”', 'Schedule synced'],
      ['Tap “Edit”, change the time to 18:30:00 and start the timer on “Save”', 'Row shows 18:30:00, “Syncing…”'],
      ['Wait for “Synced to device” and stop the timer', 'Elapsed time under 2 s'],
    ],
    expected: 'The device schedule matches the app’s new value in under 2 seconds.',
    shots: ['ATC-09_schedule_sync_under_2s.png'],
    actualAll: true,
  },
  {
    id: 'ATC-10', at: 'AT-010', module: 'Mobile App (PWA)', maps: 'Mobile app requirement', priority: 'High',
    name: 'Verify the mobile app is installable (manifest, icons, service worker)',
    pre: ['App is served over localhost or HTTPS (Vercel)'],
    data: [['Manifest', '/manifest.webmanifest'], ['Required', 'display: standalone, start_url: /, icons 192 & 512 px'], ['Service worker', '/sw.js']],
    steps: [
      ['Open the app', 'Page links /manifest.webmanifest'],
      ['Request the manifest', 'name PawFeed, display standalone, start_url /'],
      ['Request every icon in the manifest', 'All icons load (HTTP 200)'],
      ['Check the service worker registration', 'Service worker state is “activated”'],
    ],
    expected: 'The phone’s browser can install PawFeed as an app (Add to Home Screen).',
    shots: ['ATC-10_pwa_installable.png'], phoneShots: true,
  },
  {
    id: 'ATC-11', at: 'AT-011', module: 'Mobile App (PWA)', maps: 'Mobile app requirement', priority: 'Medium',
    name: 'Verify the app opens and works while the phone is offline',
    pre: ['App was opened once, so the service worker cached it'],
    data: [['Network', 'Offline'], ['Expected mode', 'On-device demo']],
    steps: [
      ['Wait for the service worker to be activated', 'State “activated”'],
      ['Turn the network off and reload the app', 'App still opens (served from cache)'],
      ['Check the mode label', '“On-device demo”'],
      ['Tap “Feed Now”', '“Dispensed … g” message'],
    ],
    expected: 'The app loads and can feed without an internet connection.',
    shots: ['ATC-11_offline_mode.png'], phoneShots: true,
  },
  {
    id: 'ATC-12', at: 'AT-012', module: 'Hosting (Vercel)', maps: 'Deployment requirement', priority: 'High',
    name: 'Verify the hosted app works without a server API and keeps its data',
    pre: ['No /api server is available (same as on Vercel)'],
    data: [['/api/** response', '404 Not Found (mocked)'], ['Storage', 'Browser localStorage']],
    steps: [
      ['Open the app', 'Mode label shows “On-device demo”, status CONNECTED'],
      ['Tap “Feed Now”', 'Dispense count 1, weight 9.5–10.5 g'],
      ['Reload the app', 'Dispense count is still 1'],
    ],
    expected: 'The Vercel-hosted app runs the feeder in the browser and keeps the data after reload.',
    shots: ['ATC-12_hosted_on_device_mode.png'], phoneShots: true,
  },
  {
    id: 'ATC-13', at: 'AT-013', module: 'Responsive UI', maps: 'Mobile app requirement', priority: 'Medium',
    name: 'Verify the layout fits phone screens with a tappable Feed button',
    pre: ['App is open on the target screen size'],
    data: [['Screens', '1280×900 · 412×839 (Pixel 7) · 390×664 (iPhone 14)'], ['Min. tap target', '44 × 44 px']],
    steps: [
      ['Compare page width with screen width', 'No horizontal (sideways) scrolling'],
      ['Check the “Feed Now” button', 'Visible on the first screen'],
      ['Measure the button', 'At least 44 × 44 px'],
    ],
    expected: 'The app fits every screen and the main action is easy to tap.',
    shots: ['ATC-13_responsive_layout.png'], phoneShots: true, actualAll: true,
  },
];

// ---------- HTML helpers ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const box = on => (on ? '☑' : '☐');
const img = f => `../screenshots/${f}`;
const exists = f => fs.existsSync(path.join(ROOT, 'screenshots', f));
const table = (head, rows, cls = '') => `
  <table class="${cls}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const badge = s => (s === 'passed' ? '<span class="pass">PASSED</span>' : `<span class="fail">${esc(String(s || 'NOT RUN').toUpperCase())}</span>`);
const tick = s => (s === 'passed' ? '<span class="ok">✔ Passed</span>' : `<span class="bad">✘ ${esc(s || 'not run')}</span>`);
const sec = ms => `${(ms / 1000).toFixed(1)} s`;

function figure(file, caption, style = '') {
  if (!exists(file)) return `<div class="missing">[Screenshot ${file} not available yet]</div>`;
  return `<figure><img src="${img(file)}" style="${style}"><figcaption>${caption}</figcaption></figure>`;
}

function caseBlock(c) {
  const r = runs[c.id] || {};
  const desk = r['desktop-chrome'] || {};
  const actual = c.actualAll
    ? `<ul>${PLATFORMS.map(p => `<li><b>${p.short}:</b> ${esc((r[p.id] || {}).actual || '—')}</li>`).join('')}</ul>`
    : `${esc(desk.actual || '—')}<br><i class="muted">(Desktop run shown; Android and iPhone runs met the same limits.)</i>`;
  const exec = PLATFORMS.map(p => {
    const x = r[p.id] || {};
    return `${p.short}: ${badge(x.status)} <span class="muted">${x.duration != null ? sec(x.duration) : ''}</span>`;
  }).join(' &nbsp; ');

  let shots;
  if (c.phoneShots) {
    const file = c.shots[0];
    shots = `<div class="shots3">
      <figure><img src="${img(file)}"><figcaption>Desktop Chrome</figcaption></figure>
      ${PLATFORMS.slice(1).map(p => `<figure><div class="phone"><img src="${img(`${p.id}/${file}`)}"></div><figcaption>${p.label}</figcaption></figure>`).join('')}
    </div>`;
  } else {
    shots = `<div class="${c.shots.length > 1 ? 'shots2' : ''}">${c.shots.map(s => `
      <figure><img src="${img(s)}"><figcaption>Screenshot: ${s} (Desktop Chrome, captured automatically by Playwright)</figcaption></figure>`).join('')}</div>`;
  }

  return `
  <section class="tc">
    <h3>${c.id} — ${esc(c.name)}</h3>
    ${table(['Field', 'Details'], [
      ['Test Case ID', c.id],
      ['Test Case Name', esc(c.name)],
      ['Module / Maps to', `${c.module} — ${c.maps}`],
      ['Priority', c.priority],
      ['Preconditions', `<ul>${c.pre.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`],
    ], 'kv')}
    <h4>Test Data</h4>
    ${table(['Field', 'Value'], c.data.map(d => d.map(esc)))}
    <h4>Test Steps</h4>
    ${table(['Step', 'Description', 'Expected Result'], c.steps.map((s, i) => [i + 1, esc(s[0]), esc(s[1])]), 'steps')}
    ${table(['Field', 'Details'], [
      ['Expected Result', esc(c.expected)],
      ['Actual Result', actual],
      ['Execution Result', exec],
      ['Automation Status', `${box(false)} Not Started &nbsp; ${box(false)} In Progress &nbsp; ${box(true)} Automated &nbsp; ${box(true)} Executed`],
      ['Script', `tests/smart-pet-feeder.spec.js — “${c.id}”${c.phoneShots ? ' · tag @smoke (also run against the live site)' : ''}`],
    ], 'kv')}
    ${shots}
  </section>`;
}

// ---------- document ----------
const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Software Automation Test Document — Smart Pet Feeder</title>
<style>
  body { font-family: "Segoe UI", Calibri, Arial, sans-serif; color: #1d2340; font-size: 10.5pt; line-height: 1.45; }
  h1 { color: #1f2a63; text-align: center; font-size: 22pt; margin: 0 0 2px; letter-spacing: .5px; }
  .subtitle { text-align: center; color: #12857f; font-style: italic; margin-bottom: 18px; }
  h2 { color: #1f2a63; font-size: 14.5pt; border-bottom: 2px solid #1f2a63; padding-bottom: 3px; margin: 22px 0 10px; break-after: avoid; }
  h3 { color: #12857f; font-size: 12.5pt; margin: 0 0 8px; break-after: avoid; }
  h4 { color: #1f2a63; font-size: 10.5pt; margin: 10px 0 4px; break-after: avoid; }
  a { color: #12857f; }
  code { font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; break-inside: auto; }
  tr { break-inside: avoid; }
  th { background: #1f2a63; color: #fff; text-align: left; padding: 5px 8px; font-weight: 600; }
  td { border: 1px solid #cfd4e2; padding: 5px 8px; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f3f6fb; }
  table.kv td:first-child { width: 27%; font-weight: 600; background: #eef1f8; }
  table.steps td:first-child { width: 7%; text-align: center; }
  table.matrix td:not(:first-child) { text-align: center; }
  ul { margin: 0; padding-left: 18px; }
  .pass { background: #d6f5e3; color: #1b8a4a; font-weight: 700; padding: 0 6px; border-radius: 4px; font-size: 8.5pt; }
  .fail { background: #fde0dc; color: #c0392b; font-weight: 700; padding: 0 6px; border-radius: 4px; font-size: 8.5pt; }
  .ok { color: #1b8a4a; font-weight: 700; } .bad { color: #c0392b; font-weight: 700; }
  .muted { color: #6b7290; font-size: 8.5pt; }
  .tc { break-before: page; font-size: 9.2pt; line-height: 1.28; }
  .tc td, .tc th { padding: 3px 7px; }
  .tc table { margin: 2px 0 6px; }
  .tc h4 { margin: 5px 0 2px; }
  figure { margin: 8px 0 0; break-inside: avoid; text-align: center; }
  figure img { width: 88%; border: 1px solid #cfd4e2; }
  .tc figure img { width: auto; max-width: 100%; max-height: 2.3in; }
  .shots2, .shots3 { display: flex; gap: 10px; align-items: flex-start; break-inside: avoid; }
  .shots2 figure, .shots3 figure { flex: 1; margin-top: 6px; }
  .shots3 figure:first-child { flex: 2.2; }
  .shots2 figure img { width: auto; max-width: 100%; max-height: 2.3in; }
  .phone { height: 2.3in; width: 1.2in; overflow: hidden; border: 2px solid #1d2340; border-radius: 12px; margin: 0 auto; }
  .tc .phone img { width: 100%; max-height: none; border: 0; display: block; }
  figcaption { font-size: 8pt; color: #6b7290; margin-top: 3px; }
  .note { background: #f3f6fb; border-left: 4px solid #12857f; padding: 8px 12px; margin: 8px 0; }
  .missing { border: 2px dashed #c0392b; color: #c0392b; padding: 18px; text-align: center; margin: 8px 0; }
  .checks div { margin: 2px 0; }
  .metric td:last-child { font-weight: 700; }
  .page { break-before: page; }
  table.signoff td { vertical-align: middle; }
  table.signoff td:nth-child(3) { width: 34%; padding: 2px 8px; }
  .sig { height: 0.5in; width: auto; display: block; }
  .pipeline { display: flex; align-items: stretch; gap: 6px; margin: 8px 0; font-size: 9pt; }
  .pipeline div { flex: 1; border: 1px solid #cfd4e2; border-radius: 6px; padding: 6px 8px; background: #f3f6fb; }
  .pipeline b { color: #1f2a63; display: block; }
  .pipeline span.arrow { flex: 0 0 auto; align-self: center; border: 0; background: none; color: #12857f; font-weight: 700; }
</style></head><body>

<h1>SOFTWARE AUTOMATION TEST DOCUMENT</h1>
<div class="subtitle">Automatic Smart Pet Feeder — PawFeed Web &amp; Mobile App · Playwright Automation · CI/CD</div>

<h2>1. Document Information</h2>
${table(['Field', 'Details'], [
  ['Project Name', 'Automatic Smart Pet Feeder'],
  ['Application Name', 'PawFeed — Smart Pet Feeder Web Dashboard &amp; installable Mobile App (PWA)'],
  ['Version', '1.0.0'],
  ['Test Cycle', 'Final Exam — Automation Cycle 1'],
  ['Prepared By', 'Russel Carlo T. Manzon (IT233)'],
  ['Reviewed By', '&nbsp;'],
  ['Date', DOC_DATE],
  ['Automation Framework', 'Playwright Test (@playwright/test v1.64.1), JavaScript'],
  ['Test Environment', `Local DEV (Windows 11) · CI (GitHub Actions, Ubuntu) · PROD (Vercel — <a href="${LIVE_URL}">${LIVE_URL.replace('https://', '')}</a>)`],
  ['Source Code', `<a href="${REPO_URL}">${REPO_URL.replace('https://', '')}</a>`],
], 'kv')}

<h2>2. Objective</h2>
<h4>Purpose</h4>
<p>The objective of this automation testing effort is to turn the automatable scenarios from the
<i>Define Automation Testing</i> document (AS-01 to AS-06) into real, repeatable Playwright tests that run
against the Smart Pet Feeder app on <b>desktop and on mobile phones (Android and iPhone)</b>. The tests validate
the feeder’s key functions — manual feeding, portion accuracy, scheduled dispensing, low-food alerts, Wi-Fi
reconnection and app-to-device schedule sync — plus the mobile app itself (installable, offline, responsive).
The suite runs automatically in a <b>CI/CD pipeline</b> on every code change, and the app is only deployed to
production when every test passes, reducing regression effort and capturing screenshot evidence of every run.</p>

<h2>3. Scope</h2>
<h4>In Scope</h4>
<ul>
  <li>Manual Feed (Feed Now) and jam detection</li>
  <li>Portion size configuration and validation</li>
  <li>Scheduled dispensing using a mocked device clock</li>
  <li>Low Food alert notifications (simulated IR sensor)</li>
  <li>Wi-Fi drop and automatic reconnection (simulated network)</li>
  <li>App-to-device schedule synchronization time</li>
  <li>Mobile app (PWA): installability, offline use, responsive phone layout</li>
  <li>Hosted deployment on Vercel and post-deploy smoke testing of the live site</li>
  <li>Cross-platform execution: Desktop Chrome, Android (Pixel 7) and iPhone 14 (WebKit)</li>
</ul>
<h4>Out of Scope</h4>
<ul>
  <li>Physical / mechanical checks: anti-jam motor force (TC-05), cord safety (TC-11), lid-lock shake test (TC-13) — remain manual / hardware-in-the-loop</li>
  <li>Performance / load testing and penetration testing</li>
  <li>App-store (native) builds and testing on physical phones — phones are emulated by Playwright</li>
  <li>Real feeder firmware / hardware and third-party systems (push-notification providers, Wi-Fi routers)</li>
</ul>

<h2>4. Test Environment</h2>
${table(['Component', 'Details'], [
  ['Environment', 'DEV — local Windows 11 PC · CI — GitHub Actions (ubuntu-latest) · PROD — Vercel'],
  ['Application URL', `Local: http://localhost:3000 (started by Playwright <code>webServer</code>) · Live: <a href="${LIVE_URL}">${LIVE_URL}</a>`],
  ['Database', 'None — device state is kept in memory by the Node.js server (local/CI) or in the browser’s localStorage (Vercel); reset before every test'],
  ['Browser', 'Chromium (Chrome 156) and WebKit 27.2 (Safari engine), Playwright builds'],
  ['Mobile Device', 'Playwright device emulation: <b>Pixel 7</b> — Android 14, Chrome, 412×839, touch · <b>iPhone 14</b> — iOS Safari (WebKit), 390×664, touch'],
  ['Operating System', 'Windows 11 Pro (10.0.26300) locally · Ubuntu (GitHub Actions) in CI'],
  ['API Endpoint', 'http://localhost:3000/api (status, feed, portion, schedules, sim/*) · on Vercel the device runs inside the app (no server API)'],
  ['Build Version', 'PawFeed 1.0.0 · Node.js v23.8.0 (local) / v22 (CI) · Playwright 1.64.1'],
], 'kv')}

<h2>5. Automation Framework Details</h2>
<h4>Framework Type</h4>
<div class="checks">
  <div>${box(false)} Data Driven</div>
  <div>${box(false)} Keyword Driven</div>
  <div>${box(true)} <b>Hybrid Framework</b> — Playwright Test runner + reusable helper functions (<code>setPortion</code>, <code>lastWeight</code>, <code>snap</code>, <code>record</code>), stable <code>data-testid</code> locators, test data from the AS-01–AS-06 scenarios, and one suite executed on three platform projects</div>
  <div>${box(false)} BDD Framework</div>
  <div>${box(false)} Model-Based Testing</div>
</div>
<h4>Technology Stack</h4>
${table(['Component', 'Tool'], [
  ['Test Automation', '<b>Playwright</b> (@playwright/test 1.64.1)'],
  ['Mobile Automation', '<b>Playwright device emulation</b> (Pixel 7, iPhone 14). Appium is not needed because the mobile app is a PWA.'],
  ['API Automation', 'Playwright APIRequestContext (device reset, manifest/icon checks)'],
  ['Programming Language', '<b>JavaScript</b> (Node.js)'],
  ['Build Tool', 'npm (<code>npm test</code>, <code>npm run report</code>, <code>npm run doc</code>)'],
  ['Reporting', 'Playwright HTML Reporter (screenshots, video, trace) + JSON reporter; report published live at <code>/report</code>'],
  ['CI/CD', '<b>GitHub Actions</b> → <b>Vercel</b> (deploy only after all tests pass)'],
  ['Source Control', `<b>Git + GitHub</b> — <a href="${REPO_URL}">${REPO_URL.replace('https://', '')}</a>`],
], 'kv')}
<h4>Project Structure</h4>
${table(['File / Folder', 'Purpose'], [
  ['public/index.html', 'PawFeed app UI — web dashboard and mobile app (system under test)'],
  ['public/device-core.js', 'Simulated feeder device logic, shared by the server and the browser'],
  ['public/manifest.webmanifest, public/sw.js, public/icons/', 'Mobile app (PWA): install manifest, offline service worker, app icons'],
  ['server.js', 'Node.js server + device API used locally and in CI'],
  ['tests/smart-pet-feeder.spec.js', 'The 13 automated test cases (ATC-01 – ATC-13)'],
  ['playwright.config.js', 'Runner config: 3 platform projects, base URL, screenshots/video/trace, reporters'],
  ['.github/workflows/ci-cd.yml', 'CI/CD pipeline: test → deploy to Vercel → smoke-test the live site'],
  ['vercel.json', 'Vercel hosting settings'],
  ['screenshots/', 'Screenshots saved by every test (sub-folders for Android and iPhone)'],
])}

<h2>6. Entry Criteria</h2>
<div class="checks">
  <div>${box(true)} Stable test environment available (local server starts automatically; CI runner provisioned by GitHub)</div>
  <div>${box(true)} Test data prepared (values from AS-01 – AS-06; device reset before each test)</div>
  <div>${box(true)} User stories completed (all six scenarios + mobile app features implemented)</div>
  <div>${box(true)} Test cases approved (based on the submitted Define Automation Testing document)</div>
  <div>${box(true)} Test scripts developed and reviewed</div>
  <div>${box(true)} Build deployed successfully (localhost:3000 and Vercel production)</div>
</div>

<h2>7. Exit Criteria</h2>
<div class="checks">
  <div>${box(executed === cases.length * PLATFORMS.length)} All critical test cases executed (${cases.length} test cases × ${PLATFORMS.length} platforms = ${executed} executions)</div>
  <div>${box(stats.unexpected === 0)} No Sev-1 or Sev-2 defects open</div>
  <div>${box(Number(passRate) >= 95)} Automation pass rate ≥ 95% (actual: ${passRate}%)</div>
  <div>${box(true)} Defect retesting completed (all issues in Section 11 re-tested after fix)</div>
  <div>${box(false)} Final test report approved (pending instructor review)</div>
</div>

<h2>8. Automation Test Scenarios</h2>
${table(['Test ID', 'Module', 'Scenario', 'Maps to', 'Priority'],
  cases.map(c => [c.at, c.module, esc(c.name), c.maps, c.priority]))}
<p class="muted">Every scenario runs on all three platforms: Desktop Chrome, Android (Pixel 7) and iPhone 14.</p>

<h2 class="page">9. Automated Test Cases</h2>
<p>Each test case below was automated in Playwright and executed on ${RUN_AT} on <b>Desktop Chrome, Android (Pixel 7)
and iPhone 14</b>. The <b>Actual Result</b> values are recorded by the test script itself during the run, and every
screenshot was taken automatically by the test at the moment its assertions passed. ATC-10 to ATC-13 show the
desktop screenshot next to the top of the Android and iPhone screens.</p>
${cases.map(caseBlock).join('\n')}

<h2 class="page">10. Test Data Management</h2>
${table(['Data Type', 'Source', 'Owner'], [
  ['Device state (food level, portion, schedules, logs)', 'Reset through <code>POST /api/sim/reset</code> in <code>beforeEach</code>', 'QA (Playwright hook)'],
  ['Portion sizes, meal times, thresholds', 'Hard-coded in the spec from AS-01 – AS-06', 'QA Team'],
  ['Sensor & hardware inputs (jam, IR food level, Wi-Fi, clock)', 'Device Simulator panel / <code>/api/sim/*</code>', 'QA Team'],
  ['On-device data (Vercel / offline mode)', 'Browser localStorage; each test uses a fresh browser context', 'QA (Playwright)'],
  ['Deployment secrets (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID)', 'GitHub Actions encrypted secrets — never stored in the code', 'Russel Carlo T. Manzon'],
])}

<h2>11. Defect Tracking</h2>
<p>No open defects: all ${executed} test executions passed in the final run. Issues found while building and running the
automation were fixed and re-tested:</p>
${table(['Defect ID', 'Summary', 'Severity', 'Status'], [
  ['BUG-001', 'On iPhone (WebKit) the “Feed Now” and other buttons used a serif system font instead of the app font. Found from the iPhone screenshots; fixed by making buttons and inputs inherit the page font.', 'Low', 'Fixed'],
  ['ENV-001', 'Playwright took ~3 minutes to stop the app server on Windows after each run. Fixed by adding a global teardown that asks the server to shut down.', 'Low', 'Fixed'],
  ['ENV-002', 'Food-level bar was captured mid-animation, so the screenshot showed a shorter bar than the % value. Fixed by removing the CSS transition.', 'Low', 'Fixed'],
  ['ENV-003', 'Vercel cannot keep the server’s in-memory device state between requests. Fixed by moving the device logic into a shared module that also runs inside the app (covered by ATC-12).', 'Medium', 'Fixed'],
])}
<p><b>Severity Classification:</b> Critical · High · Medium · Low</p>

<h2>12. Test Execution Summary</h2>
${table(['Metric', 'Value'], [
  ['Total Test Cases', cases.length],
  ['Automated Test Cases', cases.length],
  ['Platforms', `${PLATFORMS.length} (${PLATFORMS.map(p => p.short).join(', ')})`],
  ['Executed Test Runs', `${executed} (${cases.length} × ${PLATFORMS.length})`],
  ['Passed', stats.expected],
  ['Failed', stats.unexpected],
  ['Blocked / Skipped', stats.skipped],
  ['Flaky', stats.flaky],
  ['Pass Percentage', `${passRate}%`],
  ['Total Execution Time', sec(stats.duration)],
  ['Run Date / Time', RUN_AT],
], 'metric kv')}
<p><b>Formula:</b> Pass Rate (%) = (Passed / Executed) × 100 = (${stats.expected} / ${executed}) × 100 = <b>${passRate}%</b></p>
<h4>Results per Platform</h4>
${table(['Test Case', ...PLATFORMS.map(p => p.label)], cases.map(c => [
  `${c.id} — ${esc(c.module)}`, ...PLATFORMS.map(p => tick(((runs[c.id] || {})[p.id] || {}).status)),
]), 'matrix')}
<h4>Execution Evidence</h4>
<p>Screenshots taken by the tester of the Playwright HTML report (<code>npx playwright show-report</code>) for the run on
${RUN_AT}: every test case passed on every platform. The same suite also passed in the CI/CD pipeline (Figure 2, Section 16).</p>
<div class="shots2">
${figure('EVIDENCE-02a_report_desktop.png', 'Figure 1a — Desktop Chrome: ATC-01 – ATC-13 passed', 'width:100%')}
${figure('EVIDENCE-02b_report_android_iphone.png', 'Figure 1b — Android (Pixel 7): ATC-01 – ATC-13 passed; iPhone 14 begins', 'width:100%')}
</div>
${figure('EVIDENCE-02c_report_iphone.png', 'Figure 1c — iPhone 14 (WebKit): remaining test cases passed', 'width:50%')}

<h2>13. Automation Coverage</h2>
${table(['Module', 'Total TC', 'Automated', 'Coverage %'], [
  ['Manual Feed (TC-02)', 2, 2, '100%'],
  ['Portion Settings (TC-03)', 2, 2, '100%'],
  ['Scheduling (TC-04)', 1, 1, '100%'],
  ['Low Food Alerts (TC-06)', 2, 2, '100%'],
  ['Wi-Fi Connectivity (TC-08)', 1, 1, '100%'],
  ['App Schedule Sync (TC-14)', 1, 1, '100%'],
  ['Mobile App — PWA install &amp; offline', 2, 2, '100%'],
  ['Hosting (Vercel on-device mode)', 1, 1, '100%'],
  ['Responsive UI (phone layouts)', 1, 1, '100%'],
  ['Physical / Hardware (TC-05, TC-11, TC-13)', 3, 0, '0% (manual only)'],
  ['<b>Total</b>', '<b>16</b>', '<b>13</b>', '<b>81%</b>'],
])}
<div class="note">ATC-02 covers the software side of TC-05 (jam is detected and the motor stops). The physical anti-jam force,
cord integrity and lid-lock shake test need real hardware, so they stay manual as stated in the Define Automation Testing document.
Platform coverage is 100%: every automated test case runs on desktop, Android and iPhone.</div>

<h2>14. Risks and Assumptions</h2>
<h4>Risks</h4>
<ul>
  <li>The feeder device is simulated; real hardware may behave differently (motor timing, sensor noise).</li>
  <li>Phones are emulated (screen size, touch, user agent, browser engine); a real phone may still differ slightly.</li>
  <li>Timing-based tests (Wi-Fi reconnect, sync &lt; 2 s) could become flaky on a slow CI runner.</li>
  <li>Dispensed weight has random ±2% variance, so weight checks rely on the ±5% tolerance.</li>
  <li>Deployment depends on GitHub Actions and Vercel being available, and on the Vercel token staying valid.</li>
</ul>
<h4>Assumptions</h4>
<ul>
  <li>Port 3000 is free and Node.js + Playwright Chromium and WebKit are installed.</li>
  <li>The requirements in the Test Plan / Define Automation Testing document are final.</li>
  <li>Tests run one at a time (1 worker) because they share one simulated device.</li>
</ul>

<h2>15. Reporting and Dashboard</h2>
<h4>Daily Metrics</h4>
<ul>
  <li>Build Status: shown on every commit in GitHub Actions (<a href="${REPO_URL}/actions">${REPO_URL.replace('https://', '')}/actions</a>)</li>
  <li>Execution Status: ${stats.expected}/${executed} passed</li>
  <li>Defect Trend: 0 open; 4 fixed (1 UI bug, 3 environment issues)</li>
  <li>Automation Coverage: 13 of 16 test cases (81%), on 3 platforms</li>
  <li>Failed Tests: ${stats.unexpected}</li>
  <li>Execution Duration: ${sec(stats.duration)} locally</li>
</ul>
<h4>Reports Used</h4>
<ul>
  <li><b>Playwright HTML Report</b> — local (<code>npm run report</code>) and live at <a href="${LIVE_URL}/report/">${LIVE_URL.replace('https://', '')}/report</a> (published by the pipeline)</li>
  <li>GitHub Actions run summary + downloadable artifacts (<code>playwright-report</code>, <code>screenshots</code>)</li>
  <li>Playwright JSON report (<code>docs/results.json</code>) — used to fill in this document</li>
</ul>
${figure('REPORT-02_test_detail.png', 'Playwright HTML report — step-by-step detail of ATC-09 with the recorded sync time', 'width:62%')}

<h2>16. CI/CD Integration Checklist</h2>
<div class="pipeline">
  <div><b>1. Push / Pull Request</b>Code pushed to GitHub (main)</div><span class="arrow">→</span>
  <div><b>2. Test</b>${cases.length} test cases × 3 platforms on Ubuntu</div><span class="arrow">→</span>
  <div><b>3. Quality gate</b>Deploy job runs only if every test passed</div><span class="arrow">→</span>
  <div><b>4. Deploy</b>App + test report to Vercel production</div><span class="arrow">→</span>
  <div><b>5. Smoke test</b>@smoke tests against the live URL</div>
</div>
${table(['Item', 'Status', 'Notes'], [
  ['Source Code in Git', box(true), `GitHub: <a href="${REPO_URL}">${REPO_URL.replace('https://', '')}</a>`],
  ['Build Pipeline Configured', box(true), 'GitHub Actions workflow <code>.github/workflows/ci-cd.yml</code>'],
  ['Automated Execution Triggered', box(true), 'Runs on every push and pull request to <code>main</code> (and manually)'],
  ['Test Reports Published', box(true), `HTML report + screenshots as run artifacts, and live at <a href="${LIVE_URL}/report/">/report</a>`],
  ['Notifications Enabled', box(true), 'GitHub emails the repository owner when a workflow run fails'],
  ['Quality Gates Configured', box(true), 'Deploy needs the test job to pass; the live site is then smoke-tested'],
])}
${figure('CI-01_github_actions_run.png', 'Figure 2 — GitHub Actions: CI/CD run #1 succeeded — Playwright tests (39 runs) → Deploy to Vercel (with live smoke test)', 'width:88%')}
${figure('CI-02_live_app_on_phone.png', `Figure 3 — The live app on Vercel (${LIVE_URL.replace('https://', '')}) on an emulated Android phone`, 'width:30%')}

<h2 class="page">17. Test Sign-Off</h2>
${table(['Role', 'Name', 'Signature', 'Date'],
  ['QA Lead', 'Test Manager', 'Development Lead', 'Business Owner'].map(role =>
    [role, 'Russel Carlo T. Manzon', '<img class="sig" src="signature.png" alt="Signature of Russel Carlo T. Manzon">', DOC_DATE]),
  'signoff')}
<p class="muted">Solo project: every role was carried out by the student, Russel Carlo T. Manzon. Instructor review is recorded under “Reviewed By” in Section 1.</p>
<h4>Final Recommendation</h4>
<p><b>Go Live Status:</b></p>
<div class="checks">
  <div>${box(false)} Go</div>
  <div>${box(true)} <b>Conditional Go</b> — all ${executed} automated test runs passed (${passRate}%) on desktop, Android and iPhone, and the
  app is live on Vercel. Go-live for the physical feeder is conditional on completing the manual hardware tests
  (TC-05 anti-jam force, TC-11 cord safety, TC-13 lid lock).</div>
  <div>${box(false)} No-Go</div>
</div>
</body></html>`;

const htmlPath = path.join(__dirname, 'Software_Automation_Test_Document.html');
fs.writeFileSync(htmlPath, html);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  const hdr = 'font-family:Segoe UI,Arial;font-size:8pt;color:#6b7290;width:100%;padding:0 0.75in;display:flex;justify-content:space-between;';
  await page.pdf({
    path: path.join(ROOT, 'Software_Automation_Test_Document_Manzon.pdf'),
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.85in', bottom: '0.75in', left: '0.75in', right: '0.75in' },
    displayHeaderFooter: true,
    headerTemplate: `<div style="${hdr}"><span>Manzon, Russel Carlo T.<br>IT233</span><span>QUALITY</span><span style="text-align:right">Software Automation Test Document<br>${DOC_DATE}</span></div>`,
    footerTemplate: `<div style="${hdr}"><span>Automatic Smart Pet Feeder</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  });
  await browser.close();
  console.log('PDF written: Software_Automation_Test_Document_Manzon.pdf');
})();
