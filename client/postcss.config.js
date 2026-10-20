export default {
  plugins: {
    // Tailwind v4 moved its PostCSS plugin into a dedicated package.
    // Vendor prefixing and @import handling are built in, so autoprefixer
    // and postcss-import are no longer needed here.
    '@tailwindcss/postcss': {},
  },
};
