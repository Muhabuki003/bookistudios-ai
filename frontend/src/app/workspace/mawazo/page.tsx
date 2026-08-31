import { redirect } from "next/navigation";
import { getServerSideUser } from "@/core/auth/server";
import { MawazoWorkspace } from "@/components/workspace/mawazo/mawazo-workspace";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "founder@bookistudios.com";

export default async function MawazoPage() {
  const result = await getServerSideUser();
  if (result.tag !== "authenticated") redirect("/login?next=/workspace/mawazo");
  if (result.user.email !== ADMIN_EMAIL && result.user.system_role !== "admin") {
    redirect("/workspace");
  }
  return <MawazoWorkspace user={result.user} />;
}
