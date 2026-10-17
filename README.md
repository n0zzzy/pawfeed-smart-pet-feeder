# PawFeed — Automatic Smart Pet Feeder (Playwright Automation)

QUALITY Final Exam — Russel Carlo T. Manzon, IT233

A web dashboard for the Automatic Smart Pet Feeder with a simulated device, plus
Playwright automation tests based on scenarios AS-01 to AS-06 of the
"Define Automation Testing" document.

## Run the app
```
npm install
npx playwright install chromium
npm start            # open http://localhost:3000
```

## Run the tests
```
npm test             # headless, all 9 tests
npm run test:headed  # watch the browser click through each test
npm run test:ui      # Playwright UI mode (good for screenshots)
npm run report       # open the HTML report (screenshots, videos, traces)
```

Screenshots from every test are saved in `screenshots/`.

## Rebuild the test document (PDF)
```
npm test             # run first, then screenshot the terminal + report into screenshots/EVIDENCE-*.png
npm run doc          # writes Software_Automation_Test_Document_Manzon.pdf from that run
```

## Test cases
| ID | Scenario | Maps to |
|----|----------|---------|
| ATC-01 | Manual feed dispenses one ~10 g portion | AS-01 / TC-02 |
| ATC-02 | Manual feed blocked when chute is jammed (negative) | AS-01 / TC-02 |
| ATC-03 | 5-slot portion dispenses ~50 g and persists | AS-02 / TC-03 |
| ATC-04 | Invalid portion (99 slots) rejected (negative) | AS-02 / TC-03 |
| ATC-05 | Scheduled meal triggers within ±1 minute | AS-03 / TC-04 |
| ATC-06 | Low Food alert at 10% | AS-04 / TC-06 |
| ATC-07 | No alert at 40% (negative) | AS-04 / TC-06 |
| ATC-08 | Wi-Fi auto-reconnect within 60 s, no manual pairing | AS-05 / TC-08 |
| ATC-09 | Schedule change syncs to device in under 2 s | AS-06 / TC-14 |
