# GitHub Actions — two-repository API comparison example

**Captured:** 12 October 2026 (UTC).  
**Source:** Public GitHub REST workflow-run and run-jobs endpoints.  
**Scope:** Three *selected completed runs* per repository; the sets are not full-month data and are **not a synchronized time window**.

This worked example accompanies the [read-only multi-repository CLI](../scripts/github-actions-compare.mjs). It demonstrates why a comparison must include sampling and workload caveats rather than treating raw job durations as billing or efficiency scores.

## Observed runs

These six public runs were selected for inspection after their completion. Links go to the actual GitHub-hosted workflow history. The rows are a dated snapshot, not a prediction of what the current CLI will find when you run it later.

| Repository | Workflow run | Event | Conclusion | Completed jobs | Elapsed job time |
| --- | --- | --- | --- | ---: | ---: |
| Ops-Copilot | [38274099681](https://github.com/senanurcetin/Ops-Copilot/actions/runs/38274099681) | pull_request | success | 1 | 84 seconds |
| Ops-Copilot | [38274014148](https://github.com/senanurcetin/Ops-Copilot/actions/runs/38274014148) | pull_request | failure | 1 | 54 seconds |
| Ops-Copilot | [38273351602](https://github.com/senanurcetin/Ops-Copilot/actions/runs/38273351602) | push | success | 1 | 105 seconds |
| ot-sentinel | [38271078652](https://github.com/senanurcetin/ot-sentinel/actions/runs/38271078652) | push | success | 1 | 89 seconds |
| ot-sentinel | [38271078548](https://github.com/senanurcetin/ot-sentinel/actions/runs/38271078548) | push | success | 3 | 313 seconds |
| ot-sentinel | [38271078540](https://github.com/senanurcetin/ot-sentinel/actions/runs/38271078540) | push | success | 4 | 143 seconds |

For each run, the inspected public `jobs` API returned its complete first page with `total_count` equal to the number of returned jobs (1, 1, 1, 1, 3, 4 respectively). Job time was measured as the sum of `completed_at - started_at` for those jobs.

| Selected sample | Completed workflow runs | Completed jobs | Failed workflow runs | Elapsed job time |
| --- | ---: | ---: | ---: | ---: |
| Ops-Copilot | 3 | 3 | 1 | 243 seconds / 4.1 minutes |
| ot-sentinel | 3 | 8 | 0 | 545 seconds / 9.1 minutes |

**Interpretation:** OT-Sentinel's sample comprises eight jobs over multiple kinds of CI, E2E and security checks, whereas the Ops-Copilot sample contains three single-job CI runs. The larger aggregate job time is therefore **not evidence that OT-Sentinel is less efficient or more expensive**. These runs also cover different periods. Run-time metrics do not model GitHub billing, operating-system multipliers, runner type, reruns, storage or other workload.

## Independently check the public API

GitHub supplies the REST data used for each record:

- [Ops-Copilot workflow runs](https://api.github.com/repos/senanurcetin/Ops-Copilot/actions/runs?per_page=5)
- [OT-Sentinel workflow runs](https://api.github.com/repos/senanurcetin/ot-sentinel/actions/runs?per_page=5)
- [Ops-Copilot run 38274099681 jobs](https://api.github.com/repos/senanurcetin/Ops-Copilot/actions/runs/38274099681/jobs)
- [Ops-Copilot run 38274014148 jobs](https://api.github.com/repos/senanurcetin/Ops-Copilot/actions/runs/38274014148/jobs)
- [Ops-Copilot run 38273351602 jobs](https://api.github.com/repos/senanurcetin/Ops-Copilot/actions/runs/38273351602/jobs)
- [OT-Sentinel run 38271078652 jobs](https://api.github.com/repos/senanurcetin/ot-sentinel/actions/runs/38271078652/jobs)
- [OT-Sentinel run 38271078548 jobs](https://api.github.com/repos/senanurcetin/ot-sentinel/actions/runs/38271078548/jobs)
- [OT-Sentinel run 38271078540 jobs](https://api.github.com/repos/senanurcetin/ot-sentinel/actions/runs/38271078540/jobs)

## Run the current live comparison

From a checkout of this repository with Node.js 20+:

```bash
node scripts/github-actions-compare.mjs \
  senanurcetin/Ops-Copilot senanurcetin/ot-sentinel \
  --since 2026-10-01 --limit 3 --markdown

node --test tests/github-actions-compare.test.mjs
```

These commands make **GET-only** API requests and do not use GitHub Actions runner minutes when executed locally. The CLI picks the latest matching runs at execution time, including runs that are still in progress; its output **will not necessarily equal the curated completed-run table above**.

The CLI rejects API errors instead of reporting partially fetched repositories as successfully compared, caps the number of repositories and run records, and marks samples that might exclude older runs. Public repos generally need no token; private repo access requires a suitably scoped read-only token.

Developer support: **senanur.cetin.work@gmail.com**. This source-backed example demonstrates the GitHub REST API integration; it does **not** imply Developer Program registration or acceptance.
