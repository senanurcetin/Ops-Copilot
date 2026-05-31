# Ops-Copilot Industrial Data Science Case Study

## Objective

Turn Ops-Copilot from a retrieval demo into a data science portfolio project that demonstrates how industrial process data can be translated into operational decisions.

## Business framing

The case study asks a practical manufacturing question:

**If a factory can only manually review a small subset of wafer lots, which lots should be prioritized first?**

That framing matters more than a generic classification score. In plants, review capacity is constrained by engineers, time, and shift load. A useful model therefore needs to rank lots by risk, not just emit a raw probability.

## Dataset

- **Source:** UCI Machine Learning Repository
- **Dataset:** SECOM
- **Rows:** 1,567 wafer lots
- **Raw sensor features:** 590
- **Label:** binary pass/fail outcome
- **Time span:** July 2008 to October 2008

## Modeling approach

- Sort rows chronologically.
- Hold out the most recent 20 percent as the evaluation slice.
- Drop features above 60 percent missingness.
- Median-impute the remaining sensor columns.
- Benchmark three levels of modeling complexity:
  - naive prior baseline
  - class-weighted logistic regression
  - random forest benchmark
- Evaluate both threshold-free discrimination and review-budget scenarios.

## Current offline results

- **Chronological holdout:** latest 314 lots
- **Holdout failure count:** 17
- **ROC-AUC:** 0.766
- **PR-AUC:** 0.175
- **Top 10 percent review queue:** 32 lots, 5 failures captured
- **Top 10 percent precision:** 15.6 percent
- **Top 10 percent recall:** 29.4 percent
- **Top 10 percent lift vs random review:** 2.89x

These numbers are intentionally framed around queue quality, not only a classifier threshold. That makes the result easier to explain to operations and manufacturing stakeholders.

## Benchmark comparison

- **Naive baseline:** ROC-AUC 0.500, PR-AUC 0.054
- **Published logistic regression:** ROC-AUC 0.766, PR-AUC 0.175
- **Random forest benchmark:** ROC-AUC 0.520, PR-AUC 0.069

The published portfolio model remains logistic regression because it keeps coefficient-level interpretability for stakeholder review while also outperforming the tested tree-based benchmark on the chronological holdout.

## Why this is portfolio-relevant

This version of the project now shows:

- data cleaning under heavy missingness
- imbalanced classification handling
- leakage-aware evaluation logic
- operational metric design
- SQL thinking for monitoring and business reporting
- productization via a public case-study page and the existing application shell

## Operational metric design

Instead of judging the model only at a fixed 0.50 threshold, the project evaluates review-budget slices such as:

- top 5 percent of lots
- top 10 percent of lots
- top 20 percent of lots

This maps directly to plant staffing reality and turns the model into a queue-prioritization system.

## Repo surfaces

- `analysis/run_secom_case_study.py`: reproducible pipeline
- `docs/hiring-summary.md`: short recruiter-facing explanation
- `src/data/secom-case-study/*`: generated artifacts used by the app
- `src/app/case-study/page.tsx`: public case-study route
- `sql/*.sql`: monitoring and business-analysis queries

## Limitations

- Sensor names are anonymized, so feature interpretation is limited.
- This is still an offline benchmark, not a deployed model service.
- The product shell can explain results, but it does not yet score live plant telemetry.
