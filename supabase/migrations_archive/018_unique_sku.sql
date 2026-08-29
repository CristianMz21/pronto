-- Prevent duplicate SKUs within the same business.
-- NULLs and empty strings are excluded so optional SKU fields stay flexible.
-- Partial unique constraints require CREATE UNIQUE INDEX (not ALTER TABLE ADD CONSTRAINT).
CREATE UNIQUE INDEX unique_sku_per_business
  ON inventory_items (business_id, sku)
  WHERE sku IS NOT NULL AND sku != '';
