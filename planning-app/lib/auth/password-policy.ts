/** Advisor accounts always require verified authenticator MFA before a session is issued. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
export const PASSWORD_LENGTH_MESSAGE = 'Use a password of 8–200 characters. A unique 12+ character passphrase is recommended.';
export function validPasswordLength(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}
