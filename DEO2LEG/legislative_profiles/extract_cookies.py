#!/usr/bin/env python3
"""
extract_cookies.py — pull Cloudflare cookies (cf_clearance, __cf_bm) for
congress.gov.ph out of the local Google Chrome profile and save them to
cf_cookies.json, together with Chrome's exact User-Agent (cf_clearance is
bound to IP + User-Agent, so scraping must reuse both).

Chrome on Linux encrypts cookies with AES-128-CBC:
  - key from gnome-keyring/kwallet (Secret Service), or
  - the well-known fallback password b'peanuts' when no keyring is set up.
Cookie values are prefixed with b'v10' / b'v11'.
"""
import base64
import json
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

import psycopg2  # noqa: F401  (present in env; not used — keeps parity if extended)

HOME = Path.home()
COOKIE_DB = HOME / ".config/google-chrome/Default/Cookies"
OUT = Path(__file__).resolve().parent / "cf_cookies.json"
DOMAIN_SUFFIX = "congress.gov.ph"


def get_encryption_key() -> bytes:
    """Return the raw keyring secret used by Chrome on Linux.

    - GNOME Keyring / Secret Service ("Chrome Safe Storage") when available.
    - Falls back to the classic hardcoded b'peanuts' otherwise.
    """
    try:
        import secretstorage

        connection = secretstorage.dbus_init()
        collection = secretstorage.get_default_collection(connection)
        if collection.is_locked():
            collection.unlock()  # usually a no-op on unlocked desktop sessions
        for item in collection.get_all_items():
            if item.get_label() in ("Chrome Safe Storage", "Chromium Safe Storage"):
                secret = item.get_secret()
                if secret:
                    print("Using keyring secret (Chrome Safe Storage).")
                    return secret
    except Exception as e:
        print(f"Keyring unavailable ({e}); using fallback password.")
    return b"peanuts"


def derive_key(secret: bytes) -> bytes:
    import hashlib

    return hashlib.pbkdf2_hmac("sha1", secret, b"saltysalt", 1, dklen=16)


def decrypt_value(blob: bytes, key: bytes) -> str:
    if not blob:
        return ""
    if blob.startswith(b"v10") or blob.startswith(b"v11"):
        from Crypto.Cipher import AES  # pycryptodome

        iv = b" " * 16
        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(blob[3:])
        # Strip PKCS7 padding
        pad = decrypted[-1]
        if isinstance(pad, int) and 1 <= pad <= 16:
            decrypted = decrypted[:-pad]
        return decrypted.decode("utf-8", errors="replace")
    return blob.decode("utf-8", errors="replace")


def main() -> int:
    key = derive_key(get_encryption_key())

    # Copy the DB — Chrome holds a lock on the live file.
    tmp = Path(tempfile.mktemp(suffix=".sqlite"))
    shutil.copy2(COOKIE_DB, tmp)

    conn = sqlite3.connect(tmp)
    rows = conn.execute(
        "SELECT host_key, name, encrypted_value, value, path, expires_utc, is_secure "
        "FROM cookies WHERE host_key LIKE ?",
        (f"%{DOMAIN_SUFFIX}%",),
    ).fetchall()
    conn.close()
    tmp.unlink(missing_ok=True)

    cookies = []
    for host, name, enc, plain, path, expires, secure in rows:
        value = plain if plain else decrypt_value(enc, key)
        if not value:
            continue
        cookies.append(
            {
                "name": name,
                "value": value,
                "domain": host,
                "path": path or "/",
                "secure": bool(secure),
            }
        )

    interesting = [c for c in cookies if c["name"] in ("cf_clearance", "__cf_bm", "__cfruid")]
    OUT.write_text(json.dumps(cookies, indent=2))
    print(f"Extracted {len(cookies)} congress.gov.ph cookies "
          f"({len(interesting)} Cloudflare-related) -> {OUT}")
    for c in interesting:
        shown = c["value"][:18] + "..." if len(c["value"]) > 18 else c["value"]
        print(f"  {c['name']:<14} {c['domain']:<26} {shown}")
    if not any(c["name"] == "cf_clearance" for c in interesting):
        print("\nNOTE: no cf_clearance found. Visit congress.gov.ph in Chrome first, "
              "then re-run this script.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
