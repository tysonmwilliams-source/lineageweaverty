/**
 * SVGO config for public/heraldic-charges.
 *
 * CRITICAL: `convertColors` must stay disabled. Every charge is recoloured at
 * runtime by ExternalChargeRenderer, which substitutes on the literal pattern
 * /fill="#FFFFFF"|fill="#ffffff"|fill="white"/gi. `convertColors` rewrites
 * `#FFFFFF` to the equivalent `#fff`, which that regex does not match — so the
 * charges would keep rendering white instead of taking the tincture, silently,
 * across all 12,243 white fills in 352 files.
 *
 * `removeUselessStrokeAndFill` is off for the same reason: a fill it judges
 * redundant is a fill the recolour depends on finding.
 *
 * Run with:  npx svgo -r -f public/heraldic-charges
 */
export default {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          convertColors: false,
          removeUselessStrokeAndFill: false,

          // Keep viewBox — the renderer scales charges by it.
          removeViewBox: false,

          // mergePaths rewrites many subpaths into one 'd'. That can flip
          // even-odd/nonzero winding results and silently punch holes in or
          // fill in parts of the artwork. These 355 charges are traced art with
          // no source to regenerate from, so the geometry stays untouched.
          mergePaths: false,
        },
      },
    },
  ],
};
