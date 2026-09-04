import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { listBrands } from '../_data';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'همه برندها',
  description: 'فهرست الفبایی برندهای موجود در گیفتی‌پی — گیفت کارت، اشتراک و محصولات دیجیتال.',
  alternates: { canonical: '/brands' },
};

const ALPHABET = 'ا آ ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن و ه ی'.split(' ');

function firstLetter(name: string): string {
  const ch = name.trim()[0] ?? '#';
  return ALPHABET.includes(ch) ? ch : '#';
}

export default async function BrandsPage() {
  const brands = await listBrands();

  const groups = new Map<string, typeof brands>();
  for (const b of brands) {
    const letter = firstLetter(b.nameFa);
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(b);
  }
  const order = [...ALPHABET, '#'].filter((l) => groups.has(l));

  return (
    <div className="container-page space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-extrabold text-fg">همه برندها</h1>
        <p className="mt-1.5 text-sm text-fg-muted">فهرست الفبایی برندهای موجود در فروشگاه.</p>
      </div>

      {brands.length === 0 ? (
        <p className="text-sm text-fg-muted">در حال حاضر برندی ثبت نشده است.</p>
      ) : (
        <>
          <nav aria-label="نمایه الفبایی" className="sticky top-16 z-10 -mx-4 overflow-x-auto border-y border-border-base bg-bg/95 px-4 py-2 backdrop-blur no-scrollbar sm:mx-0 sm:rounded-xl sm:border">
            <ul className="flex w-max gap-1">
              {order.map((l) => (
                <li key={l}>
                  <a
                    href={`#letter-${l === '#' ? 'hash' : l}`}
                    className="flex size-8 items-center justify-center rounded-lg text-sm font-medium text-fg-muted transition-colors hover:bg-primary-soft hover:text-primary"
                  >
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-8">
            {order.map((letter) => (
              <section key={letter} id={`letter-${letter === '#' ? 'hash' : letter}`} aria-labelledby={`h-${letter}`} className="scroll-mt-32">
                <h2 id={`h-${letter}`} className="mb-3 text-lg font-bold text-primary">
                  {letter}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {groups.get(letter)!.map((b) => (
                    <Link
                      key={b.slug}
                      href={`/brand/${b.slug}`}
                      className="flex items-center gap-3 rounded-xl border border-border-base bg-surface p-3 transition-colors hover:border-primary/40"
                    >
                      {b.logoPath ? (
                        <Image src={b.logoPath} alt="" width={36} height={36} className="size-9 shrink-0 rounded-lg object-contain" />
                      ) : (
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-muted text-xs text-fg-faint">{b.nameFa.slice(0, 2)}</span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{b.nameFa}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
