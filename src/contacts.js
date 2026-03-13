import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const SOURCES_DIR = path.join(
  homedir(),
  'Library/Application Support/AddressBook/Sources'
);

const contactCache = new Map();
let cacheLoaded = false;

/**
 * Load contacts from the macOS Contacts SQLite databases.
 * Reads all source databases under AddressBook/Sources/.
 */
export async function loadContacts() {
  if (cacheLoaded) return contactCache;

  try {
    const sources = readdirSync(SOURCES_DIR);

    for (const src of sources) {
      const dbPath = path.join(SOURCES_DIR, src, 'AddressBook-v22.abcddb');
      try {
        const db = new DatabaseSync(dbPath, { readOnly: true });

        // Load phone numbers
        const phones = db.prepare(`
          SELECT r.ZFIRSTNAME as firstName, r.ZLASTNAME as lastName, p.ZFULLNUMBER as phone
          FROM ZABCDRECORD r
          JOIN ZABCDPHONENUMBER p ON p.ZOWNER = r.Z_PK
          WHERE (r.ZFIRSTNAME IS NOT NULL OR r.ZLASTNAME IS NOT NULL)
            AND p.ZFULLNUMBER IS NOT NULL
        `).all();

        for (const row of phones) {
          const name = buildName(row.firstName, row.lastName);
          if (!name) continue;
          const key = normalizePhone(row.phone);
          const hasFullName = row.firstName && row.lastName;
          const existing = contactCache.get(key);
          // Prefer entries with both first + last name over nicknames
          if (!existing || hasFullName) {
            contactCache.set(key, name);
          }
        }

        // Load email addresses
        const emails = db.prepare(`
          SELECT r.ZFIRSTNAME as firstName, r.ZLASTNAME as lastName, e.ZADDRESS as email
          FROM ZABCDRECORD r
          JOIN ZABCDEMAILADDRESS e ON e.ZOWNER = r.Z_PK
          WHERE (r.ZFIRSTNAME IS NOT NULL OR r.ZLASTNAME IS NOT NULL)
            AND e.ZADDRESS IS NOT NULL
        `).all();

        for (const row of emails) {
          const name = buildName(row.firstName, row.lastName);
          if (!name) continue;
          const key = row.email.toLowerCase().trim();
          const hasFullName = row.firstName && row.lastName;
          const existing = contactCache.get(key);
          if (!existing || hasFullName) {
            contactCache.set(key, name);
          }
        }

        db.close();
      } catch {
        // Skip unreadable source databases
      }
    }

    cacheLoaded = true;
    console.log(`Loaded ${contactCache.size} contact entries`);
  } catch (err) {
    console.warn('Could not load contacts:', err.message);
    console.warn('Grant Full Disk Access to Terminal/Node if contacts are not resolving.');
  }

  return contactCache;
}

/**
 * Look up a display name for a handle (phone/email).
 */
export function getContactName(handle) {
  if (!handle) return 'Unknown';
  if (handle.includes('@')) return contactCache.get(handle.toLowerCase().trim()) || handle;
  return contactCache.get(normalizePhone(handle)) || handle;
}

/**
 * Build a display name from first/last, handling nulls.
 */
function buildName(firstName, lastName) {
  const fn = firstName || '';
  const ln = lastName || '';
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  return name || null;
}

/**
 * Normalize a phone number to last 10 digits for matching.
 */
function normalizePhone(id) {
  const digits = id.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Reload the contacts cache.
 */
export async function reloadContacts() {
  cacheLoaded = false;
  contactCache.clear();
  return loadContacts();
}
