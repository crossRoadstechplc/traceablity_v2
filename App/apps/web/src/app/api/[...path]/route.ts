import { handleApi } from "@/server/ledger-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Cold hydrate of the seeded world can exceed the default 10s Hobby limit. */
export const maxDuration = 60;

type Ctx = { params: Promise<{ path?: string[] }> };

async function dispatch(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return handleApi(req, path);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
