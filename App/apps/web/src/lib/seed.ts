import { api } from "@/lib/api";

export async function seedWorld(): Promise<{ preferredTraceLotId?: string }> {
  const result = await api<{ preferredTraceLotId?: string }>("/v1/seed", {
    method: "POST",
    body: "{}",
  });
  if (result.preferredTraceLotId) {
    localStorage.setItem("ankuaru_preferred_lot", result.preferredTraceLotId);
  } else {
    localStorage.removeItem("ankuaru_preferred_lot");
  }
  return result;
}
