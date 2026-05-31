-- Assumed warehouse tables:
-- manufacturing.lot_inference_scores(lot_id, scored_at, risk_score, model_version)
-- manufacturing.lot_metadata(lot_id, line_name, product_family, shift_name)

WITH ranked_lots AS (
  SELECT
    scores.lot_id,
    metadata.line_name,
    metadata.product_family,
    metadata.shift_name,
    scores.scored_at,
    scores.risk_score,
    PERCENT_RANK() OVER (ORDER BY scores.risk_score DESC) AS risk_percentile
  FROM manufacturing.lot_inference_scores AS scores
  LEFT JOIN manufacturing.lot_metadata AS metadata
    ON metadata.lot_id = scores.lot_id
  WHERE scores.model_version = 'secom-logreg-v1'
    AND scores.scored_at >= CURRENT_DATE - INTERVAL '1 day'
)
SELECT
  lot_id,
  line_name,
  product_family,
  shift_name,
  scored_at,
  risk_score,
  risk_percentile
FROM ranked_lots
WHERE risk_percentile <= 0.10
ORDER BY risk_score DESC;
