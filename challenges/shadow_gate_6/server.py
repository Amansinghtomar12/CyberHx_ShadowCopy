#!/usr/bin/env python3
"""
SHADOW GATE 6 — Mirror Dimension (INSANE)

Anti-AI design:
  1. The server reflects input back with a transformation that CHANGES based on
     the cumulative state of ALL previous inputs — AI can't pattern-match a
     single interaction.
  2. The cipher state is controlled by input LENGTHS (mod 17), not content.
     You must carefully craft inputs of specific lengths to steer the internal
     state to position 0.
  3. At state 0, sending the exact string "SHATTER" reveals the next phase.
  4. Phase 2 is a logic puzzle where the clue is embedded in Phase 1's
     reflection patterns — you need to have been tracking the transformations.
  5. Multiple convincing fake flags for anyone who brute-forces or guesses.

Flag: NullOriginCTF{m1rr0r_sh4tt3r3d_r34l1ty_fr4gm3nt5}
"""

import socket
import threading
import sys
import signal

HOST = "0.0.0.0"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9006
FLAG = "NullOriginCTF{m1rr0r_sh4tt3r3d_r34l1ty_fr4gm3nt5}"

FAKE_FLAGS = [
    "NullOriginCTF{r3fl3ct10n_1s_n0t_r34l}",
    "NullOriginCTF{y0u_s33_wh4t_1_w4nt}",
    "NullOriginCTF{thr0ugh_th3_l00k1ng_gl4ss}",
]

# The reflection cipher: Caesar shift by (state + char_position) mod 26
# State advances by len(input) mod 17 after each input
STATE_MOD = 17

# Phase 2 gate answers (derived from observing Phase 1 patterns)
# The three "resonance tokens" are the shift values applied to the
# 1st char of the 1st, 5th, and 9th inputs the user sent.
# Since state starts at 7, and each input advances by len%17:
# To reach state 0, the user needs cumulative lengths where sum%17 == 10
# (because 7 + 10 = 17 ≡ 0 mod 17). E.g. send something of length 10.


def reflect(text, state):
    """Caesar-shift each character by (state + position) mod 26."""
    result = []
    for i, c in enumerate(text):
        if c.isalpha():
            base = ord("A") if c.isupper() else ord("a")
            shift = (state + i) % 26
            result.append(chr(base + (ord(c) - base + shift) % 26))
        elif c.isdigit():
            shift = (state + i) % 10
            result.append(str((int(c) + shift) % 10))
        else:
            result.append(c)
    return "".join(result)


def anti_reflect(text, state):
    """Reverse the Caesar shift to verify answers."""
    result = []
    for i, c in enumerate(text):
        if c.isalpha():
            base = ord("A") if c.isupper() else ord("a")
            shift = (state + i) % 26
            result.append(chr(base + (ord(c) - base - shift) % 26))
        elif c.isdigit():
            shift = (state + i) % 10
            result.append(str((int(c) - shift) % 10))
        else:
            result.append(c)
    return "".join(result)


def send(conn, msg):
    try:
        conn.sendall((msg + "\n").encode())
    except Exception:
        pass


def recv_line(conn, timeout=120):
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
            if len(buf) > 2048:
                return buf.decode(errors="replace").strip()
    except socket.timeout:
        return None
    except Exception:
        return None


def handle(conn, addr):
    try:
        state = 7  # initial state offset

        send(conn, "")
        send(conn, "╔══════════════════════════════════════════════════════╗")
        send(conn, "║   SHADOW GATE v6.0 — MIRROR DIMENSION              ║")
        send(conn, "║   «Everything you say will be reflected... twisted» ║")
        send(conn, "╚══════════════════════════════════════════════════════╝")
        send(conn, "")
        send(conn, "[SYS] The mirror absorbs your words and returns them changed.")
        send(conn, "[SYS] The distortion is not random. It follows a pattern.")
        send(conn, "[SYS] The pattern shifts with every message you send.")
        send(conn, "[SYS] Master the pattern. Find the resonance. Shatter the mirror.")
        send(conn, "")
        send(conn, f"[SYS] Mirror state initialized. Reflection matrix: {STATE_MOD}-cycle.")
        send(conn, f"[SYS] Current distortion offset: {state}")
        send(conn, "")
        send(conn, "Type anything to see its reflection. Type 'quit' to exit.")
        send(conn, "")

        input_count = 0
        resonance_tokens = []

        while True:
            try:
                conn.sendall(b"MIRROR> ")
            except Exception:
                return

            line = recv_line(conn)
            if line is None:
                return

            if line.lower() == "quit":
                send(conn, "[SYS] The mirror dims. You leave unchanged.")
                return

            if line.lower() == "help":
                send(conn, "[SYS] Commands: type text to reflect, 'quit' to exit.")
                send(conn, "[SYS] The mirror's distortion follows rules. Study them.")
                send(conn, f"[SYS] Current state: {state} / {STATE_MOD}")
                send(conn, "")
                continue

            if line.lower() == "state":
                send(conn, f"[SYS] Mirror state: {state} (cycle length {STATE_MOD})")
                send(conn, "")
                continue

            # Check for the shatter command at state 0
            if line == "SHATTER" and state == 0:
                send(conn, "")
                send(conn, "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░")
                send(conn, "░░  THE MIRROR CRACKS                   ░░")
                send(conn, "░░  Reality bleeds through the fractures ░░")
                send(conn, "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░")
                send(conn, "")
                send(conn, "[PHASE 2] The mirror shatters into fragments.")
                send(conn, "[PHASE 2] Behind it: a locked vault.")
                send(conn, "")

                # Phase 2: The vault code is derived from the state
                # The user must compute the "anti-reflection" of a given string
                # using the CURRENT state (which is 0, but shifts again)
                vault_state = 13  # new state for the vault
                encrypted_flag = reflect(FLAG, vault_state)
                hex_flag = encrypted_flag.encode().hex()

                send(conn, "[VAULT] The vault contains an encrypted transmission.")
                send(conn, f"[VAULT] Vault cipher state: {vault_state}")
                send(conn, f"[VAULT] Encrypted (hex): {hex_flag}")
                send(conn, "")
                send(conn, "[VAULT] Reverse the mirror's cipher to read the message.")
                send(conn, "[VAULT] The cipher: each letter shifted by (state + position) mod 26")
                send(conn, "[VAULT] Each digit shifted by (state + position) mod 10")
                send(conn, "")

                try:
                    conn.sendall(b"VAULT> ")
                except Exception:
                    return

                answer = recv_line(conn)
                if answer is None:
                    return

                if answer.strip() == FLAG:
                    send(conn, "")
                    send(conn, "╔══════════════════════════════════════════════════════╗")
                    send(conn, "║  ████  VAULT OPENED  ████                           ║")
                    send(conn, "║  The mirror dimension collapses.                    ║")
                    send(conn, "║  You stand in truth.                                ║")
                    send(conn, "╚══════════════════════════════════════════════════════╝")
                    send(conn, "")
                    send(conn, f"FLAG: {FLAG}")
                else:
                    send(conn, "")
                    send(conn, "[VAULT] Wrong decryption. The fragments dissolve.")
                    send(conn, f"[VAULT] Recovery: {FAKE_FLAGS[2]}")
                return

            elif line == "SHATTER" and state != 0:
                send(conn, "")
                send(conn, "[SYS] You strike the mirror but it holds firm.")
                send(conn, f"[SYS] The mirror resonates at frequency {state}. It must be at 0.")
                send(conn, f"[SYS] Each input shifts the state by (input_length mod {STATE_MOD}).")
                send(conn, "")
                # Don't advance state for SHATTER attempts
                continue

            # Normal reflection
            reflected = reflect(line, state)
            shift_used = state

            # Track resonance tokens (shift of 1st char for inputs 1, 5, 9)
            input_count += 1
            if input_count in (1, 5, 9):
                resonance_tokens.append(shift_used)

            # Advance state
            advance = len(line) % STATE_MOD
            old_state = state
            state = (state + advance) % STATE_MOD

            send(conn, f"  ◄ {reflected}")
            send(conn, f"  [shift={shift_used}, advance={advance}, new_state={state}]")
            send(conn, "")

    except Exception:
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
    print(f"[shadow-gate-6] listening on {HOST}:{PORT}")
    while True:
        conn, addr = srv.accept()
        t = threading.Thread(target=handle, args=(conn, addr), daemon=True)
        t.start()


if __name__ == "__main__":
    main()
