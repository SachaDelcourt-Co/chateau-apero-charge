-- deployment/03_seed_comprehensive_test_data.sql
-- Comprehensive test data seeding for festival simulation

-- Clear existing test data first
DELETE FROM public.bar_order_items WHERE order_id IN (SELECT id FROM public.bar_orders WHERE client_request_id LIKE 'k6-test-%');
DELETE FROM public.bar_orders WHERE client_request_id LIKE 'k6-test-%';
DELETE FROM public.recharges WHERE client_request_id LIKE 'k6-test-%';
DELETE FROM public.app_transaction_log WHERE client_request_id LIKE 'k6-test-%';
DELETE FROM public.idempotency_keys WHERE request_id LIKE 'k6-test-%';
DELETE FROM public.table_cards WHERE id LIKE 'k6-test-%';

-- Insert comprehensive test cards with proper balances
INSERT INTO public.table_cards (id, amount, created_at, updated_at) VALUES
-- High-balance cards for heavy testing
('k6-test-card-001', 100.00, now(), now()),
('k6-test-card-002', 150.00, now(), now()),
('k6-test-card-003', 200.00, now(), now()),
('k6-test-card-004', 250.00, now(), now()),
('k6-test-card-005', 300.00, now(), now()),

-- Medium-balance cards for regular testing
('k6-test-card-006', 75.00, now(), now()),
('k6-test-card-007', 80.00, now(), now()),
('k6-test-card-008', 85.00, now(), now()),
('k6-test-card-009', 90.00, now(), now()),
('k6-test-card-010', 95.00, now(), now()),

-- Low-balance cards for edge case testing
('k6-test-card-011', 5.00, now(), now()),
('k6-test-card-012', 10.00, now(), now()),
('k6-test-card-013', 15.00, now(), now()),
('k6-test-card-014', 20.00, now(), now()),
('k6-test-card-015', 25.00, now(), now()),

-- Zero-balance cards for recharge testing
('k6-test-card-016', 0.00, now(), now()),
('k6-test-card-017', 0.00, now(), now()),
('k6-test-card-018', 0.00, now(), now()),
('k6-test-card-019', 0.00, now(), now()),
('k6-test-card-020', 0.00, now(), now()),

-- Additional cards for concurrent testing (21-50)
('k6-test-card-021', 50.00, now(), now()),
('k6-test-card-022', 55.00, now(), now()),
('k6-test-card-023', 60.00, now(), now()),
('k6-test-card-024', 65.00, now(), now()),
('k6-test-card-025', 70.00, now(), now()),
('k6-test-card-026', 45.00, now(), now()),
('k6-test-card-027', 40.00, now(), now()),
('k6-test-card-028', 35.00, now(), now()),
('k6-test-card-029', 30.00, now(), now()),
('k6-test-card-030', 25.00, now(), now()),
('k6-test-card-031', 120.00, now(), now()),
('k6-test-card-032', 125.00, now(), now()),
('k6-test-card-033', 130.00, now(), now()),
('k6-test-card-034', 135.00, now(), now()),
('k6-test-card-035', 140.00, now(), now()),
('k6-test-card-036', 145.00, now(), now()),
('k6-test-card-037', 110.00, now(), now()),
('k6-test-card-038', 115.00, now(), now()),
('k6-test-card-039', 105.00, now(), now()),
('k6-test-card-040', 100.00, now(), now()),
('k6-test-card-041', 180.00, now(), now()),
('k6-test-card-042', 185.00, now(), now()),
('k6-test-card-043', 190.00, now(), now()),
('k6-test-card-044', 195.00, now(), now()),
('k6-test-card-045', 175.00, now(), now()),
('k6-test-card-046', 170.00, now(), now()),
('k6-test-card-047', 165.00, now(), now()),
('k6-test-card-048', 160.00, now(), now()),
('k6-test-card-049', 155.00, now(), now()),
('k6-test-card-050', 150.00, now(), now())

ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    updated_at = EXCLUDED.updated_at;

-- Insert test products for bar orders
INSERT INTO public.products (id, name, price, category, available, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Beer - Pint', 6.50, 'alcoholic', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440002', 'Wine - Glass', 8.00, 'alcoholic', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440003', 'Cocktail - Mojito', 12.00, 'alcoholic', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440004', 'Soft Drink', 3.50, 'non-alcoholic', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440005', 'Water Bottle', 2.00, 'non-alcoholic', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440006', 'Coffee', 4.00, 'non-alcoholic', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440007', 'Sandwich', 8.50, 'food', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440008', 'Chips', 3.00, 'food', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440009', 'Hot Dog', 7.00, 'food', true, now(), now()),
('550e8400-e29b-41d4-a716-446655440010', 'Burger', 12.50, 'food', true, now(), now())

ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    category = EXCLUDED.category,
    available = EXCLUDED.available,
    updated_at = EXCLUDED.updated_at;

-- Create test staff members
INSERT INTO public.staff (id, name, role, checkpoint_id, active, created_at, updated_at) VALUES
('k6-test-staff-001', 'Test Staff Alice', 'cashier', 'checkpoint-main', true, now(), now()),
('k6-test-staff-002', 'Test Staff Bob', 'cashier', 'checkpoint-vip', true, now(), now()),
('k6-test-staff-003', 'Test Staff Carol', 'supervisor', 'checkpoint-main', true, now(), now()),
('k6-test-staff-004', 'Test Staff Dave', 'cashier', 'checkpoint-entrance', true, now(), now()),
('k6-test-staff-005', 'Test Staff Eve', 'cashier', 'checkpoint-bar', true, now(), now())

ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    checkpoint_id = EXCLUDED.checkpoint_id,
    active = EXCLUDED.active,
    updated_at = EXCLUDED.updated_at;

-- Create test checkpoints
INSERT INTO public.checkpoints (id, name, location, active, created_at, updated_at) VALUES
('checkpoint-main', 'Main Entrance Checkpoint', 'Festival Main Gate', true, now(), now()),
('checkpoint-vip', 'VIP Area Checkpoint', 'VIP Lounge', true, now(), now()),
('checkpoint-entrance', 'Secondary Entrance', 'Side Gate', true, now(), now()),
('checkpoint-bar', 'Bar Area Checkpoint', 'Central Bar', true, now(), now()),
('checkpoint-food', 'Food Court Checkpoint', 'Food Area', true, now(), now())

ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    active = EXCLUDED.active,
    updated_at = EXCLUDED.updated_at;

-- Create test points of sale
INSERT INTO public.points_of_sale (id, name, location, type, active, created_at, updated_at) VALUES
('pos-bar-main', 'Main Bar', 'Central Festival Area', 'bar', true, now(), now()),
('pos-bar-vip', 'VIP Bar', 'VIP Lounge', 'bar', true, now(), now()),
('pos-food-court', 'Food Court', 'Food Area', 'food', true, now(), now()),
('pos-merchandise', 'Merchandise Stand', 'Near Main Stage', 'retail', true, now(), now()),
('pos-bar-stage', 'Stage Bar', 'Near Main Stage', 'bar', true, now(), now())

ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    type = EXCLUDED.type,
    active = EXCLUDED.active,
    updated_at = EXCLUDED.updated_at;

-- Verify test data insertion
DO $$
DECLARE
    card_count INTEGER;
    product_count INTEGER;
    staff_count INTEGER;
    checkpoint_count INTEGER;
    pos_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO card_count FROM public.table_cards WHERE id LIKE 'k6-test-%';
    SELECT COUNT(*) INTO product_count FROM public.products WHERE id::TEXT LIKE '550e8400-e29b-41d4-a716-44665544%';
    SELECT COUNT(*) INTO staff_count FROM public.staff WHERE id LIKE 'k6-test-%';
    SELECT COUNT(*) INTO checkpoint_count FROM public.checkpoints WHERE id LIKE 'checkpoint-%';
    SELECT COUNT(*) INTO pos_count FROM public.points_of_sale WHERE id LIKE 'pos-%';
    
    RAISE NOTICE 'Test data seeding completed:';
    RAISE NOTICE '  - Test cards: %', card_count;
    RAISE NOTICE '  - Test products: %', product_count;
    RAISE NOTICE '  - Test staff: %', staff_count;
    RAISE NOTICE '  - Test checkpoints: %', checkpoint_count;
    RAISE NOTICE '  - Test points of sale: %', pos_count;
    
    IF card_count < 50 THEN
        RAISE EXCEPTION 'Insufficient test cards created. Expected 50, got %', card_count;
    END IF;
    
    IF product_count < 10 THEN
        RAISE EXCEPTION 'Insufficient test products created. Expected 10, got %', product_count;
    END IF;
END $$;

-- Create helper function for test data validation
CREATE OR REPLACE FUNCTION public.validate_test_environment()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    card_count INTEGER;
    product_count INTEGER;
    staff_count INTEGER;
    checkpoint_count INTEGER;
    pos_count INTEGER;
    total_card_balance DECIMAL(10,2);
    procedures_exist BOOLEAN;
BEGIN
    -- Count test data
    SELECT COUNT(*) INTO card_count FROM public.table_cards WHERE id LIKE 'k6-test-%';
    SELECT COUNT(*) INTO product_count FROM public.products WHERE id::TEXT LIKE '550e8400-e29b-41d4-a716-44665544%';
    SELECT COUNT(*) INTO staff_count FROM public.staff WHERE id LIKE 'k6-test-%';
    SELECT COUNT(*) INTO checkpoint_count FROM public.checkpoints WHERE id LIKE 'checkpoint-%';
    SELECT COUNT(*) INTO pos_count FROM public.points_of_sale WHERE id LIKE 'pos-%';
    SELECT COALESCE(SUM(amount), 0) INTO total_card_balance FROM public.table_cards WHERE id LIKE 'k6-test-%';
    
    -- Check if stored procedures exist
    SELECT EXISTS(
        SELECT 1 FROM pg_proc 
        WHERE proname IN ('sp_process_bar_order', 'sp_process_checkpoint_recharge', 'sp_process_stripe_recharge')
    ) INTO procedures_exist;
    
    result := jsonb_build_object(
        'status', 'SUCCESS',
        'test_cards', card_count,
        'test_products', product_count,
        'test_staff', staff_count,
        'test_checkpoints', checkpoint_count,
        'test_points_of_sale', pos_count,
        'total_card_balance', total_card_balance,
        'stored_procedures_exist', procedures_exist,
        'environment_ready', (card_count >= 50 AND product_count >= 10 AND procedures_exist)
    );
    
    RETURN result;
END;
$$;

-- Grant execute permission on validation function
GRANT EXECUTE ON FUNCTION public.validate_test_environment() TO anon, authenticated, service_role;

-- Final validation
SELECT public.validate_test_environment();