-- Collapse the duplicated global lookup rows, then make the duplication
-- impossible.
--
-- Why they exist: food_tag_def and symptom_type were unique on (user_id, key)
-- with Postgres' default NULLS DISTINCT. Global seed rows have user_id IS NULL,
-- so no two of them ever compared equal, the seed's ON CONFLICT never fired,
-- and every run inserted a fresh set. migrate.ts seeds on every deploy, so the
-- count grew once per deployment.
--
-- The DML below is hand-written; drizzle-kit only emits the DDL at the end. It
-- has to run FIRST: adding the constraint to an already-duplicated table fails
-- with "could not create unique index".
--
-- All of this runs inside drizzle's single migration transaction, so a failure
-- anywhere leaves nothing half-applied.

-- Canonical row per key. Deliberately first_value() and not min(id): min(uuid)
-- does not exist in Postgres 17, and neither table has a created_at to sort by.
-- Which copy wins does not matter — migrate.ts seeds immediately after this
-- migration, and that upsert now matches, so the survivor is refreshed from
-- tags.ts straight away.
CREATE TEMP TABLE tag_def_canon ON COMMIT DROP AS
SELECT id AS dup_id,
       first_value(id) OVER (PARTITION BY key ORDER BY id) AS keep_id
FROM food_tag_def
WHERE user_id IS NULL;--> statement-breakpoint

CREATE TEMP TABLE symptom_type_canon ON COMMIT DROP AS
SELECT id AS dup_id,
       first_value(id) OVER (PARTITION BY key ORDER BY id) AS keep_id
FROM symptom_type
WHERE user_id IS NULL;--> statement-breakpoint

-- food_tag carries real user labelling and its FK is ON DELETE CASCADE, so the
-- assignments must be moved onto the canonical tag BEFORE anything is deleted.
--
-- Collapse by insert-on-conflict rather than UPDATE: a food may carry several
-- copies of the same tag, and an UPDATE would see the pre-statement snapshot and
-- try to rename all of them onto the same (food_id, tag_id), violating the PK.
-- DISTINCT ON picks exactly one winner per (food, canonical tag).
--
-- "A manual tag always wins" (src/actions/foods.ts), so a manual assignment
-- outranks a derived one and brings its 'certain' confidence with it.
INSERT INTO food_tag (food_id, tag_id, source, confidence, created_at)
SELECT DISTINCT ON (ft.food_id, c.keep_id)
       ft.food_id, c.keep_id, ft.source, ft.confidence, ft.created_at
FROM food_tag ft
JOIN tag_def_canon c ON c.dup_id = ft.tag_id
ORDER BY ft.food_id, c.keep_id, (ft.source = 'manual') DESC, ft.created_at
ON CONFLICT (food_id, tag_id) DO UPDATE
  SET source = EXCLUDED.source,
      confidence = EXCLUDED.confidence
  WHERE food_tag.source <> 'manual';--> statement-breakpoint

DELETE FROM food_tag ft
USING tag_def_canon c
WHERE ft.tag_id = c.dup_id AND c.dup_id <> c.keep_id;--> statement-breakpoint

-- symptom_entry_symptom is ON DELETE RESTRICT, so leaving a reference behind
-- would abort the migration rather than lose data. Same collapse, keeping a
-- recorded per-symptom severity over a NULL one.
INSERT INTO symptom_entry_symptom (entry_id, symptom_type_id, severity)
SELECT DISTINCT ON (s.entry_id, c.keep_id)
       s.entry_id, c.keep_id, s.severity
FROM symptom_entry_symptom s
JOIN symptom_type_canon c ON c.dup_id = s.symptom_type_id
ORDER BY s.entry_id, c.keep_id, (s.severity IS NULL), s.severity DESC
ON CONFLICT (entry_id, symptom_type_id) DO UPDATE
  SET severity = COALESCE(symptom_entry_symptom.severity, EXCLUDED.severity);--> statement-breakpoint

DELETE FROM symptom_entry_symptom s
USING symptom_type_canon c
WHERE s.symptom_type_id = c.dup_id AND c.dup_id <> c.keep_id;--> statement-breakpoint

-- tag_rule and elimination_rule have no unique constraint on tag_id, so a plain
-- repoint cannot collide. tag_rule is rebuilt wholesale by the next seed anyway;
-- repointing keeps the database consistent even if that never runs.
UPDATE tag_rule r
SET tag_id = c.keep_id
FROM tag_def_canon c
WHERE r.tag_id = c.dup_id AND c.dup_id <> c.keep_id;--> statement-breakpoint

UPDATE elimination_rule e
SET tag_id = c.keep_id
FROM tag_def_canon c
WHERE e.tag_id = c.dup_id AND c.dup_id <> c.keep_id;--> statement-breakpoint

-- Nothing references the duplicates any more.
DELETE FROM food_tag_def d
USING tag_def_canon c
WHERE d.id = c.dup_id AND c.dup_id <> c.keep_id;--> statement-breakpoint

DELETE FROM symptom_type t
USING symptom_type_canon c
WHERE t.id = c.dup_id AND c.dup_id <> c.keep_id;--> statement-breakpoint

DROP INDEX "food_tag_def_key_uq";--> statement-breakpoint
DROP INDEX "symptom_type_key_uq";--> statement-breakpoint
ALTER TABLE "food_tag_def" ADD CONSTRAINT "food_tag_def_key_uq" UNIQUE NULLS NOT DISTINCT("user_id","key");--> statement-breakpoint
ALTER TABLE "symptom_type" ADD CONSTRAINT "symptom_type_key_uq" UNIQUE NULLS NOT DISTINCT("user_id","key");
