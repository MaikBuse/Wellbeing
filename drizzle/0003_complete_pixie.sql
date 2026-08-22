ALTER TYPE "public"."food_source" ADD VALUE 'bls' BEFORE 'manual';--> statement-breakpoint
ALTER TYPE "public"."tag_rule_match" ADD VALUE 'bls_group';--> statement-breakpoint
ALTER TYPE "public"."tag_rule_match" ADD VALUE 'bls_measured';--> statement-breakpoint
CREATE TABLE "food_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bls_code" text NOT NULL,
	"name_de" text NOT NULL,
	"group_key" text NOT NULL,
	"is_everyday" boolean DEFAULT false NOT NULL,
	"kcal_100" numeric(10, 2),
	"protein_100" numeric(10, 2),
	"fat_100" numeric(10, 2),
	"sat_fat_100" numeric(10, 2),
	"carbs_100" numeric(10, 2),
	"sugar_100" numeric(10, 2),
	"fiber_100" numeric(10, 2),
	"salt_100" numeric(10, 3),
	"lactose_100" numeric(10, 3),
	"fructose_100" numeric(10, 3),
	"glucose_100" numeric(10, 3),
	"sorbitol_100" numeric(10, 3),
	"mannitol_100" numeric(10, 3),
	"alcohol_100" numeric(10, 3),
	"omega3_100" numeric(10, 3),
	"epa_dha_100" numeric(10, 3),
	"arachidonic_100" numeric(10, 3),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "bls_catalog_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "food_catalog_bls_code_uq" ON "food_catalog" USING btree ("bls_code");--> statement-breakpoint
CREATE INDEX "food_catalog_name_lower_idx" ON "food_catalog" USING btree (lower("name_de"));--> statement-breakpoint
CREATE INDEX "food_catalog_everyday_idx" ON "food_catalog" USING btree (lower("name_de")) WHERE "food_catalog"."is_everyday";--> statement-breakpoint
ALTER TABLE "food" ADD CONSTRAINT "food_bls_catalog_id_food_catalog_id_fk" FOREIGN KEY ("bls_catalog_id") REFERENCES "public"."food_catalog"("id") ON DELETE set null ON UPDATE no action;