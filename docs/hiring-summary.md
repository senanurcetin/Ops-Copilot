# Ops-Copilot Hiring Summary

## One-line positioning

Ops-Copilot is an industrial AI assistant that combines document-grounded operator support with a measured manufacturing failure-risk case study.

## What problem it solves

Factory teams lose time when troubleshooting knowledge lives across scattered manuals, tribal memory, and maintenance notes. Ops-Copilot centralizes that knowledge in an authenticated assistant and pairs it with a SECOM-based ranking workflow for prioritizing limited engineering review capacity.

## What was built

- A Next.js and Firebase product shell for operator-facing troubleshooting.
- Per-user manual retrieval with persistent chat and checklist logging.
- A public industrial data science layer built on the UCI SECOM dataset.
- SQL monitoring surfaces and case-study artifacts that make the modeling work recruiter-readable.

## Why the case study matters

The project does not stop at “an ML model was trained.” It reframes the task as a queue-prioritization problem:

- limited engineering review capacity
- imbalanced manufacturing outcomes
- chronological evaluation on future lots
- review-budget metrics instead of generic accuracy claims

## Published model choice

- **Naive baseline:** establishes the class-prior floor
- **Class-weighted logistic regression:** published portfolio model
- **Random forest benchmark:** tested as a higher-capacity non-linear alternative

The logistic model remains published because it balances stronger ranking performance with coefficient-level interpretability that is easier to defend in an industrial setting.

## Current measurable result

- **ROC-AUC:** 0.7659
- **PR-AUC:** 0.1745
- **Top 10% review-budget recall:** 29.4%
- **Top 10% failure-yield lift vs random review:** 2.89x

## What this proves

- Industrial problem framing, not only model training
- Applied ML evaluation under class imbalance
- Productization of model outputs into an operator-facing workflow
- Secure, testable implementation quality rather than notebook-only work

## Honest limitations

- Retrieval is lexical today, not embedding-based.
- The SECOM layer is an offline portfolio case study, not a live plant-scoring service.
- The product shell demonstrates workflow integration, not multi-tenant SaaS maturity.

## Best use in applications

Use Ops-Copilot as the first project for:

- Applied Data Scientist
- Industrial AI Engineer
- Manufacturing Analytics
- AI Product Engineer
