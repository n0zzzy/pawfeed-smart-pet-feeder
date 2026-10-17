// Builds the Allure report from allure-results/ into allure-report/.
// Retries a few times because on Windows a fresh file can be briefly locked (e.g. by antivirus),
// which makes Allure's final folder rename fail with EPERM.  Run: npm run allure
const { execSync } = require('child_process');
const fs = require('fs');

const cmd = 'npx allure generate allure-results -o allure-report --name "PawFeed Test Report"';

for (let attempt = 1; attempt <= 3; attempt++) {
  fs.rmSync('allure-report', { recursive: true, force: true });
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch { /* checked below */ }
  if (fs.existsSync('allure-report/index.html') && fs.existsSync('allure-report/data')) {
    console.log('Allure report written to allure-report/index.html');
    process.exit(0);
  }
  console.log(`Allure report not complete (attempt ${attempt}), retrying...`);
}
console.error('Could not generate the Allure report.');
process.exit(1);
