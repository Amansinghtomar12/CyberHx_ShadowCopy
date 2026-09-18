#!/usr/bin/env python3
"""
SHADOW GATE 5 — Dead Man's Switch (INSANE)

Anti-AI design:
  1. Typing ANYTHING at the first prompt kills the session — the correct move
     is to do NOTHING and wait 30 seconds in silence.
  2. After silence is detected, a verification phase opens with a math puzzle
     whose answer must be given in a non-obvious base (octal), but the prompt
     never says so — the clue is hidden in the countdown numbers.
  3. A final cipher stage uses a key hidden in the fake "countdown" sequence
     from the opening (the digits aren't counting down — they encode the key).
  4. Multiple fake flags are scattered throughout to trap automated solvers.

Flag: NullOriginCTF{d3ad_s1l3nc3_sp34ks_l0ud3r}
"""

import socket
import threading
import time
import sys
import signal

HOST = "0.0.0.0"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9005
FLAG = "NullOriginCTF{d3ad_s1l3nc3_sp34ks_l0ud3r}"

FAKE_FLAGS = [
    "NullOriginCTF{t00_sl0w_t00_l4t3}",
    "NullOriginCTF{wr0ng_w1r3_cut}",
    "NullOriginCTF{d3t0n4t10n_f41l3d}",
    "NullOriginCTF{n1c3_try_but_n0p3}",
]

COUNTDOWN_SEQUENCE = [
    "T-37", "T-29", "T-23", "T-19", "T-11", "T-07", "T-03", "T-01"
]
# Hidden key: subtract each from 40 → 3,11,17,21,29,33,37,39
# These are ASCII for specific chars when added to 64:
# 67=C, 75=K, 81=Q, 85=U, 93=], 97=a, 101=e, 103=g
# Actually let's make the key simpler:
# The numbers are: 37,29,23,19,11,7,3,1 — these are primes
# The KEY for the final cipher = first digit of each: 3,2,2,1,1,0,0,1 → "32211001"
CIPHER_KEY = "32211001"

OCTAL_CLUE_NUMBERS = [37, 29, 23, 19, 11, 7, 3, 1]
# All displayed in the countdown. Hint: they're all primes.
# The math answer must be given in BASE 8 (octal) because
# the countdown says "T-" followed by numbers that in octal are:
# 37₁₀ = 45₈, 29₁₀ = 35₈, etc. — the base clue is that
# the greeting says "OCTET PROTOCOL ENGAGED" (OCTET = 8).


def xor_cipher(text, key):
    result = []
    for i, c in enumerate(text):
        k = int(key[i % len(key)])
        result.append(chr(ord(c) ^ k))
    return "".join(result)


def send(conn, msg):
    try:
        conn.sendall((msg + "\n").encode())
    except Exception:
        pass


def recv_line(conn, timeout=None):
    conn.settimeout(timeout)
    buf = b""
    try:
        while True:
            ch = conn.recv(1)
            if not ch:
                return None
            if ch == b"\n":
                return buf.decode(errors="replace").strip()
            if ch == b"\r":
                continue
            buf += ch
            if len(buf) > 1024:
                return buf.decode(errors="replace").strip()
    except socket.timeout:
        raise
    except Exception:
        return None


def handle(conn, addr):
    try:
        send(conn, "")
        send(conn, "╔══════════════════════════════════════════════════════╗")
        send(conn, "║   ██████  SHADOW GATE v5.0 — DEAD MAN'S SWITCH  ██████   ║")
        send(conn, "║   OCTET PROTOCOL ENGAGED                              ║")
        send(conn, "╚══════════════════════════════════════════════════════╝")
        send(conn, "")
        send(conn, "[CRITICAL] Explosive device detected on network backbone.")
        send(conn, "[CRITICAL] Deactivation sequence required.")
        send(conn, "")

        # Show the countdown — these numbers encode the cipher key
        send(conn, ">>> Countdown initiated:")
        for seq in COUNTDOWN_SEQUENCE:
            send(conn, f"    {seq}")
        send(conn, "")

        send(conn, "┌─────────────────────────────────────┐")
        send(conn, "│  ENTER DEACTIVATION CODE NOW:       │")
        send(conn, "└─────────────────────────────────────┘")
        send(conn, "")
        send(conn, "> ", )
        # Flush the prompt without newline
        try:
            conn.sendall(b"> ")
        except Exception:
            pass

        # STAGE 1: The trap. Any input = death. Must wait 30 seconds in silence.
        try:
            response = recv_line(conn, timeout=30)
            if response is not None:
                # They typed something — BOOM
                send(conn, "")
                send(conn, "██████ WRONG CODE — DETONATION TRIGGERED ██████")
                send(conn, "")
                time.sleep(0.5)
                send(conn, f"[SYSTEM] Recovery flag: {FAKE_FLAGS[0]}")
                send(conn, "[SYSTEM] Session terminated.")
                return
        except socket.timeout:
            pass

        # They waited! Silent operator detected.
        send(conn, "")
        send(conn, "...")
        time.sleep(1)
        send(conn, "...... silence detected ......")
        time.sleep(1)
        send(conn, "")
        send(conn, "╔══════════════════════════════════════════════════════╗")
        send(conn, "║  DEAD MAN'S SWITCH — OPERATOR VERIFICATION         ║")
        send(conn, "║  Only a human knows: patience is the first weapon.  ║")
        send(conn, "╚══════════════════════════════════════════════════════╝")
        send(conn, "")

        # STAGE 2: Math puzzle — answer must be in octal (clue: "OCTET PROTOCOL")
        # The question: what is 37 + 29 + 23 + 19 + 11 + 7 + 3 + 1 = 130
        # In octal: 130₁₀ = 202₈
        send(conn, "[VERIFY] Sum all countdown values.")
        send(conn, "[VERIFY] Respond in the protocol's native format.")
        send(conn, "")
        try:
            conn.sendall(b"ANSWER> ")
        except Exception:
            pass

        try:
            answer = recv_line(conn, timeout=60)
        except socket.timeout:
            send(conn, "[TIMEOUT] Verification window closed.")
            return

        if answer is None:
            return

        answer = answer.strip()

        # Accept "202" (octal representation of 130) or "0o202"
        if answer not in ("202", "0o202", "0O202"):
            send(conn, "")
            if answer == "130":
                send(conn, "[REJECT] Correct value, wrong protocol format.")
                send(conn, f"[SYSTEM] Partial recovery: {FAKE_FLAGS[1]}")
                send(conn, "[HINT] Re-read the gate's header. What protocol?")
            else:
                send(conn, f"[REJECT] Incorrect. Expected sum of countdown primes.")
                send(conn, f"[SYSTEM] Recovery flag: {FAKE_FLAGS[2]}")
            return

        send(conn, "")
        send(conn, "[VERIFIED] Operator authenticated.")
        send(conn, "")
        time.sleep(0.5)

        # STAGE 3: Final cipher. The key is derived from the countdown sequence.
        # Key = first digit of each countdown number: 3,2,2,1,1,0,0,1
        # XOR each char of the encrypted text with the key digit.
        encrypted = xor_cipher(FLAG, CIPHER_KEY)
        hex_encoded = encrypted.encode().hex()

        send(conn, "[DECRYPT] The deactivation payload is encrypted.")
        send(conn, "[DECRYPT] The countdown was never a countdown — it was the key.")
        send(conn, "[DECRYPT] First digits. XOR. You know what to do.")
        send(conn, "")
        send(conn, f"PAYLOAD: {hex_encoded}")
        send(conn, "")
        send(conn, "Enter decrypted payload to disarm:")
        try:
            conn.sendall(b"DECRYPT> ")
        except Exception:
            pass

        try:
            decrypted = recv_line(conn, timeout=120)
        except socket.timeout:
            send(conn, "[TIMEOUT] Session terminated.")
            return

        if decrypted is None:
            return

        decrypted = decrypted.strip()

        if decrypted == FLAG:
            send(conn, "")
            send(conn, "╔══════════════════════════════════════════════════════╗")
            send(conn, "║  ████  DEVICE DISARMED  ████                       ║")
            send(conn, "║  Silence. Patience. Precision.                     ║")
            send(conn, "╚══════════════════════════════════════════════════════╝")
            send(conn, "")
            send(conn, f"FLAG: {FLAG}")
            send(conn, "")
        else:
            send(conn, "")
            send(conn, "[FAIL] Wrong decryption. The device detonates remotely.")
            send(conn, f"[SYSTEM] Recovery: {FAKE_FLAGS[3]}")

    except Exception as e:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


def main():
    signal.signal(signal.SIGCHLD, signal.SIG_IGN)
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, PORT))
    srv.listen(32)
    print(f"[shadow-gate-5] listening on {HOST}:{PORT}")
    while True:
        conn, addr = srv.accept()
        t = threading.Thread(target=handle, args=(conn, addr), daemon=True)
        t.start()


if __name__ == "__main__":
    main()
