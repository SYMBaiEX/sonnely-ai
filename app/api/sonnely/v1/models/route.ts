import { models } from "@/lib/models";

export function GET() {
  return Response.json({
    object: "list",
    data: models.map((model) => ({ id: model.id, object: "model", created: 0, owned_by: "near-ai" })),
  });
}
