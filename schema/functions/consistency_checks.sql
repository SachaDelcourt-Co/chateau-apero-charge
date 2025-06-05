-- #############################################################################
-- ## Consistency Check Function: Reconcile Card Balances with Transactions ##
-- #############################################################################

CREATE OR REPLACE FUNCTION check_card_balance_reconciliation(
    p_card_id_filter TEXT DEFAULT NULL,
    p_lookback_days INT DEFAULT NULL
)
RETURNS TABLE (
    card_id TEXT,
    current_db_balance DECIMAL(10, 2),
    calculated_expected_balance DECIMAL(10, 2),
    discrepancy_amount DECIMAL(10, 2)
) AS $$
DECLARE
    r RECORD; -- For iterating through cards
    v_log_start_time TIMESTAMPTZ;
    v_calculated_balance DECIMAL(10, 2);
    v_anchor_balance DECIMAL(10, 2);
    v_sum_transactions DECIMAL(10, 2);
    v_oldest_tx_prev_balance DECIMAL(10, 2);
    v_oldest_tx_timestamp TIMESTAMPTZ;
BEGIN
    IF p_lookback_days IS NOT NULL THEN
        v_log_start_time := NOW() - (p_lookback_days || ' days')::INTERVAL;
    END IF;

    FOR r IN
        SELECT tc.id AS card_id_val, tc.balance, tc.initial_balance, tc.created_at
        FROM public.table_cards tc -- Assuming 'public' schema, adjust if different
        WHERE (p_card_id_filter IS NULL OR tc.id = p_card_id_filter)
    LOOP
        v_calculated_balance := NULL; -- Reset for each card

        IF p_lookback_days IS NULL THEN -- Full history reconciliation
            v_anchor_balance := COALESCE(r.initial_balance, 0.00);

            SELECT COALESCE(SUM(atl.amount_involved), 0.00)
            INTO v_sum_transactions
            FROM public.app_transaction_log atl
            WHERE atl.card_id = r.card_id_val
              AND atl.status = 'COMPLETED';

            v_calculated_balance := v_anchor_balance + v_sum_transactions;
        ELSE -- Lookback period reconciliation
            v_oldest_tx_prev_balance := NULL;
            v_oldest_tx_timestamp := NULL;

            -- Attempt 1: Anchor from oldest 'COMPLETED' transaction in lookback window
            SELECT atl.previous_balance_on_card, atl.transaction_timestamp
            INTO v_oldest_tx_prev_balance, v_oldest_tx_timestamp
            FROM public.app_transaction_log atl
            WHERE atl.card_id = r.card_id_val
              AND atl.status = 'COMPLETED'
              AND atl.transaction_timestamp >= v_log_start_time
            ORDER BY atl.transaction_timestamp ASC
            LIMIT 1;

            IF v_oldest_tx_timestamp IS NOT NULL THEN -- Anchor transaction found
                -- Ensure previous_balance_on_card is not NULL for a reliable anchor
                IF v_oldest_tx_prev_balance IS NULL THEN
                     -- This case indicates a data quality issue or unexpected NULL.
                     -- For now, we might skip or log this. Let's assume it should be present.
                     -- If it can be NULL, COALESCE might be needed, but its meaning changes.
                     -- For this implementation, we rely on it being non-NULL.
                    v_anchor_balance := 0.00; -- Fallback, though ideally this shouldn't happen for an anchor.
                                             -- Or better, treat as v_calculated_balance = NULL
                ELSE
                    v_anchor_balance := v_oldest_tx_prev_balance;
                END IF;
                
                SELECT COALESCE(SUM(atl.amount_involved), 0.00)
                INTO v_sum_transactions
                FROM public.app_transaction_log atl
                WHERE atl.card_id = r.card_id_val
                  AND atl.status = 'COMPLETED'
                  AND atl.transaction_timestamp >= v_oldest_tx_timestamp; -- Sum from this anchor tx onwards

                IF v_oldest_tx_prev_balance IS NOT NULL THEN -- Only calculate if anchor was valid
                    v_calculated_balance := v_anchor_balance + v_sum_transactions;
                END IF;

            ELSE -- No 'COMPLETED' anchor transaction in lookback window
                 -- Attempt 2: If card created within lookback window, use initial_balance
                IF r.created_at >= v_log_start_time THEN
                    v_anchor_balance := COALESCE(r.initial_balance, 0.00);
                    SELECT COALESCE(SUM(atl.amount_involved), 0.00)
                    INTO v_sum_transactions
                    FROM public.app_transaction_log atl
                    WHERE atl.card_id = r.card_id_val
                      AND atl.status = 'COMPLETED'
                      AND atl.transaction_timestamp >= r.created_at; -- Sum all transactions since creation

                    v_calculated_balance := v_anchor_balance + v_sum_transactions;
                END IF;
                -- If neither condition met (e.g. old card, no recent tx), v_calculated_balance remains NULL
            END IF;
        END IF;

        IF v_calculated_balance IS NOT NULL AND r.balance <> v_calculated_balance THEN
            -- Populate output table variables for RETURN NEXT
            card_id := r.card_id_val;
            current_db_balance := r.balance;
            calculated_expected_balance := v_calculated_balance;
            discrepancy_amount := r.balance - v_calculated_balance;
            RETURN NEXT;
        END IF;
    END LOOP;
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER; -- SECURITY DEFINER if needed for Supabase scheduled functions accessing tables

-- #############################################################################
-- ## Consistency Check Function: Check Bar Order Totals Mismatch           ##
-- #############################################################################

CREATE OR REPLACE FUNCTION check_bar_order_total_mismatch()
RETURNS TABLE (
    order_id BIGINT,
    recorded_total_amount DECIMAL(10, 2),
    calculated_items_total DECIMAL(10, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.order_id_val,
        s.recorded_total_amount_val,
        s.calculated_items_total_val
    FROM (
        SELECT
            bo.id AS order_id_val,
            bo.total_amount AS recorded_total_amount_val,
            COALESCE(SUM(boi.price_at_purchase * boi.quantity), 0.00) AS calculated_items_total_val
        FROM public.bar_orders bo
        LEFT JOIN public.bar_order_items boi ON bo.id = boi.bar_order_id
        GROUP BY bo.id, bo.total_amount -- Group by primary key of bar_orders
    ) s
    WHERE s.recorded_total_amount_val <> s.calculated_items_total_val;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER; -- SECURITY DEFINER if needed

----------------------------------------------------------------------------------------------------
-- DOCUMENTATION AND TEST OUTLINES (Provided as comments here, to be extracted)
----------------------------------------------------------------------------------------------------

/*
## Documentation and Test Outlines for Database Consistency Check Functions

### Function 1: `check_card_balance_reconciliation`

**1. Purpose:**
   Verifies the integrity of card balances in the `table_cards` table by reconciling them against transaction history in `app_transaction_log`. It helps identify cards where the recorded balance does not match the balance calculated from an initial anchor point plus subsequent completed transactions.

**2. Parameters:**
   - `p_card_id_filter TEXT DEFAULT NULL`: Optional. If provided, the check is performed only for the specified card ID. If NULL, all cards are checked.
   - `p_lookback_days INT DEFAULT NULL`: Optional.
     - If NULL (default), performs a full history reconciliation for each card, starting from `table_cards.initial_balance` and summing all 'COMPLETED' transactions.
     - If an integer value is provided (e.g., 30), reconciliation is performed for recent activity within that number of days. The anchor point is the `previous_balance_on_card` from the oldest 'COMPLETED' transaction within the lookback period. If no such transaction exists but the card was created within the lookback period, `initial_balance` is used as the anchor.

**3. Logic Overview:**
   - The function iterates through each card (or the filtered card).
   - **Full History Mode (`p_lookback_days` IS NULL):**
     - Anchor Balance: `COALESCE(table_cards.initial_balance, 0)`.
     - Sum Transactions: Sum of `amount_involved` for all 'COMPLETED' transactions for the card.
     - Expected Balance: `Anchor Balance + Sum Transactions`.
   - **Lookback Mode (`p_lookback_days` IS NOT NULL):**
     - Determines a `log_start_time` (NOW() - `p_lookback_days`).
     - **Anchor Attempt 1 (Oldest Transaction in Window):**
       - Finds the oldest 'COMPLETED' transaction for the card with `transaction_timestamp >= log_start_time`.
       - If found, Anchor Balance is `transaction.previous_balance_on_card`. Sum Transactions includes `amount_involved` from this anchor transaction onwards.
     - **Anchor Attempt 2 (Initial Balance for Recent Cards):**
       - If no such transaction is found AND `table_cards.created_at >= log_start_time`.
       - Anchor Balance is `COALESCE(table_cards.initial_balance, 0)`. Sum Transactions includes `amount_involved` for all 'COMPLETED' transactions since card creation.
     - If no suitable anchor can be determined for lookback mode, the card is skipped for that mode (no discrepancy reported).
   - Compares `table_cards.balance` with the calculated expected balance.

**4. Return Structure:**
   Returns a SETOF records for cards with discrepancies:
   - `card_id TEXT`: The ID of the card with a balance discrepancy.
   - `current_db_balance DECIMAL(10, 2)`: The current balance stored in `table_cards.balance`.
   - `calculated_expected_balance DECIMAL(10, 2)`: The balance calculated based on transactions.
   - `discrepancy_amount DECIMAL(10, 2)`: The difference (`current_db_balance - calculated_expected_balance`).

**5. Example Call:**
   - Check all cards, full history: `SELECT * FROM check_card_balance_reconciliation();`
   - Check a specific card, full history: `SELECT * FROM check_card_balance_reconciliation(p_card_id_filter => 'card_xyz');`
   - Check all cards, 30-day lookback: `SELECT * FROM check_card_balance_reconciliation(p_lookback_days => 30);`
   - Check specific card, 7-day lookback: `SELECT * FROM check_card_balance_reconciliation(p_card_id_filter => 'card_abc', p_lookback_days => 7);`

**6. Assumptions:**
   - `table_cards` exists with columns: `id (TEXT)`, `balance (DECIMAL)`, `initial_balance (DECIMAL)`, `created_at (TIMESTAMPTZ)`.
   - `app_transaction_log` exists with columns: `card_id (TEXT)`, `amount_involved (DECIMAL)`, `status (TEXT)` (with 'COMPLETED' as a key status), `transaction_timestamp (TIMESTAMPTZ)`, `previous_balance_on_card (DECIMAL)`.
   - `previous_balance_on_card` in `app_transaction_log` accurately reflects the card's balance *before* the effect of the current transaction and is non-NULL for 'COMPLETED' transactions used as anchors.
   - Balances and amounts are stored as `DECIMAL(10, 2)`.
   - `NOW()` gives the current timestamp in the database's timezone.

**7. Unit Test Cases Outline for `check_card_balance_reconciliation`:**

   **Setup:**
   - `table_cards` (tc)
   - `app_transaction_log` (atl)

   **Test Case 1: Card matches, full history**
     - tc: `id='card1', balance=150, initial_balance=100, created_at='...'`
     - atl:
       - `card_id='card1', amount_involved=50, status='COMPLETED', transaction_timestamp='...'`
       - `card_id='card1', amount_involved=20, status='PENDING', transaction_timestamp='...'`
     - Expected: No record returned for 'card1'.

   **Test Case 2: Card mismatch, full history**
     - tc: `id='card2', balance=130, initial_balance=50, created_at='...'`
     - atl:
       - `card_id='card2', amount_involved=100, status='COMPLETED', transaction_timestamp='...'`
     - Expected: Record for 'card2', `current_db_balance=130`, `calculated_expected_balance=150`, `discrepancy=-20`.

   **Test Case 3: Card matches, lookback_days, anchor from transaction**
     - tc: `id='card3', balance=200, initial_balance=0, created_at='NOW() - 60 days'`
     - atl:
       - `card_id='card3', amount_involved=100, status='COMPLETED', transaction_timestamp='NOW() - 40 days', previous_balance_on_card=0`
       - `card_id='card3', amount_involved=50, status='COMPLETED', transaction_timestamp='NOW() - 20 days', previous_balance_on_card=100` (This is the anchor tx for 30-day lookback)
       - `card_id='card3', amount_involved=50, status='COMPLETED', transaction_timestamp='NOW() - 10 days', previous_balance_on_card=150`
     - Call: `check_card_balance_reconciliation(p_lookback_days => 30)`
     - Expected: No record for 'card3'. (Anchor is tx at -20 days, prev_bal=100. Sum since then = 50. Expected = 100 + 50 = 150. Wait, current balance is 200. This should be a mismatch.
       Let's re-evaluate Test Case 3:
       Anchor tx at `NOW() - 20 days`, `previous_balance_on_card=100`.
       Transactions from this point: `amount_involved=50` (at -20 days), `amount_involved=50` (at -10 days). Total sum = 100.
       Calculated = `100 (anchor_prev_bal) + 50 (tx1) + 50 (tx2) = 200`. Matches `balance=200`.
       Expected: No record for 'card3'. This is correct.

   **Test Case 4: Card mismatch, lookback_days, anchor from transaction**
     - tc: `id='card4', balance=180, initial_balance=0, created_at='NOW() - 60 days'`
     - atl: (Same as card3)
       - `card_id='card4', amount_involved=100, status='COMPLETED', transaction_timestamp='NOW() - 40 days', previous_balance_on_card=0`
       - `card_id='card4', amount_involved=50, status='COMPLETED', transaction_timestamp='NOW() - 20 days', previous_balance_on_card=100`
       - `card_id='card4', amount_involved=50, status='COMPLETED', transaction_timestamp='NOW() - 10 days', previous_balance_on_card=150`
     - Call: `check_card_balance_reconciliation(p_lookback_days => 30)`
     - Expected: Record for 'card4', `current_db_balance=180`, `calculated_expected_balance=200`, `discrepancy=-20`.

   **Test Case 5: Card matches, lookback_days, anchor from initial_balance (card created in window)**
     - tc: `id='card5', balance=75, initial_balance=25, created_at='NOW() - 15 days'`
     - atl:
       - `card_id='card5', amount_involved=50, status='COMPLETED', transaction_timestamp='NOW() - 10 days'`
       - (No transactions older than `created_at` or before lookback window start if card is very new)
     - Call: `check_card_balance_reconciliation(p_lookback_days => 30)`
     - Expected: No record for 'card5'. (Anchor is `initial_balance=25`. Sum since creation = 50. Expected = 25 + 50 = 75).

   **Test Case 6: Card mismatch, lookback_days, anchor from initial_balance**
     - tc: `id='card6', balance=70, initial_balance=25, created_at='NOW() - 15 days'`
     - atl:
       - `card_id='card6', amount_involved=50, status='COMPLETED', transaction_timestamp='NOW() - 10 days'`
     - Call: `check_card_balance_reconciliation(p_lookback_days => 30)`
     - Expected: Record for 'card6', `current_db_balance=70`, `calculated_expected_balance=75`, `discrepancy=-5`.

   **Test Case 7: Card with no transactions, full history**
     - tc: `id='card7', balance=10, initial_balance=10, created_at='...'`
     - atl: (No transactions for 'card7')
     - Expected: No record for 'card7'.

   **Test Case 8: Card with no transactions, mismatch initial_balance, full history**
     - tc: `id='card8', balance=15, initial_balance=10, created_at='...'`
     - atl: (No transactions for 'card8')
     - Expected: Record for 'card8', `current_db_balance=15`, `calculated_expected_balance=10`, `discrepancy=5`.

   **Test Case 9: Old card, no transactions in lookback window (skipped for lookback)**
     - tc: `id='card9', balance=100, initial_balance=0, created_at='NOW() - 100 days'`
     - atl:
       - `card_id='card9', amount_involved=100, status='COMPLETED', transaction_timestamp='NOW() - 90 days', previous_balance_on_card=0`
     - Call: `check_card_balance_reconciliation(p_lookback_days => 30)`
     - Expected: No record for 'card9' (as `v_calculated_balance` would be NULL).

   **Test Case 10: `p_card_id_filter` usage**
     - Populate multiple cards, some with discrepancies, some without.
     - Call with `p_card_id_filter` for a card with discrepancy. Expected: Only that card's discrepancy.
     - Call with `p_card_id_filter` for a card without discrepancy. Expected: No records.

### Function 2: `check_bar_order_total_mismatch`

**1. Purpose:**
   Verifies that the `total_amount` recorded in each `bar_orders` record correctly matches the sum of `price_at_purchase * quantity` for all associated items in `bar_order_items`.

**2. Parameters:**
   None.

**3. Logic Overview:**
   - For each order in `bar_orders`:
     - It calculates the sum of (`price_at_purchase * quantity`) for all its items in `bar_order_items`. If an order has no items, this sum is considered 0.
     - It compares this calculated sum with the `bar_orders.total_amount`.
   - Returns records for any orders where these two values do not match.

**4. Return Structure:**
   Returns a SETOF records for orders with mismatched totals:
   - `order_id BIGINT`: The ID of the bar order.
   - `recorded_total_amount DECIMAL(10, 2)`: The `total_amount` stored in the `bar_orders` table.
   - `calculated_items_total DECIMAL(10, 2)`: The sum of (`price_at_purchase * quantity`) from `bar_order_items`.

**5. Example Call:**
   `SELECT * FROM check_bar_order_total_mismatch();`

**6. Assumptions:**
   - `bar_orders` table exists with columns: `id (BIGINT)`, `total_amount (DECIMAL(10, 2))`.
   - `bar_order_items` table exists with columns: `bar_order_id (BIGINT)`, `price_at_purchase (DECIMAL(10, 2))`, `quantity (INT)`.
   - Amounts are stored as `DECIMAL(10, 2)`.

**7. Unit Test Cases Outline for `check_bar_order_total_mismatch`:**

   **Setup:**
   - `bar_orders` (bo)
   - `bar_order_items` (boi)

   **Test Case 1: Order total matches sum of items**
     - bo: `id=1, total_amount=25.00`
     - boi:
       - `bar_order_id=1, price_at_purchase=10.00, quantity=1`
       - `bar_order_id=1, price_at_purchase=7.50, quantity=2`
     - Calculated items total: `10.00*1 + 7.50*2 = 10.00 + 15.00 = 25.00`.
     - Expected: No record returned for order 1.

   **Test Case 2: Order total does NOT match sum of items**
     - bo: `id=2, total_amount=30.00`
     - boi:
       - `bar_order_id=2, price_at_purchase=12.00, quantity=1`
       - `bar_order_id=2, price_at_purchase=8.00, quantity=2`
     - Calculated items total: `12.00*1 + 8.00*2 = 12.00 + 16.00 = 28.00`.
     - Expected: Record for order 2, `recorded_total_amount=30.00`, `calculated_items_total=28.00`.

   **Test Case 3: Order with no items, total_amount is 0.00**
     - bo: `id=3, total_amount=0.00`
     - boi: (No items for order 3)
     - Calculated items total: `0.00`.
     - Expected: No record returned for order 3.

   **Test Case 4: Order with no items, total_amount is NOT 0.00 (mismatch)**
     - bo: `id=4, total_amount=10.00`
     - boi: (No items for order 4)
     - Calculated items total: `0.00`.
     - Expected: Record for order 4, `recorded_total_amount=10.00`, `calculated_items_total=0.00`.

   **Test Case 5: Multiple orders, some match, some don't**
     - Order 1 (matches), Order 2 (mismatches), Order 3 (no items, matches 0.00), Order 4 (no items, mismatches non-zero).
     - Expected: Records only for Order 2 and Order 4.

*/