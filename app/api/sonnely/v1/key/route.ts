import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { backend, inferenceErrorResponse, inferenceKeyHash, json } from "@/lib/server";

export async function GET(request: NextRequest) {
  try {
    const hash = inferenceKeyHash(request);
    const { db, secret } = backend();
    const data = await db.query(api.currentKey.status, { secret, hash, now: Date.now() });
    return json({ data });
  } catch (error) {
    return inferenceErrorResponse(error);
  }
}
