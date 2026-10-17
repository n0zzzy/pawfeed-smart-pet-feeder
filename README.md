# PawFeed — Automatic Smart Pet Feeder (Playwright Automation)

[![CI/CD](https://github.com/n0zzzy/pawfeed-smart-pet-feeder/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/n0zzzy/pawfeed-smart-pet-feeder/actions/workflows/ci-cd.yml)

QUALITY Final Exam — Russel Carlo T. Manzon, IT233

A web dashboard and installable mobile app (PWA) for the Automatic Smart Pet Feeder, with a
simulated feeder device and Playwright automation tests based on scenarios AS-01 to AS-06 of the
"Define Automation Testing" document.

- **Live app:** https://pawfeed-smart-pet-feeder.vercel.app
- **Live test report:** https://pawfeed-smart-pet-feeder.vercel.app/report/
- **Test document:** [Software_Automation_Test_Document_Manzon.pdf](Software_Automation_Test_Document_Manzon.pdf)

## Install the mobile app
Open the live app on your phone, then:
- **Android (Chrome):** ⋮ menu → *Install app* / *Add to Home screen*
- **iPhone (Safari):** Share → *Add to Home Screen*

It opens full-screen with its own icon and still works offline.

## Run locally
```
npm install
npx playwright install chromium webkit
npm start            # open http://localhost:3000
```

## Run the tests
```
npm test             # 13 test cases on Desktop Chrome, Android (Pixel 7) and iPhone 14 = 39 runs
npm run test:headed  # watch the browser click through each test
npm run test:ui      # Playwright UI mode
npm run report       # open the HTML report (screenshots, videos, traces)
```

Screenshots from every test are saved in `screenshots/` (`android-pixel7/` and `iphone-14/` for the phone runs).

## CI/CD
`.github/workflows/ci-cd.yml` runs on every push and pull request:
1. **Test** — the full suite on all three platforms.
2. **Deploy** — only on `main` and only if every test passed, deploy to Vercel (with the HTML report at `/report`).
3. **Smoke test** — run the `@smoke` tests against the live site.

## Rebuild the test document (PDF)
```
npm test             # run first, then screenshot the HTML report into screenshots/EVIDENCE-*.png
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
| ATC-10 | Mobile app is installable (manifest, icons, service worker) | Mobile app |
| ATC-11 | App opens and feeds while offline | Mobile app |
| ATC-12 | Hosted app works without a server API (Vercel) | Deployment |
| ATC-13 | Layout fits phone screens, Feed button tappable | Mobile app |
