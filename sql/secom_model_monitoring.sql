-- Assumed warehouse tables:
-- manufacturing.review_queue_decisions(lot_id, reviewed_at, was_flagged)
-- manufacturing.lot_outcomes(lot_id, final_failure_label)
-- manufacturing.lot_inference_scores(lot_id, scored_at, risk_score, model_version)

WITH labeled_reviews AS (
  SELECT
    DATE_TRUNC('week', decisions.reviewed_at) AS review_week,
    scores.model_version,
    decisions.was_flagged,
    outcomes.final_failure_label
  FROM manufacturing.review_queue_decisions AS decisions
  INNER JOIN manufacturing.lot_outcomes AS outcomes
    ON outcomes.lot_id = decisions.lot_id
  INNER JOIN manufacturing.lot_inference_scores AS scores
    ON scores.lot_id = decisions.lot_id
  WHERE scores.model_version = 'secom-logreg-v1'
)
SELECT
  review_week,
  model_version,
  AVG(CASE WHEN was_flagged THEN 1.0 ELSE 0.0 END) AS review_budget_share,
  AVG(CASE WHEN was_flagged AND final_failure_label = 1 THEN 1.0 ELSE 0.0 END)
    / NULLIF(AVG(CASE WHEN was_flagged THEN 1.0 ELSE 0.0 END), 0) AS flagged_precision,
  AVG(CASE WHEN final_failure_label = 1 THEN 1.0 ELSE 0.0 END) AS base_failure_rate,
  AVG(CASE WHEN was_flagged AND final_failure_label = 1 THEN 1.0 ELSE 0.0 END)
    / NULLIF(AVG(CASE WHEN final_failure_label = 1 THEN 1.0 ELSE 0.0 END), 0) AS failure_capture_rate
FROM labeled_reviews
GROUP BY 1, 2
ORDER BY 1 DESC;
