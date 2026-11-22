export function siteOrigin() {
  const origin = process.env.APP_ORIGIN?.trim()
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return origin.replace(/\/+$/, "");
}
