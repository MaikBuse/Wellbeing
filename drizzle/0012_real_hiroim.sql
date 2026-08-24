CREATE TYPE "public"."mascot_character" AS ENUM('merv', 'orson');--> statement-breakpoint
ALTER TABLE "user_setting" ADD COLUMN "mascot_character" "mascot_character" DEFAULT 'merv' NOT NULL;