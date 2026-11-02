CREATE TABLE "product_image" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" text NOT NULL,
	"media_asset_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "operation" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "property_type" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "bedrooms" integer;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "bathrooms" real;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "area_m2" integer;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "lot_m2" integer;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "parking" integer;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "features" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "location_url" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "status" text DEFAULT 'disponible' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_media_asset_id_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_image_product_idx" ON "product_image" USING btree ("product_id","position");--> statement-breakpoint
INSERT INTO "product_image" ("id", "organization_id", "product_id", "media_asset_id", "position")
SELECT 'pim_' || substr(md5(random()::text || "id"), 1, 20), "organization_id", "id", "image_asset_id", 0
FROM "product" WHERE "image_asset_id" IS NOT NULL;
