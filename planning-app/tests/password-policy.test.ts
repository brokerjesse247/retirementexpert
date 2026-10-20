import { describe, it, expect } from 'vitest';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, validPasswordLength } from '../lib/auth/password-policy';
describe('Advisor password-only length policy',()=>{
  it('accepts exactly eight characters',()=>{expect(PASSWORD_MIN_LENGTH).toBe(8);expect(validPasswordLength('A'.repeat(8))).toBe(true);});
  it('rejects shorter passwords',()=>{expect(validPasswordLength('A'.repeat(7))).toBe(false);expect(validPasswordLength('')).toBe(false);});
  it('keeps the maximum bounded',()=>{expect(validPasswordLength('A'.repeat(PASSWORD_MAX_LENGTH))).toBe(true);expect(validPasswordLength('A'.repeat(PASSWORD_MAX_LENGTH+1))).toBe(false);});
});
