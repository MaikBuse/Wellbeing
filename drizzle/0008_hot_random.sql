CREATE TYPE "public"."activity_level" AS ENUM('sedentary', 'light', 'moderate', 'active', 'very_active');--> statement-breakpoint
CREATE TYPE "public"."biological_sex" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TYPE "public"."diet_form" AS ENUM('omnivore', 'pescetarian', 'vegetarian', 'vegan');--> statement-breakpoint
CREATE TYPE "public"."menopause_stage" AS ENUM('pre', 'peri', 'post');--> statement-breakpoint
CREATE TYPE "public"."weight_goal" AS ENUM('maintain', 'lose', 'gain');--> statement-breakpoint
CREATE TYPE "public"."weight_source" AS ENUM('daily_log', 'manual');--> statement-breakpoint
CREATE TABLE "medication_nutrient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_id" uuid NOT NULL,
	"nutrient_key" text NOT NULL,
	"amount_per_piece" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medn_amount_positive" CHECK ("medication_nutrient"."amount_per_piece" > 0)
);
--> statement-breakpoint
CREATE TABLE "nutrition_target_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nutrient_key" text NOT NULL,
	"min_value" numeric(12, 3),
	"max_value" numeric(12, 3),
	"unit" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"reason" text,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nto_dates_ordered" CHECK ("nutrition_target_override"."valid_to" is null or "nutrition_target_override"."valid_to" >= "nutrition_target_override"."valid_from"),
	CONSTRAINT "nto_has_value" CHECK ("nutrition_target_override"."disabled" or "nutrition_target_override"."min_value" is not null or "nutrition_target_override"."max_value" is not null)
);
--> statement-breakpoint
CREATE TABLE "user_nutrition_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reference_sex" "biological_sex",
	"birth_year" smallint,
	"height_cm" smallint,
	"activity_level" "activity_level" DEFAULT 'light' NOT NULL,
	"goal" "weight_goal" DEFAULT 'maintain' NOT NULL,
	"has_sarcopenia" boolean DEFAULT false NOT NULL,
	"menopause_stage" "menopause_stage",
	"diet_form" "diet_form" DEFAULT 'omnivore' NOT NULL,
	"renal_impairment" boolean DEFAULT false NOT NULL,
	"protein_max_g_per_kg" numeric(3, 2),
	"weight_source" "weight_source" DEFAULT 'daily_log' NOT NULL,
	"reference_weight_kg" numeric(5, 2),
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unp_birth_year_sane" CHECK ("user_nutrition_profile"."birth_year" is null or "user_nutrition_profile"."birth_year" between 1900 and 2100),
	CONSTRAINT "unp_height_sane" CHECK ("user_nutrition_profile"."height_cm" is null or "user_nutrition_profile"."height_cm" between 100 and 250),
	CONSTRAINT "unp_weight_sane" CHECK ("user_nutrition_profile"."reference_weight_kg" is null or "user_nutrition_profile"."reference_weight_kg" between 30 and 250),
	CONSTRAINT "unp_dates_ordered" CHECK ("user_nutrition_profile"."valid_to" is null or "user_nutrition_profile"."valid_to" >= "user_nutrition_profile"."valid_from"),
	CONSTRAINT "unp_menopause_needs_female" CHECK ("user_nutrition_profile"."menopause_stage" is null or "user_nutrition_profile"."reference_sex" = 'female'),
	CONSTRAINT "unp_protein_cap_needs_renal" CHECK ("user_nutrition_profile"."protein_max_g_per_kg" is null
          or ("user_nutrition_profile"."renal_impairment" and "user_nutrition_profile"."protein_max_g_per_kg" between 0.40 and 2.50))
);
--> statement-breakpoint
ALTER TABLE "user_setting" ADD COLUMN "nutrition_ack_version" smallint;--> statement-breakpoint
ALTER TABLE "user_setting" ADD COLUMN "nutrition_ack_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "medication_nutrient" ADD CONSTRAINT "medication_nutrient_medication_id_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_target_override" ADD CONSTRAINT "nutrition_target_override_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_nutrition_profile" ADD CONSTRAINT "user_nutrition_profile_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "medication_nutrient_uq" ON "medication_nutrient" USING btree ("medication_id","nutrient_key");--> statement-breakpoint
CREATE INDEX "nto_user_key_idx" ON "nutrition_target_override" USING btree ("user_id","nutrient_key","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "nto_open_uq" ON "nutrition_target_override" USING btree ("user_id","nutrient_key") WHERE "nutrition_target_override"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "unp_user_from_idx" ON "user_nutrition_profile" USING btree ("user_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "unp_open_uq" ON "user_nutrition_profile" USING btree ("user_id") WHERE "user_nutrition_profile"."valid_to" is null;