"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SharedProjectContent from "@/app/shared/[token]/SharedProjectContent";
import { api } from "@/lib/api";

export default function GalleryProjectPage() {
  const params = useParams();
  const id = params.id as string;
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    api.getGalleryProject(id)
      .then((project) => {
        if (active) setShareToken(project.share_token ?? null);
      })
      .catch(() => {
        if (active) setNotFound(true);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (notFound) {
    return (
      <main className="gallery-page gallery-project-error">
        <Link href="/gallery" className="gallery-back-link">Back to gallery</Link>
        <h1>Public project not found</h1>
        <p>The project may have been unpublished or removed.</p>
      </main>
    );
  }

  if (!shareToken) {
    return (
      <main className="gallery-page gallery-project-error" role="status" aria-live="polite" aria-busy="true">
        <Link href="/gallery" className="gallery-back-link">Back to gallery</Link>
        <h1>Loading public project...</h1>
      </main>
    );
  }

  return <SharedProjectContent token={shareToken} />;
}
