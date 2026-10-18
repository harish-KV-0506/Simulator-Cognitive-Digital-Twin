# Cognitive Digital Twin: web edition

An interactive, fully client-side Cognitive Digital Twin for MSME business decision intelligence.
No server, no build step: static files that run on GitHub Pages.

## Deploy on GitHub Pages
1. Create a new repository (for example `cognitive-digital-twin`).
2. Upload everything in this folder to the repository root (`index.html`, `style.css`, `js/`, `.nojekyll`).
3. Settings > Pages > Build and deployment > Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`. Save.
4. After a minute your site is live at `https://<your-username>.github.io/<repo-name>/`.

Open `index.html` directly in a browser to try it locally. It needs internet for Google Fonts only.

## What is inside
- `js/engine.js`  data ingestion and cleaning, twin calibration, Random Forest + seasonal regression forecasting,
  knowledge graph and impact reasoning, Monte Carlo simulation, Q-learning
- `js/app.js`     boot pipeline, live twin stream, router and shell
- `js/views.js`, `js/views2.js`  dashboard, data, live twin, cognitive analysis, simulation, decision lab, reports
- `js/charts.js`  canvas charts   `js/bg.js`  animated background   `js/landing.js`  landing page

## Using your own data
Data integration > Upload a CSV with columns `date, product, units, price` (optional `stock, satisfaction`).
About 30+ weeks of history works best. Unit cost is assumed to be 68% of price unless you adapt `ingestCSV`.

## Notes
- The sample dataset is synthetic. The numbers in the app are computed live from the loaded data.
- The "Reported results" section on the landing page quotes the research paper.
- The research implementation uses an LSTM, Neo4j, Flask and Power BI. This web edition re-implements the same
  framework in JavaScript, so it uses a Random Forest and seasonal regression instead of an LSTM.
