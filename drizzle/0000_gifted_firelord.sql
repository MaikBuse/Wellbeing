CREATE TYPE "public"."challenge_verdict" AS ENUM('tolerated', 'suspicious', 'reactive', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."dose_unit" AS ENUM('mg', 'ug', 'g', 'ml', 'iu', 'piece');--> statement-breakpoint
CREATE TYPE "public"."food_source" AS ENUM('off', 'manual');--> statement-breakpoint
CREATE TYPE "public"."intake_status" AS ENUM('taken', 'skipped', 'missed');--> statement-breakpoint
CREATE TYPE "public"."joint_region" AS ENUM('jaw', 'neck', 'shoulder', 'elbow', 'wrist', 'hand', 'hip', 'knee', 'ankle', 'foot', 'spine', 'si');--> statement-breakpoint
CREATE TYPE "public"."joint_side" AS ENUM('left', 'right', 'both');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner', 'snack', 'drink');--> statement-breakpoint
CREATE TYPE "public"."med_category" AS ENUM('csdmard', 'bdmard', 'tsdmard', 'nsaid', 'steroid', 'analgesic', 'supplement', 'other');--> statement-breakpoint
CREATE TYPE "public"."med_form" AS ENUM('tablet', 'capsule', 'injection', 'infusion', 'drops', 'spray', 'ointment', 'other');--> statement-breakpoint
CREATE TYPE "public"."menstrual_event_kind" AS ENUM('period_start', 'period_end', 'spotting');--> statement-breakpoint
CREATE TYPE "public"."onset_lag" AS ENUM('immediate', 'early', 'mid', 'late', 'next_day');--> statement-breakpoint
CREATE TYPE "public"."phase_kind" AS ENUM('baseline', 'elimination', 'reintroduction', 'washout');--> statement-breakpoint
CREATE TYPE "public"."portion_unit" AS ENUM('g', 'ml', 'piece', 'portion');--> statement-breakpoint
CREATE TYPE "public"."protocol_status" AS ENUM('planned', 'active', 'completed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."rule_mode" AS ENUM('avoid', 'allow', 'challenge');--> statement-breakpoint
CREATE TYPE "public"."schedule_kind" AS ENUM('daily', 'weekly', 'interval_days', 'as_needed');--> statement-breakpoint
CREATE TYPE "public"."tag_category" AS ENUM('trigger', 'nutrient', 'group', 'custom');--> statement-breakpoint
CREATE TYPE "public"."tag_confidence" AS ENUM('certain', 'likely', 'trace');--> statement-breakpoint
CREATE TYPE "public"."tag_rule_match" AS ENUM('off_allergen', 'off_trace', 'off_category', 'off_additive', 'ingredient_keyword', 'name_keyword');--> statement-breakpoint
CREATE TYPE "public"."tag_source" AS ENUM('off_derived', 'rule', 'manual');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zitadel_sub" text NOT NULL,
	"email" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_setting" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"time_zone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"day_start_hour" smallint DEFAULT 4 NOT NULL,
	"track_cycle" boolean DEFAULT true NOT NULL,
	"track_weight" boolean DEFAULT true NOT NULL,
	"count_trace_exposure" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_start_hour_range" CHECK ("user_setting"."day_start_hour" between 0 and 12)
);
--> statement-breakpoint
CREATE TABLE "food_tag_def" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"key" text NOT NULL,
	"label_de" text NOT NULL,
	"description_de" text,
	"category" "tag_category" NOT NULL,
	"is_analysed" boolean DEFAULT false NOT NULL,
	"primary_window" "onset_lag",
	"min_dose_grams" numeric(10, 2) DEFAULT 5,
	"sort_order" smallint DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "joint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label_de" text NOT NULL,
	"region" "joint_region" NOT NULL,
	"is_paired" boolean DEFAULT true NOT NULL,
	"in_das28" boolean DEFAULT false NOT NULL,
	"sort_order" smallint DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptom_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"key" text NOT NULL,
	"label_de" text NOT NULL,
	"group_key" text NOT NULL,
	"is_red_flag" boolean DEFAULT false NOT NULL,
	"sort_order" smallint DEFAULT 100 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tag_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"match_type" "tag_rule_match" NOT NULL,
	"pattern" text NOT NULL,
	"confidence" "tag_confidence" DEFAULT 'likely' NOT NULL,
	"is_negative" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_portion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"label_de" text NOT NULL,
	"grams" numeric(10, 2) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" smallint DEFAULT 100 NOT NULL,
	CONSTRAINT "food_portion_grams_positive" CHECK ("food_portion"."grams" > 0)
);
--> statement-breakpoint
CREATE TABLE "food_tag" (
	"food_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"source" "tag_source" DEFAULT 'manual' NOT NULL,
	"confidence" "tag_confidence" DEFAULT 'certain' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_tag_food_id_tag_id_pk" PRIMARY KEY("food_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "food" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"source" "food_source" DEFAULT 'manual' NOT NULL,
	"off_product_id" uuid,
	"barcode" text,
	"basis_unit" "portion_unit" DEFAULT 'g' NOT NULL,
	"kcal_100" numeric(10, 2),
	"protein_100" numeric(10, 2),
	"fat_100" numeric(10, 2),
	"sat_fat_100" numeric(10, 2),
	"carbs_100" numeric(10, 2),
	"sugar_100" numeric(10, 2),
	"fiber_100" numeric(10, 2),
	"salt_100" numeric(10, 2),
	"density_g_per_ml" numeric(6, 3) DEFAULT 1,
	"default_portion_grams" numeric(10, 2),
	"is_beverage" boolean DEFAULT false NOT NULL,
	"overridden_fields" text[] DEFAULT '{}' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "off_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barcode" text NOT NULL,
	"product_name" text,
	"brands" text,
	"quantity" text,
	"serving_size" text,
	"categories_tags" text[],
	"allergens_tags" text[],
	"traces_tags" text[],
	"additives_tags" text[],
	"ingredients_text" text,
	"nova_group" smallint,
	"kcal_100" numeric(10, 2),
	"protein_100" numeric(10, 2),
	"fat_100" numeric(10, 2),
	"sat_fat_100" numeric(10, 2),
	"carbs_100" numeric(10, 2),
	"sugar_100" numeric(10, 2),
	"fiber_100" numeric(10, 2),
	"salt_100" numeric(10, 2),
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"quantity" numeric(10, 2) DEFAULT 1 NOT NULL,
	"unit" "portion_unit" DEFAULT 'portion' NOT NULL,
	"portion_id" uuid,
	"grams" numeric(10, 2) NOT NULL,
	"kcal" numeric(10, 2),
	"protein_g" numeric(10, 2),
	"fat_g" numeric(10, 2),
	"sat_fat_g" numeric(10, 2),
	"carbs_g" numeric(10, 2),
	"sugar_g" numeric(10, 2),
	"fiber_g" numeric(10, 2),
	"salt_g" numeric(10, 2),
	"nutrients_computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "meal_item_grams_positive" CHECK ("meal_item"."grams" > 0)
);
--> statement-breakpoint
CREATE TABLE "meal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"log_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptom_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"meal_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"log_date" date NOT NULL,
	"severity" smallint NOT NULL,
	"onset_lag" "onset_lag",
	"onset_minutes" integer,
	"duration_minutes" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "symptom_severity_range" CHECK ("symptom_entry"."severity" between 0 and 10),
	CONSTRAINT "symptom_lag_requires_meal" CHECK ("symptom_entry"."meal_id" is null or "symptom_entry"."onset_lag" is not null)
);
--> statement-breakpoint
CREATE TABLE "symptom_entry_symptom" (
	"entry_id" uuid NOT NULL,
	"symptom_type_id" uuid NOT NULL,
	"severity" smallint,
	CONSTRAINT "symptom_entry_symptom_entry_id_symptom_type_id_pk" PRIMARY KEY("entry_id","symptom_type_id")
);
--> statement-breakpoint
CREATE TABLE "daily_log_joint" (
	"daily_log_id" uuid NOT NULL,
	"joint_id" uuid NOT NULL,
	"side" "joint_side" DEFAULT 'both' NOT NULL,
	"severity" smallint,
	"is_swollen" boolean DEFAULT false NOT NULL,
	"is_tender" boolean DEFAULT true NOT NULL,
	CONSTRAINT "daily_log_joint_daily_log_id_joint_id_side_pk" PRIMARY KEY("daily_log_id","joint_id","side")
);
--> statement-breakpoint
CREATE TABLE "daily_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"joint_pain" smallint,
	"morning_stiffness_minutes" integer,
	"fatigue" smallint,
	"wellbeing" smallint,
	"is_flare" boolean DEFAULT false NOT NULL,
	"sleep_minutes" integer,
	"sleep_quality" smallint,
	"stress" smallint,
	"activity_minutes" integer,
	"activity_intensity" smallint,
	"bristol_typical" smallint,
	"bowel_movements" smallint,
	"weight_kg" numeric(5, 2),
	"water_ml" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_log_bristol_range" CHECK ("daily_log"."bristol_typical" is null or "daily_log"."bristol_typical" between 1 and 7),
	CONSTRAINT "daily_log_scores_range" CHECK (("daily_log"."joint_pain" is null or "daily_log"."joint_pain" between 0 and 10)
        and ("daily_log"."fatigue" is null or "daily_log"."fatigue" between 0 and 10)
        and ("daily_log"."wellbeing" is null or "daily_log"."wellbeing" between 0 and 10)
        and ("daily_log"."stress" is null or "daily_log"."stress" between 0 and 10)
        and ("daily_log"."sleep_quality" is null or "daily_log"."sleep_quality" between 0 and 10)
        and ("daily_log"."activity_intensity" is null or "daily_log"."activity_intensity" between 0 and 10)),
	CONSTRAINT "daily_log_stiffness_sane" CHECK ("daily_log"."morning_stiffness_minutes" is null
        or "daily_log"."morning_stiffness_minutes" between 0 and 1440)
);
--> statement-breakpoint
CREATE TABLE "menstrual_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_date" date NOT NULL,
	"kind" "menstrual_event_kind" NOT NULL,
	"flow" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menstrual_flow_range" CHECK ("menstrual_event"."flow" is null or "menstrual_event"."flow" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "medication_intake" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"schedule_dose_id" uuid,
	"planned_log_date" date,
	"planned_at" timestamp with time zone,
	"taken_at" timestamp with time zone,
	"log_date" date NOT NULL,
	"status" "intake_status" NOT NULL,
	"dose_amount" numeric(10, 2) NOT NULL,
	"dose_unit" "dose_unit" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_schedule_dose" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"time_of_day" time NOT NULL,
	"dose_amount" numeric(10, 2) NOT NULL,
	"dose_unit" "dose_unit" NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_id" uuid NOT NULL,
	"kind" "schedule_kind" NOT NULL,
	"weekday" smallint,
	"interval_days" smallint,
	"anchor_date" date,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_needs_weekday" CHECK ("medication_schedule"."kind" <> 'weekly' or "medication_schedule"."weekday" between 0 and 6),
	CONSTRAINT "interval_needs_anchor" CHECK ("medication_schedule"."kind" <> 'interval_days'
        or ("medication_schedule"."interval_days" > 0 and "medication_schedule"."anchor_date" is not null)),
	CONSTRAINT "schedule_dates_ordered" CHECK ("medication_schedule"."valid_to" is null or "medication_schedule"."valid_to" >= "medication_schedule"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "medication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active_substance" text,
	"form" "med_form" DEFAULT 'tablet' NOT NULL,
	"strength_amount" numeric(10, 2),
	"strength_unit" "dose_unit",
	"category" "med_category" DEFAULT 'other' NOT NULL,
	"started_on" date,
	"ended_on" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elimination_phase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"kind" "phase_kind" NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"planned_days" smallint,
	"sort_order" smallint NOT NULL,
	"note" text,
	CONSTRAINT "phase_dates_ordered" CHECK ("elimination_phase"."ends_on" is null or "elimination_phase"."ends_on" >= "elimination_phase"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "elimination_protocol" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text,
	"status" "protocol_status" DEFAULT 'planned' NOT NULL,
	"started_on" date,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elimination_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"verdict" "challenge_verdict" NOT NULL,
	"mean_outcome_before" numeric(10, 2),
	"mean_outcome_during" numeric(10, 2),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elimination_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"tag_id" uuid,
	"food_id" uuid,
	"mode" "rule_mode" NOT NULL,
	"dose_note" text,
	CONSTRAINT "elimination_rule_target" CHECK (("elimination_rule"."tag_id" is not null) <> ("elimination_rule"."food_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "analysis_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"range_from" date NOT NULL,
	"range_to" date NOT NULL,
	"params" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "user_setting" ADD CONSTRAINT "user_setting_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_tag_def" ADD CONSTRAINT "food_tag_def_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_type" ADD CONSTRAINT "symptom_type_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_rule" ADD CONSTRAINT "tag_rule_tag_id_food_tag_def_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."food_tag_def"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_portion" ADD CONSTRAINT "food_portion_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_tag" ADD CONSTRAINT "food_tag_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_tag" ADD CONSTRAINT "food_tag_tag_id_food_tag_def_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."food_tag_def"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food" ADD CONSTRAINT "food_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food" ADD CONSTRAINT "food_off_product_id_off_product_id_fk" FOREIGN KEY ("off_product_id") REFERENCES "public"."off_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_item" ADD CONSTRAINT "meal_item_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_item" ADD CONSTRAINT "meal_item_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_item" ADD CONSTRAINT "meal_item_portion_id_food_portion_id_fk" FOREIGN KEY ("portion_id") REFERENCES "public"."food_portion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal" ADD CONSTRAINT "meal_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_entry" ADD CONSTRAINT "symptom_entry_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_entry" ADD CONSTRAINT "symptom_entry_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_entry_symptom" ADD CONSTRAINT "symptom_entry_symptom_entry_id_symptom_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."symptom_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_entry_symptom" ADD CONSTRAINT "symptom_entry_symptom_symptom_type_id_symptom_type_id_fk" FOREIGN KEY ("symptom_type_id") REFERENCES "public"."symptom_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_log_joint" ADD CONSTRAINT "daily_log_joint_daily_log_id_daily_log_id_fk" FOREIGN KEY ("daily_log_id") REFERENCES "public"."daily_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_log_joint" ADD CONSTRAINT "daily_log_joint_joint_id_joint_id_fk" FOREIGN KEY ("joint_id") REFERENCES "public"."joint"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_log" ADD CONSTRAINT "daily_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menstrual_event" ADD CONSTRAINT "menstrual_event_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_intake" ADD CONSTRAINT "medication_intake_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_intake" ADD CONSTRAINT "medication_intake_medication_id_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medication"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_intake" ADD CONSTRAINT "intake_schedule_dose_fk" FOREIGN KEY ("schedule_dose_id") REFERENCES "public"."medication_schedule_dose"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_schedule_dose" ADD CONSTRAINT "medication_schedule_dose_schedule_id_medication_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."medication_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_schedule" ADD CONSTRAINT "medication_schedule_medication_id_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication" ADD CONSTRAINT "medication_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elimination_phase" ADD CONSTRAINT "elimination_phase_protocol_id_elimination_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."elimination_protocol"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elimination_protocol" ADD CONSTRAINT "elimination_protocol_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elimination_result" ADD CONSTRAINT "elimination_result_phase_id_elimination_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."elimination_phase"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elimination_rule" ADD CONSTRAINT "elimination_rule_phase_id_elimination_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."elimination_phase"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elimination_rule" ADD CONSTRAINT "elimination_rule_tag_id_food_tag_def_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."food_tag_def"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elimination_rule" ADD CONSTRAINT "elimination_rule_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_zitadel_sub_uq" ON "app_user" USING btree ("zitadel_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "food_tag_def_key_uq" ON "food_tag_def" USING btree ("user_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "joint_key_uq" ON "joint" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "symptom_type_key_uq" ON "symptom_type" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "tag_rule_tag_idx" ON "tag_rule" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "food_portion_food_idx" ON "food_portion" USING btree ("food_id");--> statement-breakpoint
CREATE UNIQUE INDEX "food_portion_default_uq" ON "food_portion" USING btree ("food_id") WHERE "food_portion"."is_default";--> statement-breakpoint
CREATE INDEX "food_tag_tag_idx" ON "food_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "food_user_name_uq" ON "food" USING btree ("user_id",lower("name"),coalesce(lower("brand"), ''));--> statement-breakpoint
CREATE UNIQUE INDEX "food_user_barcode_uq" ON "food" USING btree ("user_id","barcode") WHERE "food"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "food_picker_idx" ON "food" USING btree ("user_id","last_used_at" DESC NULLS LAST) WHERE "food"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "food_name_lower_idx" ON "food" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "off_product_barcode_uq" ON "off_product" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "meal_item_meal_idx" ON "meal_item" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "meal_item_food_idx" ON "meal_item" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "meal_user_day_idx" ON "meal" USING btree ("user_id","log_date");--> statement-breakpoint
CREATE INDEX "meal_user_time_idx" ON "meal" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "symptom_user_day_idx" ON "symptom_entry" USING btree ("user_id","log_date");--> statement-breakpoint
CREATE INDEX "symptom_meal_idx" ON "symptom_entry" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "symptom_entry_symptom_type_idx" ON "symptom_entry_symptom" USING btree ("symptom_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_log_user_date_uq" ON "daily_log" USING btree ("user_id","log_date");--> statement-breakpoint
CREATE UNIQUE INDEX "menstrual_event_uq" ON "menstrual_event" USING btree ("user_id","event_date","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_planned_uq" ON "medication_intake" USING btree ("schedule_dose_id","planned_log_date") WHERE "medication_intake"."planned_log_date" is not null;--> statement-breakpoint
CREATE INDEX "intake_user_day_idx" ON "medication_intake" USING btree ("user_id","log_date");--> statement-breakpoint
CREATE INDEX "intake_med_day_idx" ON "medication_intake" USING btree ("medication_id","log_date");--> statement-breakpoint
CREATE UNIQUE INDEX "med_schedule_dose_uq" ON "medication_schedule_dose" USING btree ("schedule_id","time_of_day");--> statement-breakpoint
CREATE INDEX "med_schedule_med_idx" ON "medication_schedule" USING btree ("medication_id","valid_from");--> statement-breakpoint
CREATE INDEX "medication_user_idx" ON "medication" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "phase_protocol_idx" ON "elimination_phase" USING btree ("protocol_id","starts_on");--> statement-breakpoint
CREATE INDEX "protocol_user_idx" ON "elimination_protocol" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "elimination_result_phase_uq" ON "elimination_result" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "elimination_rule_phase_idx" ON "elimination_rule" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "analysis_run_idx" ON "analysis_run" USING btree ("user_id","kind","created_at" DESC NULLS LAST);