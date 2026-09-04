import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatJalali } from '@/lib/persian';
import { getPageBySlug } from '../../_content';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return {};
  return {
    title: page.seoTitle || page.titleFa,
    description: page.seoDescription || page.excerptFa || undefined,
    alternates: { canonical: `/p/${slug}` },
  };
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <Breadcrumbs items={[{ label: page.titleFa }]} />
      <header>
        <h1 className="text-2xl font-extrabold text-fg">{page.titleFa}</h1>
        <p className="mt-1.5 text-xs text-fg-faint">آخرین بروزرسانی: {formatJalali(page.updatedAt)}</p>
      </header>
      <div className="prose-fa max-w-none">
        {page.contentFa.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}
