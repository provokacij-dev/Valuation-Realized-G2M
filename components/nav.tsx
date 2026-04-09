"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/ads", label: "New Ads" },
  { href: "/upload", label: "Upload Queue" },
  { href: "/skills", label: "Skills", badge: true },
  { href: "/leads", label: "Leads" },
  { href: "/engagements", label: "Engagements" },
];

export default function Nav() {
  const pathname = usePathname();
  const [skillBadge, setSkillBadge] = useState(0);

  useEffect(() => {
    async function loadBadge() {
      try {
        const res = await fetch("/api/skill-proposals?status=pending&count=true");
        if (!res.ok) return;
        const data = await res.json();
        setSkillBadge(data.count ?? 0);
      } catch {
        // badge is non-critical — silent fail
      }
    }
    loadBadge();
    // Refresh every 60s to pick up new proposals from ad approvals
    const id = setInterval(loadBadge, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <nav className="bg-vr-green text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <span className="font-semibold text-base tracking-tight">
          <span className="text-vr-gold">Valuation Realized</span>
          <span className="text-white/60 ml-2 text-sm font-normal">Ads Platform</span>
        </span>

        <div className="flex items-center gap-1">
          {links.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {link.label}
                {link.badge && skillBadge > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-vr-gold text-vr-green text-[10px] font-bold flex items-center justify-center">
                    {skillBadge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
