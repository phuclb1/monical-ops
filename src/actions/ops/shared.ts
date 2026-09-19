import { revalidatePath } from "next/cache";

export function refresh(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}
