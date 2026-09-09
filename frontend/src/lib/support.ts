// src/lib/support.ts
// One source for "there is no password reset — contact the operators". The
// platform has no email flow, so a forgotten password can only be restored
// by an admin. Every place a player might discover that says it the same
// way, in the platform's voice.

export const ADMIN_EMAIL = 'support@cyberhx.com';

export const NO_RESET_TAG = '[ NO RESET PROTOCOL ]';

/** Register: said while the player is choosing a password, before it is too late. */
export const REGISTER_NO_RESET =
  `${NO_RESET_TAG} There is no password reset on this grid. Guard your access key — lose it and only the operators can restore your entry:`;

/** Login / Settings: said wherever a player may have already forgotten it. */
export const FORGOT_NO_RESET =
  `Forgot your access key? ${NO_RESET_TAG} — only the operators can reset it. Contact`;

/** Settings: the current password did not match. */
export const WRONG_CURRENT =
  `ACCESS DENIED :: current access key incorrect. Forgot it? ${NO_RESET_TAG} — contact the operators at ${ADMIN_EMAIL} to reset it.`;
