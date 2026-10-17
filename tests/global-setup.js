// Start every run with an empty Allure results folder.
// (The test database is not deleted here: the web server already has it open.
//  Each test resets the device data through POST /api/sim/reset instead.)
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  fs.rmSync(path.join(__dirname, '..', 'allure-results'), { recursive: true, force: true });
};
