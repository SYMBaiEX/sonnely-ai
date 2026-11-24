import type { NextRequest } from "next/server";
import { runSpecialized } from "@/lib/specialized-inference";

export const maxDuration = 60;

export function POST(request: NextRequest) {
  return runSpecialized(request, "images/generations");
}
