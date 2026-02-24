import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 bg-[var(--muted)] pb-20 md:pb-6 overflow-x-hidden min-w-0">{children}</main>
    </div>
  );
}
