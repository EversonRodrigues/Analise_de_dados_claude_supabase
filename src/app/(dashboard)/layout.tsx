import { Nav } from '@/components/ui/Nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </>
  );
}
