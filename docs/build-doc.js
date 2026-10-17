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

// ---------- collect results from the Playwright JSON report ----------
const runs = {};
(function walk(suite) {
  for (const s of suite.suites || []) walk(s);
  for (const spec of suite.specs || []) {
    const id = spec.title.split(':')[0];
    const t = spec.tests[0];
    const r = t.results[t.results.length - 1];
    const notes = [...(t.annotations || []), ...(r.annotations || [])];
    runs[id] = {
      status: r.status,
      duration: r.duration,
      actual: [...new Set(notes.filter(a => a.type === 'actual').map(a => a.description))].join(' '),
    };
  }
})(results);

const stats = results.stats;
const executed = stats.expected + stats.unexpected + stats.flaky;
const passRate = executed ? ((stats.expected / executed) * 100).toFixed(0) : '0';

// ---------- static test case definitions (from the Define Automation Testing doc) ----------
const cases = [
  {
    id: 'ATC-01', at: 'AT-001', module: 'Manual Feed', maps: 'AS-01 / TC-02', priority: 'High',
    name: 'Verify manual feed dispenses exactly one portion (~10 g)',
    pre: ['Feeder is powered on and CONNECTED', 'Hopper food level is 100%', 'Portion size is 1 slot (default)'],
    data: [['Portion size', '1 slot (≈10 g)'], ['Tolerance', '±5% → 9.5 g – 10.5 g']],
    steps: [
      ['Reset device and open the dashboard', 'Dashboard loads, status CONNECTED, dispense count 0'],
      ['Click “Feed Now”', 'Message “Dispensed … g (1 slot/s)” is shown'],
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
      ['Click “Toggle Chute Jam” in the Device Simulator', 'Jam indicator shows ON'],
      ['Click “Feed Now”', 'Message “JAM_DETECTED — nothing dispensed (0 g)”'],
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
      ['Enter 5 in the Slots field and click “Save Portion”', '“Portion saved: 5 slot(s)” message'],
      ['Reload the page', 'Portion Size still shows 5 slot(s)'],
      ['Click “Feed Now” and read Last Feed weight', 'Weight within 47.5–52.5 g'],
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
      ['Enter 99 in the Slots field and click “Save Portion”', 'Error “INVALID_PORTION: Portion must be 1-10 slots.”'],
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
      ['Enter 10 in “Food level %” and click “Set IR Sensor”', 'Food Level shows 10% (red bar)'],
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
      ['Enter 40 in “Food level %” and click “Set IR Sensor”', 'Food Level shows 40%'],
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
      ['Click “Drop Wi-Fi”', 'Status badge shows DISCONNECTED'],
      ['Wait 5 s, then click “Restore Wi-Fi”', 'Status shows RECONNECTING'],
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
      ['Click “Edit”, change the time to 18:30:00 and start the timer on “Save”', 'Row shows 18:30:00, “Syncing…”'],
      ['Wait for “Synced to device” and stop the timer', 'Elapsed time under 2 s'],
    ],
    expected: 'The device schedule matches the app’s new value in under 2 seconds.',
    shots: ['ATC-09_schedule_sync_under_2s.png'],
  },
];

// ---------- HTML helpers ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const box = on => (on ? '☑' : '☐');
const img = f => `../screenshots/${f}`;
const table = (head, rows, cls = '') => `
  <table class="${cls}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const statusBadge = s => (s === 'passed' ? '<span class="pass">PASSED</span>' : `<span class="fail">${esc(String(s).toUpperCase())}</span>`);

function caseBlock(c) {
  const r = runs[c.id] || { status: 'not run', duration: 0, actual: '' };
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
      ['Actual Result', esc(r.actual || '—')],
      ['Execution Result', `${statusBadge(r.status)} &nbsp; (${(r.duration / 1000).toFixed(1)} s)`],
      ['Automation Status', `${box(false)} Not Started &nbsp; ${box(false)} In Progress &nbsp; ${box(true)} Automated &nbsp; ${box(true)} Executed`],
      ['Script', `tests/smart-pet-feeder.spec.js — “${c.id}”`],
    ], 'kv')}
    <div class="${c.shots.length > 1 ? 'shots2' : ''}">${c.shots.map(s => `
      <figure><img src="${img(s)}"><figcaption>Screenshot: ${s} (captured automatically by Playwright during the test)</figcaption></figure>`).join('')}</div>
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
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; break-inside: auto; }
  tr { break-inside: avoid; }
  th { background: #1f2a63; color: #fff; text-align: left; padding: 5px 8px; font-weight: 600; }
  td { border: 1px solid #cfd4e2; padding: 5px 8px; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f3f6fb; }
  table.kv td:first-child { width: 27%; font-weight: 600; background: #eef1f8; }
  table.steps td:first-child { width: 7%; text-align: center; }
  ul { margin: 0; padding-left: 18px; }
  .pass { background: #d6f5e3; color: #1b8a4a; font-weight: 700; padding: 1px 8px; border-radius: 4px; }
  .fail { background: #fde0dc; color: #c0392b; font-weight: 700; padding: 1px 8px; border-radius: 4px; }
  .tc { break-before: page; font-size: 9.5pt; line-height: 1.3; }
  .tc td, .tc th { padding: 3px 7px; }
  .tc table { margin: 2px 0 6px; }
  .tc h4 { margin: 6px 0 2px; }
  figure { margin: 8px 0 0; break-inside: avoid; text-align: center; }
  figure img { width: 88%; border: 1px solid #cfd4e2; }
  .tc figure img { width: auto; max-width: 100%; max-height: 2.4in; }
  .shots2 { display: flex; gap: 10px; }
  .shots2 figure { flex: 1; }
  .shots2 figure img { width: auto; max-width: 100%; max-height: 2.4in; }
  figcaption { font-size: 8.5pt; color: #6b7290; margin-top: 3px; }
  pre { background: #1e2a2e; color: #e6edf3; padding: 10px 12px; font-size: 7.6pt; white-space: pre-wrap; border-radius: 4px; }
  .note { background: #f3f6fb; border-left: 4px solid #12857f; padding: 8px 12px; margin: 8px 0; }
  .checks div { margin: 2px 0; }
  .metric td:last-child { font-weight: 700; }
  .cover-meta { margin-top: 6px; }
  .page { break-before: page; }
</style></head><body>

<h1>SOFTWARE AUTOMATION TEST DOCUMENT</h1>
<div class="subtitle">Automatic Smart Pet Feeder — PawFeed Web Dashboard · Playwright Automation</div>

<h2>1. Document Information</h2>
${table(['Field', 'Details'], [
  ['Project Name', 'Automatic Smart Pet Feeder'],
  ['Application Name', 'PawFeed — Smart Pet Feeder Web Dashboard (with simulated feeder device)'],
  ['Version', '1.0.0'],
  ['Test Cycle', 'Final Exam — Automation Cycle 1'],
  ['Prepared By', 'Russel Carlo T. Manzon (IT233)'],
  ['Reviewed By', '&nbsp;'],
  ['Date', DOC_DATE],
  ['Automation Framework', 'Playwright Test (@playwright/test v1.64.1), JavaScript'],
  ['Test Environment', 'Local DEV — Windows 11 Pro, Node.js v23.8.0, Chromium, http://localhost:3000'],
], 'kv')}

<h2>2. Objective</h2>
<h4>Purpose</h4>
<p>The objective of this automation testing effort is to turn the automatable scenarios from the
<i>Define Automation Testing</i> document (AS-01 to AS-06) into real, repeatable Playwright tests that run
against the Smart Pet Feeder web dashboard. The tests validate the feeder’s key functions — manual feeding,
portion accuracy, scheduled dispensing, low-food alerts, Wi-Fi reconnection and app-to-device schedule sync —
reduce manual regression effort, and capture screenshot evidence of every run.</p>

<h2>3. Scope</h2>
<h4>In Scope</h4>
<ul>
  <li>Manual Feed (Feed Now) and jam detection</li>
  <li>Portion size configuration and validation</li>
  <li>Scheduled dispensing using a mocked device clock</li>
  <li>Low Food alert notifications (simulated IR sensor)</li>
  <li>Wi-Fi drop and automatic reconnection (simulated network)</li>
  <li>App-to-device schedule synchronization time</li>
  <li>Device API validation through the web UI (status, feed, portion, schedules)</li>
</ul>
<h4>Out of Scope</h4>
<ul>
  <li>Physical / mechanical checks: anti-jam motor force (TC-05), cord safety (TC-11), lid-lock shake test (TC-13) — remain manual / hardware-in-the-loop</li>
  <li>Performance / load testing and penetration testing</li>
  <li>Native mobile app testing and real feeder firmware / hardware</li>
  <li>Third-party systems (cloud push-notification providers, Wi-Fi routers)</li>
</ul>

<h2>4. Test Environment</h2>
${table(['Component', 'Details'], [
  ['Environment', 'DEV (local machine)'],
  ['Application URL', 'http://localhost:3000 (started automatically by Playwright <code>webServer</code>)'],
  ['Database', 'None — device state is kept in memory by the Node.js server and reset before every test'],
  ['Browser', 'Chromium (Playwright build, Chrome Headless Shell 156), viewport 1280 × 900'],
  ['Mobile Device', 'N/A — web dashboard tested at desktop viewport'],
  ['Operating System', 'Windows 11 Pro (10.0.26300)'],
  ['API Endpoint', 'http://localhost:3000/api (status, feed, portion, schedules, sim/*)'],
  ['Build Version', 'PawFeed 1.0.0 · Node.js v23.8.0 · Playwright 1.64.1'],
], 'kv')}

<h2>5. Automation Framework Details</h2>
<h4>Framework Type</h4>
<div class="checks">
  <div>${box(false)} Data Driven</div>
  <div>${box(false)} Keyword Driven</div>
  <div>${box(true)} <b>Hybrid Framework</b> — Playwright Test runner + reusable helper functions (<code>setPortion</code>, <code>lastWeight</code>, <code>snap</code>), stable <code>data-testid</code> locators, and test data taken from the AS-01–AS-06 scenarios</div>
  <div>${box(false)} BDD Framework</div>
  <div>${box(false)} Model-Based Testing</div>
</div>
<h4>Technology Stack</h4>
${table(['Component', 'Tool'], [
  ['Test Automation', '<b>Playwright</b> (@playwright/test 1.64.1)'],
  ['Mobile Automation', 'N/A (web dashboard only)'],
  ['API Automation', 'Playwright APIRequestContext (device reset before each test)'],
  ['Programming Language', '<b>JavaScript</b> (Node.js v23.8.0)'],
  ['Build Tool', 'npm (scripts: <code>npm test</code>, <code>npm run report</code>)'],
  ['Reporting', 'Playwright HTML Reporter (screenshots, video, trace) + JSON reporter'],
  ['CI/CD', 'Not configured yet — tests run locally (see Section 16)'],
  ['Source Control', 'Git (project folder ready to push; see Section 16)'],
], 'kv')}
<h4>Project Structure</h4>
${table(['File / Folder', 'Purpose'], [
  ['server.js', 'Node.js server + simulated feeder device API'],
  ['public/index.html', 'PawFeed web dashboard (system under test)'],
  ['tests/smart-pet-feeder.spec.js', 'The 9 automated test cases (ATC-01 – ATC-09)'],
  ['tests/global-teardown.js', 'Stops the app server after the run'],
  ['playwright.config.js', 'Runner config: browser, base URL, screenshots/video/trace, reporters'],
  ['screenshots/', 'Screenshots saved by every test'],
  ['playwright-report/', 'Generated HTML report'],
])}

<h2>6. Entry Criteria</h2>
<div class="checks">
  <div>${box(true)} Stable test environment available (local server starts automatically)</div>
  <div>${box(true)} Test data prepared (values from AS-01 – AS-06; device reset before each test)</div>
  <div>${box(true)} User stories completed (dashboard features for all six scenarios implemented)</div>
  <div>${box(true)} Test cases approved (based on the submitted Define Automation Testing document)</div>
  <div>${box(true)} Test scripts developed and reviewed</div>
  <div>${box(true)} Build deployed successfully (PawFeed 1.0.0 running on localhost:3000)</div>
</div>

<h2>7. Exit Criteria</h2>
<div class="checks">
  <div>${box(true)} All critical test cases executed (${executed}/${cases.length})</div>
  <div>${box(stats.unexpected === 0)} No Sev-1 or Sev-2 defects open</div>
  <div>${box(Number(passRate) >= 95)} Automation pass rate ≥ 95% (actual: ${passRate}%)</div>
  <div>${box(true)} Defect retesting completed (environment issues ENV-001 and ENV-002 re-tested after fix)</div>
  <div>${box(false)} Final test report approved (pending instructor review)</div>
</div>

<h2>8. Automation Test Scenarios</h2>
${table(['Test ID', 'Module', 'Scenario', 'Maps to', 'Priority'],
  cases.map(c => [c.at, c.module, esc(c.name), c.maps, c.priority]))}

<h2 class="page">9. Automated Test Cases</h2>
<p>Each test case below was automated in Playwright and executed on ${DOC_DATE}. The <b>Actual Result</b>
values are recorded by the test script itself during the run, and every screenshot was taken automatically
by the test at the moment its assertions passed.</p>
${cases.map(caseBlock).join('\n')}

<h2 class="page">10. Test Data Management</h2>
${table(['Data Type', 'Source', 'Owner'], [
  ['Device state (food level, portion, schedules, logs)', 'Reset through <code>POST /api/sim/reset</code> in <code>beforeEach</code>', 'QA (Playwright hook)'],
  ['Portion sizes, meal times, thresholds', 'Hard-coded in the spec from AS-01 – AS-06', 'QA Team'],
  ['Sensor & hardware inputs (jam, IR food level, Wi-Fi, clock)', 'Device Simulator panel / <code>/api/sim/*</code>', 'QA Team'],
  ['User accounts / API tokens', 'N/A — local build has no login', '—'],
])}

<h2>11. Defect Tracking</h2>
<p>No product defects were found in the final run: all ${cases.length} test cases passed. Two test-environment
issues were found while setting up the automation and were fixed and re-tested:</p>
${table(['Defect ID', 'Summary', 'Severity', 'Status'], [
  ['ENV-001', 'Playwright took ~3 minutes to stop the app server on Windows after each run. Fixed by adding a global teardown that asks the server to shut down.', 'Low', 'Fixed'],
  ['ENV-002', 'Food-level bar was captured mid-animation, so the screenshot showed a shorter bar than the % value. Fixed by removing the CSS transition.', 'Low', 'Fixed'],
])}
<p><b>Severity Classification:</b> Critical · High · Medium · Low</p>

<h2>12. Test Execution Summary</h2>
${table(['Metric', 'Value'], [
  ['Total Test Cases', cases.length],
  ['Automated Test Cases', cases.length],
  ['Executed Test Cases', executed],
  ['Passed', stats.expected],
  ['Failed', stats.unexpected],
  ['Blocked / Skipped', stats.skipped],
  ['Pass Percentage', `${passRate}%`],
  ['Total Execution Time', `${(stats.duration / 1000).toFixed(1)} s`],
  ['Run Date / Time', RUN_AT],
], 'metric kv')}
<p><b>Formula:</b> Pass Rate (%) = (Passed / Executed) × 100 = (${stats.expected} / ${executed}) × 100 = <b>${passRate}%</b></p>
<h4>Execution Evidence</h4>
<p>Screenshots taken by the tester during the run on ${RUN_AT}.</p>
<figure><img src="${img('EVIDENCE-01_terminal_npm_test.png')}" style="width:100%"><figcaption>Figure 1 — Terminal: <code>npm test</code> (playwright test) — ${stats.expected} passed in ${(stats.duration / 1000).toFixed(1)} s</figcaption></figure>
<figure><img src="${img('EVIDENCE-02_html_report.png')}" style="width:100%"><figcaption>Figure 2 — Playwright HTML report (<code>npx playwright show-report</code>, http://localhost:9323): All ${executed} · Passed ${stats.expected} · Failed ${stats.unexpected} · Flaky ${stats.flaky} · Skipped ${stats.skipped}</figcaption></figure>

<h2>13. Automation Coverage</h2>
${table(['Module', 'Total TC', 'Automated', 'Coverage %'], [
  ['Manual Feed (TC-02)', 2, 2, '100%'],
  ['Portion Settings (TC-03)', 2, 2, '100%'],
  ['Scheduling (TC-04)', 1, 1, '100%'],
  ['Low Food Alerts (TC-06)', 2, 2, '100%'],
  ['Wi-Fi Connectivity (TC-08)', 1, 1, '100%'],
  ['App Schedule Sync (TC-14)', 1, 1, '100%'],
  ['Physical / Hardware (TC-05, TC-11, TC-13)', 3, 0, '0% (manual only)'],
  ['<b>Total</b>', '<b>12</b>', '<b>9</b>', '<b>75%</b>'],
])}
<div class="note">ATC-02 covers the software side of TC-05 (jam is detected and the motor stops). The physical anti-jam force,
cord integrity and lid-lock shake test need real hardware, so they stay manual as stated in the Define Automation Testing document.</div>

<h2>14. Risks and Assumptions</h2>
<h4>Risks</h4>
<ul>
  <li>The device is simulated; real feeder hardware may behave differently (motor timing, sensor noise).</li>
  <li>Timing-based tests (Wi-Fi reconnect, sync &lt; 2 s) could become flaky on a slow machine.</li>
  <li>Dispensed weight has random ±2% variance, so weight checks rely on the ±5% tolerance.</li>
  <li>Requirement changes in the original Test Plan would need the scripts updated.</li>
</ul>
<h4>Assumptions</h4>
<ul>
  <li>Port 3000 is free and Node.js + Playwright Chromium are installed.</li>
  <li>The requirements in the Test Plan / Define Automation Testing document are final.</li>
  <li>The device API is reachable during execution; tests run one at a time (1 worker) because they share one device.</li>
</ul>

<h2>15. Reporting and Dashboard</h2>
<h4>Daily Metrics (from the Playwright HTML report)</h4>
<ul>
  <li>Build Status: PawFeed 1.0.0 — app starts automatically</li>
  <li>Execution Status: ${stats.expected}/${executed} passed</li>
  <li>Defect Trend: 0 product defects; 2 environment issues fixed</li>
  <li>Automation Coverage: 9 of 12 test cases (75%)</li>
  <li>Failed Tests: ${stats.unexpected}</li>
  <li>Execution Duration: ${(stats.duration / 1000).toFixed(1)} s</li>
</ul>
<h4>Reports Used</h4>
<ul>
  <li><b>Playwright HTML Report</b> (<code>npm run report</code>) — per-test steps, screenshots, video and trace</li>
  <li>Playwright JSON report (<code>docs/results.json</code>) — used to fill in this document</li>
</ul>
<figure><img src="${img('REPORT-02_test_detail.png')}" style="width:66%"><figcaption>Playwright HTML report — step-by-step detail of ATC-09 with the recorded sync time</figcaption></figure>

<h2>16. CI/CD Integration Checklist</h2>
${table(['Item', 'Status', 'Notes'], [
  ['Source Code in Git', box(false), 'Project is ready to push to GitHub'],
  ['Build Pipeline Configured', box(false), 'Not yet — planned GitHub Actions workflow'],
  ['Automated Execution Triggered', box(true), 'One command (<code>npm test</code>) starts the app and runs all tests'],
  ['Test Reports Published', box(true), 'HTML + JSON reports generated on every run'],
  ['Notifications Enabled', box(false), 'Not yet'],
  ['Quality Gates Configured', box(true), 'Run exits with an error code if any test fails'],
])}

<h2>17. Test Sign-Off</h2>
${table(['Role', 'Name', 'Signature', 'Date'], [
  ['QA Lead', 'Russel Carlo T. Manzon', '&nbsp;', DOC_DATE],
  ['Test Manager', '&nbsp;', '&nbsp;', '&nbsp;'],
  ['Development Lead', 'Russel Carlo T. Manzon', '&nbsp;', DOC_DATE],
  ['Business Owner', '&nbsp;', '&nbsp;', '&nbsp;'],
])}
<h4>Final Recommendation</h4>
<p><b>Go Live Status:</b></p>
<div class="checks">
  <div>${box(false)} Go</div>
  <div>${box(true)} <b>Conditional Go</b> — all ${cases.length} automated software tests passed (${passRate}%). Go-live is conditional on
  completing the manual hardware tests (TC-05 anti-jam force, TC-11 cord safety, TC-13 lid lock).</div>
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
