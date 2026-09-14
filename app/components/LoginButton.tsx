/**
 * The reshare button.
 *
 * A plain link, not a button that fetches. The destination is known when the
 * page renders, so making the visitor wait on a round trip — up to a couple of
 * seconds on a cold function — turned the main call to action into something
 * that looked broken when tapped.
 *
 * As a link it navigates instantly, works without JavaScript, and can be
 * long-pressed or opened in a new tab like any other link.
 */
export function LoginButton({
  href,
  label,
  className = 'btn-primary',
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <a className={className} href={href} rel="nofollow sponsored">
      {label}
    </a>
  );
}
