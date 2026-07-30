import type { Metadata } from "next";
import { AppProvider } from "@/components/app/app-provider";
import { AppShell } from "@/components/app/app-shell";
import { noIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = noIndexMetadata;
export default function ProductLayout({ children }: { children: React.ReactNode }) { return <AppProvider><AppShell>{children}</AppShell></AppProvider>; }
