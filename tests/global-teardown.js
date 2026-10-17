// Ask the feeder server to exit on its own after the run; killing it from Playwright on Windows can hang for minutes.
module.exports = async () => {
  try {
    await fetch('http://localhost:3000/api/sim/shutdown', { method: 'POST' });
  } catch {
    // server already stopped
  }
};
