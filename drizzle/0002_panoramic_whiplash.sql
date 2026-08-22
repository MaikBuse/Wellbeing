-- Makes the food library global.
--
-- Foods were per-user. `user_id` becomes `created_by_user_id` (provenance only,
-- never a filter) and the two uniqueness rules stop being per-account. That
-- last part needs the data merged first: with two accounts, "Haferflocken" may
-- exist twice, and a global unique index would simply refuse to be created.
--
-- Same shape as 0001: collapse the data, then tighten the constraint.
ALTER TABLE "food" RENAME COLUMN "user_id" TO "created_by_user_id";--> statement-breakpoint
ALTER TABLE "food" DROP CONSTRAINT "food_user_id_app_user_id_fk";
--> statement-breakpoint
DROP INDEX "food_user_name_uq";--> statement-breakpoint
DROP INDEX "food_user_barcode_uq";--> statement-breakpoint
DROP INDEX "food_picker_idx";--> statement-breakpoint
DROP INDEX "food_name_lower_idx";--> statement-breakpoint
ALTER TABLE "food" ADD CONSTRAINT "food_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Collapse cross-account duplicates onto the oldest row.
--
-- A loop rather than one pass: merging by name can leave a barcode collision
-- and vice versa, and a chain of three rows needs more than one round. The
-- table holds a few hundred rows and this runs once, so correctness wins over
-- cleverness. With no duplicates the loop exits immediately.
DO $$
DECLARE
  loser  uuid;
  keeper uuid;
BEGIN
  LOOP
    -- One pair at a time: same name key, or same barcode. The keeper is the
    -- older row, ties broken by id so the choice is deterministic.
    SELECT l.id, k.id
      INTO loser, keeper
      FROM food l
      JOIN food k
        ON k.id <> l.id
       AND (
             (lower(k.name) = lower(l.name)
              AND coalesce(lower(k.brand), '') = coalesce(lower(l.brand), ''))
             OR (k.barcode IS NOT NULL AND k.barcode = l.barcode)
           )
       AND (k.created_at, k.id) < (l.created_at, l.id)
     LIMIT 1;

    EXIT WHEN loser IS NULL;

    -- History first. meal_item.food_id is ON DELETE RESTRICT precisely so that
    -- this step cannot be skipped: the DELETE below would fail instead.
    -- The frozen nutrients on meal_item are NOT recomputed here.
    UPDATE meal_item SET food_id = keeper WHERE food_id = loser;
    UPDATE elimination_rule SET food_id = keeper WHERE food_id = loser;

    -- food_tag has a PK on (food_id, tag_id), so a tag both rows carry must not
    -- be inserted twice. The keeper's own assignment wins.
    INSERT INTO food_tag (food_id, tag_id, source, confidence, created_at)
    SELECT keeper, tag_id, source, confidence, created_at
      FROM food_tag
     WHERE food_id = loser
    ON CONFLICT (food_id, tag_id) DO NOTHING;
    DELETE FROM food_tag WHERE food_id = loser;

    -- Portions move instead of being deleted: meal_item.portion_id is
    -- ON DELETE SET NULL, so dropping them would erase "1 Scheibe" from
    -- entries already recorded. food_portion_default_uq permits one default per
    -- food, so an incoming default yields to the one already on the keeper.
    UPDATE food_portion
       SET food_id = keeper,
           is_default = is_default
             AND NOT EXISTS (
                   SELECT 1
                     FROM food_portion d
                    WHERE d.food_id = keeper
                      AND d.is_default
                 )
     WHERE food_id = loser;

    DELETE FROM food WHERE id = loser;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "food_name_uq" ON "food" USING btree (lower("name"),coalesce(lower("brand"), ''));--> statement-breakpoint
CREATE UNIQUE INDEX "food_barcode_uq" ON "food" USING btree ("barcode") WHERE "food"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "food_picker_idx" ON "food" USING btree ("last_used_at" DESC NULLS LAST) WHERE "food"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "food_name_lower_idx" ON "food" USING btree (lower("name"));