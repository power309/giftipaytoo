import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { toPersianDigits, formatJalali } from '@/lib/persian';
import type { BlogListItem } from '@/app/(storefront)/_content';

const FALLBACK = '/media/placeholder.webp';

export function BlogCard({ post, priority = false }: { post: BlogListItem; priority?: boolean }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border-base bg-surface transition-all hover:border-primary/40 hover:shadow-[var(--shadow-lift)]">
      <Link href={`/blog/${post.slug}`} className="relative block aspect-[16/10] overflow-hidden bg-surface-muted" tabIndex={-1} aria-hidden>
        <Image
          src={post.coverPath || FALLBACK}
          alt=""
          fill
          sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {post.categoryFa && <span className="w-fit rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-medium text-primary">{post.categoryFa}</span>}
        <h3 className="text-sm font-bold leading-6 text-fg line-clamp-2">
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {post.titleFa}
          </Link>
        </h3>
        <p className="line-clamp-2 text-xs leading-6 text-fg-muted">{post.excerptFa}</p>
        <div className="mt-auto flex items-center gap-3 pt-2 text-[11px] text-fg-faint">
          {post.publishedAt && <span>{formatJalali(post.publishedAt)}</span>}
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {toPersianDigits(post.readingMinutes)} دقیقه مطالعه
          </span>
        </div>
      </div>
    </article>
  );
}
