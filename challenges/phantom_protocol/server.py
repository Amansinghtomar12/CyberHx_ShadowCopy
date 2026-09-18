#!/usr/bin/env python3
"""
PHANTOM PROTOCOL — Multi-Chain Exploitation Challenge (INSANE)

Category : PWN / Blockchain / Crypto / Reversing
Difficulty: INSANE
Port     : 9008 (TCP)
Flag     : NullOriginCTF{ph4nt0m_pr0t0c0l_m4st3r_pwn3d}

Six chained stages — each requires a different exploit technique.
All must be solved in a single TCP session.

═══════════════════════════════════════════════════════════════
STAGE 1 — Buffer Overflow (Registry Packet)
═══════════════════════════════════════════════════════════════
Packet layout (28 bytes):
  [username: 16 bytes][role: 8 bytes][CRC32: 4 bytes LE]
Default role is "auditor". Required role: "operator".
Overflow username into role, recompute CRC32 over first 24 bytes.

Solution:
  data = b"A"*16 + b"operator"
  crc  = struct.pack("<I", binascii.crc32(data) & 0xFFFFFFFF)
  send (data + crc).hex()

═══════════════════════════════════════════════════════════════
STAGE 2 — Format String (HMAC Key Leak)
═══════════════════════════════════════════════════════════════
Simulated stack has HMAC key at positions 7 and 8.
Use %7$x and %8$x (or sequential %x) to leak the two 32-bit
halves, concatenate to 16-char hex string, submit.

Solution:
  query %7$x%8$x  →  "a3f7c91b2d4e8056"
  submit a3f7c91b2d4e8056

═══════════════════════════════════════════════════════════════
STAGE 3 — Schnorr Signature Nonce Reuse
═══════════════════════════════════════════════════════════════
Uses safe-prime group: P=2q+1 (modulus), Q (prime group order).
Two signatures share the same nonce k.  Recover private key x:
  x = (s1 - s2) * modinv(e2 - e1, Q) mod Q
Then sign "DRAIN_VAULT": pick k', r'=G^k' mod P,
e'=SHA256(msg||r') mod Q, s'=(k'-x*e') mod Q.  Submit r' and s'.

═══════════════════════════════════════════════════════════════
STAGE 4 — Reentrancy + Integer Underflow
═══════════════════════════════════════════════════════════════
Vault pool=10, wallet=1.  Gas limit=150000, per call=35000
→ max reentrant depth = 4.

Solution:
  deposit 1        (pool=11, balance=1)
  attack 1 4       (extract 4, pool=7, balance underflows)
  withdraw 7       (pool=0 — drained!)

═══════════════════════════════════════════════════════════════
STAGE 5 — ABI Encoding + uint256 Overflow
═══════════════════════════════════════════════════════════════
Craft calldata for emergencyTransfer(address,uint256).
ADMIN_FEE = 0x539 (1337).  Need amount + fee to overflow uint256
to zero:  amount = 2^256 - 1337.

Calldata = selector(4B) + address(32B padded) + amount(32B)
Submit as 136-char hex string.

═══════════════════════════════════════════════════════════════
STAGE 6 — Custom VM Bytecode Reversing
═══════════════════════════════════════════════════════════════
Stack-based VM.  Bytecode checks 4 equations on 4 uint32 inputs:
  input[0] ^ 0xDEADBEEF == 0x1337CAFE
  ((input[0] + 0x42) * 3) & 0xFFFFFFFF == input[1]
  input[1] ^ input[2] == 0xBAADF00D
  (input[0] ^ input[1] ^ input[2] ^ input[3]) == 0xFACEFEED

Solution:
  input[0] = 0xDEADBEEF ^ 0x1337CAFE = 0xCD9A7411
  input[1] = ((0xCD9A7411 + 0x42) * 3) & 0xFFFFFFFF
  input[2] = input[1] ^ 0xBAADF00D
  input[3] = input[0] ^ input[1] ^ input[2] ^ 0xFACEFEED
"""

import socket
import threading
import struct
import hashlib
import sys
import signal
import binascii

HOST = "0.0.0.0"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9008
FLAG = "NullOriginCTF{ph4nt0m_pr0t0c0l_m4st3r_pwn3d}"
TIMEOUT = 600


# ═══════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════

def _egcd(a, b):
    if a == 0:
        return b, 0, 1
    g, x, y = _egcd(b % a, a)
    return g, y - (b // a) * x, x


def modinv(a, m):
    a = a % m
    g, x, _ = _egcd(a, m)
    if g != 1:
        return None
    return x % m


# ═══════════════════════════════════════════════════════════
#  Stage 2 — Format String config
# ═══════════════════════════════════════════════════════════

HMAC_KEY = bytes.fromhex("a3f7c91b2d4e8056")
HMAC_KEY_HEX = HMAC_KEY.hex()
_KEY_P1 = int.from_bytes(HMAC_KEY[0:4], "big")
_KEY_P2 = int.from_bytes(HMAC_KEY[4:8], "big")

STACK = [
    0xDEADBEEF,   # 0  return address
    0xCAFEBABE,   # 1  frame pointer
    0x41414141,   # 2  local var
    0x42424242,   # 3  local var
    0x08049000,   # 4  buffer ptr
    0xF7E3C900,   # 5  canary
    0x00000000,   # 6  padding
    _KEY_P1,      # 7  HMAC key part 1  ← target
    _KEY_P2,      # 8  HMAC key part 2  ← target
    0xBFFFFA00,   # 9  saved ebp
    0x08048567,   # 10 saved eip
    0x00000001,   # 11 argc
]


def fmt_process(fmt):
    out, i, sp = [], 0, 0
    while i < len(fmt):
        if fmt[i] == "%" and i + 1 < len(fmt):
            i += 1
            digits = ""
            while i < len(fmt) and fmt[i].isdigit():
                digits += fmt[i]
                i += 1
            if digits and i < len(fmt) and fmt[i] == "$":
                i += 1
                pos = int(digits)
                if i < len(fmt):
                    s = fmt[i]
                    i += 1
                    if s == "x" and 0 <= pos < len(STACK):
                        out.append(f"{STACK[pos]:08x}")
                    elif s == "d" and 0 <= pos < len(STACK):
                        out.append(str(STACK[pos]))
                    elif s == "n":
                        out.append("[BLOCKED]")
                    else:
                        out.append("(nil)")
                continue
            spec = fmt[i] if i < len(fmt) else ""
            i += 1
            if spec == "x" and sp < len(STACK):
                out.append(f"{STACK[sp]:08x}")
                sp += 1
            elif spec == "d" and sp < len(STACK):
                out.append(str(STACK[sp]))
                sp += 1
            elif spec == "n":
                out.append("[BLOCKED]")
                sp += 1
            elif spec == "p" and sp < len(STACK):
                out.append(f"0x{STACK[sp]:08x}")
                sp += 1
            elif spec == "%":
                out.append("%")
            else:
                out.append("(nil)")
                sp += 1
        else:
            out.append(fmt[i])
            i += 1
    return "".join(out)


# ═══════════════════════════════════════════════════════════
#  Stage 3 — Schnorr Signature config
# ═══════════════════════════════════════════════════════════

SIG_P = 2417851639229258349415043
SIG_Q = 1208925819614629174707521
SIG_G = 4
SIG_X = 314159265358979323846264338327 % SIG_Q
SIG_K = 271828182845904523536028747135 % SIG_Q
SIG_Y = pow(SIG_G, SIG_X, SIG_P)

MSG1 = b"Transfer 10 ETH to 0xdead"
MSG2 = b"Transfer 5 ETH to 0xbeef"
VERIFY_MSG = b"DRAIN_VAULT"


def _sighash(data):
    return int(hashlib.sha256(data).hexdigest(), 16) % SIG_Q


SIG_R = pow(SIG_G, SIG_K, SIG_P)
SIG_E1 = _sighash(MSG1 + str(SIG_R).encode())
SIG_S1 = (SIG_K - SIG_X * SIG_E1) % SIG_Q
SIG_E2 = _sighash(MSG2 + str(SIG_R).encode())
SIG_S2 = (SIG_K - SIG_X * SIG_E2) % SIG_Q

_c1 = (pow(SIG_G, SIG_S1, SIG_P) * pow(SIG_Y, SIG_E1, SIG_P)) % SIG_P
_c2 = (pow(SIG_G, SIG_S2, SIG_P) * pow(SIG_Y, SIG_E2, SIG_P)) % SIG_P
assert _c1 == SIG_R, "sig1 verify fail"
assert _c2 == SIG_R, "sig2 verify fail"
_rx = ((SIG_S1 - SIG_S2) * pow(SIG_E2 - SIG_E1, -1, SIG_Q)) % SIG_Q
assert _rx == SIG_X, "key recovery check fail"


# ═══════════════════════════════════════════════════════════
#  Stage 5 — ABI Overflow config
# ═══════════════════════════════════════════════════════════

ADMIN_FEE = 1337
FUNC_SIG = b"emergencyTransfer(address,uint256)"
FUNC_SEL = hashlib.sha3_256(FUNC_SIG).digest()[:4]
FUNC_SEL_HEX = FUNC_SEL.hex()
TARGET_ADDR = "0000000000000000000000000000000000001337"
OVERFLOW_AMT = (2**256 - ADMIN_FEE)


# ═══════════════════════════════════════════════════════════
#  Stage 6 — VM config
# ═══════════════════════════════════════════════════════════

OP_PUSH1 = 0x01
OP_PUSH4 = 0x02
OP_ADD   = 0x10
OP_SUB   = 0x11
OP_MUL   = 0x12
OP_XOR   = 0x13
OP_AND   = 0x14
OP_MOD   = 0x15
OP_DUP   = 0x20
OP_SWAP  = 0x21
OP_EQ    = 0x30
OP_LT    = 0x31
OP_LOAD  = 0x40
OP_JUMPI = 0x50
OP_JUMP  = 0x51
OP_RVRT  = 0xFE
OP_HALT  = 0xFF

VM_INPUT_0 = 0xDEADBEEF ^ 0x1337CAFE
VM_INPUT_1 = ((VM_INPUT_0 + 0x42) * 3) & 0xFFFFFFFF
VM_INPUT_2 = VM_INPUT_1 ^ 0xBAADF00D
VM_INPUT_3 = (VM_INPUT_0 ^ VM_INPUT_1 ^ VM_INPUT_2 ^ 0xFACEFEED) & 0xFFFFFFFF

assert (VM_INPUT_0 ^ 0xDEADBEEF) == 0x1337CAFE
assert VM_INPUT_1 == ((VM_INPUT_0 + 0x42) * 3) & 0xFFFFFFFF
assert (VM_INPUT_1 ^ VM_INPUT_2) == 0xBAADF00D
assert ((VM_INPUT_0 ^ VM_INPUT_1 ^ VM_INPUT_2 ^ VM_INPUT_3) & 0xFFFFFFFF) == 0xFACEFEED


def _p4(val):
    return list(val.to_bytes(4, "big"))


BYTECODE = bytes([
    # ── Check 1: input[0] ^ 0xDEADBEEF == 0x1337CAFE ──
    OP_PUSH1, 0x00,
    OP_LOAD,
    *[OP_PUSH4, *_p4(0xDEADBEEF)],
    OP_XOR,
    *[OP_PUSH4, *_p4(0x1337CAFE)],
    OP_EQ,

    # ── Dead code block (obfuscation) ──
    OP_PUSH1, 0x01,
    *[OP_JUMPI, 0x00, 21],     # jump over REVERT (addr 21 = next real op)
    OP_RVRT,

    # ── Check 2: ((input[0]+0x42)*3) & 0xFFFFFFFF == input[1] ──  (offset ~28)
    OP_PUSH1, 0x00,
    OP_LOAD,
    OP_PUSH1, 0x42,
    OP_ADD,
    OP_PUSH1, 0x03,
    OP_MUL,
    *[OP_PUSH4, *_p4(0xFFFFFFFF)],
    OP_AND,
    OP_PUSH1, 0x01,
    OP_LOAD,
    OP_EQ,

    # ── Check 3: input[1] ^ input[2] == 0xBAADF00D ──
    OP_PUSH1, 0x01,
    OP_LOAD,
    OP_PUSH1, 0x02,
    OP_LOAD,
    OP_XOR,
    *[OP_PUSH4, *_p4(0xBAADF00D)],
    OP_EQ,

    # ── Check 4: input[0]^input[1]^input[2]^input[3] == 0xFACEFEED ──
    OP_PUSH1, 0x00, OP_LOAD,
    OP_PUSH1, 0x01, OP_LOAD,
    OP_XOR,
    OP_PUSH1, 0x02, OP_LOAD,
    OP_XOR,
    OP_PUSH1, 0x03, OP_LOAD,
    OP_XOR,
    *[OP_PUSH4, *_p4(0xFACEFEED)],
    OP_EQ,

    # ── Combine: AND all four results ──
    OP_AND,
    OP_AND,
    OP_AND,

    OP_HALT,
])


def run_vm(code, inputs):
    stk, pc, steps = [], 0, 0
    while pc < len(code) and steps < 10000:
        steps += 1
        op = code[pc]; pc += 1
        if op == OP_PUSH1:
            stk.append(code[pc]); pc += 1
        elif op == OP_PUSH4:
            stk.append(int.from_bytes(code[pc:pc+4], "big")); pc += 4
        elif op == OP_ADD:
            b, a = stk.pop(), stk.pop(); stk.append((a + b) & 0xFFFFFFFF)
        elif op == OP_SUB:
            b, a = stk.pop(), stk.pop(); stk.append((a - b) & 0xFFFFFFFF)
        elif op == OP_MUL:
            b, a = stk.pop(), stk.pop(); stk.append((a * b) & 0xFFFFFFFF)
        elif op == OP_XOR:
            b, a = stk.pop(), stk.pop(); stk.append(a ^ b)
        elif op == OP_AND:
            b, a = stk.pop(), stk.pop(); stk.append(a & b)
        elif op == OP_MOD:
            b, a = stk.pop(), stk.pop(); stk.append(a % b if b else 0)
        elif op == OP_DUP:
            stk.append(stk[-1])
        elif op == OP_SWAP:
            stk[-1], stk[-2] = stk[-2], stk[-1]
        elif op == OP_EQ:
            b, a = stk.pop(), stk.pop(); stk.append(1 if a == b else 0)
        elif op == OP_LT:
            b, a = stk.pop(), stk.pop(); stk.append(1 if a < b else 0)
        elif op == OP_LOAD:
            idx = stk.pop()
            stk.append(inputs[idx] if 0 <= idx < len(inputs) else 0)
        elif op == OP_JUMPI:
            addr = int.from_bytes(code[pc:pc+2], "big"); pc += 2
            if stk.pop(): pc = addr
        elif op == OP_JUMP:
            addr = int.from_bytes(code[pc:pc+2], "big"); pc += 2
            pc = addr
        elif op == OP_RVRT:
            return 0
        elif op == OP_HALT:
            return stk[-1] if stk else 0
        else:
            return 0
    return stk[-1] if stk else 0


_vm_check = run_vm(BYTECODE, [VM_INPUT_0, VM_INPUT_1, VM_INPUT_2, VM_INPUT_3])
assert _vm_check == 1, f"VM self-test failed: got {_vm_check}"


# ═══════════════════════════════════════════════════════════
#  Client Handler
# ═══════════════════════════════════════════════════════════

class Client:
    def __init__(self, conn, addr):
        self.conn = conn
        self.addr = addr
        self.buf = b""

    def send(self, t):
        self.conn.sendall(t.encode())

    def sendln(self, t=""):
        self.send(t + "\n")

    def recv_line(self):
        while b"\n" not in self.buf:
            d = self.conn.recv(4096)
            if not d:
                raise ConnectionError
            self.buf += d
        line, self.buf = self.buf.split(b"\n", 1)
        return line.decode(errors="replace").strip()

    def prompt(self, p=">>> "):
        self.send(p)
        return self.recv_line()

    # ── Banner ──────────────────────────────────────────

    def banner(self):
        self.sendln(r"""
 ██████╗ ██╗  ██╗ █████╗ ███╗   ██╗████████╗ ██████╗ ███╗   ███╗
 ██╔══██╗██║  ██║██╔══██╗████╗  ██║╚══██╔══╝██╔═══██╗████╗ ████║
 ██████╔╝███████║███████║██╔██╗ ██║   ██║   ██║   ██║██╔████╔██║
 ██╔═══╝ ██╔══██║██╔══██║██║╚██╗██║   ██║   ██║   ██║██║╚██╔╝██║
 ██║     ██║  ██║██║  ██║██║ ╚████║   ██║   ╚██████╔╝██║ ╚═╝ ██║
 ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝     ╚═╝
                    P R O T O C O L
        ═══════ INSANE DIFFICULTY ═══════
    Multi-Stage PWN / Blockchain / Reversing

    6 stages.  All must be solved in one session.
    Good luck, operator.
""")

    # ── Stage 1: Buffer Overflow ────────────────────────

    def stage1(self):
        self.sendln("=" * 56)
        self.sendln("  STAGE 1 ── Contract Registry: Buffer Overflow")
        self.sendln("=" * 56)
        self.sendln("""
The PhantomVault registry accepts operator registration
packets over a raw binary protocol.

Packet format (28 bytes):
  Offset 0x00 : Username   [16 bytes, null-padded ASCII]
  Offset 0x10 : Role       [8 bytes,  null-padded ASCII]
  Offset 0x18 : Checksum   [4 bytes,  CRC32 little-endian]

Default registration role: "auditor"
Required role for access:  "operator"

Integrity is validated via CRC32 of the first 24 bytes.
Send your registration packet as a hex string.
""")
        while True:
            raw = self.prompt("packet> ")
            if raw in ("quit", "exit"):
                raise ConnectionError
            try:
                pkt = bytes.fromhex(raw)
            except ValueError:
                self.sendln("[-] Invalid hex.")
                continue
            if len(pkt) != 28:
                self.sendln(f"[-] Packet must be 28 bytes (got {len(pkt)}).")
                continue
            exp_crc = struct.pack("<I", binascii.crc32(pkt[:24]) & 0xFFFFFFFF)
            if pkt[24:28] != exp_crc:
                self.sendln("[-] CRC32 checksum mismatch. Packet rejected.")
                continue
            role = pkt[16:24].rstrip(b"\x00").decode("ascii", errors="replace")
            if role != "operator":
                self.sendln(f"[-] Access denied. Role '{role}' insufficient.")
                continue
            self.sendln("[+] Registry overflow successful.")
            self.sendln("[+] Role escalated to OPERATOR. Stage 1 complete!\n")
            return

    # ── Stage 2: Format String ──────────────────────────

    def stage2(self):
        self.sendln("=" * 56)
        self.sendln("  STAGE 2 ── Audit Log: Format String Exploit")
        self.sendln("=" * 56)
        self.sendln("""
The audit log query interface has a format string vulnerability.
The logging engine uses a printf-like formatter internally.

Your goal: extract the HMAC signing key from process memory.

Commands:
  query <format_string>   — inject into the log formatter
  submit <hex_key>         — submit the 8-byte key (16 hex chars)
  help                     — show this help

Hint: the key is stored as two 32-bit words on the stack.
""")
        attempts = 0
        while attempts < 50:
            line = self.prompt("audit> ")
            if line in ("quit", "exit"):
                raise ConnectionError
            if line == "help":
                self.sendln("  query <fmt>     — e.g. query %x.%x.%x")
                self.sendln("  submit <hex>    — e.g. submit a1b2c3d4e5f60718")
                continue
            if line.startswith("submit "):
                key = line[7:].strip().lower()
                if key == HMAC_KEY_HEX:
                    self.sendln("[+] HMAC key verified. Stage 2 complete!\n")
                    return
                self.sendln("[-] Incorrect key.")
                attempts += 1
                continue
            if line.startswith("query "):
                fmt = line[6:]
            else:
                fmt = line
            result = fmt_process(fmt)
            self.sendln(f"  Log: {result}")
            attempts += 1
        self.sendln("[-] Too many attempts. Connection terminated.")
        raise ConnectionError

    # ── Stage 3: Signature Nonce Reuse ──────────────────

    def stage3(self):
        self.sendln("=" * 56)
        self.sendln("  STAGE 3 ── Schnorr Signature: Nonce Reuse Attack")
        self.sendln("=" * 56)
        self.sendln(f"""
The PhantomVault uses a Schnorr-like digital signature scheme.
Two transactions were signed with the SAME nonce.

Signature scheme (safe-prime group over Z_p*):
  Sign(m, x, k):
    r = G^k mod P
    e = SHA256(m || r) mod Q
    s = (k - x * e) mod Q
  Verify(m, r, s):
    e = SHA256(m || r) mod Q
    G^s * Y^e mod P == r

Public Parameters:
  P (modulus)    = {SIG_P}
  Q (group order)= {SIG_Q}
  G (generator)  = {SIG_G}
  Y (pubkey)     = {SIG_Y}

Transaction 1:
  Message : {MSG1.decode()}
  r       = {SIG_R}
  s       = {SIG_S1}
  e       = {SIG_E1}

Transaction 2 (SAME NONCE!):
  Message : {MSG2.decode()}
  r       = {SIG_R}
  s       = {SIG_S2}
  e       = {SIG_E2}

Recover the private key x, then sign the message "DRAIN_VAULT".
""")
        self.sendln("Step 1: Submit the recovered private key x.")
        while True:
            raw = self.prompt("privkey> ")
            if raw in ("quit", "exit"):
                raise ConnectionError
            try:
                x_val = int(raw)
            except ValueError:
                self.sendln("[-] Enter x as a decimal integer.")
                continue
            if x_val % SIG_Q != SIG_X:
                self.sendln("[-] Incorrect private key.")
                continue
            self.sendln("[+] Private key verified!\n")
            break

        self.sendln('Step 2: Sign the message "DRAIN_VAULT".')
        self.sendln("Submit r and s (decimal), one per prompt.")
        while True:
            try:
                r_raw = self.prompt("r> ")
                s_raw = self.prompt("s> ")
                r_val = int(r_raw)
                s_val = int(s_raw)
            except (ValueError, ConnectionError):
                self.sendln("[-] Invalid input.")
                continue
            e_val = _sighash(VERIFY_MSG + str(r_val).encode())
            check = (pow(SIG_G, s_val, SIG_P) * pow(SIG_Y, e_val, SIG_P)) % SIG_P
            if check == r_val:
                self.sendln("[+] Signature verified. Stage 3 complete!\n")
                return
            self.sendln("[-] Signature verification failed.")

    # ── Stage 4: Reentrancy Attack ──────────────────────

    def stage4(self):
        self.sendln("=" * 56)
        self.sendln("  STAGE 4 ── Smart Contract: Reentrancy Exploit")
        self.sendln("=" * 56)
        self.sendln("""
// Solidity 0.7.6 — no overflow protection
contract PhantomVault {
    mapping(address => uint256) public balances;
    uint256 public pool;      // starts at 10 ether

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        pool += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount);
        // VULNERABLE: state update AFTER external call
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
        balances[msg.sender] -= amount;   // underflows in 0.7.6!
        pool -= amount;
    }
}

Gas Configuration:
  Transaction gas limit : 150000
  Gas per withdraw call : ~35000

Your wallet : 1 ETH
Vault pool  : 10 ETH

Commands:
  deposit <n>       — deposit n ETH from wallet
  attack <n> <d>    — reentrancy: withdraw n ETH, d recursive calls
  withdraw <n>      — normal withdrawal
  status            — show current state
  check             — verify if pool is drained (goal: pool == 0)
""")
        wallet = 1
        balance = 0
        pool = 10
        gas_limit = 150000
        gas_per = 35000
        max_depth = gas_limit // gas_per

        while True:
            line = self.prompt("vault> ")
            if line in ("quit", "exit"):
                raise ConnectionError
            parts = line.split()
            if not parts:
                continue
            cmd = parts[0].lower()

            if cmd == "status":
                self.sendln(f"  Wallet  : {wallet} ETH")
                self.sendln(f"  Balance : {balance} (contract)")
                self.sendln(f"  Pool    : {pool} ETH")
                continue

            if cmd == "check":
                if pool == 0:
                    self.sendln("[+] Vault drained! Stage 4 complete!\n")
                    return
                self.sendln(f"[-] Pool still has {pool} ETH.")
                continue

            if cmd == "help":
                self.sendln("  deposit <n> | attack <n> <depth> | withdraw <n>")
                self.sendln("  status | check | help")
                continue

            if cmd == "deposit":
                if len(parts) < 2:
                    self.sendln("[-] Usage: deposit <amount>")
                    continue
                try:
                    amt = int(parts[1])
                except ValueError:
                    self.sendln("[-] Invalid amount.")
                    continue
                if amt <= 0:
                    self.sendln("[-] Amount must be positive.")
                    continue
                if amt > wallet:
                    self.sendln(f"[-] REVERT: insufficient wallet ({wallet} ETH).")
                    continue
                wallet -= amt
                balance += amt
                pool += amt
                self.sendln(f"  Deposited {amt} ETH. Pool={pool}, Balance={balance}")
                continue

            if cmd == "attack":
                if len(parts) < 3:
                    self.sendln("[-] Usage: attack <amount> <depth>")
                    continue
                try:
                    amt = int(parts[1])
                    depth = int(parts[2])
                except ValueError:
                    self.sendln("[-] Invalid parameters.")
                    continue
                if amt <= 0 or depth <= 0:
                    self.sendln("[-] Amount and depth must be positive.")
                    continue
                if balance < amt:
                    self.sendln(f"[-] REVERT: insufficient balance ({balance}).")
                    continue
                if depth > max_depth:
                    self.sendln(
                        f"[-] OUT OF GAS at depth {depth}. "
                        f"Transaction reverted."
                    )
                    continue
                total_extract = amt * depth
                if total_extract > pool:
                    self.sendln(
                        f"[-] REVERT: vault exhausted mid-attack "
                        f"(tried {total_extract}, pool={pool})."
                    )
                    continue
                wallet += total_extract
                pool -= total_extract
                new_bal = balance - (amt * depth)
                if new_bal < 0:
                    new_bal += 2**256
                balance = new_bal
                self.sendln(
                    f"  Reentrancy x{depth}: extracted {total_extract} ETH."
                )
                if balance > 2**200:
                    self.sendln(
                        "  [!] Balance underflow detected (uint256 wrap)."
                    )
                self.sendln(f"  Pool={pool}, Wallet={wallet}")
                continue

            if cmd == "withdraw":
                if len(parts) < 2:
                    self.sendln("[-] Usage: withdraw <amount>")
                    continue
                try:
                    amt = int(parts[1])
                except ValueError:
                    self.sendln("[-] Invalid amount.")
                    continue
                if amt <= 0:
                    self.sendln("[-] Amount must be positive.")
                    continue
                if balance < amt:
                    self.sendln(f"[-] REVERT: insufficient balance.")
                    continue
                if amt > pool:
                    self.sendln(
                        f"[-] REVERT: pool insufficient ({pool} ETH)."
                    )
                    continue
                wallet += amt
                pool -= amt
                balance -= amt
                self.sendln(f"  Withdrawn {amt} ETH. Pool={pool}, Wallet={wallet}")
                continue

            self.sendln("[-] Unknown command. Type 'help'.")

    # ── Stage 5: ABI Encoding + Integer Overflow ────────

    def stage5(self):
        self.sendln("=" * 56)
        self.sendln("  STAGE 5 ── ABI Encoding: uint256 Overflow")
        self.sendln("=" * 56)
        self.sendln(f"""
The vault's emergency withdrawal function:

  function emergencyTransfer(address to, uint256 amount) {{
      uint256 total = amount + ADMIN_FEE;  // unchecked!
      require(total <= poolBalance);
      poolBalance -= total;
      payable(to).transfer(amount);
  }}

  ADMIN_FEE    = {ADMIN_FEE} (0x{ADMIN_FEE:x})
  poolBalance  = 1000000

ABI Encoding (Solidity-style):
  Bytes 0-3  : function selector (SHA3-256 of signature, first 4 bytes)
  Bytes 4-35 : address parameter (20 bytes, left-padded to 32)
  Bytes 36-67: uint256 amount parameter (32 bytes)

Function signature: {FUNC_SIG.decode()}
Selector          : 0x{FUNC_SEL_HEX}
Target address    : 0x{TARGET_ADDR[-40:]}

Craft calldata where amount + ADMIN_FEE overflows uint256 to
bypass the balance check.  Submit as a hex string (136 chars).
""")
        while True:
            raw = self.prompt("calldata> ")
            if raw in ("quit", "exit"):
                raise ConnectionError
            raw = raw.strip().lower()
            if raw.startswith("0x"):
                raw = raw[2:]
            if len(raw) != 136:
                self.sendln(f"[-] Calldata must be 68 bytes / 136 hex chars (got {len(raw)}).")
                continue
            try:
                data = bytes.fromhex(raw)
            except ValueError:
                self.sendln("[-] Invalid hex.")
                continue
            sel = data[0:4]
            addr = data[4:36]
            amt_bytes = data[36:68]
            if sel != FUNC_SEL:
                self.sendln(
                    f"[-] Wrong selector: 0x{sel.hex()} "
                    f"(expected 0x{FUNC_SEL_HEX})."
                )
                continue
            addr_hex = addr.hex()
            if addr_hex != "0" * 24 + TARGET_ADDR[-40:]:
                self.sendln("[-] Wrong target address.")
                continue
            amount = int.from_bytes(amt_bytes, "big")
            total = (amount + ADMIN_FEE) % (2**256)
            if total != 0:
                self.sendln(
                    f"[-] Overflow check failed. "
                    f"amount + fee = {total} (need 0)."
                )
                continue
            self.sendln("[+] uint256 overflow! total = 0.")
            self.sendln("[+] Balance check bypassed. Stage 5 complete!\n")
            return

    # ── Stage 6: VM Bytecode Reversing ──────────────────

    def stage6(self):
        self.sendln("=" * 56)
        self.sendln("  STAGE 6 ── Bytecode Reversing: Custom VM")
        self.sendln("=" * 56)
        self.sendln("""
The vault's unlock mechanism runs bytecode on a custom stack VM.
You must provide 4 uint32 input values that make the VM return 1.

Opcode Reference:
  0x01 PUSH1 <1B>     — push 1-byte immediate
  0x02 PUSH4 <4B>     — push 4-byte immediate (big-endian)
  0x10 ADD            — pop a,b; push (a+b) & 0xFFFFFFFF
  0x11 SUB            — pop a,b; push (a-b) & 0xFFFFFFFF
  0x12 MUL            — pop a,b; push (a*b) & 0xFFFFFFFF
  0x13 XOR            — pop a,b; push a^b
  0x14 AND            — pop a,b; push a&b
  0x15 MOD            — pop a,b; push a%b
  0x20 DUP            — duplicate top
  0x21 SWAP           — swap top two
  0x30 EQ             — pop a,b; push 1 if a==b else 0
  0x31 LT             — pop a,b; push 1 if a<b else 0
  0x40 LOAD           — pop index; push input[index]
  0x50 JUMPI <2B>     — pop cond; if cond!=0 jump to addr
  0x51 JUMP  <2B>     — unconditional jump
  0xFE REVERT         — halt with failure
  0xFF HALT           — halt; top of stack = result

Bytecode hex dump:
""")
        hexdump = BYTECODE.hex()
        for off in range(0, len(hexdump), 32):
            addr = off // 2
            chunk = hexdump[off:off+32]
            spaced = " ".join(chunk[i:i+2] for i in range(0, len(chunk), 2))
            self.sendln(f"  {addr:04x}: {spaced}")
        self.sendln(f"\n  Total: {len(BYTECODE)} bytes")
        self.sendln("""
Submit 4 uint32 values as hex (8 chars each, space-separated).
Example format: DEADBEEF 12345678 AABBCCDD 00112233
""")
        while True:
            raw = self.prompt("input> ")
            if raw in ("quit", "exit"):
                raise ConnectionError
            parts = raw.strip().split()
            if len(parts) != 4:
                self.sendln("[-] Need exactly 4 hex uint32 values.")
                continue
            try:
                vals = [int(p, 16) & 0xFFFFFFFF for p in parts]
            except ValueError:
                self.sendln("[-] Invalid hex values.")
                continue
            result = run_vm(BYTECODE, vals)
            if result == 1:
                self.sendln("[+] VM returned 1. Unlock sequence accepted!")
                self.sendln("[+] Stage 6 complete!\n")
                return
            self.sendln(f"[-] VM returned {result}. Rejected.")

    # ── Victory ─────────────────────────────────────────

    def victory(self):
        self.sendln("=" * 56)
        self.sendln("  ALL 6 STAGES COMPLETE")
        self.sendln("=" * 56)
        self.sendln(r"""
  ╔═══════════════════════════════════════════╗
  ║  PHANTOM PROTOCOL — FULLY COMPROMISED    ║
  ╠═══════════════════════════════════════════╣
  ║                                           ║
  ║  """ + FLAG + r"""  ║
  ║                                           ║
  ╚═══════════════════════════════════════════╝
""")
        self.sendln("Congratulations, operator. You have mastered:")
        self.sendln("  [1] Buffer overflow with CRC integrity bypass")
        self.sendln("  [2] Format string memory extraction")
        self.sendln("  [3] Schnorr signature nonce reuse attack")
        self.sendln("  [4] Smart contract reentrancy exploitation")
        self.sendln("  [5] ABI encoding with uint256 overflow")
        self.sendln("  [6] Custom bytecode reverse engineering")
        self.sendln("\nThe phantom has been unmasked.\n")

    # ── Run ─────────────────────────────────────────────

    def run(self):
        try:
            self.conn.settimeout(TIMEOUT)
            self.banner()
            self.stage1()
            self.stage2()
            self.stage3()
            self.stage4()
            self.stage5()
            self.stage6()
            self.victory()
        except (ConnectionError, BrokenPipeError, OSError, socket.timeout):
            pass
        except Exception as e:
            try:
                self.sendln(f"\n[!] Internal error: {e}")
            except Exception:
                pass
        finally:
            self.conn.close()


# ═══════════════════════════════════════════════════════════
#  Server
# ═══════════════════════════════════════════════════════════

def main():
    signal.signal(signal.SIGCHLD, signal.SIG_IGN)
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, PORT))
    srv.listen(32)
    print(f"[phantom-protocol] listening on {HOST}:{PORT}")

    while True:
        conn, addr = srv.accept()
        t = threading.Thread(target=Client(conn, addr).run, daemon=True)
        t.start()


if __name__ == "__main__":
    main()
