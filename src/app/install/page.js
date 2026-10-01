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
    <div className="bc-empty mt-10" role="status">
      <strong>Redirecting</strong>
      Taking you to Awards…
    </div>
  );
}