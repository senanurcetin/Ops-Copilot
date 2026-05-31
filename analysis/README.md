# SECOM Case Study Pipeline

This folder turns Ops-Copilot into an industrial data science case study using the UCI SECOM manufacturing dataset.

## What it produces

- `src/data/secom-case-study/summary.json`
- `src/data/secom-case-study/benchmark-comparison.json`
- `src/data/secom-case-study/feature-importance.json`
- `src/data/secom-case-study/risk-deciles.json`
- `src/data/secom-case-study/daily-trend.json`

These artifacts power the public `/case-study` page and document the offline modeling workflow used for the portfolio narrative.

## Dataset choice

- **Dataset:** SECOM (UCI Machine Learning Repository)
- **Task:** predict wafer-lot failures from inline sensor measurements
- **Why it fits:** industrial process data, strong class imbalance, missing values, and a realistic need to rank limited engineering review capacity

## Rebuild the artifacts

```bash
python -m pip install -r analysis/requirements.txt
python analysis/run_secom_case_study.py
```

## Modeling notes

- Rows are ordered chronologically and evaluated on the latest 20 percent of lots.
- Features with more than 60 percent missingness are removed.
- Remaining values are median-imputed.
- Three benchmark layers are compared: naive prior baseline, class-weighted logistic regression, and random forest.
- The published portfolio model remains class-weighted logistic regression because it preserves coefficient-level explanation while staying strongest on the chronological holdout.
- The operating policy is review-budget driven: rank lots by failure risk instead of forcing a naive 0.50 threshold.
