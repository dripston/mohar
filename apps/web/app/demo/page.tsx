import type { Metadata } from "next";
import { DemoRoom } from "@/components/demo/DemoRoom";

export const metadata: Metadata = { title: "Demo room | Mohar", description: "Seeded certificates in every verdict state, sample scholarship applications and the demo run sheet." };

export default function Page() {
  return <DemoRoom />;
}
