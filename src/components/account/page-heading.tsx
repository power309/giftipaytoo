/**
 * The one `<h1>` each account page renders — visually matching
 * `SectionHeading` (used elsewhere on the page for h2-level subsections)
 * but semantically the page's single top-level heading.
 */
export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-fg sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
