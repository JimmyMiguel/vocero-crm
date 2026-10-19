CREATE TABLE "quote" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"number" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"cutoff_date" date,
	"departure_date" date NOT NULL,
	"transit_days" integer DEFAULT 55 NOT NULL,
	"capacity_cbm" double precision DEFAULT 68 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "shipment_id" text;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_org_number_uq" ON "quote" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "quote_lead_idx" ON "quote" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "shipment_org_departure_idx" ON "shipment" USING btree ("organization_id","departure_date");--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE set null ON UPDATE no action;