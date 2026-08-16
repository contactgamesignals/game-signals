import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/withdrawal" },
};

export default function WithdrawalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
