import type { Metadata } from "next";
import SharedProjectContent from "@/app/shared/[token]/SharedProjectContent";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface SharePreview {
  kind?: string;
  after_image?: string;
}

interface SharedProject {
  name: string;
  description?: string | null;
  thumbnail_url?: string | null;
  share_preview?: SharePreview | null;
}

async function fetchSharedProject(token: string): Promise<SharedProject | null> {
  try {
    const res = await fetch(`${API_URL}/shared/${encodeURIComponent(token)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const project = await fetchSharedProject(token);

  if (!project) {
    return {
      title: "Ennen ja jalkeen | Helscoop",
      description: "Suunnittele remonttisi 3D:ssa Helscoopilla.",
    };
  }

  const title = `${project.name} - ennen ja jalkeen`;
  const description =
    project.description ||
    "Katso remontin ennen/jalkeen-vertailu, joka on tehty Helscoopilla.";
  const ogImage = project.share_preview?.kind === "before_after" && project.share_preview.after_image
    ? `${API_URL}/shared/${encodeURIComponent(token)}/og-image`
    : project.thumbnail_url || "https://helscoop.fi/og-default.png";

  return {
    title,
    description,
    alternates: {
      canonical: `/share/${encodeURIComponent(token)}?compare=1`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "fi_FI",
      siteName: "Helscoop",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedProjectContent token={token} />;
}
