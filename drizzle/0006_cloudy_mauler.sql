ALTER TABLE "food_catalog" ADD COLUMN "search_alias" text;--> statement-breakpoint
ALTER TABLE "food_catalog" ADD COLUMN "search_folded" text GENERATED ALWAYS AS (replace(replace(replace(replace(lower("name_de"), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')) STORED;--> statement-breakpoint
ALTER TABLE "food_catalog" ADD COLUMN "search_squashed" text GENERATED ALWAYS AS (regexp_replace(replace(replace(replace(replace(lower("name_de"), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), '[^a-z0-9]', '', 'g')) STORED;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "search_folded" text GENERATED ALWAYS AS (replace(replace(replace(replace(lower(("name" || ' ' || coalesce("brand", ''))), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')) STORED;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "search_squashed" text GENERATED ALWAYS AS (regexp_replace(replace(replace(replace(replace(lower(("name" || ' ' || coalesce("brand", ''))), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), '[^a-z0-9]', '', 'g')) STORED;--> statement-breakpoint
CREATE INDEX "food_catalog_search_folded_idx" ON "food_catalog" USING btree ("search_folded");--> statement-breakpoint
CREATE INDEX "food_catalog_search_squashed_idx" ON "food_catalog" USING btree ("search_squashed");--> statement-breakpoint
CREATE INDEX "food_search_folded_idx" ON "food" USING btree ("search_folded");--> statement-breakpoint
CREATE INDEX "food_search_squashed_idx" ON "food" USING btree ("search_squashed");