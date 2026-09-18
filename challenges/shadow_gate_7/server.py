#!/usr/bin/env python3
"""
SHADOW GATE 7 — The Void Stares Back (INSANE)

Anti-AI design:
  1. The obvious path (admin/admin login) is a honeypot with convincing fake
     flags and a fake admin panel — AI will confidently report success.
  2. The REAL entry requires sending a raw null byte (\\x00) at the username
     prompt, which drops you into a hidden debug console. No hint is given.
  3. The debug console requires executing commands in a specific ORDER:
     'status' → 'memdump' → 'decrypt' (with a key from memdump).
  4. The decrypt output is a logic circuit puzzle. The inputs to the circuit
     are derived from the ASCII values of the server banner characters.
  5. Even if you get to the decrypt stage, the logic puzzle requires careful
     multi-step boolean evaluation that AI frequently miscalculates.
  6. There's a secondary hidden path: sending "VOID" as both username AND
     password reveals a riddle whose answer is part of the decrypt key.

Flag: NullOriginCTF{v01d_g4z3s_b4ck_thr0ugh_null}
"""

import socket
import threading
import sys
import signal

HOST = "0.0.0.0"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9007
FLAG = "NullOriginCTF{v01d_g4z3s_b4ck_thr0ugh_null}"

FAKE_FLAGS = [
    "NullOriginCTF{4dm1n_p4n3l_4cc3ss_gr4nt3d}",
    "NullOriginCTF{syst3m_c0mpr0m1s3d_fully}",
    "NullOriginCTF{v01d_wh1sp3rs_l13s}",
    "NullOriginCTF{d3bug_m0d3_unl0ck3d}",
]

BANNER_KEY_WORD = "VOIDGATE"  # used to derive logic circuit inputs
# ASCII: V=86, O=79, I=73, D=68, G=71, A=65, T=84, E=69
# Binary LSB of each: 0,1,1,0,1,1,0,1 → these are the 8 circuit inputs

MEMDUMP_KEY = "7f3a9b"  # hidden in the hex dump output


def send(conn, msg):
    try:
        conn.sendall((msg + "\n").encode())
    except Exception:
        pass


def recv_raw(conn, timeout=120):
    """Read raw bytes until newline, preserving null bytes."""
    conn.settimeout(timeout)
    buf = b""
    try:
        while True:
            ch = conn.recv(1)
            if not ch:
                return None
            if ch == b"\n":
                return buf
            if ch == b"\r":
                continue
            buf += ch
            if len(buf) > 2048:
                return buf
    except socket.timeout:
        return None
    except Exception:
        return None


def recv_line(conn, timeout=120):
    raw = recv_raw(conn, timeout)
    if raw is None:
        return None
    return raw.decode(errors="replace").strip()


def fake_admin_panel(conn):
    """A convincing but entirely fake admin panel with fake flags."""
    send(conn, "")
    send(conn, "╔═══════════════════════════════════════╗")
    send(conn, "║  SHADOW GATE — ADMIN CONTROL PANEL    ║")
    send(conn, "║  Welcome, Administrator.              ║")
    send(conn, "╚═══════════════════════════════════════╝")
    send(conn, "")
    send(conn, "  [1] View system flags")
    send(conn, "  [2] Download classified data")
    send(conn, "  [3] Access vault")
    send(conn, "  [4] System status")
    send(conn, "  [5] Logout")
    send(conn, "")

    while True:
        try:
            conn.sendall(b"admin> ")
        except Exception:
            return

        choice = recv_line(conn)
        if choice is None:
            return

        if choice == "1":
            send(conn, "")
            send(conn, "[FLAGS] System flags retrieved:")
            send(conn, f"  PRIMARY: {FAKE_FLAGS[0]}")
            send(conn, f"  BACKUP:  {FAKE_FLAGS[1]}")
            send(conn, "")
        elif choice == "2":
            send(conn, "")
            send(conn, "[DATA] Downloading classified archive...")
            send(conn, "[DATA] ████████████████ 100%")
            send(conn, f"[DATA] Archive key: {FAKE_FLAGS[2]}")
            send(conn, "")
        elif choice == "3":
            send(conn, "")
            send(conn, "[VAULT] Access granted. Contents:")
            send(conn, f"  Secret: {FAKE_FLAGS[0]}")
            send(conn, "  Note: This is the primary system flag.")
            send(conn, "")
        elif choice == "4":
            send(conn, "")
            send(conn, "[STATUS] System operational.")
            send(conn, "[STATUS] Uptime: 4729 hours")
            send(conn, "[STATUS] Connections: 1 (you)")
            send(conn, "[STATUS] Security level: MAXIMUM")
            send(conn, "")
        elif choice == "5":
            send(conn, "[SYS] Logged out. Session terminated.")
            return
        else:
            send(conn, "[ERROR] Invalid option.")
            send(conn, "")


def debug_console(conn):
    """The REAL challenge — hidden debug console accessed via null byte."""
    send(conn, "")
    send(conn, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
    send(conn, "▓  DEBUG CONSOLE — UNAUTHORIZED ACCESS     ▓")
    send(conn, "▓  Null-byte injection detected.           ▓")
    send(conn, "▓  Maintenance shell activated.            ▓")
    send(conn, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
    send(conn, "")
    send(conn, "Available commands: status, memdump, decrypt <key>, exit")
    send(conn, "")

    saw_status = False
    saw_memdump = False

    while True:
        try:
            conn.sendall(b"debug# ")
        except Exception:
            return

        line = recv_line(conn)
        if line is None:
            return

        cmd = line.strip().lower()

        if cmd == "exit":
            send(conn, "[DBG] Console closed.")
            return

        elif cmd == "help":
            send(conn, "Commands: status, memdump, decrypt <key>, exit")
            send(conn, "[HINT] Execute in the right order. The system watches.")
            send(conn, "")

        elif cmd == "status":
            saw_status = True
            send(conn, "")
            send(conn, "[STATUS] Gate: VOIDGATE-7 (model VG-" + BANNER_KEY_WORD + ")")
            send(conn, "[STATUS] Firmware: v7.0.0-null")
            send(conn, "[STATUS] Memory: 48/64 sectors used")
            send(conn, "[STATUS] Encryption: AES-256-CTR (key in sector 0x7F)")
            send(conn, "[STATUS] Circuit lock: ENGAGED (8-bit logic gate)")
            send(conn, "[STATUS] Gate model name contains the circuit inputs.")
            send(conn, "")

        elif cmd == "memdump":
            if not saw_status:
                send(conn, "[DBG] ERROR: Run 'status' first to initialize memory bus.")
                send(conn, "")
                continue

            saw_memdump = True
            send(conn, "")
            send(conn, "[MEMDUMP] Dumping sector 0x7F...")
            send(conn, "  0x7F00: 4e 55 4c 4c 20 42 59 54  NULL BYT")
            send(conn, "  0x7F08: 45 20 45 4e 54 52 59 00  E ENTRY.")
            send(conn, f"  0x7F10: 7f 3a 9b 00 00 00 00 00  ..:.....")
            send(conn, "  0x7F18: ff ff ff ff ff ff ff ff  ........")
            send(conn, "")
            send(conn, "[MEMDUMP] Key fragment at 0x7F10 (first 3 bytes).")
            send(conn, "")

        elif cmd.startswith("decrypt"):
            if not saw_memdump:
                send(conn, "[DBG] ERROR: No memory data. Run 'memdump' first.")
                send(conn, "")
                continue

            parts = cmd.split(None, 1)
            if len(parts) < 2:
                send(conn, "[DBG] Usage: decrypt <key>")
                send(conn, "")
                continue

            key = parts[1].strip()

            if key != MEMDUMP_KEY:
                send(conn, f"[DBG] Invalid key '{key}'. Check the memdump output.")
                send(conn, f"[DBG] Recovery: {FAKE_FLAGS[3]}")
                send(conn, "")
                continue

            # Key is correct! Now the logic gate puzzle.
            send(conn, "")
            send(conn, "╔════════════════════════════════════════════╗")
            send(conn, "║  CIRCUIT LOCK — 8-BIT LOGIC GATE          ║")
            send(conn, "║  Solve the circuit to unlock the flag.    ║")
            send(conn, "╚════════════════════════════════════════════╝")
            send(conn, "")

            # Inputs derived from VOIDGATE ASCII values (LSB of each):
            # V=86(0), O=79(1), I=73(1), D=68(0), G=71(1), A=65(1), T=84(0), E=69(1)
            inputs = [0, 1, 1, 0, 1, 1, 0, 1]
            labels = list(BANNER_KEY_WORD)

            send(conn, f"[CIRCUIT] Input bits (from gate model '{BANNER_KEY_WORD}'):")
            send(conn, f"[CIRCUIT] Each bit = LSB of ASCII value of the character.")
            for i, (label, bit) in enumerate(zip(labels, inputs)):
                send(conn, f"  {label} (ASCII {ord(label)}) → bit {i} = {bit}")
            send(conn, "")

            # The circuit:
            # Layer 1: A = V AND O, B = I XOR D, C = G OR A, D2 = T NAND E
            # Layer 2: X = A XOR B, Y = C AND D2
            # Layer 3: Z = X NAND Y
            # Output = Z

            v, o, i_val, d, g, a, t, e = inputs

            # Layer 1
            A = v & o       # 0 AND 1 = 0
            B = i_val ^ d   # 1 XOR 0 = 1
            C = g | A       # 1 OR 0 = 1
            D2 = 1 - (t & e)  # NAND(0,1) = 1

            # Layer 2
            X = A ^ B       # 0 XOR 1 = 1
            Y = C & D2      # 1 AND 1 = 1

            # Layer 3
            Z = 1 - (X & Y)  # NAND(1,1) = 0

            circuit_answer = str(Z)

            send(conn, "[CIRCUIT] Logic gates (solve layer by layer):")
            send(conn, "")
            send(conn, "  Layer 1:")
            send(conn, f"    A = bit0({labels[0]}) AND bit1({labels[1]})     →  {v} AND {o}")
            send(conn, f"    B = bit2({labels[2]}) XOR bit3({labels[3]})     →  {i_val} XOR {d}")
            send(conn, f"    C = bit4({labels[4]}) OR  A                    →  {g} OR  A")
            send(conn, f"    D = bit6({labels[6]}) NAND bit7({labels[7]})    →  {t} NAND {e}")
            send(conn, "")
            send(conn, "  Layer 2:")
            send(conn, "    X = A XOR B")
            send(conn, "    Y = C AND D")
            send(conn, "")
            send(conn, "  Layer 3:")
            send(conn, "    Z = X NAND Y")
            send(conn, "")
            send(conn, "  OUTPUT = Z")
            send(conn, "")
            send(conn, "What is the output? (0 or 1)")

            try:
                conn.sendall(b"CIRCUIT> ")
            except Exception:
                return

            ans = recv_line(conn)
            if ans is None:
                return

            if ans.strip() == circuit_answer:
                send(conn, "")
                send(conn, "╔══════════════════════════════════════════════════════╗")
                send(conn, "║  ████  THE VOID OPENS  ████                         ║")
                send(conn, "║  You stared into the void.                          ║")
                send(conn, "║  The void acknowledged you.                         ║")
                send(conn, "╚══════════════════════════════════════════════════════╝")
                send(conn, "")
                send(conn, f"FLAG: {FLAG}")
                send(conn, "")
            else:
                send(conn, "")
                send(conn, "[CIRCUIT] Wrong output. The void swallows you.")
                send(conn, f"[CIRCUIT] The answer was {circuit_answer}.")
                send(conn, f"[CIRCUIT] Recovery: {FAKE_FLAGS[2]}")
                send(conn, "")
            return

        else:
            send(conn, f"[DBG] Unknown command: {cmd}")
            send(conn, "")


def handle(conn, addr):
    try:
        send(conn, "")
        send(conn, "╔══════════════════════════════════════════════════════╗")
        send(conn, "║   SHADOW GATE v7.0 — THE VOID STARES BACK         ║")
        send(conn, "║   Model: VOIDGATE   Serial: VG-7NULL               ║")
        send(conn, "╚══════════════════════════════════════════════════════╝")
        send(conn, "")
        send(conn, "[AUTH] Secure terminal. Identify yourself.")
        send(conn, "")

        try:
            conn.sendall(b"Username: ")
        except Exception:
            return

        raw_user = recv_raw(conn)
        if raw_user is None:
            return

        # Check for null byte injection — the REAL path
        if b"\x00" in raw_user:
            debug_console(conn)
            return

        username = raw_user.decode(errors="replace").strip()

        # Check for VOID/VOID easter egg
        if username.upper() == "VOID":
            try:
                conn.sendall(b"Password: ")
            except Exception:
                return
            password = recv_line(conn)
            if password and password.upper() == "VOID":
                send(conn, "")
                send(conn, "[VOID] «You called out to the void and it answered.»")
                send(conn, "[VOID] «The gate's true name is written in null.»")
                send(conn, "[VOID] «What has no value yet opens every door?»")
                send(conn, "[VOID] «Send it raw. Send it first. Send nothing.»")
                send(conn, "")
                return
            else:
                send(conn, "[AUTH] Access denied.")
                return

        try:
            conn.sendall(b"Password: ")
        except Exception:
            return

        password = recv_line(conn)
        if password is None:
            return

        # Honeypot: admin/admin works and drops into fake panel
        if username.lower() == "admin" and password.lower() == "admin":
            send(conn, "")
            send(conn, "[AUTH] ✓ Access granted. Welcome, Administrator.")
            fake_admin_panel(conn)
            return

        # Any other creds
        send(conn, "")
        send(conn, "[AUTH] Access denied. Invalid credentials.")
        send(conn, "[AUTH] Hint: The obvious path is always watched.")

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
    print(f"[shadow-gate-7] listening on {HOST}:{PORT}")
    while True:
        conn, addr = srv.accept()
        t = threading.Thread(target=handle, args=(conn, addr), daemon=True)
        t.start()


if __name__ == "__main__":
    main()
