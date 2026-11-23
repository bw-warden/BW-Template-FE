export function AppFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="bitwarden-logo"
          src="/bitwarden-logo.png"
          alt="Bitwarden"
          height={48}
        />
      </div>
    </footer>
  );
}
