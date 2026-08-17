ALTER TABLE "ContentPackage" ADD COLUMN "currentStock" INTEGER NOT NULL DEFAULT 0;

-- Existing ContentPackage rows only had the remaining-stock value. Preserve
-- that value as the safest current-stock fallback until the next full sync.
UPDATE "ContentPackage"
SET "currentStock" = "stockLeft";
