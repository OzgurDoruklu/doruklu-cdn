/**
 * Doruklu CDN — Global Assets
 * Bu dosya tüm subdomain'lerde kullanılan ortak görsel varlıkları içerir.
 */

export const Assets = {
    // Kurumsal Logo (Modern Indigo/Violet Design)
    logoSVG: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="logoGrad" x1="0" y1="0" x2="100" y2="100">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <path d="M50 5L95 27.5V72.5L50 95L5 72.5V27.5L50 5Z" fill="url(#logoGrad)" filter="url(#glow)"/>
  <path d="M30 45L50 35L70 45V55L50 65L30 55V45Z" fill="white" fill-opacity="0.9" />
  <path d="M50 20L80 35V65L50 80L20 65V35L50 20Z" stroke="white" stroke-opacity="0.3" stroke-width="1" />
</svg>`
};
