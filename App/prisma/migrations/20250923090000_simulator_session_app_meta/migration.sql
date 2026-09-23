-- CreateTable
CREATE TABLE "public"."simulator_sessions" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "capacity" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulator_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "public"."app_meta" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "preferred_trace_lot_id" UUID,
    "last_hash" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulator_sessions_actor_id_idx" ON "public"."simulator_sessions"("actor_id");
