import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Clock, CalendarDays } from 'lucide-react';
import { env } from '@/lib/env';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { getBlogPostBySlug, getRelatedBlogPosts } from '../../_content';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { BlogCard } from '@/components/storefront/blog-card';
import { ShareButton } from '@/components/storefront/share-button';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return {};
  const title = post.seoTitle || post.titleFa;
  const description = post.seoDescription || post.excerptFa;
  return {
    title,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title, description, type: 'article', images: post.coverPath ? [{ url: post.coverPath }] : undefined },
  };
}

const FALLBACK = '/media/placeholder.webp';

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  const related = await getRelatedBlogPosts(slug, post.categoryFa, 3);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.titleFa,
    description: post.excerptFa,
    image: post.coverPath ? [`${env.appUrl}${post.coverPath}`] : undefined,
    datePublished: post.publishedAt ?? undefined,
    author: post.authorName ? { '@type': 'Person', name: post.authorName } : undefined,
    publisher: { '@type': 'Organization', name: 'گیفتی‌پی' },
    mainEntityOfPage: `${env.appUrl}/blog/${slug}`,
  };

  return (
    <div className="container-page max-w-3xl space-y-6 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <Breadcrumbs items={[{ label: 'مجله', href: '/blog' }, { label: post.titleFa }]} />

      <header className="space-y-3">
        {post.categoryFa && <span className="inline-block w-fit rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">{post.categoryFa}</span>}
        <h1 className="text-2xl font-extrabold leading-9 text-fg sm:text-3xl">{post.titleFa}</h1>
        <p className="text-sm leading-7 text-fg-muted">{post.excerptFa}</p>
        <div className="flex flex-wrap items-center gap-4 border-y border-border-base py-3 text-xs text-fg-muted">
          {post.authorName && <span>نویسنده: {post.authorName}</span>}
          {post.publishedAt && (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden /> {formatJalali(post.publishedAt)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {toPersianDigits(post.readingMinutes)} دقیقه مطالعه
          </span>
          <span className="ms-auto">
            <ShareButton title={post.titleFa} size="sm" />
          </span>
        </div>
      </header>

      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-surface-muted">
        <Image src={post.coverPath || FALLBACK} alt={post.coverAlt || post.titleFa} fill sizes="(max-width: 768px) 100vw, 768px" priority className="object-cover" />
      </div>

      <div className="prose-fa max-w-none">
        {post.contentFa.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-posts" className="border-t border-border-base pt-6">
          <h2 id="related-posts" className="mb-4 text-lg font-bold text-fg">
            مطالب مرتبط
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {related.map((p) => (
              <BlogCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
