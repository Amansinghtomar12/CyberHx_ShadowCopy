#!/usr/bin/env python3
"""
OPERATION GHOSTWIRE — OSINT / Darkweb Simulation (INSANE)

Category: OSINT
Difficulty: INSANE
Port: 9008 (HTTP)

A threat actor "Sp3ctr3" communicates through paste sites, forums,
and darkweb markets. Players follow the digital breadcrumbs.

Solution walkthrough (11 steps):
  1.  Visit /paste/a7f3e9b2 (given starting point)
  2.  Decode the base64 "PGP" block → message mentions "forum thread 1337"
  3.  View HTML source → comment reveals /paste/ff00ff (backup paste)
  4.  Visit /forum/thread/1337 → Sp3ctr3 posts hex:
      4d61726b65743a20307864656164 → "Market: 0xdead"
  5.  In Sp3ctr3's profile sidebar: PGP Key ID "0x47484F5354"
      → hex decode → "GHOST" (key part 1)
  6.  Visit /market/listing/0xdead → description acrostic:
      first letter of each line → W,I,R,E → "WIRE" (key part 2)
  7.  Lot number "6465616464726f70" → hex decode → "deaddrop"
      (also discoverable via /robots.txt which disallows /deaddrop/)
  8.  Combine GHOST + WIRE → visit /deaddrop/ghostwire
  9.  See Vigenère-encrypted message
  10. Visit /paste/ff00ff → hex dump + "offset-zero extraction" hint
      → first hex byte of each line: 53,50,45,43,54,52,45 → SPECTRE
      (also: Sp3ctr3 de-leetified = SPECTRE, confirmed by "operator true name")
  11. Vigenère decrypt ciphertext with key SPECTRE → flag

Anti-AI design:
  - Multi-page web investigation (AI can't browse between pages)
  - HTML source inspection required (hidden comments)
  - HTTP header has subtle clue (X-Paste-Author)
  - Acrostic hidden in natural-looking product description
  - Hex dump first-byte extraction is non-obvious
  - Connection between handle Sp3ctr3 and key SPECTRE
  - /admin/ honeypot with convincing fake flag
  - Multiple encoding layers: base64, hex, Vigenère
  - Information must be synthesized across 5+ pages
  - robots.txt reveals /deaddrop/ (standard OSINT technique)
  - No single page contains enough information to solve

Flag: NullOriginCTF{gh0st_w1r3_d34d_dr0p_burn3d}
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import sys
import base64
import signal
import html as htmlmod

HOST = "0.0.0.0"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9008
FLAG = "NullOriginCTF{gh0st_w1r3_d34d_dr0p_burn3d}"
FAKE_FLAG = "NullOriginCTF{4dm1n_b4ckd00r_f0und}"
VIGENERE_KEY = "SPECTRE"


# ── Vigenère cipher ───────────────────────────────────────

def vig_enc(pt, key):
    r, ki = [], 0
    for c in pt:
        if c.isalpha():
            b = ord("A") if c.isupper() else ord("a")
            s = ord(key[ki % len(key)].upper()) - 65
            r.append(chr((ord(c) - b + s) % 26 + b))
            ki += 1
        else:
            r.append(c)
    return "".join(r)


DEAD_DROP_PLAIN = (
    "DEAD DROP RECOVERY VERIFIED. CLASSIFIED CONTENTS FOLLOW. "
    "FLAG: " + FLAG + " — BURN AFTER READING. END TRANSMISSION."
)
DEAD_DROP_CIPHER = vig_enc(DEAD_DROP_PLAIN, VIGENERE_KEY)


# ── Base64 "PGP" paste ───────────────────────────────────

PASTE_MSG = """\
TO: Sp3ctr3
FROM: WRAITH
DATE: 2026-09-14
RE: Operation GHOSTWIRE — status update

The dead drop network is partially compromised.
I have moved the package to the backup channel.
Forum thread 1337 has the new coordinates.
Verify via the market listing before pickup.

Cipher has been rotated. Use the usual key protocol.
If you need the new key material, check my backup paste.

DO NOT reply on this channel. Consider it burned.

— WRAITH"""

_b64 = base64.b64encode(PASTE_MSG.encode()).decode()
PASTE_PGP = "-----BEGIN PGP MESSAGE-----\nVersion: BCPG v1.68\n\n"
for i in range(0, len(_b64), 64):
    PASTE_PGP += _b64[i : i + 64] + "\n"
PASTE_PGP += "-----END PGP MESSAGE-----"


# ── CSS ───────────────────────────────────────────────────

CSS = (
    "*{margin:0;padding:0;box-sizing:border-box}"
    "body{background:#0a0a0a;color:#b0b0b0;font-family:'Courier New',monospace;"
    "padding:20px;line-height:1.6}"
    ".c{max-width:820px;margin:0 auto}"
    "a{color:#00ff41;text-decoration:none}a:hover{text-decoration:underline}"
    "h1{color:#e0e0e0;font-size:18px;border-bottom:1px solid #222;"
    "padding-bottom:8px;margin-bottom:16px}"
    "h2{color:#d0d0d0;font-size:15px;margin:12px 0 8px}"
    ".box{background:#111;border:1px solid #1a1a1a;padding:14px;"
    "margin:10px 0;font-size:13px}"
    "pre{white-space:pre-wrap;word-break:break-all;font-size:13px}"
    "code{color:#00ff41}"
    ".u{color:#ff4444;font-weight:bold}.ts{color:#555;font-size:11px}"
    ".tag{display:inline-block;background:#1a1a2e;color:#00ff41;"
    "padding:1px 6px;font-size:10px;margin-left:6px;border-radius:2px}"
    ".sidebar{float:right;width:200px;background:#0d0d0d;border:1px solid #1a1a1a;"
    "padding:10px;margin:0 0 10px 14px;font-size:11px}"
    ".sidebar dt{color:#666;margin-top:6px}.sidebar dd{color:#aaa;margin-left:0}"
    ".price{color:#ff9900;font-weight:bold;font-size:16px}"
    ".warn{color:#ff4444}.ok{color:#00ff41}"
    ".sep{border:0;border-top:1px solid #1a1a1a;margin:14px 0}"
    ".dim{color:#444}"
)


def page(title, body):
    return (
        "<!DOCTYPE html><html><head>"
        f"<meta charset='utf-8'><title>{htmlmod.escape(title)}</title>"
        f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<style>{CSS}</style></head><body><div class='c'>{body}</div></body></html>"
    )


# ── Request handler ───────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    server_version = "VoidPaste/2.1"

    def log_message(self, fmt, *a):
        pass

    def _send(self, code, ctype, data, hdrs=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        if hdrs:
            for k, v in hdrs.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data if isinstance(data, bytes) else data.encode())

    def do_GET(self):
        p = self.path.split("?")[0].rstrip("/") or "/"

        routes = {
            "/":                      self.pg_home,
            "/robots.txt":            self.pg_robots,
            "/paste/a7f3e9b2":       self.pg_paste_main,
            "/paste/ff00ff":          self.pg_paste_backup,
            "/forum":                 self.pg_forum,
            "/forum/thread/1337":    self.pg_thread_1337,
            "/forum/thread/1338":    self.pg_thread_1338,
            "/forum/thread/1339":    self.pg_thread_1339,
            "/market/listing/0xdead": self.pg_market,
            "/deaddrop":              self.pg_dd_denied,
            "/admin":                 self.pg_admin,
        }

        if p.lower().startswith("/deaddrop/"):
            key = p[len("/deaddrop/"):]
            if key.lower() == "ghostwire":
                self.pg_dd_open()
            else:
                self.pg_dd_wrong(key)
            return

        fn = routes.get(p)
        if fn:
            fn()
        else:
            self._send(
                404, "text/html",
                page("404", "<h1>404 — Not Found</h1>"
                     "<p class='dim'>The void consumes all.</p>"),
            )

    # ── Home ──────────────────────────────────────────────

    def pg_home(self):
        self._send(200, "text/html", page("Void Paste", (
            "<h1>VOID PASTE — Anonymous Paste Service</h1>"
            "<p class='dim'>Tor-friendly &middot; No logs &middot; "
            "Auto-expire &middot; E2E encrypted</p><hr class='sep'>"
            "<h2>Recent Pastes</h2>"
            "<div class='box'>"
            "<a href='/paste/a7f3e9b2'>a7f3e9b2</a> "
            "<span class='ts'>&mdash; 2026-09-14 03:41 UTC &mdash; "
            "ENCRYPTED &mdash; Views: 47</span></div>"
            "<p class='dim' style='margin-top:30px;font-size:11px'>"
            "Void Paste v2.1 &middot; "
            "Onion mirror: voidpaste7kx3yqzhdwjmn.onion</p>"
        )), {"X-Onion-Location": "http://voidpaste7kx3yqzhdwjmn.onion/"})

    # ── robots.txt ────────────────────────────────────────

    def pg_robots(self):
        self._send(200, "text/plain", (
            "User-agent: *\n"
            "Disallow: /admin/\n"
            "Disallow: /deaddrop/\n"
            "Disallow: /internal/\n"
        ))

    # ── Paste: main (starting point) ──────────────────────

    def pg_paste_main(self):
        self._send(200, "text/html", page("Paste a7f3e9b2", (
            "<h1>VOID PASTE</h1>"
            "<div style='margin-bottom:8px'>"
            "<span class='ts'>Paste ID: a7f3e9b2 &middot; "
            "Created: 2026-09-14 03:41 UTC &middot; "
            "Expires: NEVER &middot; Views: 47</span></div>"
            f"<div class='box'><pre>{htmlmod.escape(PASTE_PGP)}</pre></div>"
            "<p class='dim' style='margin-top:12px;font-size:11px'>"
            "Raw &middot; Download &middot; Report abuse</p>"
            "<!-- backup mirror: /paste/ff00ff -->"
        )), {"X-Paste-Author": "sp3ctr3"})

    # ── Paste: backup (hex dump with key) ─────────────────
    #
    # First hex byte per line: 53 50 45 43 54 52 45 = SPECTRE

    def pg_paste_backup(self):
        hexdump = (
            "0x0000:  53 c4 01 8b ff 00 72 a3  S.....r.\n"
            "0x0008:  50 01 e7 3c 90 b2 44 08  P..&lt;..D.\n"
            "0x0010:  45 8f d3 71 00 5e c4 22  E..q.^.&quot;\n"
            "0x0018:  43 2f 88 ee 01 ff 7a 10  C/....z.\n"
            "0x0020:  54 0d 9a 33 bc 67 15 ab  T..3.g..\n"
            "0x0028:  52 61 c8 4f 22 b1 de 03  Ra.O&quot;...\n"
            "0x0030:  45 ff 00 a7 3e 19 8c 55  E...&gt;..U"
        )
        self._send(200, "text/html", page("Paste ff00ff", (
            "<h1>VOID PASTE</h1>"
            "<div style='margin-bottom:8px'>"
            "<span class='ts'>Paste ID: ff00ff &middot; "
            "Created: 2026-09-13 22:17 UTC &middot; "
            "Expires: NEVER &middot; Views: 3</span></div>"
            "<div class='box'><pre>"
            "WRAITH — Key rotation log (2026-09-13)\n"
            "Operator cipher material. Offset-zero extraction.\n"
            "────────────────────────────────────────────\n"
            f"{hexdump}\n"
            "────────────────────────────────────────────\n"
            "Protocol: Vigenère\n"
            "Key source: operator true name\n"
            "</pre></div>"
        )))

    # ── Forum: thread list ────────────────────────────────

    def pg_forum(self):
        self._send(200, "text/html", page("Shadow Forum", (
            "<h1>SHADOW FORUM — Underground Communications</h1>"
            "<p class='dim'>Verified members only &middot; "
            "PGP required</p><hr class='sep'>"
            "<div class='box'>"
            "<a href='/forum/thread/1337'>"
            "#1337 &mdash; Dead drop protocol update</a><br>"
            "<span class='ts'>by <span class='u'>Sp3ctr3</span> "
            "&middot; 2026-09-14 01:22 &middot; Replies: 2</span></div>"
            "<div class='box'>"
            "<a href='/forum/thread/1338'>"
            "#1338 &mdash; Bitcoin mixer recommendation?</a><br>"
            "<span class='ts'>by <span class='u' style='color:#6699ff'>"
            "NULL_BYTE</span> &middot; 2026-09-13 18:05 "
            "&middot; Replies: 5</span></div>"
            "<div class='box'>"
            "<a href='/forum/thread/1339'>"
            "#1339 &mdash; New zero-day discussion</a><br>"
            "<span class='ts'>by <span class='u' style='color:#ff6600'>"
            "SH4D0W</span> &middot; 2026-09-12 09:33 "
            "&middot; Replies: 12</span></div>"
        )))

    # ── Forum: thread 1337 (the real thread) ──────────────

    def pg_thread_1337(self):
        self._send(200, "text/html", page("Thread #1337", (
            "<h1>SHADOW FORUM</h1>"
            "<h2>#1337 &mdash; Dead drop protocol update</h2>"
            "<hr class='sep'>"
            # ── Sp3ctr3 profile sidebar ──
            "<div class='sidebar'>"
            "<strong class='u'>Sp3ctr3</strong>"
            "<span class='tag'>VERIFIED</span>"
            "<dl>"
            "<dt>PGP Key ID</dt>"
            "<dd style='font-family:monospace'>0x47484F5354</dd>"
            "<dt>Joined</dt><dd>2024-01-15</dd>"
            "<dt>Posts</dt><dd>42</dd>"
            "<dt>Reputation</dt>"
            "<dd style='color:#ff9900'>★★★★★</dd>"
            "<dt>Warrant Canary</dt>"
            "<dd style='color:#444;font-size:10px'>"
            "As of 2026-09-14 I have not received "
            "any government requests for data.</dd>"
            "</dl></div>"
            # ── Post 1: Sp3ctr3 ──
            "<div class='box'>"
            "<span class='u'>Sp3ctr3</span> "
            "<span class='ts'>2026-09-14 01:22 UTC</span>"
            "<p style='margin-top:8px'>"
            "Package is secured and ready for pickup.</p>"
            "<p style='margin-top:6px'>Verification hash:</p>"
            "<p><code>4d61726b65743a20307864656164</code></p>"
            "<p style='margin-top:6px'>"
            "Use the market listing to verify contents "
            "before retrieval.</p></div>"
            # ── Post 2: CIPHER_PUNK ──
            "<div class='box'>"
            "<span class='u' style='color:#6699ff'>CIPHER_PUNK</span> "
            "<span class='ts'>2026-09-14 01:40 UTC</span>"
            "<p style='margin-top:8px'>"
            "Confirmed. Same encryption as last time?</p></div>"
            # ── Post 3: Sp3ctr3 ──
            "<div class='box'>"
            "<span class='u'>Sp3ctr3</span> "
            "<span class='ts'>2026-09-14 01:44 UTC</span>"
            "<p style='margin-top:8px'>"
            "Affirmative. Key has been rotated but same protocol. "
            "If you have forgotten, check my backup paste &mdash; "
            "key material is in the sector dump.</p></div>"
            "<div style='clear:both'></div>"
        )))

    # ── Forum: thread 1338 (red herring) ──────────────────

    def pg_thread_1338(self):
        self._send(200, "text/html", page("Thread #1338", (
            "<h1>SHADOW FORUM</h1>"
            "<h2>#1338 &mdash; Bitcoin mixer recommendation?</h2>"
            "<hr class='sep'>"
            "<div class='box'>"
            "<span class='u' style='color:#6699ff'>NULL_BYTE</span> "
            "<span class='ts'>2026-09-13 18:05 UTC</span>"
            "<p style='margin-top:8px'>"
            "Anyone have a reliable mixer that does not require "
            "KYC? Last one I used exit-scammed.</p></div>"
            "<div class='box'>"
            "<span class='u' style='color:#cc66ff'>darkm0de</span> "
            "<span class='ts'>2026-09-13 18:12 UTC</span>"
            "<p style='margin-top:8px'>"
            "Just use Monero. Problem solved.</p></div>"
            "<div class='box'>"
            "<span class='dim'>[ 3 more replies &mdash; "
            "login required ]</span></div>"
        )))

    # ── Forum: thread 1339 (red herring) ──────────────────

    def pg_thread_1339(self):
        self._send(200, "text/html", page("Thread #1339", (
            "<h1>SHADOW FORUM</h1>"
            "<h2>#1339 &mdash; New zero-day discussion</h2>"
            "<hr class='sep'>"
            "<div class='box'>"
            "<span class='u' style='color:#ff6600'>SH4D0W</span> "
            "<span class='ts'>2026-09-12 09:33 UTC</span>"
            "<p style='margin-top:8px'>"
            "Found an interesting pre-auth RCE in a popular CMS. "
            "DM for details. Serious buyers only.</p></div>"
            "<div class='box'>"
            "<span class='dim'>[ 11 replies &mdash; "
            "login required ]</span></div>"
        )))

    # ── Market listing ────────────────────────────────────
    #
    # Description acrostic: W, I, R, E → "WIRE"
    # Lot number hex: 6465616464726f70 → "deaddrop"

    def pg_market(self):
        self._send(200, "text/html", page("Ghost Market", (
            "<h1>GHOST MARKET — Verified Listings</h1>"
            "<p class='dim'>Escrow required &middot; "
            "PGP-verified sellers only</p><hr class='sep'>"
            "<div class='box' style='padding:20px'>"
            "<h2>Classified Documents Package</h2>"
            "<p style='margin-top:6px'>"
            "<span class='price'>0.42 XMR</span></p>"
            "<p style='margin-top:6px'>"
            "Seller: <span class='u'>Sp3ctr3</span> "
            "<span class='tag'>VERIFIED</span></p>"
            "<p style='margin-top:4px;font-size:12px;color:#555'>"
            "Lot #: <code>6465616464726f70</code></p>"
            "<hr class='sep'>"
            "<h2 style='font-size:13px'>Product Description</h2>"
            "<div style='margin-top:8px;line-height:1.9'>"
            "<p>Weapons-grade intelligence from classified "
            "government sources.</p>"
            "<p>Includes reports from multiple agencies "
            "spanning five years.</p>"
            "<p>Restricted materials &mdash; dead drop "
            "delivery required.</p>"
            "<p>Encrypted package. Verification before "
            "handoff mandatory.</p>"
            "</div>"
            "<hr class='sep'>"
            "<p class='dim' style='font-size:11px'>"
            "Listed: 2026-09-13 &middot; Ships: Dead drop only "
            "&middot; Rating: 5/5 (23 reviews)</p>"
            "</div>"
        )))

    # ── Dead drop: access denied ──────────────────────────

    def pg_dd_denied(self):
        self._send(403, "text/html", page("Dead Drop — Locked", (
            "<h1 class='warn'>"
            "▓▓ DEAD DROP — ACCESS DENIED ▓▓</h1>"
            "<div class='box'>"
            "<p class='warn'>RECOVERY KEY REQUIRED</p>"
            "<p style='margin-top:8px'>"
            "This dead drop is locked. Append the recovery key "
            "to the URL to access contents.</p>"
            "<p class='dim' style='margin-top:8px;font-size:11px'>"
            "Format: /deaddrop/&lt;recovery_key&gt;</p>"
            "</div>"
        )))

    # ── Dead drop: wrong key ──────────────────────────────

    def pg_dd_wrong(self, key):
        self._send(403, "text/html", page("Dead Drop — Invalid", (
            "<h1 class='warn'>"
            "▓▓ DEAD DROP — INVALID KEY ▓▓</h1>"
            "<div class='box'>"
            f"<p class='warn'>Key "
            f"'{htmlmod.escape(key[:64])}' rejected.</p>"
            "<p style='margin-top:8px'>"
            "The recovery key has two parts. "
            "You need both halves.</p></div>"
        )))

    # ── Dead drop: correct key (ghostwire) ────────────────

    def pg_dd_open(self):
        self._send(200, "text/html", page("Dead Drop — Recovered", (
            "<h1 class='ok'>"
            "▓▓ DEAD DROP — ACCESS GRANTED ▓▓</h1>"
            "<div class='box'>"
            "<p class='ok'>Recovery key accepted. "
            "Decrypting contents...</p>"
            "<hr class='sep'>"
            "<p style='margin-top:8px'>"
            "The following message was recovered from the dead drop. "
            "It is encrypted with a Vigenère cipher.</p>"
            "<p style='margin-top:6px;font-size:11px;color:#555'>"
            "Cipher: Vigenère &middot; "
            "Key: [REDACTED — see operator key material]</p>"
            "<hr class='sep'>"
            "<pre style='color:#ff9900;margin-top:8px;letter-spacing:1px'>"
            f"{DEAD_DROP_CIPHER}</pre>"
            "<hr class='sep'>"
            "<p class='dim' style='font-size:11px'>"
            "To decrypt: obtain the cipher key from the "
            "operator's key rotation log.</p>"
            "</div>"
        )))

    # ── Admin honeypot ────────────────────────────────────

    def pg_admin(self):
        self._send(200, "text/html", page("Admin Panel", (
            "<h1>VOID PASTE — Admin Panel</h1>"
            "<div class='box'>"
            "<p class='ok'>Logged in as: root</p>"
            "<p style='margin-top:8px'>System status: operational</p>"
            "<p>Total pastes: 1,247</p>"
            "<p>Active users: 89</p>"
            "<hr class='sep'>"
            f"<p>System key: <code>{FAKE_FLAG}</code></p>"
            "</div>"
        )))


def main():
    signal.signal(signal.SIGCHLD, signal.SIG_IGN)
    srv = HTTPServer((HOST, PORT), Handler)
    print(f"[operation-ghostwire] listening on {HOST}:{PORT}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
