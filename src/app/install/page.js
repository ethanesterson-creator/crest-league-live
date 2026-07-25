"use client";

// The old /install route now points people to Awards. Install instructions
// live under the Admin password box. This redirects any old bookmark.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InstallRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/awards");
  }, [router]);
  return (
    <div className="mt-10 text-center text-white/60">
      Redirecting to Awards…
    </div>
  );
}