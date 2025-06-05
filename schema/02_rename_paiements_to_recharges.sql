-- Rename the paiements table to recharges for semantic clarity
ALTER TABLE public.paiements RENAME TO recharges;

-- Add new columns to track payment method more explicitly
ALTER TABLE public.recharges ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';
ALTER TABLE public.recharges ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);
ALTER TABLE public.recharges ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(100);
ALTER TABLE public.recharges ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update existing records to set the payment method based on paid_by_card flag
UPDATE public.recharges 
SET payment_method = CASE 
    WHEN paid_by_card = TRUE THEN 'card'
    ELSE 'cash'
  END;

-- Create index for faster lookups by card_id (renamed from id_card)
ALTER TABLE public.recharges RENAME COLUMN id_card TO card_id;
CREATE INDEX IF NOT EXISTS idx_recharges_card_id ON public.recharges(card_id);

-- Create index for created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_recharges_created_at ON public.recharges(created_at);

-- Add comments to document the table
COMMENT ON TABLE public.recharges IS 'Records of all card recharges, whether paid by cash, card or Stripe';
COMMENT ON COLUMN public.recharges.payment_method IS 'Method of payment: cash, card, stripe';
COMMENT ON COLUMN public.recharges.transaction_id IS 'Internal transaction ID for reference';
COMMENT ON COLUMN public.recharges.stripe_session_id IS 'Stripe session ID for online payments';
COMMENT ON COLUMN public.recharges.notes IS 'Additional notes about the recharge'; 