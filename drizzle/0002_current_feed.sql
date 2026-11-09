ALTER TYPE "public"."asset_category" ADD VALUE 'live_post';--> statement-breakpoint
ALTER TABLE "feed_layouts" ADD COLUMN "is_current" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_layouts_one_current_idx" ON "feed_layouts" USING btree ("workspace_id") WHERE "feed_layouts"."is_current";