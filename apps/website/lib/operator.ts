import "server-only";

// Public contact information comes from the adopter's server configuration.
// An unconfigured demo must not send feedback to the project's author.
const configuredEmail = process.env.SUPPORT_EMAIL?.trim();
export const supportEmail =
  configuredEmail &&
  configuredEmail.length <= 254 &&
  /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(configuredEmail)
    ? configuredEmail
    : null;
