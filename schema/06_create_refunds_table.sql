-- Create the refunds table
CREATE TABLE IF NOT EXISTS public.refunds (
  id SERIAL PRIMARY KEY,
  id_card VARCHAR(255),
  "first name" VARCHAR(255),
  "last name" VARCHAR(255),
  email VARCHAR(255),
  account VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE public.refunds IS 'Table for storing refund requests from users';
COMMENT ON COLUMN public.refunds.id IS 'Auto-incrementing primary key';
COMMENT ON COLUMN public.refunds.id_card IS 'Card ID for which refund is requested';
COMMENT ON COLUMN public.refunds."first name" IS 'First name of the person requesting refund';
COMMENT ON COLUMN public.refunds."last name" IS 'Last name of the person requesting refund';
COMMENT ON COLUMN public.refunds.email IS 'Email address for refund communication';
COMMENT ON COLUMN public.refunds.account IS 'IBAN account number for refund transfer';
COMMENT ON COLUMN public.refunds.created_at IS 'Timestamp when refund request was created';

-- Create index for faster lookups by card ID
CREATE INDEX IF NOT EXISTS idx_refunds_id_card ON public.refunds(id_card);

-- Create index for created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON public.refunds(created_at);

-- Enable Row Level Security (if needed)
-- ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- Note: Add RLS policies if you need them for security
-- For now, we'll leave it open for testing 