#!/usr/bin/env node
/**
 * Creates an admin editor entry for ADMIN_USERS.
 *
 *   npm run admin:user
 *
 * Prompts for an email and password, then prints the JSON entry to paste into
 * Vercel and a QR code to scan with any authenticator app. The TOTP secret is
 * shown once and never stored anywhere by this script.
 */
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';

const ISSUER = 'Voltix';

// Salt and hash stay separate hex fields: a `$`-delimited string is mangled
// by dotenv-style variable expansion.
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return {
    salt: salt.toString('hex'),
    hash: crypto.scryptSync(password, salt, 64).toString('hex'),
  };
}

const rl = readline.createInterface({ input: stdin, output: stdout });

const email = (await rl.question('Editor email: ')).trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('\nThat does not look like an email address.');
  process.exit(1);
}

const password = (await rl.question('Password (leave blank to generate): ')).trim();
const finalPassword =
  password || crypto.randomBytes(18).toString('base64url').slice(0, 24);

if (password && password.length < 12) {
  console.error('\nUse at least 12 characters, or leave it blank to generate one.');
  process.exit(1);
}

rl.close();

const totpSecret = new Secret({ size: 20 }).base32;
const uri = new TOTP({
  issuer: ISSUER,
  label: email,
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  secret: Secret.fromBase32(totpSecret),
}).toString();

const { salt, hash } = hashPassword(finalPassword);
const entry = { email, salt, hash, totp: totpSecret };

console.log('\n' + '─'.repeat(64));
console.log('1. Scan this with Google Authenticator, Authy, or your phone\'s');
console.log('   built-in password app:\n');
console.log(await QRCode.toString(uri, { type: 'terminal', small: true }));
console.log("   Can't scan? Enter this key manually:");
console.log(`   ${totpSecret}\n`);
console.log('─'.repeat(64));
console.log('2. Give the editor these credentials, over something private:\n');
console.log(`   Email:    ${email}`);
console.log(`   Password: ${finalPassword}\n`);
console.log('─'.repeat(64));
console.log('3. Add this to ADMIN_USERS in Vercel.');
console.log('   For several editors, put every entry in the same JSON array.\n');
console.log(JSON.stringify([entry]));
console.log('\n' + '─'.repeat(64));
console.log('The password and QR code are shown once and stored nowhere.');
console.log('Only the scrypt hash goes into ADMIN_USERS, so the variable');
console.log('itself is not a usable credential.\n');
