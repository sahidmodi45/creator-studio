ALTER TYPE "public"."asset_category" ADD VALUE 'brand_asset';--> statement-breakpoint
ALTER TABLE "brand_docs" ADD COLUMN "shared_with_client" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_colors" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_fonts" text[] DEFAULT '{}'::text[] NOT NULL;