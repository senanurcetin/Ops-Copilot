-- Assumed warehouse tables:
-- manufacturing.lot_inference_scores(lot_id, scored_at, risk_score, model_version)
-- manufacturing.lot_outcomes(lot_id, final_failure_label)

WITH ranked_lots AS (
  SELECT
    scores.lot_id,
    scores.scored_at,
    outcomes.final_failure_label,
    scores.risk_score,
    NTILE(10) OVER (ORDER BY scores.risk_score DESC) AS risk_decile
  FROM manufacturing.lot_inference_scores AS scores
  INNER JOIN manufacturing.lot_outcomes AS outcomes
    ON outcomes.lot_id = scores.lot_id
  WHERE scores.model_version = 'secom-logreg-v1'
),
decile_metrics AS (
  SELECT
    risk_decile,
    COUNT(*) AS lots,
    SUM(CASE WHEN final_failure_label = 1 THEN 1 ELSE 0 END) AS failures,
    AVG(CASE WHEN final_failure_label = 1 THEN 1.0 ELSE 0.0 END) AS fail_rate
  FROM ranked_lots
  GROUP BY 1
),
baseline AS (
  SELECT AVG(CASE WHEN final_failure_label = 1 THEN 1.0 ELSE 0.0 END) AS base_fail_rate
  FROM ranked_lots
)
SELECT
  metrics.risk_decile,
  metrics.lots,
  metrics.failures,
  metrics.fail_rate,
  metrics.fail_rate / NULLIF(baseline.base_fail_rate, 0) AS lift_vs_random_review
FROM decile_metrics AS metrics
CROSS JOIN baseline
ORDER BY metrics.risk_decile;
