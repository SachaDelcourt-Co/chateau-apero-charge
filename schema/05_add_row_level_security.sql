-- Enable Row Level Security on critical tables
ALTER TABLE public.table_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_order_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies to limit access based on roles
-- Allow full access to table_cards for users with admin role
CREATE POLICY admin_table_cards_policy ON public.table_cards
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin'::text);

-- Allow read access to table_cards for bar and recharge roles
CREATE POLICY view_table_cards_policy ON public.table_cards
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('bar', 'recharge')::text[]);

-- Allow bar role to view and create bar orders
CREATE POLICY bar_orders_for_bar_role ON public.bar_orders
  FOR ALL  
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'bar')::text[]);

-- Allow recharge role and admin to manage recharges
CREATE POLICY recharges_for_recharge_role ON public.recharges
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'recharge')::text[]);

-- Allow bar role to create and view order items
CREATE POLICY bar_items_for_bar_role ON public.bar_order_items
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'bar')::text[]);

-- Create anon policies for necessary public access
CREATE POLICY anon_card_view ON public.table_cards
  FOR SELECT
  TO anon
  USING (true);

-- Add comments about security
COMMENT ON TABLE public.table_cards IS 'Core table for card records with RLS policies applied';
COMMENT ON TABLE public.recharges IS 'Records of all card recharges with RLS policies applied';
COMMENT ON TABLE public.bar_orders IS 'Bar order records with RLS policies applied';
COMMENT ON TABLE public.bar_order_items IS 'Items in bar orders with RLS policies applied'; 