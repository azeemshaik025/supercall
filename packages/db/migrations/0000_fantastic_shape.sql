CREATE TABLE "backings" (
	"call" text PRIMARY KEY NOT NULL,
	"order" text NOT NULL,
	"size" bigint NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"deadline" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copies" (
	"pay_fee_tx" text PRIMARY KEY NOT NULL,
	"call" text NOT NULL,
	"follower" text NOT NULL,
	"size" bigint NOT NULL,
	"flash_order_id" text,
	"close_order_id" text,
	"cancel_signature" text,
	"refused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copies_flash_order_id" UNIQUE("flash_order_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"call" text NOT NULL,
	"kind" text NOT NULL,
	"what" text NOT NULL,
	"price" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_once" UNIQUE("wallet","call","kind"),
	CONSTRAINT "notifications_kind" CHECK ("notifications"."kind" in ('ending')),
	CONSTRAINT "notifications_what" CHECK ("notifications"."what" in ('target', 'stop', 'deadline', 'caller', 'unfired', 'void'))
);
--> statement-breakpoint
CREATE TABLE "oppose_votes" (
	"call" text NOT NULL,
	"privy_user_id" text NOT NULL,
	"wallets" text[] NOT NULL,
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oppose_votes_call_privy_user_id_pk" PRIMARY KEY("call","privy_user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"text" text,
	"verdict" text,
	"reason" text,
	"reading" jsonb,
	"call" text,
	"read_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "posts_verdict" CHECK ("posts"."verdict" in ('call', 'close', 'not-a-call'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"privy_user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"wallet" text NOT NULL,
	"x_user_id" text,
	"x_username" text,
	"x_name" text,
	"x_avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username" UNIQUE("username"),
	CONSTRAINT "profiles_x_user_id" UNIQUE("x_user_id")
);
--> statement-breakpoint
CREATE TABLE "voids" (
	"call" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_nullifiers" (
	"nullifier" numeric(78, 0) NOT NULL,
	"action" text NOT NULL,
	"wallet" text NOT NULL,
	"environment" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_nullifiers_nullifier_action" UNIQUE("nullifier","action"),
	CONSTRAINT "world_nullifiers_wallet_action" UNIQUE("wallet","action")
);
--> statement-breakpoint
CREATE INDEX "copies_call" ON "copies" USING btree ("call");--> statement-breakpoint
CREATE INDEX "copies_follower" ON "copies" USING btree ("follower");