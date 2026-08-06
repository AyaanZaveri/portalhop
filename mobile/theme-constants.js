// CommonJS mirror of the radius scale in @portalhop/shared/theme/tokens, because
// tailwind.config.js is loaded by Metro's config pass and cannot import TS.
// Derived from --radius: 0.625rem (10px) in the web app's globals.css.
module.exports = {
  radius: {
    sm: 6,
    md: 8,
    lg: 10,
    xl: 14,
    "2xl": 18,
    "3xl": 22,
    "4xl": 26,
  },
}
