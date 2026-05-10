CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE "payouts" (
	"week_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_week_id_user_id_pk" PRIMARY KEY("week_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "weekly_history" (
	"week_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"final_rank" integer NOT NULL,
	"final_score" bigint NOT NULL,
	CONSTRAINT "weekly_history_week_id_user_id_pk" PRIMARY KEY("week_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_history" ADD CONSTRAINT "weekly_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;