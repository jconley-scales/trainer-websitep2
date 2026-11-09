/**
 * Dedicated-page header: a flat band of brand green carrying the page's single
 * <h1> and a one-line lead, echoing the home-page hero so the public pages read
 * as one site. The body section below is labelled by this h1 (id="page-title").
 * `focusable` lets a script move focus to the h1 (it stays out of the Tab order),
 * for pages that swap their content in place.
 */
export function PageHeader({
  title,
  lead,
  focusable = false,
}: {
  title: string;
  lead?: string;
  focusable?: boolean;
}) {
  return (
    <div className="page-header">
      <div className="wrap">
        <h1 id="page-title" className="page-header-title" tabIndex={focusable ? -1 : undefined}>
          {title}
        </h1>
        {lead ? <p className="page-header-lead">{lead}</p> : null}
      </div>
    </div>
  );
}
