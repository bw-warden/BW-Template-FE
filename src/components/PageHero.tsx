type PageHeroProps = {
  kicker?: string;
  title: string;
  copy: string;
};

export function PageHero({
  kicker = "Bitwarden provisioning",
  title,
  copy,
}: PageHeroProps) {
  return (
    <section className="page-hero" aria-label={title}>
      <div className="page-hero-inner">
        <p className="page-hero-kicker">{kicker}</p>
        <h1 className="section-title">{title}</h1>
        <p className="section-copy">{copy}</p>
      </div>
    </section>
  );
}
