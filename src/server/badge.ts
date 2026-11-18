/**
 * The "linted with tells" badge served at /badge.svg. A static flat badge in the shields.io
 * layout: solid fills on both halves, so it reads the same on light and dark READMEs.
 * Text widths are pinned with textLength so the badge looks the same whatever font renders it.
 */
export const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="102" height="20" role="img" aria-label="linted with: tells">
<title>linted with: tells</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="102" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="69" height="20" fill="#555"/><rect x="69" width="33" height="20" fill="#146c43"/><rect width="102" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
<text aria-hidden="true" x="355" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="590">linted with</text>
<text x="355" y="140" transform="scale(.1)" textLength="590">linted with</text>
<text aria-hidden="true" x="845" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="230">tells</text>
<text x="845" y="140" transform="scale(.1)" textLength="230">tells</text>
</g>
</svg>
`;
