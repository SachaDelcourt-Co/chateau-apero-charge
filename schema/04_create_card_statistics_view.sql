-- Create a view that calculates real-time statistics for each card
CREATE OR REPLACE VIEW public.card_statistics AS
SELECT
  c.id AS card_id,
  c.amount AS current_balance,
  c.description,
  COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN r.amount ELSE 0 END), 0) AS total_recharged,
  COALESCE(COUNT(DISTINCT r.id), 0) AS recharge_count,
  COALESCE(MAX(r.created_at), NULL) AS last_recharge_date,
  COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN b.total_amount ELSE 0 END), 0) AS total_spent,
  COALESCE(COUNT(DISTINCT b.id), 0) AS order_count,
  COALESCE(MAX(b.created_at), NULL) AS last_order_date
FROM
  public.table_cards c
LEFT JOIN
  public.recharges r ON c.id = r.card_id
LEFT JOIN
  public.bar_orders b ON c.id = b.card_id
GROUP BY
  c.id, c.amount, c.description;

-- Add an index to the base tables for faster view calculation
CREATE INDEX IF NOT EXISTS idx_bar_orders_card_id ON public.bar_orders(card_id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_created_at ON public.bar_orders(created_at);

-- Add comments explaining the view
COMMENT ON VIEW public.card_statistics IS 'Real-time calculated statistics for each card, aggregating data from transactions and recharges';
COMMENT ON COLUMN public.card_statistics.card_id IS 'Card identifier';
COMMENT ON COLUMN public.card_statistics.current_balance IS 'Current card balance in EUR';
COMMENT ON COLUMN public.card_statistics.total_recharged IS 'Total amount recharged to this card';
COMMENT ON COLUMN public.card_statistics.recharge_count IS 'Number of recharge transactions';
COMMENT ON COLUMN public.card_statistics.last_recharge_date IS 'Date of the last recharge';
COMMENT ON COLUMN public.card_statistics.total_spent IS 'Total amount spent from this card';
COMMENT ON COLUMN public.card_statistics.order_count IS 'Number of bar orders placed';
COMMENT ON COLUMN public.card_statistics.last_order_date IS 'Date of the last order'; 