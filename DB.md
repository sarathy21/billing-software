# Database Changes

## Recent Updates
1. **Raw Material Transactions:** Renamed the `purchase_place` column to `product_details` to reflect new product detail mapping in the frontend.
2. **Purchase Rates (Products Table implicitly / `purchase_rates` context):** Added `agent_commission` logic/storage support.
3. Updated schema definition in `database/db.js` accordingly.

The `billing.db` schema has been adjusted to handle these new client requirements safely. Automatic backup configuration is available in `main.js` to run on intervals.
