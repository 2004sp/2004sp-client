// src/datastruct/Linkable.ts
class Linkable {
  key = 0n;
  next = null;
  prev = null;
  unlink() {
    if (this.prev != null) {
      this.prev.next = this.next;
      if (this.next) {
        this.next.prev = this.prev;
      }
      this.next = null;
      this.prev = null;
    }
  }
}

// src/datastruct/Linkable2.ts
class Linkable2 extends Linkable {
  next2 = null;
  prev2 = null;
  unlink2() {
    if (this.prev2 !== null) {
      this.prev2.next2 = this.next2;
      if (this.next2) {
        this.next2.prev2 = this.prev2;
      }
      this.next2 = null;
      this.prev2 = null;
    }
  }
}

// src/datastruct/LinkList.ts
class LinkList {
  sentinel = new Linkable;
  cursor = null;
  constructor() {
    this.sentinel.next = this.sentinel;
    this.sentinel.prev = this.sentinel;
  }
  clear() {
    while (true) {
      const node = this.sentinel.next;
      if (node === this.sentinel) {
        return;
      }
      node?.unlink();
    }
  }
  push(node) {
    if (node.prev) {
      node.unlink();
    }
    node.prev = this.sentinel.prev;
    node.next = this.sentinel;
    if (node.prev) {
      node.prev.next = node;
    }
    node.next.prev = node;
  }
  pushFront(node) {
    if (node.prev) {
      node.unlink();
    }
    node.prev = this.sentinel;
    node.next = this.sentinel.next;
    node.prev.next = node;
    if (node.next) {
      node.next.prev = node;
    }
  }
  popFront() {
    const node = this.sentinel.next;
    if (node === this.sentinel) {
      return null;
    }
    node?.unlink();
    return node;
  }
  head() {
    const node = this.sentinel.next;
    if (node === this.sentinel) {
      this.cursor = null;
      return null;
    }
    this.cursor = node?.next ?? null;
    return node;
  }
  tail() {
    const node = this.sentinel.prev;
    if (node === this.sentinel) {
      this.cursor = null;
      return null;
    }
    this.cursor = node?.prev ?? null;
    return node;
  }
  next() {
    const node = this.cursor;
    if (node === this.sentinel) {
      this.cursor = null;
      return null;
    }
    this.cursor = node?.next ?? null;
    return node;
  }
  prev() {
    const node = this.cursor;
    if (node === this.sentinel) {
      this.cursor = null;
      return null;
    }
    this.cursor = node?.prev ?? null;
    return node;
  }
}

// src/util/JsUtil.ts
var sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var downloadUrl = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
function bytesToBigInt(bytes) {
  let result = 0n;
  for (let index = 0;index < bytes.length; index++) {
    result = result << 8n | BigInt(bytes[index]);
  }
  return result;
}
function bigIntToBytes(bigInt) {
  const bytes = [];
  while (bigInt > 0n) {
    bytes.unshift(Number(bigInt & 0xffn));
    bigInt >>= 8n;
  }
  if (bytes[0] & 128) {
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}
function bigIntModPow(base, exponent, modulus) {
  let result = 1n;
  while (exponent > 0n) {
    if (exponent % 2n === 1n) {
      result = result * base % modulus;
    }
    base = base * base % modulus;
    exponent >>= 1n;
  }
  return result;
}

// src/io/Packet.ts
class Packet extends Linkable2 {
  static CRC32_POLYNOMIAL = 3988292384;
  static crctable = new Int32Array(256);
  static bitmask = new Uint32Array(33);
  static cacheMin = new LinkList;
  static cacheMid = new LinkList;
  static cacheMax = new LinkList;
  static cacheMinCount = 0;
  static cacheMidCount = 0;
  static cacheMaxCount = 0;
  static {
    for (let i = 0;i < 32; i++) {
      Packet.bitmask[i] = (1 << i) - 1;
    }
    Packet.bitmask[32] = 4294967295;
    for (let i = 0;i < 256; i++) {
      let remainder = i;
      for (let bit = 0;bit < 8; bit++) {
        if ((remainder & 1) === 1) {
          remainder = remainder >>> 1 ^ Packet.CRC32_POLYNOMIAL;
        } else {
          remainder >>>= 1;
        }
      }
      Packet.crctable[i] = remainder;
    }
  }
  static getcrc(src, offset, length) {
    let crc = 4294967295;
    for (let i = offset;i < length; i++) {
      crc = crc >>> 8 ^ this.crctable[(crc ^ src[i]) & 255];
    }
    return ~crc;
  }
  static checkcrc(src, offset, length, expected = 0) {
    return Packet.getcrc(src, offset, length) == expected;
  }
  view;
  data;
  pos = 0;
  bitPos = 0;
  random = null;
  constructor(src) {
    if (!src) {
      throw new Error;
    }
    super();
    if (src instanceof Int8Array) {
      this.data = new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
    } else {
      this.data = src;
    }
    this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
  }
  get length() {
    return this.view.byteLength;
  }
  get available() {
    return this.view.byteLength - this.pos;
  }
  static alloc(type) {
    let cached = null;
    if (type === 0 && Packet.cacheMinCount > 0) {
      Packet.cacheMinCount--;
      cached = Packet.cacheMin.popFront();
    } else if (type === 1 && Packet.cacheMidCount > 0) {
      Packet.cacheMidCount--;
      cached = Packet.cacheMid.popFront();
    } else if (type === 2 && Packet.cacheMaxCount > 0) {
      Packet.cacheMaxCount--;
      cached = Packet.cacheMax.popFront();
    }
    if (cached) {
      cached.pos = 0;
      return cached;
    }
    if (type === 0) {
      return new Packet(new Uint8Array(100));
    } else if (type === 1) {
      return new Packet(new Uint8Array(5000));
    } else {
      return new Packet(new Uint8Array(30000));
    }
  }
  release() {
    this.pos = 0;
    if (this.length === 100 && Packet.cacheMinCount < 1000) {
      Packet.cacheMin.push(this);
      Packet.cacheMinCount++;
    } else if (this.length === 5000 && Packet.cacheMidCount < 250) {
      Packet.cacheMid.push(this);
      Packet.cacheMidCount++;
    } else if (this.length === 30000 && Packet.cacheMaxCount < 50) {
      Packet.cacheMax.push(this);
      Packet.cacheMaxCount++;
    }
  }
  g1() {
    return this.view.getUint8(this.pos++);
  }
  g1b() {
    return this.view.getInt8(this.pos++);
  }
  g2() {
    const result = this.view.getUint16(this.pos);
    this.pos += 2;
    return result;
  }
  g2b() {
    const result = this.view.getInt16(this.pos);
    this.pos += 2;
    return result;
  }
  g3() {
    const result = this.view.getUint8(this.pos++) << 16 | this.view.getUint16(this.pos);
    this.pos += 2;
    return result;
  }
  g4() {
    const result = this.view.getInt32(this.pos);
    this.pos += 4;
    return result;
  }
  g8() {
    const result = this.view.getBigInt64(this.pos);
    this.pos += 8;
    return result;
  }
  gsmart() {
    return this.view.getUint8(this.pos) < 128 ? this.g1() - 64 : this.g2() - 49152;
  }
  gsmarts() {
    return this.view.getUint8(this.pos) < 128 ? this.g1() : this.g2() - 32768;
  }
  gjstr() {
    const view = this.view;
    const length = view.byteLength;
    let str = "";
    let b;
    while ((b = view.getUint8(this.pos++)) !== 10 && this.pos < length) {
      str += String.fromCharCode(b);
    }
    return str;
  }
  gdata(length, offset, dest) {
    dest.set(this.data.subarray(this.pos, this.pos + length), offset);
    this.pos += length;
  }
  pIsaac(opcode) {
    this.view.setUint8(this.pos++, opcode + (this.random?.nextInt ?? 0) & 255);
  }
  p1(value) {
    this.view.setUint8(this.pos++, value);
  }
  p2(value) {
    this.view.setUint16(this.pos, value);
    this.pos += 2;
  }
  ip2(value) {
    this.view.setUint16(this.pos, value, true);
    this.pos += 2;
  }
  p3(value) {
    this.view.setUint8(this.pos++, value >> 16);
    this.view.setUint16(this.pos, value);
    this.pos += 2;
  }
  p4(value) {
    this.view.setInt32(this.pos, value);
    this.pos += 4;
  }
  ip4(value) {
    this.view.setInt32(this.pos, value, true);
    this.pos += 4;
  }
  p8(value) {
    this.view.setBigInt64(this.pos, value);
    this.pos += 8;
  }
  pjstr(str) {
    const view = this.view;
    const length = str.length;
    for (let i = 0;i < length; i++) {
      view.setUint8(this.pos++, str.charCodeAt(i));
    }
    view.setUint8(this.pos++, 10);
  }
  pdata(src, length, offset) {
    this.data.set(src.subarray(offset, offset + length), this.pos);
    this.pos += length - offset;
  }
  psize1(size) {
    this.view.setUint8(this.pos - size - 1, size);
  }
  bits() {
    this.bitPos = this.pos << 3;
  }
  bytes() {
    this.pos = this.bitPos + 7 >>> 3;
  }
  gBit(n) {
    let bytePos = this.bitPos >>> 3;
    let remaining = 8 - (this.bitPos & 7);
    let value = 0;
    this.bitPos += n;
    for (;n > remaining; remaining = 8) {
      value += (this.view.getUint8(bytePos++) & Packet.bitmask[remaining]) << n - remaining;
      n -= remaining;
    }
    if (n === remaining) {
      value += this.view.getUint8(bytePos) & Packet.bitmask[remaining];
    } else {
      value += this.view.getUint8(bytePos) >>> remaining - n & Packet.bitmask[n];
    }
    return value;
  }
  rsaenc(mod, exp) {
    const length = this.pos;
    this.pos = 0;
    const temp = new Uint8Array(length);
    this.gdata(length, 0, temp);
    const bigRaw = bytesToBigInt(temp);
    const bigEnc = bigIntModPow(bigRaw, exp, mod);
    const rawEnc = bigIntToBytes(bigEnc);
    this.pos = 0;
    this.p1(rawEnc.length);
    this.pdata(rawEnc, rawEnc.length, 0);
  }
}

// src/client/InputTracking.ts
class InputTracking {
  static active = false;
  static old = null;
  static out = null;
  static lastTime = 0;
  static trackedCount = 0;
  static lastMoveTime = 0;
  static lastX = 0;
  static lastY = 0;
  static activate() {
    this.old = Packet.alloc(1);
    this.out = null;
    this.lastTime = performance.now();
    this.active = true;
  }
  static deactivate() {
    this.active = false;
    this.old = null;
    this.out = null;
  }
  static flush() {
    let buffer = null;
    if (this.out && this.active) {
      buffer = this.out;
    }
    this.out = null;
    return buffer;
  }
  static stop() {
    let buffer = null;
    if (this.old && this.old.pos > 0 && this.active) {
      buffer = this.old;
    }
    this.deactivate();
    return buffer;
  }
  static ensureCapacity(n) {
    if (!this.old) {
      return;
    }
    if (this.old.pos + n >= 500) {
      const buffer = this.old;
      this.old = Packet.alloc(1);
      this.out = buffer;
    }
  }
  static mousePressed(x, y, button, _pointerType) {
    if (!this.old) {
      return;
    }
    if (!this.active && (x >= 0 && x < 789 && y >= 0 && y < 532)) {
      return;
    }
    this.trackedCount++;
    const now = performance.now();
    let delta = (now - this.lastTime) / 10 | 0;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = now;
    this.ensureCapacity(5);
    if (button === 2) {
      this.old.p1(1);
    } else {
      this.old.p1(2);
    }
    this.old.p1(delta);
    this.old.p3(x + (y << 10));
  }
  static mouseReleased(button, _pointerType) {
    if (!this.old) {
      return;
    }
    if (!this.active) {
      return;
    }
    this.trackedCount++;
    const now = performance.now();
    let delta = (now - this.lastTime) / 10 | 0;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = now;
    this.ensureCapacity(2);
    if (button === 2) {
      this.old.p1(3);
    } else {
      this.old.p1(4);
    }
    this.old.p1(delta);
  }
  static mouseMoved(x, y, _pointerType) {
    if (!this.old) {
      return;
    }
    if (!this.active && (x >= 0 && x < 789 && y >= 0 && y < 532)) {
      return;
    }
    const now = performance.now();
    if (now - this.lastMoveTime < 50) {
      return;
    }
    this.lastMoveTime = now;
    this.trackedCount++;
    let delta = (now - this.lastTime) / 10 | 0;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = now;
    if (x - this.lastX < 8 && x - this.lastX >= -8 && y - this.lastY < 8 && y - this.lastY >= -8) {
      this.ensureCapacity(3);
      this.old.p1(5);
      this.old.p1(delta);
      this.old.p1(x + (y - this.lastY + 8 << 4) + 8 - this.lastX);
    } else if (x - this.lastX < 128 && x - this.lastX >= -128 && y - this.lastY < 128 && y - this.lastY >= -128) {
      this.ensureCapacity(4);
      this.old.p1(6);
      this.old.p1(delta);
      this.old.p1(x + 128 - this.lastX);
      this.old.p1(y + 128 - this.lastY);
    } else {
      this.ensureCapacity(5);
      this.old.p1(7);
      this.old.p1(delta);
      this.old.p3(x + (y << 10));
    }
    this.lastX = x;
    this.lastY = y;
  }
  static keyPressed(key) {
    if (!this.old) {
      return;
    }
    if (!this.active) {
      return;
    }
    this.trackedCount++;
    const now = performance.now();
    let delta = (now - this.lastTime) / 10 | 0;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = now;
    if (key === 1000) {
      key = 11;
    } else if (key === 1001) {
      key = 12;
    } else if (key === 1002) {
      key = 14;
    } else if (key === 1003) {
      key = 15;
    } else if (key >= 1008) {
      key -= 992;
    }
    this.ensureCapacity(3);
    this.old.p1(8);
    this.old.p1(delta);
    this.old.p1(key);
  }
  static keyReleased(key) {
    if (!this.old) {
      return;
    }
    if (!this.active) {
      return;
    }
    this.trackedCount++;
    const now = performance.now();
    let delta = (now - this.lastTime) / 10 | 0;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = now;
    if (key === 1000) {
      key = 11;
    } else if (key === 1001) {
      key = 12;
    } else if (key === 1002) {
      key = 14;
    } else if (key === 1003) {
      key = 15;
    } else if (key >= 1008) {
      key -= 992;
    }
    this.ensureCapacity(3);
    this.old.p1(9);
    this.old.p1(delta);
    this.old.p1(key);
  }
  static focusGained() {
    if (!this.old) {
      return;
    }
    if (!this.active) {
      return;
    }
    this.trackedCount++;
    const now = performance.now();
    let delta = (now - this.lastTime) / 10 | 0;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = now;
    this.ensureCapacity(2);
    this.old.p1(10);
    this.old.p1(delta);
  }
  static focusLost() {
    if (!this.old) {
      return;
    }
    if (!this.active) {
      return;
    }
    this.trackedCount++;
    const now = performance.now();
    let delta = (now - this.lastTime) / 10 | 0;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = now;
    this.ensureCapacity(2);
    this.old.p1(11);
    this.old.p1(delta);
  }
  static mouseEntered() {
    if (!this.old) {
      return;
    }
    if (!this.active) {
      return;
    }
    this.trackedCount++;
    const now = performance.now();
    let delta = (now - this.lastTime) / 10 | 0;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = now;
    this.ensureCapacity(2);
    this.old.p1(12);
    this.old.p1(delta);
  }
  static mouseExited() {
    if (!this.old) {
      return;
    }
    if (!this.active) {
      return;
    }
    this.trackedCount++;
    const now = performance.now();
    let delta = (now - this.lastTime) / 10 | 0;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = now;
    this.ensureCapacity(2);
    this.old.p1(13);
    this.old.p1(delta);
  }
}

// src/client/KeyCodes.ts
var CanvasEnabledKeys = ["F11", "F12"];
var KeyCodes = new Map;
KeyCodes.set("ArrowLeft", { code: 37, ch: 1 });
KeyCodes.set("ArrowRight", { code: 39, ch: 2 });
KeyCodes.set("ArrowUp", { code: 38, ch: 3 });
KeyCodes.set("ArrowDown", { code: 40, ch: 4 });
KeyCodes.set("Control", { code: 17, ch: 5 });
KeyCodes.set("Shift", { code: 16, ch: 6 });
KeyCodes.set("Alt", { code: 18, ch: 7 });
KeyCodes.set("Backspace", { code: 8, ch: 8 });
KeyCodes.set("Tab", { code: 9, ch: 9 });
KeyCodes.set("Enter", { code: 10, ch: 10 });
KeyCodes.set("Escape", { code: 27, ch: 27 });
KeyCodes.set(" ", { code: 32, ch: 32 });
KeyCodes.set("Delete", { code: 127, ch: 127 });
KeyCodes.set("Home", { code: 36, ch: 1000 });
KeyCodes.set("End", { code: 35, ch: 1001 });
KeyCodes.set("PageUp", { code: 33, ch: 1002 });
KeyCodes.set("PageDown", { code: 34, ch: 1003 });
KeyCodes.set("F1", { code: 112, ch: 1008 });
KeyCodes.set("F2", { code: 113, ch: 1009 });
KeyCodes.set("F3", { code: 114, ch: 1010 });
KeyCodes.set("F4", { code: 115, ch: 1011 });
KeyCodes.set("F5", { code: 116, ch: 1012 });
KeyCodes.set("F6", { code: 117, ch: 1013 });
KeyCodes.set("F7", { code: 118, ch: 1014 });
KeyCodes.set("F8", { code: 119, ch: 1015 });
KeyCodes.set("F9", { code: 120, ch: 1016 });
KeyCodes.set("F10", { code: 121, ch: 1017 });
KeyCodes.set("F11", { code: 122, ch: 1018 });
KeyCodes.set("F12", { code: 123, ch: 1019 });
KeyCodes.set("CapsLock", { code: 20, ch: 65535 });
KeyCodes.set("Meta", { code: 524, ch: 65535 });
KeyCodes.set("Insert", { code: 155, ch: 65535 });
KeyCodes.set("`", { code: 192, ch: 96 });
KeyCodes.set("~", { code: 192, ch: 126 });
KeyCodes.set("!", { code: 49, ch: 33 });
KeyCodes.set("@", { code: 50, ch: 64 });
KeyCodes.set("#", { code: 51, ch: 35 });
KeyCodes.set("£", { code: 51, ch: 163 });
KeyCodes.set("$", { code: 52, ch: 36 });
KeyCodes.set("%", { code: 53, ch: 37 });
KeyCodes.set("^", { code: 54, ch: 94 });
KeyCodes.set("&", { code: 55, ch: 38 });
KeyCodes.set("*", { code: 56, ch: 42 });
KeyCodes.set("(", { code: 57, ch: 40 });
KeyCodes.set(")", { code: 48, ch: 41 });
KeyCodes.set("-", { code: 45, ch: 45 });
KeyCodes.set("_", { code: 45, ch: 95 });
KeyCodes.set("=", { code: 61, ch: 61 });
KeyCodes.set("+", { code: 61, ch: 43 });
KeyCodes.set("[", { code: 91, ch: 91 });
KeyCodes.set("{", { code: 91, ch: 123 });
KeyCodes.set("]", { code: 93, ch: 93 });
KeyCodes.set("}", { code: 93, ch: 125 });
KeyCodes.set("\\", { code: 92, ch: 92 });
KeyCodes.set("|", { code: 92, ch: 124 });
KeyCodes.set(";", { code: 59, ch: 59 });
KeyCodes.set(":", { code: 59, ch: 58 });
KeyCodes.set("'", { code: 222, ch: 39 });
KeyCodes.set('"', { code: 222, ch: 34 });
KeyCodes.set(",", { code: 44, ch: 44 });
KeyCodes.set("<", { code: 44, ch: 60 });
KeyCodes.set(".", { code: 46, ch: 46 });
KeyCodes.set(">", { code: 46, ch: 62 });
KeyCodes.set("/", { code: 47, ch: 47 });
KeyCodes.set("?", { code: 47, ch: 63 });
KeyCodes.set("0", { code: 48, ch: 48 });
KeyCodes.set("1", { code: 49, ch: 49 });
KeyCodes.set("2", { code: 50, ch: 50 });
KeyCodes.set("3", { code: 51, ch: 51 });
KeyCodes.set("4", { code: 52, ch: 52 });
KeyCodes.set("5", { code: 53, ch: 53 });
KeyCodes.set("6", { code: 54, ch: 54 });
KeyCodes.set("7", { code: 55, ch: 55 });
KeyCodes.set("8", { code: 56, ch: 56 });
KeyCodes.set("9", { code: 57, ch: 57 });
KeyCodes.set("a", { code: 65, ch: 97 });
KeyCodes.set("b", { code: 66, ch: 98 });
KeyCodes.set("c", { code: 67, ch: 99 });
KeyCodes.set("d", { code: 68, ch: 100 });
KeyCodes.set("e", { code: 69, ch: 101 });
KeyCodes.set("f", { code: 70, ch: 102 });
KeyCodes.set("g", { code: 71, ch: 103 });
KeyCodes.set("h", { code: 72, ch: 104 });
KeyCodes.set("i", { code: 73, ch: 105 });
KeyCodes.set("j", { code: 74, ch: 106 });
KeyCodes.set("k", { code: 75, ch: 107 });
KeyCodes.set("l", { code: 76, ch: 108 });
KeyCodes.set("m", { code: 77, ch: 109 });
KeyCodes.set("n", { code: 78, ch: 110 });
KeyCodes.set("o", { code: 79, ch: 111 });
KeyCodes.set("p", { code: 80, ch: 112 });
KeyCodes.set("q", { code: 81, ch: 113 });
KeyCodes.set("r", { code: 82, ch: 114 });
KeyCodes.set("s", { code: 83, ch: 115 });
KeyCodes.set("t", { code: 84, ch: 116 });
KeyCodes.set("u", { code: 85, ch: 117 });
KeyCodes.set("v", { code: 86, ch: 118 });
KeyCodes.set("w", { code: 87, ch: 119 });
KeyCodes.set("x", { code: 88, ch: 120 });
KeyCodes.set("y", { code: 89, ch: 121 });
KeyCodes.set("z", { code: 90, ch: 122 });
KeyCodes.set("A", { code: 65, ch: 65 });
KeyCodes.set("B", { code: 66, ch: 66 });
KeyCodes.set("C", { code: 67, ch: 67 });
KeyCodes.set("D", { code: 68, ch: 68 });
KeyCodes.set("E", { code: 69, ch: 69 });
KeyCodes.set("F", { code: 70, ch: 70 });
KeyCodes.set("G", { code: 71, ch: 71 });
KeyCodes.set("H", { code: 72, ch: 72 });
KeyCodes.set("I", { code: 73, ch: 73 });
KeyCodes.set("J", { code: 74, ch: 74 });
KeyCodes.set("K", { code: 75, ch: 75 });
KeyCodes.set("L", { code: 76, ch: 76 });
KeyCodes.set("M", { code: 77, ch: 77 });
KeyCodes.set("N", { code: 78, ch: 78 });
KeyCodes.set("O", { code: 79, ch: 79 });
KeyCodes.set("P", { code: 80, ch: 80 });
KeyCodes.set("Q", { code: 81, ch: 81 });
KeyCodes.set("R", { code: 82, ch: 82 });
KeyCodes.set("S", { code: 83, ch: 83 });
KeyCodes.set("T", { code: 84, ch: 84 });
KeyCodes.set("U", { code: 85, ch: 85 });
KeyCodes.set("V", { code: 86, ch: 86 });
KeyCodes.set("W", { code: 87, ch: 87 });
KeyCodes.set("X", { code: 88, ch: 88 });
KeyCodes.set("Y", { code: 89, ch: 89 });
KeyCodes.set("Z", { code: 90, ch: 90 });

// src/graphics/Canvas.ts
var canvas = document.getElementById("canvas");
var canvas2d = canvas?.getContext("2d", {
  desynchronized: false,
  alpha: false
});
function saveDataURL(dataURL, filename) {
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// src/graphics/Pix2D.ts
class Pix2D extends Linkable2 {
  static pixels = new Int32Array;
  static width = 0;
  static height = 0;
  static clipMinX = 0;
  static clipMaxX = 0;
  static clipMinY = 0;
  static clipMaxY = 0;
  static sizeX = 0;
  static maxX = 0;
  static maxY = 0;
  static setPixels(pixels, width, height) {
    this.pixels = pixels;
    this.width = width;
    this.height = height;
    this.setClipping(0, 0, width, height);
  }
  static resetClipping() {
    this.clipMinX = 0;
    this.clipMinY = 0;
    this.clipMaxX = this.width;
    this.clipMaxY = this.height;
    this.sizeX = this.clipMaxX - 1;
    this.maxX = this.clipMaxX / 2 | 0;
  }
  static setClipping(x1, y1, x2, y2) {
    if (x1 < 0) {
      x1 = 0;
    }
    if (y1 < 0) {
      y1 = 0;
    }
    if (x2 > this.width) {
      x2 = this.width;
    }
    if (y2 > this.height) {
      y2 = this.height;
    }
    this.clipMinY = y1;
    this.clipMaxY = y2;
    this.clipMinX = x1;
    this.clipMaxX = x2;
    this.sizeX = this.clipMaxX - 1;
    this.maxX = this.clipMaxX / 2 | 0;
    this.maxY = this.clipMaxY / 2 | 0;
  }
  static cls() {
    const len = this.width * this.height;
    for (let i = 0;i < len; i++) {
      this.pixels[i] = 0;
    }
  }
  static fillRectTrans(x, y, width, height, rgb, alpha) {
    if (x < this.clipMinX) {
      width -= this.clipMinX - x;
      x = this.clipMinX;
    }
    if (y < this.clipMinY) {
      height -= this.clipMinY - y;
      y = this.clipMinY;
    }
    if (x + width > this.clipMaxX) {
      width = this.clipMaxX - x;
    }
    if (y + height > this.clipMaxY) {
      height = this.clipMaxY - y;
    }
    const invAlpha = 256 - alpha;
    const r0 = (rgb >> 16 & 255) * alpha;
    const g0 = (rgb >> 8 & 255) * alpha;
    const b0 = (rgb & 255) * alpha;
    const step = this.width - width;
    let offset = x + y * this.width;
    for (let i = 0;i < height; i++) {
      for (let j = -width;j < 0; j++) {
        const r1 = (this.pixels[offset] >> 16 & 255) * invAlpha;
        const g1 = (this.pixels[offset] >> 8 & 255) * invAlpha;
        const b1 = (this.pixels[offset] & 255) * invAlpha;
        const mixed = (r0 + r1 >> 8 << 16) + (g0 + g1 >> 8 << 8) + (b0 + b1 >> 8);
        this.pixels[offset++] = mixed;
      }
      offset += step;
    }
  }
  static fillRect(x, y, width, height, rgb) {
    if (x < this.clipMinX) {
      width -= this.clipMinX - x;
      x = this.clipMinX;
    }
    if (y < this.clipMinY) {
      height -= this.clipMinY - y;
      y = this.clipMinY;
    }
    if (x + width > this.clipMaxX) {
      width = this.clipMaxX - x;
    }
    if (y + height > this.clipMaxY) {
      height = this.clipMaxY - y;
    }
    const step = this.width - width;
    let offset = x + y * this.width;
    for (let i = -height;i < 0; i++) {
      for (let j = -width;j < 0; j++) {
        this.pixels[offset++] = rgb;
      }
      offset += step;
    }
  }
  static drawRect(x, y, w, h, rgb) {
    this.hline(x, y, w, rgb);
    this.hline(x, y + h - 1, w, rgb);
    this.vline(x, y, h, rgb);
    this.vline(x + w - 1, y, h, rgb);
  }
  static drawRectTrans(x, y, w, h, rgb, alpha) {
    this.hlineTrans(x, y, w, rgb, alpha);
    this.hlineTrans(x, y + h - 1, w, rgb, alpha);
    if (h >= 3) {
      this.vlineTrans(x, y, h, rgb, alpha);
      this.vlineTrans(x + w - 1, y, h, rgb, alpha);
    }
  }
  static hline(x, y, width, rgb) {
    if (y < this.clipMinY || y >= this.clipMaxY) {
      return;
    }
    if (x < this.clipMinX) {
      width -= this.clipMinX - x;
      x = this.clipMinX;
    }
    if (x + width > this.clipMaxX) {
      width = this.clipMaxX - x;
    }
    const off = x + y * this.width;
    for (let i = 0;i < width; i++) {
      this.pixels[off + i] = rgb;
    }
  }
  static hlineTrans(x, y, width, rgb, alpha) {
    if (y < this.clipMinY || y >= this.clipMaxY) {
      return;
    }
    if (x < this.clipMinX) {
      width -= this.clipMinX - x;
      x = this.clipMinX;
    }
    if (x + width > this.clipMaxX) {
      width = this.clipMaxX - x;
    }
    const invAlpha = 256 - alpha;
    const r0 = (rgb >> 16 & 255) * alpha;
    const g0 = (rgb >> 8 & 255) * alpha;
    const b0 = (rgb & 255) * alpha;
    const _step = this.width - width;
    let offset = x + y * this.width;
    for (let i = 0;i < width; i++) {
      const r1 = (this.pixels[offset] >> 16 & 255) * invAlpha;
      const g1 = (this.pixels[offset] >> 8 & 255) * invAlpha;
      const b1 = (this.pixels[offset] & 255) * invAlpha;
      const mixed = (r0 + r1 >> 8 << 16) + (g0 + g1 >> 8 << 8) + (b0 + b1 >> 8);
      this.pixels[offset++] = mixed;
    }
  }
  static vline(x, y, height, rgb) {
    if (x < this.clipMinX || x >= this.clipMaxX) {
      return;
    }
    if (y < this.clipMinY) {
      height -= this.clipMinY - y;
      y = this.clipMinY;
    }
    if (y + height > this.clipMaxY) {
      height = this.clipMaxY - y;
    }
    const off = x + y * this.width;
    for (let i = 0;i < height; i++) {
      this.pixels[off + i * this.width] = rgb;
    }
  }
  static vlineTrans(x, y, height, rgb, alpha) {
    if (x < this.clipMinX || x >= this.clipMaxX) {
      return;
    }
    if (y < this.clipMinY) {
      height -= this.clipMinY - y;
      y = this.clipMinY;
    }
    if (y + height > this.clipMaxY) {
      height = this.clipMaxY - y;
    }
    const invAlpha = 256 - alpha;
    const r0 = (rgb >> 16 & 255) * alpha;
    const g0 = (rgb >> 8 & 255) * alpha;
    const b0 = (rgb & 255) * alpha;
    let offset = x + y * this.width;
    for (let i = 0;i < height; i++) {
      const r1 = (this.pixels[offset] >> 16 & 255) * invAlpha;
      const g1 = (this.pixels[offset] >> 8 & 255) * invAlpha;
      const b1 = (this.pixels[offset] & 255) * invAlpha;
      const mixed = (r0 + r1 >> 8 << 16) + (g0 + g1 >> 8 << 8) + (b0 + b1 >> 8);
      this.pixels[offset] = mixed;
      offset += this.width;
    }
  }
  static fillCircle(xCenter, yCenter, yRadius, rgb, alpha) {
    const invAlpha = 256 - alpha;
    const r0 = (rgb >> 16 & 255) * alpha;
    const g0 = (rgb >> 8 & 255) * alpha;
    const b0 = (rgb & 255) * alpha;
    let yStart = yCenter - yRadius;
    if (yStart < 0) {
      yStart = 0;
    }
    let yEnd = yCenter + yRadius;
    if (yEnd >= this.height) {
      yEnd = this.height - 1;
    }
    for (let y = yStart;y <= yEnd; y++) {
      const midpoint = y - yCenter;
      const xRadius = Math.sqrt(yRadius * yRadius - midpoint * midpoint) | 0;
      let xStart = xCenter - xRadius;
      if (xStart < 0) {
        xStart = 0;
      }
      let xEnd = xCenter + xRadius;
      if (xEnd >= this.width) {
        xEnd = this.width - 1;
      }
      let offset = xStart + y * this.width;
      for (let x = xStart;x <= xEnd; x++) {
        const r1 = (this.pixels[offset] >> 16 & 255) * invAlpha;
        const g1 = (this.pixels[offset] >> 8 & 255) * invAlpha;
        const b1 = (this.pixels[offset] & 255) * invAlpha;
        const mixed = (r0 + r1 >> 8 << 16) + (g0 + g1 >> 8 << 8) + (b0 + b1 >> 8);
        this.pixels[offset++] = mixed;
      }
    }
  }
}

// src/graphics/Pix8.ts
class Pix8 extends Pix2D {
  data;
  bpal;
  wi;
  hi;
  xof;
  yof;
  owi;
  ohi;
  constructor(width, height, palette) {
    super();
    this.data = new Int8Array(width * height);
    this.wi = this.owi = width;
    this.hi = this.ohi = height;
    this.xof = this.yof = 0;
    this.bpal = palette;
  }
  static depack(jag, name, sprite = 0) {
    const dat = new Packet(jag.read(name + ".dat"));
    const index = new Packet(jag.read("index.dat"));
    index.pos = dat.g2();
    const owi = index.g2();
    const ohi = index.g2();
    const bpalCount = index.g1();
    const bpal = new Int32Array(bpalCount);
    for (let i = 0;i < bpalCount - 1; i++) {
      bpal[i + 1] = index.g3();
    }
    for (let i = 0;i < sprite; i++) {
      index.pos += 2;
      dat.pos += index.g2() * index.g2();
      index.pos += 1;
    }
    if (dat.pos > dat.length || index.pos > index.length) {
      throw new Error;
    }
    const xof = index.g1();
    const yof = index.g1();
    const wi = index.g2();
    const hi = index.g2();
    const image = new Pix8(wi, hi, bpal);
    image.xof = xof;
    image.yof = yof;
    image.owi = owi;
    image.ohi = ohi;
    const encoding = index.g1();
    if (encoding === 0) {
      for (let i = 0;i < image.wi * image.hi; i++) {
        image.data[i] = dat.g1b();
      }
    } else if (encoding === 1) {
      for (let x = 0;x < image.wi; x++) {
        for (let y = 0;y < image.hi; y++) {
          image.data[x + y * image.wi] = dat.g1b();
        }
      }
    }
    return image;
  }
  halveSize() {
    this.owi |= 0;
    this.ohi |= 0;
    this.owi /= 2;
    this.ohi /= 2;
    this.owi |= 0;
    this.ohi |= 0;
    const pixels = new Int8Array(this.owi * this.ohi);
    let off = 0;
    for (let y = 0;y < this.hi; y++) {
      for (let x = 0;x < this.wi; x++) {
        pixels[(x + this.xof >> 1) + (y + this.yof >> 1) * this.owi] = this.data[off++];
      }
    }
    this.data = pixels;
    this.wi = this.owi;
    this.hi = this.ohi;
    this.xof = 0;
    this.yof = 0;
  }
  trim() {
    if (this.wi === this.owi && this.hi === this.ohi) {
      return;
    }
    const pixels = new Int8Array(this.owi * this.ohi);
    let off = 0;
    for (let y = 0;y < this.hi; y++) {
      for (let x = 0;x < this.wi; x++) {
        pixels[x + this.xof + (y + this.yof) * this.owi] = this.data[off++];
      }
    }
    this.data = pixels;
    this.wi = this.owi;
    this.hi = this.ohi;
    this.xof = 0;
    this.yof = 0;
  }
  rgbAdjust(r, g, b) {
    for (let i = 0;i < this.bpal.length; i++) {
      let red = this.bpal[i] >> 16 & 255;
      red += r;
      if (red < 0) {
        red = 0;
      } else if (red > 255) {
        red = 255;
      }
      let green = this.bpal[i] >> 8 & 255;
      green += g;
      if (green < 0) {
        green = 0;
      } else if (green > 255) {
        green = 255;
      }
      let blue = this.bpal[i] & 255;
      blue += b;
      if (blue < 0) {
        blue = 0;
      } else if (blue > 255) {
        blue = 255;
      }
      this.bpal[i] = (red << 16) + (green << 8) + blue;
    }
  }
  hflip() {
    const pixels = this.data;
    const width = this.wi;
    const height = this.hi;
    for (let y = 0;y < height; y++) {
      const div = width / 2 | 0;
      for (let x = 0;x < div; x++) {
        const off1 = x + y * width;
        const off2 = width - x - 1 + y * width;
        const tmp = pixels[off1];
        pixels[off1] = pixels[off2];
        pixels[off2] = tmp;
      }
    }
  }
  vflip() {
    const pixels = this.data;
    const width = this.wi;
    const height = this.hi;
    for (let y = 0;y < (height / 2 | 0); y++) {
      for (let x = 0;x < width; x++) {
        const off1 = x + y * width;
        const off2 = x + (height - y - 1) * width;
        const tmp = pixels[off1];
        pixels[off1] = pixels[off2];
        pixels[off2] = tmp;
      }
    }
  }
  plotSprite(x, y) {
    x |= 0;
    y |= 0;
    x += this.xof;
    y += this.yof;
    let dstOff = x + y * Pix2D.width;
    let srcOff = 0;
    let h = this.hi;
    let w = this.wi;
    let dstStep = Pix2D.width - w;
    let srcStep = 0;
    if (y < Pix2D.clipMinY) {
      const cutoff = Pix2D.clipMinY - y;
      h -= cutoff;
      y = Pix2D.clipMinY;
      srcOff += cutoff * w;
      dstOff += cutoff * Pix2D.width;
    }
    if (y + h > Pix2D.clipMaxY) {
      h -= y + h - Pix2D.clipMaxY;
    }
    if (x < Pix2D.clipMinX) {
      const cutoff = Pix2D.clipMinX - x;
      w -= cutoff;
      x = Pix2D.clipMinX;
      srcOff += cutoff;
      dstOff += cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (x + w > Pix2D.clipMaxX) {
      const cutoff = x + w - Pix2D.clipMaxX;
      w -= cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (w > 0 && h > 0) {
      this.plot(w, h, this.data, srcOff, srcStep, Pix2D.pixels, dstOff, dstStep);
    }
  }
  plot(w, h, src, srcOff, srcStep, dst, dstOff, dstStep) {
    const qw = -(w >> 2);
    w = -(w & 3);
    for (let y = -h;y < 0; y++) {
      for (let x = qw;x < 0; x++) {
        let palIndex = src[srcOff++];
        if (palIndex === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = this.bpal[palIndex & 255];
        }
        palIndex = src[srcOff++];
        if (palIndex === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = this.bpal[palIndex & 255];
        }
        palIndex = src[srcOff++];
        if (palIndex === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = this.bpal[palIndex & 255];
        }
        palIndex = src[srcOff++];
        if (palIndex === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = this.bpal[palIndex & 255];
        }
      }
      for (let x = w;x < 0; x++) {
        const palIndex = src[srcOff++];
        if (palIndex === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = this.bpal[palIndex & 255];
        }
      }
      dstOff += dstStep;
      srcOff += srcStep;
    }
  }
  scalePlotSprite(arg0, arg1, arg2, arg3) {
    try {
      const local2 = this.wi;
      const local5 = this.hi;
      let local7 = 0;
      let local9 = 0;
      const _local15 = (local2 << 16) / arg2 | 0;
      const _local21 = (local5 << 16) / arg3 | 0;
      const local24 = this.owi;
      const local27 = this.ohi;
      const local33 = (local24 << 16) / arg2 | 0;
      const local39 = (local27 << 16) / arg3 | 0;
      arg0 = arg0 + (this.xof * arg2 + local24 - 1) / local24 | 0;
      arg1 = arg1 + (this.yof * arg3 + local27 - 1) / local27 | 0;
      if (this.xof * arg2 % local24 != 0) {
        local7 = (local24 - this.xof * arg2 % local24 << 16) / arg2 | 0;
      }
      if (this.yof * arg3 % local27 != 0) {
        local9 = (local27 - this.yof * arg3 % local27 << 16) / arg3 | 0;
      }
      arg2 = arg2 * (this.wi - (local7 >> 16)) / local24 | 0;
      arg3 = arg3 * (this.hi - (local9 >> 16)) / local27 | 0;
      let local133 = arg0 + arg1 * Pix2D.width;
      let local137 = Pix2D.width - arg2;
      let local144;
      if (arg1 < Pix2D.clipMinY) {
        local144 = Pix2D.clipMinY - arg1;
        arg3 -= local144;
        arg1 = 0;
        local133 += local144 * Pix2D.width;
        local9 += local39 * local144;
      }
      if (arg1 + arg3 > Pix2D.clipMaxY) {
        arg3 -= arg1 + arg3 - Pix2D.clipMaxY;
      }
      if (arg0 < Pix2D.clipMinX) {
        local144 = Pix2D.clipMinX - arg0;
        arg2 -= local144;
        arg0 = 0;
        local133 += local144;
        local7 += local33 * local144;
        local137 += local144;
      }
      if (arg0 + arg2 > Pix2D.clipMaxX) {
        local144 = arg0 + arg2 - Pix2D.clipMaxX;
        arg2 -= local144;
        local137 += local144;
      }
      this.plotScale(Pix2D.pixels, this.data, this.bpal, local7, local9, local133, local137, arg2, arg3, local33, local39, local2);
    } catch (_e) {
      console.log("error in sprite clipping routine");
    }
  }
  plotScale(dst, src, bpal, offW, offH, dstOff, dstStep, w, h, scaleCropWidth, scaleCropHeight, arg11) {
    try {
      const lastOffW = offW;
      for (let y = -h;y < 0; y++) {
        const offY = (offH >> 16) * arg11;
        for (let x = -w;x < 0; x++) {
          const rgb = src[(offW >> 16) + offY];
          if (rgb == 0) {
            dstOff++;
          } else {
            dst[dstOff++] = bpal[rgb & 255];
          }
          offW += scaleCropWidth;
        }
        offH += scaleCropHeight;
        offW = lastOffW;
        dstOff += dstStep;
      }
    } catch (_e) {
      console.log("error in plot_scale");
    }
  }
}

// src/util/Arrays.ts
class TypedArray1d extends Array {
  constructor(length, defaultValue) {
    super(length);
    for (let l = 0;l < length; l++) {
      this[l] = defaultValue;
    }
  }
}

class TypedArray2d extends Array {
  constructor(length, width, defaultValue) {
    super(length);
    for (let l = 0;l < length; l++) {
      this[l] = new Array(width);
      for (let w = 0;w < width; w++) {
        this[l][w] = defaultValue;
      }
    }
  }
}
class Int32Array2d extends Array {
  constructor(length, width) {
    super(length);
    for (let l = 0;l < length; l++) {
      this[l] = new Int32Array(width);
    }
  }
}

// src/dash3d/Pix3D.ts
class Pix3D extends Pix2D {
  static lowMem = false;
  static lowDetail = true;
  static divTable = new Int32Array(512);
  static divTable2 = new Int32Array(2048);
  static sinTable = new Int32Array(2048);
  static cosTable = new Int32Array(2048);
  static colourTable = new Int32Array(65536);
  static textures = new TypedArray1d(50, null);
  static textureTranslucent = new TypedArray1d(50, false);
  static averageTextureRgb = new Int32Array(50);
  static activeTexels = new TypedArray1d(50, null);
  static textureCycle = new Int32Array(50);
  static texPal = new TypedArray1d(50, null);
  static textureCount = 0;
  static originX = 0;
  static originY = 0;
  static texelPool = null;
  static poolSize = 0;
  static opaque = false;
  static cycle = 0;
  static scanline = new Int32Array;
  static hclip = false;
  static trans = 0;
  static {
    for (let i = 1;i < 512; i++) {
      this.divTable[i] = 32768 / i | 0;
    }
    for (let i = 1;i < 2048; i++) {
      this.divTable2[i] = 65536 / i | 0;
    }
    for (let i = 0;i < 2048; i++) {
      this.sinTable[i] = Math.sin(i * 0.0030679615757712823) * 65536 | 0;
      this.cosTable[i] = Math.cos(i * 0.0030679615757712823) * 65536 | 0;
    }
  }
  static setRenderClipping() {
    this.scanline = new Int32Array(Pix2D.height);
    for (let y = 0;y < Pix2D.height; y++) {
      this.scanline[y] = Pix2D.width * y;
    }
    this.originX = Pix2D.width / 2 | 0;
    this.originY = Pix2D.height / 2 | 0;
  }
  static setClipping(width, height) {
    this.scanline = new Int32Array(height);
    for (let y = 0;y < height; y++) {
      this.scanline[y] = width * y;
    }
    this.originX = width / 2 | 0;
    this.originY = height / 2 | 0;
  }
  static clearTexels() {
    this.texelPool = null;
    this.activeTexels.fill(null);
  }
  static initPool(size) {
    if (this.texelPool) {
      return;
    }
    this.poolSize = size;
    if (this.lowMem) {
      this.texelPool = new Int32Array2d(size, 16384);
    } else {
      this.texelPool = new Int32Array2d(size, 65536);
    }
    this.activeTexels.fill(null);
  }
  static unpackTextures(textures) {
    this.textureCount = 0;
    for (let i = 0;i < 50; i++) {
      try {
        this.textures[i] = Pix8.depack(textures, i.toString());
        if (this.lowMem && this.textures[i]?.owi === 128) {
          this.textures[i]?.halveSize();
        } else {
          this.textures[i]?.trim();
        }
        this.textureCount++;
      } catch (_e) {}
    }
  }
  static getAverageTextureRgb(id) {
    if (this.averageTextureRgb[id] !== 0) {
      return this.averageTextureRgb[id];
    }
    const palette = this.texPal[id];
    if (!palette) {
      return 0;
    }
    let r = 0;
    let g = 0;
    let b = 0;
    const length = palette.length;
    for (let i = 0;i < length; i++) {
      r += palette[i] >> 16 & 255;
      g += palette[i] >> 8 & 255;
      b += palette[i] & 255;
    }
    let rgb = ((r / length | 0) << 16) + ((g / length | 0) << 8) + (b / length | 0);
    rgb = this.gammaCorrect(rgb, 1.4);
    if (rgb === 0) {
      rgb = 1;
    }
    this.averageTextureRgb[id] = rgb;
    return rgb;
  }
  static pushTexture(id) {
    if (this.activeTexels[id] && this.texelPool) {
      this.texelPool[this.poolSize++] = this.activeTexels[id];
      this.activeTexels[id] = null;
    }
  }
  static getTexels(id) {
    this.textureCycle[id] = this.cycle++;
    if (this.activeTexels[id]) {
      return this.activeTexels[id];
    }
    let texels;
    if (this.poolSize > 0 && this.texelPool) {
      texels = this.texelPool[--this.poolSize];
      this.texelPool[this.poolSize] = null;
    } else {
      let cycle = 0;
      let selected = -1;
      for (let t = 0;t < this.textureCount; t++) {
        if (this.activeTexels[t] && (this.textureCycle[t] < cycle || selected === -1)) {
          cycle = this.textureCycle[t];
          selected = t;
        }
      }
      texels = this.activeTexels[selected];
      this.activeTexels[selected] = null;
    }
    this.activeTexels[id] = texels;
    const texture = this.textures[id];
    const palette = this.texPal[id];
    if (!texels || !texture || !palette) {
      return null;
    }
    if (this.lowMem) {
      this.textureTranslucent[id] = false;
      for (let i = 0;i < 4096; i++) {
        const rgb = texels[i] = palette[texture.data[i]] & 16316671;
        if (rgb === 0) {
          this.textureTranslucent[id] = true;
        }
        texels[i + 4096] = rgb - (rgb >>> 3) & 16316671;
        texels[i + 8192] = rgb - (rgb >>> 2) & 16316671;
        texels[i + 12288] = rgb - (rgb >>> 2) - (rgb >>> 3) & 16316671;
      }
    } else {
      if (texture.wi === 64) {
        for (let y = 0;y < 128; y++) {
          for (let x = 0;x < 128; x++) {
            texels[x + (y << 7 | 0)] = palette[texture.data[(x >> 1) + (y >> 1 << 6 | 0)]];
          }
        }
      } else {
        for (let i = 0;i < 16384; i++) {
          texels[i] = palette[texture.data[i]];
        }
      }
      this.textureTranslucent[id] = false;
      for (let i = 0;i < 16384; i++) {
        texels[i] &= 16316671;
        const rgb = texels[i];
        if (rgb === 0) {
          this.textureTranslucent[id] = true;
        }
        texels[i + 16384] = rgb - (rgb >>> 3) & 16316671;
        texels[i + 32768] = rgb - (rgb >>> 2) & 16316671;
        texels[i + 49152] = rgb - (rgb >>> 2) - (rgb >>> 3) & 16316671;
      }
    }
    return texels;
  }
  static initColourTable(brightness) {
    const randomBrightness = brightness + Math.random() * 0.03 - 0.015;
    let offset = 0;
    for (let y = 0;y < 512; y++) {
      const hue = (y / 8 | 0) / 64 + 0.0078125;
      const saturation = (y & 7) / 8 + 0.0625;
      for (let x = 0;x < 128; x++) {
        const lightness = x / 128;
        let r = lightness;
        let g = lightness;
        let b = lightness;
        if (saturation !== 0) {
          let q;
          if (lightness < 0.5) {
            q = lightness * (saturation + 1);
          } else {
            q = lightness + saturation - lightness * saturation;
          }
          const p = lightness * 2 - q;
          let t = hue + 0.3333333333333333;
          if (t > 1) {
            t--;
          }
          let d11 = hue - 0.3333333333333333;
          if (d11 < 0) {
            d11++;
          }
          if (t * 6 < 1) {
            r = p + (q - p) * 6 * t;
          } else if (t * 2 < 1) {
            r = q;
          } else if (t * 3 < 2) {
            r = p + (q - p) * (0.6666666666666666 - t) * 6;
          } else {
            r = p;
          }
          if (hue * 6 < 1) {
            g = p + (q - p) * 6 * hue;
          } else if (hue * 2 < 1) {
            g = q;
          } else if (hue * 3 < 2) {
            g = p + (q - p) * (0.6666666666666666 - hue) * 6;
          } else {
            g = p;
          }
          if (d11 * 6 < 1) {
            b = p + (q - p) * 6 * d11;
          } else if (d11 * 2 < 1) {
            b = q;
          } else if (d11 * 3 < 2) {
            b = p + (q - p) * (0.6666666666666666 - d11) * 6;
          } else {
            b = p;
          }
        }
        const intR = r * 256 | 0;
        const intG = g * 256 | 0;
        const intB = b * 256 | 0;
        const rgb = (intR << 16) + (intG << 8) + intB;
        this.colourTable[offset++] = this.gammaCorrect(rgb, randomBrightness);
      }
    }
    for (let id = 0;id < 50; id++) {
      const texture = this.textures[id];
      if (!texture) {
        continue;
      }
      const palette = texture.bpal;
      this.texPal[id] = new Int32Array(palette.length);
      for (let i = 0;i < palette.length; i++) {
        const texturePalette = this.texPal[id];
        if (!texturePalette) {
          continue;
        }
        texturePalette[i] = this.gammaCorrect(palette[i], randomBrightness);
      }
    }
    for (let id = 0;id < 50; id++) {
      this.pushTexture(id);
    }
  }
  static gammaCorrect(rgb, gamma) {
    const r = (rgb >> 16) / 256;
    const g = (rgb >> 8 & 255) / 256;
    const b = (rgb & 255) / 256;
    const powR = Math.pow(r, gamma);
    const powG = Math.pow(g, gamma);
    const powB = Math.pow(b, gamma);
    const intR = powR * 256 | 0;
    const intG = powG * 256 | 0;
    const intB = powB * 256 | 0;
    return (intR << 16) + (intG << 8) + intB;
  }
  static gouraudTriangle(xA, xB, xC, yA, yB, yC, colourA, colourB, colourC) {
    let xStepAB = 0;
    let colourStepAB = 0;
    if (yB !== yA) {
      xStepAB = (xB - xA << 16) / (yB - yA) | 0;
      colourStepAB = (colourB - colourA << 15) / (yB - yA) | 0;
    }
    let xStepBC = 0;
    let colourStepBC = 0;
    if (yC !== yB) {
      xStepBC = (xC - xB << 16) / (yC - yB) | 0;
      colourStepBC = (colourC - colourB << 15) / (yC - yB) | 0;
    }
    let xStepAC = 0;
    let colourStepAC = 0;
    if (yC !== yA) {
      xStepAC = (xA - xC << 16) / (yA - yC) | 0;
      colourStepAC = (colourA - colourC << 15) / (yA - yC) | 0;
    }
    if (yA <= yB && yA <= yC) {
      if (yA >= Pix2D.clipMaxY) {
        return;
      }
      if (yB > Pix2D.clipMaxY) {
        yB = Pix2D.clipMaxY;
      }
      if (yC > Pix2D.clipMaxY) {
        yC = Pix2D.clipMaxY;
      }
      if (yB < yC) {
        xC = xA <<= 16;
        colourC = colourA <<= 15;
        if (yA < 0) {
          xC -= xStepAC * yA;
          xA -= xStepAB * yA;
          colourC -= colourStepAC * yA;
          colourA -= colourStepAB * yA;
          yA = 0;
        }
        xB <<= 16;
        colourB <<= 15;
        if (yB < 0) {
          xB -= xStepBC * yB;
          colourB -= colourStepBC * yB;
          yB = 0;
        }
        if (yA !== yB && xStepAC < xStepAB || yA === yB && xStepAC > xStepBC) {
          yC -= yB;
          yB -= yA;
          yA = this.scanline[yA];
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.gouraudRaster(xC >> 16, xB >> 16, colourC >> 7, colourB >> 7, Pix2D.pixels, yA, 0);
                xC += xStepAC;
                xB += xStepBC;
                colourC += colourStepAC;
                colourB += colourStepBC;
                yA += Pix2D.width;
              }
            }
            this.gouraudRaster(xC >> 16, xA >> 16, colourC >> 7, colourA >> 7, Pix2D.pixels, yA, 0);
            xC += xStepAC;
            xA += xStepAB;
            colourC += colourStepAC;
            colourA += colourStepAB;
            yA += Pix2D.width;
          }
        } else {
          yC -= yB;
          yB -= yA;
          yA = this.scanline[yA];
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.gouraudRaster(xB >> 16, xC >> 16, colourB >> 7, colourC >> 7, Pix2D.pixels, yA, 0);
                xC += xStepAC;
                xB += xStepBC;
                colourC += colourStepAC;
                colourB += colourStepBC;
                yA += Pix2D.width;
              }
            }
            this.gouraudRaster(xA >> 16, xC >> 16, colourA >> 7, colourC >> 7, Pix2D.pixels, yA, 0);
            xC += xStepAC;
            xA += xStepAB;
            colourC += colourStepAC;
            colourA += colourStepAB;
            yA += Pix2D.width;
          }
        }
      } else {
        xB = xA <<= 16;
        colourB = colourA <<= 15;
        if (yA < 0) {
          xB -= xStepAC * yA;
          xA -= xStepAB * yA;
          colourB -= colourStepAC * yA;
          colourA -= colourStepAB * yA;
          yA = 0;
        }
        xC <<= 16;
        colourC <<= 15;
        if (yC < 0) {
          xC -= xStepBC * yC;
          colourC -= colourStepBC * yC;
          yC = 0;
        }
        if (yA !== yC && xStepAC < xStepAB || yA === yC && xStepBC > xStepAB) {
          yB -= yC;
          yC -= yA;
          yA = this.scanline[yA];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.gouraudRaster(xC >> 16, xA >> 16, colourC >> 7, colourA >> 7, Pix2D.pixels, yA, 0);
                xC += xStepBC;
                xA += xStepAB;
                colourC += colourStepBC;
                colourA += colourStepAB;
                yA += Pix2D.width;
              }
            }
            this.gouraudRaster(xB >> 16, xA >> 16, colourB >> 7, colourA >> 7, Pix2D.pixels, yA, 0);
            xB += xStepAC;
            xA += xStepAB;
            colourB += colourStepAC;
            colourA += colourStepAB;
            yA += Pix2D.width;
          }
        } else {
          yB -= yC;
          yC -= yA;
          yA = this.scanline[yA];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.gouraudRaster(xA >> 16, xC >> 16, colourA >> 7, colourC >> 7, Pix2D.pixels, yA, 0);
                xC += xStepBC;
                xA += xStepAB;
                colourC += colourStepBC;
                colourA += colourStepAB;
                yA += Pix2D.width;
              }
            }
            this.gouraudRaster(xA >> 16, xB >> 16, colourA >> 7, colourB >> 7, Pix2D.pixels, yA, 0);
            xB += xStepAC;
            xA += xStepAB;
            colourB += colourStepAC;
            colourA += colourStepAB;
            yA += Pix2D.width;
          }
        }
      }
    } else if (yB <= yC) {
      if (yB >= Pix2D.clipMaxY) {
        return;
      }
      if (yC > Pix2D.clipMaxY) {
        yC = Pix2D.clipMaxY;
      }
      if (yA > Pix2D.clipMaxY) {
        yA = Pix2D.clipMaxY;
      }
      if (yC < yA) {
        xA = xB <<= 16;
        colourA = colourB <<= 15;
        if (yB < 0) {
          xA -= xStepAB * yB;
          xB -= xStepBC * yB;
          colourA -= colourStepAB * yB;
          colourB -= colourStepBC * yB;
          yB = 0;
        }
        xC <<= 16;
        colourC <<= 15;
        if (yC < 0) {
          xC -= xStepAC * yC;
          colourC -= colourStepAC * yC;
          yC = 0;
        }
        if (yB !== yC && xStepAB < xStepBC || yB === yC && xStepAB > xStepAC) {
          yA -= yC;
          yC -= yB;
          yB = this.scanline[yB];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.gouraudRaster(xA >> 16, xC >> 16, colourA >> 7, colourC >> 7, Pix2D.pixels, yB, 0);
                xA += xStepAB;
                xC += xStepAC;
                colourA += colourStepAB;
                colourC += colourStepAC;
                yB += Pix2D.width;
              }
            }
            this.gouraudRaster(xA >> 16, xB >> 16, colourA >> 7, colourB >> 7, Pix2D.pixels, yB, 0);
            xA += xStepAB;
            xB += xStepBC;
            colourA += colourStepAB;
            colourB += colourStepBC;
            yB += Pix2D.width;
          }
        } else {
          yA -= yC;
          yC -= yB;
          yB = this.scanline[yB];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.gouraudRaster(xC >> 16, xA >> 16, colourC >> 7, colourA >> 7, Pix2D.pixels, yB, 0);
                xA += xStepAB;
                xC += xStepAC;
                colourA += colourStepAB;
                colourC += colourStepAC;
                yB += Pix2D.width;
              }
            }
            this.gouraudRaster(xB >> 16, xA >> 16, colourB >> 7, colourA >> 7, Pix2D.pixels, yB, 0);
            xA += xStepAB;
            xB += xStepBC;
            colourA += colourStepAB;
            colourB += colourStepBC;
            yB += Pix2D.width;
          }
        }
      } else {
        xC = xB <<= 16;
        colourC = colourB <<= 15;
        if (yB < 0) {
          xC -= xStepAB * yB;
          xB -= xStepBC * yB;
          colourC -= colourStepAB * yB;
          colourB -= colourStepBC * yB;
          yB = 0;
        }
        xA <<= 16;
        colourA <<= 15;
        if (yA < 0) {
          xA -= xStepAC * yA;
          colourA -= colourStepAC * yA;
          yA = 0;
        }
        yC -= yA;
        yA -= yB;
        yB = this.scanline[yB];
        if (xStepAB < xStepBC) {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.gouraudRaster(xA >> 16, xB >> 16, colourA >> 7, colourB >> 7, Pix2D.pixels, yB, 0);
                xA += xStepAC;
                xB += xStepBC;
                colourA += colourStepAC;
                colourB += colourStepBC;
                yB += Pix2D.width;
              }
            }
            this.gouraudRaster(xC >> 16, xB >> 16, colourC >> 7, colourB >> 7, Pix2D.pixels, yB, 0);
            xC += xStepAB;
            xB += xStepBC;
            colourC += colourStepAB;
            colourB += colourStepBC;
            yB += Pix2D.width;
          }
        } else {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.gouraudRaster(xB >> 16, xA >> 16, colourB >> 7, colourA >> 7, Pix2D.pixels, yB, 0);
                xA += xStepAC;
                xB += xStepBC;
                colourA += colourStepAC;
                colourB += colourStepBC;
                yB += Pix2D.width;
              }
            }
            this.gouraudRaster(xB >> 16, xC >> 16, colourB >> 7, colourC >> 7, Pix2D.pixels, yB, 0);
            xC += xStepAB;
            xB += xStepBC;
            colourC += colourStepAB;
            colourB += colourStepBC;
            yB += Pix2D.width;
          }
        }
      }
    } else {
      if (yC >= Pix2D.clipMaxY) {
        return;
      }
      if (yA > Pix2D.clipMaxY) {
        yA = Pix2D.clipMaxY;
      }
      if (yB > Pix2D.clipMaxY) {
        yB = Pix2D.clipMaxY;
      }
      if (yA < yB) {
        xB = xC <<= 16;
        colourB = colourC <<= 15;
        if (yC < 0) {
          xB -= xStepBC * yC;
          xC -= xStepAC * yC;
          colourB -= colourStepBC * yC;
          colourC -= colourStepAC * yC;
          yC = 0;
        }
        xA <<= 16;
        colourA <<= 15;
        if (yA < 0) {
          xA -= xStepAB * yA;
          colourA -= colourStepAB * yA;
          yA = 0;
        }
        yB -= yA;
        yA -= yC;
        yC = this.scanline[yC];
        if (xStepBC < xStepAC) {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.gouraudRaster(xB >> 16, xA >> 16, colourB >> 7, colourA >> 7, Pix2D.pixels, yC, 0);
                xB += xStepBC;
                xA += xStepAB;
                colourB += colourStepBC;
                colourA += colourStepAB;
                yC += Pix2D.width;
              }
            }
            this.gouraudRaster(xB >> 16, xC >> 16, colourB >> 7, colourC >> 7, Pix2D.pixels, yC, 0);
            xB += xStepBC;
            xC += xStepAC;
            colourB += colourStepBC;
            colourC += colourStepAC;
            yC += Pix2D.width;
          }
        } else {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.gouraudRaster(xA >> 16, xB >> 16, colourA >> 7, colourB >> 7, Pix2D.pixels, yC, 0);
                xB += xStepBC;
                xA += xStepAB;
                colourB += colourStepBC;
                colourA += colourStepAB;
                yC += Pix2D.width;
              }
            }
            this.gouraudRaster(xC >> 16, xB >> 16, colourC >> 7, colourB >> 7, Pix2D.pixels, yC, 0);
            xB += xStepBC;
            xC += xStepAC;
            colourB += colourStepBC;
            colourC += colourStepAC;
            yC += Pix2D.width;
          }
        }
      } else {
        xA = xC <<= 16;
        colourA = colourC <<= 15;
        if (yC < 0) {
          xA -= xStepBC * yC;
          xC -= xStepAC * yC;
          colourA -= colourStepBC * yC;
          colourC -= colourStepAC * yC;
          yC = 0;
        }
        xB <<= 16;
        colourB <<= 15;
        if (yB < 0) {
          xB -= xStepAB * yB;
          colourB -= colourStepAB * yB;
          yB = 0;
        }
        yA -= yB;
        yB -= yC;
        yC = this.scanline[yC];
        if (xStepBC < xStepAC) {
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.gouraudRaster(xB >> 16, xC >> 16, colourB >> 7, colourC >> 7, Pix2D.pixels, yC, 0);
                xB += xStepAB;
                xC += xStepAC;
                colourB += colourStepAB;
                colourC += colourStepAC;
                yC += Pix2D.width;
              }
            }
            this.gouraudRaster(xA >> 16, xC >> 16, colourA >> 7, colourC >> 7, Pix2D.pixels, yC, 0);
            xA += xStepBC;
            xC += xStepAC;
            colourA += colourStepBC;
            colourC += colourStepAC;
            yC += Pix2D.width;
          }
        } else {
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.gouraudRaster(xC >> 16, xB >> 16, colourC >> 7, colourB >> 7, Pix2D.pixels, yC, 0);
                xB += xStepAB;
                xC += xStepAC;
                colourB += colourStepAB;
                colourC += colourStepAC;
                yC += Pix2D.width;
              }
            }
            this.gouraudRaster(xC >> 16, xA >> 16, colourC >> 7, colourA >> 7, Pix2D.pixels, yC, 0);
            xA += xStepBC;
            xC += xStepAC;
            colourA += colourStepBC;
            colourC += colourStepAC;
            yC += Pix2D.width;
          }
        }
      }
    }
  }
  static gouraudRaster(xA, xB, colourA, colourB, dst, off, len) {
    let rgb;
    if (this.lowDetail) {
      let colourStep;
      if (this.hclip) {
        if (xB - xA > 3) {
          colourStep = (colourB - colourA) / (xB - xA) | 0;
        } else {
          colourStep = 0;
        }
        if (xB > Pix2D.sizeX) {
          xB = Pix2D.sizeX;
        }
        if (xA < 0) {
          colourA -= xA * colourStep;
          xA = 0;
        }
        if (xA >= xB) {
          return;
        }
        off += xA;
        len = xB - xA >> 2;
        colourStep <<= 2;
      } else if (xA < xB) {
        off += xA;
        len = xB - xA >> 2;
        if (len > 0) {
          colourStep = (colourB - colourA) * this.divTable[len] >> 15;
        } else {
          colourStep = 0;
        }
      } else {
        return;
      }
      if (this.trans === 0) {
        while (true) {
          len--;
          if (len < 0) {
            len = xB - xA & 3;
            if (len > 0) {
              rgb = this.colourTable[colourA >> 8];
              do {
                dst[off++] = rgb;
                len--;
              } while (len > 0);
              return;
            }
            break;
          }
          rgb = this.colourTable[colourA >> 8];
          colourA += colourStep;
          dst[off++] = rgb;
          dst[off++] = rgb;
          dst[off++] = rgb;
          dst[off++] = rgb;
        }
      } else {
        const alpha = this.trans;
        const invAlpha = 256 - this.trans;
        while (true) {
          len--;
          if (len < 0) {
            len = xB - xA & 3;
            if (len > 0) {
              rgb = this.colourTable[colourA >> 8];
              rgb = ((rgb & 16711935) * invAlpha >> 8 & 16711935) + ((rgb & 65280) * invAlpha >> 8 & 65280);
              do {
                dst[off++] = rgb + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
                len--;
              } while (len > 0);
            }
            break;
          }
          rgb = this.colourTable[colourA >> 8];
          colourA += colourStep;
          rgb = ((rgb & 16711935) * invAlpha >> 8 & 16711935) + ((rgb & 65280) * invAlpha >> 8 & 65280);
          dst[off++] = rgb + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
          dst[off++] = rgb + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
          dst[off++] = rgb + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
          dst[off++] = rgb + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
        }
      }
    } else if (xA < xB) {
      const colourStep = (colourB - colourA) / (xB - xA) | 0;
      if (this.hclip) {
        if (xB > Pix2D.sizeX) {
          xB = Pix2D.sizeX;
        }
        if (xA < 0) {
          colourA -= xA * colourStep;
          xA = 0;
        }
        if (xA >= xB) {
          return;
        }
      }
      off += xA;
      len = xB - xA;
      if (this.trans === 0) {
        do {
          dst[off++] = this.colourTable[colourA >> 8];
          colourA += colourStep;
          len--;
        } while (len > 0);
      } else {
        const alpha = this.trans;
        const invAlpha = 256 - this.trans;
        do {
          rgb = this.colourTable[colourA >> 8];
          colourA += colourStep;
          rgb = ((rgb & 16711935) * invAlpha >> 8 & 16711935) + ((rgb & 65280) * invAlpha >> 8 & 65280);
          dst[off++] = rgb + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
          len--;
        } while (len > 0);
      }
    }
  }
  static flatTriangle(xA, xB, xC, yA, yB, yC, colour) {
    let xStepAB = 0;
    if (yB !== yA) {
      xStepAB = (xB - xA << 16) / (yB - yA) | 0;
    }
    let xStepBC = 0;
    if (yC !== yB) {
      xStepBC = (xC - xB << 16) / (yC - yB) | 0;
    }
    let xStepAC = 0;
    if (yC !== yA) {
      xStepAC = (xA - xC << 16) / (yA - yC) | 0;
    }
    if (yA <= yB && yA <= yC) {
      if (yA >= Pix2D.clipMaxY) {
        return;
      }
      if (yB > Pix2D.clipMaxY) {
        yB = Pix2D.clipMaxY;
      }
      if (yC > Pix2D.clipMaxY) {
        yC = Pix2D.clipMaxY;
      }
      if (yB < yC) {
        xC = xA <<= 16;
        if (yA < 0) {
          xC -= xStepAC * yA;
          xA -= xStepAB * yA;
          yA = 0;
        }
        xB <<= 16;
        if (yB < 0) {
          xB -= xStepBC * yB;
          yB = 0;
        }
        if (yA !== yB && xStepAC < xStepAB || yA === yB && xStepAC > xStepBC) {
          yC -= yB;
          yB -= yA;
          yA = this.scanline[yA];
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.flatRaster(xC >> 16, xB >> 16, Pix2D.pixels, yA, colour);
                xC += xStepAC;
                xB += xStepBC;
                yA += Pix2D.width;
              }
            }
            this.flatRaster(xC >> 16, xA >> 16, Pix2D.pixels, yA, colour);
            xC += xStepAC;
            xA += xStepAB;
            yA += Pix2D.width;
          }
        } else {
          yC -= yB;
          yB -= yA;
          yA = this.scanline[yA];
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.flatRaster(xB >> 16, xC >> 16, Pix2D.pixels, yA, colour);
                xC += xStepAC;
                xB += xStepBC;
                yA += Pix2D.width;
              }
            }
            this.flatRaster(xA >> 16, xC >> 16, Pix2D.pixels, yA, colour);
            xC += xStepAC;
            xA += xStepAB;
            yA += Pix2D.width;
          }
        }
      } else {
        xB = xA <<= 16;
        if (yA < 0) {
          xB -= xStepAC * yA;
          xA -= xStepAB * yA;
          yA = 0;
        }
        xC <<= 16;
        if (yC < 0) {
          xC -= xStepBC * yC;
          yC = 0;
        }
        if (yA !== yC && xStepAC < xStepAB || yA === yC && xStepBC > xStepAB) {
          yB -= yC;
          yC -= yA;
          yA = this.scanline[yA];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.flatRaster(xC >> 16, xA >> 16, Pix2D.pixels, yA, colour);
                xC += xStepBC;
                xA += xStepAB;
                yA += Pix2D.width;
              }
            }
            this.flatRaster(xB >> 16, xA >> 16, Pix2D.pixels, yA, colour);
            xB += xStepAC;
            xA += xStepAB;
            yA += Pix2D.width;
          }
        } else {
          yB -= yC;
          yC -= yA;
          yA = this.scanline[yA];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.flatRaster(xA >> 16, xC >> 16, Pix2D.pixels, yA, colour);
                xC += xStepBC;
                xA += xStepAB;
                yA += Pix2D.width;
              }
            }
            this.flatRaster(xA >> 16, xB >> 16, Pix2D.pixels, yA, colour);
            xB += xStepAC;
            xA += xStepAB;
            yA += Pix2D.width;
          }
        }
      }
    } else if (yB <= yC) {
      if (yB >= Pix2D.clipMaxY) {
        return;
      }
      if (yC > Pix2D.clipMaxY) {
        yC = Pix2D.clipMaxY;
      }
      if (yA > Pix2D.clipMaxY) {
        yA = Pix2D.clipMaxY;
      }
      if (yC < yA) {
        xA = xB <<= 16;
        if (yB < 0) {
          xA -= xStepAB * yB;
          xB -= xStepBC * yB;
          yB = 0;
        }
        xC <<= 16;
        if (yC < 0) {
          xC -= xStepAC * yC;
          yC = 0;
        }
        if (yB !== yC && xStepAB < xStepBC || yB === yC && xStepAB > xStepAC) {
          yA -= yC;
          yC -= yB;
          yB = this.scanline[yB];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.flatRaster(xA >> 16, xC >> 16, Pix2D.pixels, yB, colour);
                xA += xStepAB;
                xC += xStepAC;
                yB += Pix2D.width;
              }
            }
            this.flatRaster(xA >> 16, xB >> 16, Pix2D.pixels, yB, colour);
            xA += xStepAB;
            xB += xStepBC;
            yB += Pix2D.width;
          }
        } else {
          yA -= yC;
          yC -= yB;
          yB = this.scanline[yB];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.flatRaster(xC >> 16, xA >> 16, Pix2D.pixels, yB, colour);
                xA += xStepAB;
                xC += xStepAC;
                yB += Pix2D.width;
              }
            }
            this.flatRaster(xB >> 16, xA >> 16, Pix2D.pixels, yB, colour);
            xA += xStepAB;
            xB += xStepBC;
            yB += Pix2D.width;
          }
        }
      } else {
        xC = xB <<= 16;
        if (yB < 0) {
          xC -= xStepAB * yB;
          xB -= xStepBC * yB;
          yB = 0;
        }
        xA <<= 16;
        if (yA < 0) {
          xA -= xStepAC * yA;
          yA = 0;
        }
        yC -= yA;
        yA -= yB;
        yB = this.scanline[yB];
        if (xStepAB < xStepBC) {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.flatRaster(xA >> 16, xB >> 16, Pix2D.pixels, yB, colour);
                xA += xStepAC;
                xB += xStepBC;
                yB += Pix2D.width;
              }
            }
            this.flatRaster(xC >> 16, xB >> 16, Pix2D.pixels, yB, colour);
            xC += xStepAB;
            xB += xStepBC;
            yB += Pix2D.width;
          }
        } else {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.flatRaster(xB >> 16, xA >> 16, Pix2D.pixels, yB, colour);
                xA += xStepAC;
                xB += xStepBC;
                yB += Pix2D.width;
              }
            }
            this.flatRaster(xB >> 16, xC >> 16, Pix2D.pixels, yB, colour);
            xC += xStepAB;
            xB += xStepBC;
            yB += Pix2D.width;
          }
        }
      }
    } else {
      if (yC >= Pix2D.clipMaxY) {
        return;
      }
      if (yA > Pix2D.clipMaxY) {
        yA = Pix2D.clipMaxY;
      }
      if (yB > Pix2D.clipMaxY) {
        yB = Pix2D.clipMaxY;
      }
      if (yA < yB) {
        xB = xC <<= 16;
        if (yC < 0) {
          xB -= xStepBC * yC;
          xC -= xStepAC * yC;
          yC = 0;
        }
        xA <<= 16;
        if (yA < 0) {
          xA -= xStepAB * yA;
          yA = 0;
        }
        yB -= yA;
        yA -= yC;
        yC = this.scanline[yC];
        if (xStepBC < xStepAC) {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.flatRaster(xB >> 16, xA >> 16, Pix2D.pixels, yC, colour);
                xB += xStepBC;
                xA += xStepAB;
                yC += Pix2D.width;
              }
            }
            this.flatRaster(xB >> 16, xC >> 16, Pix2D.pixels, yC, colour);
            xB += xStepBC;
            xC += xStepAC;
            yC += Pix2D.width;
          }
        } else {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.flatRaster(xA >> 16, xB >> 16, Pix2D.pixels, yC, colour);
                xB += xStepBC;
                xA += xStepAB;
                yC += Pix2D.width;
              }
            }
            this.flatRaster(xC >> 16, xB >> 16, Pix2D.pixels, yC, colour);
            xB += xStepBC;
            xC += xStepAC;
            yC += Pix2D.width;
          }
        }
      } else {
        xA = xC <<= 16;
        if (yC < 0) {
          xA -= xStepBC * yC;
          xC -= xStepAC * yC;
          yC = 0;
        }
        xB <<= 16;
        if (yB < 0) {
          xB -= xStepAB * yB;
          yB = 0;
        }
        yA -= yB;
        yB -= yC;
        yC = this.scanline[yC];
        if (xStepBC < xStepAC) {
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.flatRaster(xB >> 16, xC >> 16, Pix2D.pixels, yC, colour);
                xB += xStepAB;
                xC += xStepAC;
                yC += Pix2D.width;
              }
            }
            this.flatRaster(xA >> 16, xC >> 16, Pix2D.pixels, yC, colour);
            xA += xStepBC;
            xC += xStepAC;
            yC += Pix2D.width;
          }
        } else {
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.flatRaster(xC >> 16, xB >> 16, Pix2D.pixels, yC, colour);
                xB += xStepAB;
                xC += xStepAC;
                yC += Pix2D.width;
              }
            }
            this.flatRaster(xC >> 16, xA >> 16, Pix2D.pixels, yC, colour);
            xA += xStepBC;
            xC += xStepAC;
            yC += Pix2D.width;
          }
        }
      }
    }
  }
  static flatRaster(xA, xB, dst, off, colour) {
    if (this.hclip) {
      if (xB > Pix2D.sizeX) {
        xB = Pix2D.sizeX;
      }
      if (xA < 0) {
        xA = 0;
      }
    }
    if (xA >= xB) {
      return;
    }
    off += xA;
    let len = xB - xA >> 2;
    if (this.trans === 0) {
      while (true) {
        len--;
        if (len < 0) {
          len = xB - xA & 3;
          while (true) {
            len--;
            if (len < 0) {
              return;
            }
            dst[off++] = colour;
          }
        }
        dst[off++] = colour;
        dst[off++] = colour;
        dst[off++] = colour;
        dst[off++] = colour;
      }
    } else {
      const alpha = this.trans;
      const invAlpha = 256 - this.trans;
      colour = ((colour & 16711935) * invAlpha >> 8 & 16711935) + ((colour & 65280) * invAlpha >> 8 & 65280);
      while (true) {
        len--;
        if (len < 0) {
          len = xB - xA & 3;
          while (true) {
            len--;
            if (len < 0) {
              return;
            }
            dst[off++] = colour + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
          }
        }
        dst[off++] = colour + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
        dst[off++] = colour + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
        dst[off++] = colour + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
        dst[off++] = colour + ((dst[off] & 16711935) * alpha >> 8 & 16711935) + ((dst[off] & 65280) * alpha >> 8 & 65280);
      }
    }
  }
  static textureTriangle(xA, xB, xC, yA, yB, yC, shadeA, shadeB, shadeC, originX, originY, originZ, txB, txC, tyB, tyC, tzB, tzC, texture) {
    const texels = this.getTexels(texture);
    this.opaque = !this.textureTranslucent[texture];
    const verticalX = originX - txB;
    const verticalY = originY - tyB;
    const verticalZ = originZ - tzB;
    const horizontalX = txC - originX;
    const horizontalY = tyC - originY;
    const horizontalZ = tzC - originZ;
    let u = horizontalX * originY - horizontalY * originX << 14;
    const uStride = horizontalY * originZ - horizontalZ * originY << 8;
    const uStepVertical = horizontalZ * originX - horizontalX * originZ << 5;
    let v = verticalX * originY - verticalY * originX << 14;
    const vStride = verticalY * originZ - verticalZ * originY << 8;
    const vStepVertical = verticalZ * originX - verticalX * originZ << 5;
    let w = verticalY * horizontalX - verticalX * horizontalY << 14;
    const wStride = verticalZ * horizontalY - verticalY * horizontalZ << 8;
    const wStepVertical = verticalX * horizontalZ - verticalZ * horizontalX << 5;
    let xStepAB = 0;
    let shadeStepAB = 0;
    if (yB !== yA) {
      xStepAB = (xB - xA << 16) / (yB - yA) | 0;
      shadeStepAB = (shadeB - shadeA << 16) / (yB - yA) | 0;
    }
    let xStepBC = 0;
    let shadeStepBC = 0;
    if (yC !== yB) {
      xStepBC = (xC - xB << 16) / (yC - yB) | 0;
      shadeStepBC = (shadeC - shadeB << 16) / (yC - yB) | 0;
    }
    let xStepAC = 0;
    let shadeStepAC = 0;
    if (yC !== yA) {
      xStepAC = (xA - xC << 16) / (yA - yC) | 0;
      shadeStepAC = (shadeA - shadeC << 16) / (yA - yC) | 0;
    }
    if (yA <= yB && yA <= yC) {
      if (yA >= Pix2D.clipMaxY) {
        return;
      }
      if (yB > Pix2D.clipMaxY) {
        yB = Pix2D.clipMaxY;
      }
      if (yC > Pix2D.clipMaxY) {
        yC = Pix2D.clipMaxY;
      }
      if (yB < yC) {
        xC = xA <<= 16;
        shadeC = shadeA <<= 16;
        if (yA < 0) {
          xC -= xStepAC * yA;
          xA -= xStepAB * yA;
          shadeC -= shadeStepAC * yA;
          shadeA -= shadeStepAB * yA;
          yA = 0;
        }
        xB <<= 16;
        shadeB <<= 16;
        if (yB < 0) {
          xB -= xStepBC * yB;
          shadeB -= shadeStepBC * yB;
          yB = 0;
        }
        const dy = yA - this.originY;
        u += uStepVertical * dy;
        v += vStepVertical * dy;
        w += wStepVertical * dy;
        u |= 0;
        v |= 0;
        w |= 0;
        if (yA !== yB && xStepAC < xStepAB || yA === yB && xStepAC > xStepBC) {
          yC -= yB;
          yB -= yA;
          yA = this.scanline[yA];
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.textureRaster(xC >> 16, xB >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeB >> 8);
                xC += xStepAC;
                xB += xStepBC;
                shadeC += shadeStepAC;
                shadeB += shadeStepBC;
                yA += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xC >> 16, xA >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeA >> 8);
            xC += xStepAC;
            xA += xStepAB;
            shadeC += shadeStepAC;
            shadeA += shadeStepAB;
            yA += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        } else {
          yC -= yB;
          yB -= yA;
          yA = this.scanline[yA];
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.textureRaster(xB >> 16, xC >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeC >> 8);
                xC += xStepAC;
                xB += xStepBC;
                shadeC += shadeStepAC;
                shadeB += shadeStepBC;
                yA += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xA >> 16, xC >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeC >> 8);
            xC += xStepAC;
            xA += xStepAB;
            shadeC += shadeStepAC;
            shadeA += shadeStepAB;
            yA += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        }
      } else {
        xB = xA <<= 16;
        shadeB = shadeA <<= 16;
        if (yA < 0) {
          xB -= xStepAC * yA;
          xA -= xStepAB * yA;
          shadeB -= shadeStepAC * yA;
          shadeA -= shadeStepAB * yA;
          yA = 0;
        }
        xC <<= 16;
        shadeC <<= 16;
        if (yC < 0) {
          xC -= xStepBC * yC;
          shadeC -= shadeStepBC * yC;
          yC = 0;
        }
        const dy = yA - this.originY;
        u += uStepVertical * dy;
        v += vStepVertical * dy;
        w += wStepVertical * dy;
        u |= 0;
        v |= 0;
        w |= 0;
        if ((yA === yC || xStepAC >= xStepAB) && (yA !== yC || xStepBC <= xStepAB)) {
          yB -= yC;
          yC -= yA;
          yA = this.scanline[yA];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.textureRaster(xA >> 16, xC >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeC >> 8);
                xC += xStepBC;
                xA += xStepAB;
                shadeC += shadeStepBC;
                shadeA += shadeStepAB;
                yA += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xA >> 16, xB >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeB >> 8);
            xB += xStepAC;
            xA += xStepAB;
            shadeB += shadeStepAC;
            shadeA += shadeStepAB;
            yA += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        } else {
          yB -= yC;
          yC -= yA;
          yA = this.scanline[yA];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.textureRaster(xC >> 16, xA >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeA >> 8);
                xC += xStepBC;
                xA += xStepAB;
                shadeC += shadeStepBC;
                shadeA += shadeStepAB;
                yA += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xB >> 16, xA >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeA >> 8);
            xB += xStepAC;
            xA += xStepAB;
            shadeB += shadeStepAC;
            shadeA += shadeStepAB;
            yA += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        }
      }
    } else if (yB <= yC) {
      if (yB >= Pix2D.clipMaxY) {
        return;
      }
      if (yC > Pix2D.clipMaxY) {
        yC = Pix2D.clipMaxY;
      }
      if (yA > Pix2D.clipMaxY) {
        yA = Pix2D.clipMaxY;
      }
      if (yC < yA) {
        xA = xB <<= 16;
        shadeA = shadeB <<= 16;
        if (yB < 0) {
          xA -= xStepAB * yB;
          xB -= xStepBC * yB;
          shadeA -= shadeStepAB * yB;
          shadeB -= shadeStepBC * yB;
          yB = 0;
        }
        xC <<= 16;
        shadeC <<= 16;
        if (yC < 0) {
          xC -= xStepAC * yC;
          shadeC -= shadeStepAC * yC;
          yC = 0;
        }
        const dy = yB - this.originY;
        u += uStepVertical * dy;
        v += vStepVertical * dy;
        w += wStepVertical * dy;
        u |= 0;
        v |= 0;
        w |= 0;
        if (yB !== yC && xStepAB < xStepBC || yB === yC && xStepAB > xStepAC) {
          yA -= yC;
          yC -= yB;
          yB = this.scanline[yB];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.textureRaster(xA >> 16, xC >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeC >> 8);
                xA += xStepAB;
                xC += xStepAC;
                shadeA += shadeStepAB;
                shadeC += shadeStepAC;
                yB += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xA >> 16, xB >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeB >> 8);
            xA += xStepAB;
            xB += xStepBC;
            shadeA += shadeStepAB;
            shadeB += shadeStepBC;
            yB += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        } else {
          yA -= yC;
          yC -= yB;
          yB = this.scanline[yB];
          while (true) {
            yC--;
            if (yC < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.textureRaster(xC >> 16, xA >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeA >> 8);
                xA += xStepAB;
                xC += xStepAC;
                shadeA += shadeStepAB;
                shadeC += shadeStepAC;
                yB += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xB >> 16, xA >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeA >> 8);
            xA += xStepAB;
            xB += xStepBC;
            shadeA += shadeStepAB;
            shadeB += shadeStepBC;
            yB += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        }
      } else {
        xC = xB <<= 16;
        shadeC = shadeB <<= 16;
        if (yB < 0) {
          xC -= xStepAB * yB;
          xB -= xStepBC * yB;
          shadeC -= shadeStepAB * yB;
          shadeB -= shadeStepBC * yB;
          yB = 0;
        }
        xA <<= 16;
        shadeA <<= 16;
        if (yA < 0) {
          xA -= xStepAC * yA;
          shadeA -= shadeStepAC * yA;
          yA = 0;
        }
        const dy = yB - this.originY;
        u += uStepVertical * dy;
        v += vStepVertical * dy;
        w += wStepVertical * dy;
        u |= 0;
        v |= 0;
        w |= 0;
        yC -= yA;
        yA -= yB;
        yB = this.scanline[yB];
        if (xStepAB < xStepBC) {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.textureRaster(xA >> 16, xB >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeB >> 8);
                xA += xStepAC;
                xB += xStepBC;
                shadeA += shadeStepAC;
                shadeB += shadeStepBC;
                yB += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xC >> 16, xB >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeB >> 8);
            xC += xStepAB;
            xB += xStepBC;
            shadeC += shadeStepAB;
            shadeB += shadeStepBC;
            yB += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        } else {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yC--;
                if (yC < 0) {
                  return;
                }
                this.textureRaster(xB >> 16, xA >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeA >> 8);
                xA += xStepAC;
                xB += xStepBC;
                shadeA += shadeStepAC;
                shadeB += shadeStepBC;
                yB += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xB >> 16, xC >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeC >> 8);
            xC += xStepAB;
            xB += xStepBC;
            shadeC += shadeStepAB;
            shadeB += shadeStepBC;
            yB += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        }
      }
    } else {
      if (yC >= Pix2D.clipMaxY) {
        return;
      }
      if (yA > Pix2D.clipMaxY) {
        yA = Pix2D.clipMaxY;
      }
      if (yB > Pix2D.clipMaxY) {
        yB = Pix2D.clipMaxY;
      }
      if (yA < yB) {
        xB = xC <<= 16;
        shadeB = shadeC <<= 16;
        if (yC < 0) {
          xB -= xStepBC * yC;
          xC -= xStepAC * yC;
          shadeB -= shadeStepBC * yC;
          shadeC -= shadeStepAC * yC;
          yC = 0;
        }
        xA <<= 16;
        shadeA <<= 16;
        if (yA < 0) {
          xA -= xStepAB * yA;
          shadeA -= shadeStepAB * yA;
          yA = 0;
        }
        const dy = yC - this.originY;
        u += uStepVertical * dy;
        v += vStepVertical * dy;
        w += wStepVertical * dy;
        u |= 0;
        v |= 0;
        w |= 0;
        yB -= yA;
        yA -= yC;
        yC = this.scanline[yC];
        if (xStepBC < xStepAC) {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.textureRaster(xB >> 16, xA >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeA >> 8);
                xB += xStepBC;
                xA += xStepAB;
                shadeB += shadeStepBC;
                shadeA += shadeStepAB;
                yC += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xB >> 16, xC >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeC >> 8);
            xB += xStepBC;
            xC += xStepAC;
            shadeB += shadeStepBC;
            shadeC += shadeStepAC;
            yC += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        } else {
          while (true) {
            yA--;
            if (yA < 0) {
              while (true) {
                yB--;
                if (yB < 0) {
                  return;
                }
                this.textureRaster(xA >> 16, xB >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeB >> 8);
                xB += xStepBC;
                xA += xStepAB;
                shadeB += shadeStepBC;
                shadeA += shadeStepAB;
                yC += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xC >> 16, xB >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeB >> 8);
            xB += xStepBC;
            xC += xStepAC;
            shadeB += shadeStepBC;
            shadeC += shadeStepAC;
            yC += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        }
      } else {
        xA = xC <<= 16;
        shadeA = shadeC <<= 16;
        if (yC < 0) {
          xA -= xStepBC * yC;
          xC -= xStepAC * yC;
          shadeA -= shadeStepBC * yC;
          shadeC -= shadeStepAC * yC;
          yC = 0;
        }
        xB <<= 16;
        shadeB <<= 16;
        if (yB < 0) {
          xB -= xStepAB * yB;
          shadeB -= shadeStepAB * yB;
          yB = 0;
        }
        const dy = yC - this.originY;
        u += uStepVertical * dy;
        v += vStepVertical * dy;
        w += wStepVertical * dy;
        u |= 0;
        v |= 0;
        w |= 0;
        yA -= yB;
        yB -= yC;
        yC = this.scanline[yC];
        if (xStepBC < xStepAC) {
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.textureRaster(xB >> 16, xC >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeC >> 8);
                xB += xStepAB;
                xC += xStepAC;
                shadeB += shadeStepAB;
                shadeC += shadeStepAC;
                yC += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xA >> 16, xC >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeC >> 8);
            xA += xStepBC;
            xC += xStepAC;
            shadeA += shadeStepBC;
            shadeC += shadeStepAC;
            yC += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        } else {
          while (true) {
            yB--;
            if (yB < 0) {
              while (true) {
                yA--;
                if (yA < 0) {
                  return;
                }
                this.textureRaster(xC >> 16, xB >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeB >> 8);
                xB += xStepAB;
                xC += xStepAC;
                shadeB += shadeStepAB;
                shadeC += shadeStepAC;
                yC += Pix2D.width;
                u += uStepVertical;
                v += vStepVertical;
                w += wStepVertical;
                u |= 0;
                v |= 0;
                w |= 0;
              }
            }
            this.textureRaster(xC >> 16, xA >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeA >> 8);
            xA += xStepBC;
            xC += xStepAC;
            shadeA += shadeStepBC;
            shadeC += shadeStepAC;
            yC += Pix2D.width;
            u += uStepVertical;
            v += vStepVertical;
            w += wStepVertical;
            u |= 0;
            v |= 0;
            w |= 0;
          }
        }
      }
    }
  }
  static textureRaster(xA, xB, dst, off, texels, curU, curV, u, v, w, uStride, vStride, wStride, shadeA, shadeB) {
    if (!texels) {
      return;
    }
    if (xA >= xB) {
      return;
    }
    let shadeStrides;
    let strides;
    if (this.hclip) {
      shadeStrides = (shadeB - shadeA) / (xB - xA) | 0;
      if (xB > Pix2D.sizeX) {
        xB = Pix2D.sizeX;
      }
      if (xA < 0) {
        shadeA -= xA * shadeStrides;
        xA = 0;
      }
      if (xA >= xB) {
        return;
      }
      strides = xB - xA >> 3;
      shadeStrides <<= 12;
    } else {
      if (xB - xA > 7) {
        strides = xB - xA >> 3;
        shadeStrides = (shadeB - shadeA) * this.divTable[strides] >> 6;
      } else {
        strides = 0;
        shadeStrides = 0;
      }
    }
    shadeA <<= 9;
    off += xA;
    let nextU;
    let nextV;
    let curW;
    let dx;
    let stepU;
    let stepV;
    let shadeShift;
    if (this.lowMem) {
      nextU = 0;
      nextV = 0;
      dx = xA - this.originX;
      u = u + (uStride >> 3) * dx;
      v = v + (vStride >> 3) * dx;
      w = w + (wStride >> 3) * dx;
      u |= 0;
      v |= 0;
      w |= 0;
      curW = w >> 12;
      if (curW !== 0) {
        curU = u / curW | 0;
        curV = v / curW | 0;
        if (curU < 0) {
          curU = 0;
        } else if (curU > 4032) {
          curU = 4032;
        }
      }
      u = u + uStride;
      v = v + vStride;
      w = w + wStride;
      u |= 0;
      v |= 0;
      w |= 0;
      curW = w >> 12;
      if (curW !== 0) {
        nextU = u / curW | 0;
        nextV = v / curW | 0;
        if (nextU < 7) {
          nextU = 7;
        } else if (nextU > 4032) {
          nextU = 4032;
        }
      }
      stepU = nextU - curU >> 3;
      stepV = nextV - curV >> 3;
      curU += shadeA >> 3 & 786432;
      shadeShift = shadeA >> 23;
      if (this.opaque) {
        while (strides-- > 0) {
          dst[off++] = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift;
          curU = nextU;
          curV = nextV;
          u += uStride;
          v += vStride;
          w += wStride;
          u |= 0;
          v |= 0;
          w |= 0;
          curW = w >> 12;
          if (curW !== 0) {
            nextU = u / curW | 0;
            nextV = v / curW | 0;
            if (nextU < 7) {
              nextU = 7;
            } else if (nextU > 4032) {
              nextU = 4032;
            }
          }
          stepU = nextU - curU >> 3;
          stepV = nextV - curV >> 3;
          shadeA += shadeStrides;
          curU += shadeA >> 3 & 786432;
          shadeShift = shadeA >> 23;
        }
        strides = xB - xA & 7;
        while (strides-- > 0) {
          dst[off++] = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
        }
      } else {
        while (strides-- > 0) {
          let rgb;
          if ((rgb = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU = nextU;
          curV = nextV;
          u += uStride;
          v += vStride;
          w += wStride;
          u |= 0;
          v |= 0;
          w |= 0;
          curW = w >> 12;
          if (curW !== 0) {
            nextU = u / curW | 0;
            nextV = v / curW | 0;
            if (nextU < 7) {
              nextU = 7;
            } else if (nextU > 4032) {
              nextU = 4032;
            }
          }
          stepU = nextU - curU >> 3;
          stepV = nextV - curV >> 3;
          shadeA += shadeStrides;
          curU += shadeA >> 3 & 786432;
          shadeShift = shadeA >> 23;
        }
        strides = xB - xA & 7;
        while (strides-- > 0) {
          let rgb;
          if ((rgb = texels[(curV & 4032) + (curU >> 6)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
        }
      }
    } else {
      nextU = 0;
      nextV = 0;
      dx = xA - this.originX;
      u = u + (uStride >> 3) * dx;
      v = v + (vStride >> 3) * dx;
      w = w + (wStride >> 3) * dx;
      u |= 0;
      v |= 0;
      w |= 0;
      curW = w >> 14;
      if (curW !== 0) {
        curU = u / curW | 0;
        curV = v / curW | 0;
        if (curU < 0) {
          curU = 0;
        } else if (curU > 16256) {
          curU = 16256;
        }
      }
      u = u + uStride;
      v = v + vStride;
      w = w + wStride;
      u |= 0;
      v |= 0;
      w |= 0;
      curW = w >> 14;
      if (curW !== 0) {
        nextU = u / curW | 0;
        nextV = v / curW | 0;
        if (nextU < 7) {
          nextU = 7;
        } else if (nextU > 16256) {
          nextU = 16256;
        }
      }
      stepU = nextU - curU >> 3;
      stepV = nextV - curV >> 3;
      curU += shadeA & 6291456;
      shadeShift = shadeA >> 23;
      if (this.opaque) {
        while (strides-- > 0) {
          dst[off++] = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
          dst[off++] = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift;
          curU = nextU;
          curV = nextV;
          u += uStride;
          v += vStride;
          w += wStride;
          u |= 0;
          v |= 0;
          w |= 0;
          curW = w >> 14;
          if (curW !== 0) {
            nextU = u / curW | 0;
            nextV = v / curW | 0;
            if (nextU < 7) {
              nextU = 7;
            } else if (nextU > 16256) {
              nextU = 16256;
            }
          }
          stepU = nextU - curU >> 3;
          stepV = nextV - curV >> 3;
          shadeA += shadeStrides;
          curU += shadeA & 6291456;
          shadeShift = shadeA >> 23;
        }
        strides = xB - xA & 7;
        while (strides-- > 0) {
          dst[off++] = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift;
          curU += stepU;
          curV += stepV;
        }
      } else {
        while (strides-- > 0 && texels) {
          let rgb;
          if ((rgb = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
          if ((rgb = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU = nextU;
          curV = nextV;
          u += uStride;
          v += vStride;
          w += wStride;
          u |= 0;
          v |= 0;
          w |= 0;
          curW = w >> 14;
          if (curW !== 0) {
            nextU = u / curW | 0;
            nextV = v / curW | 0;
            if (nextU < 7) {
              nextU = 7;
            } else if (nextU > 16256) {
              nextU = 16256;
            }
          }
          stepU = nextU - curU >> 3;
          stepV = nextV - curV >> 3;
          shadeA += shadeStrides;
          curU += shadeA & 6291456;
          shadeShift = shadeA >> 23;
        }
        strides = xB - xA & 7;
        while (strides-- > 0 && texels) {
          let rgb;
          if ((rgb = texels[(curV & 16256) + (curU >> 7)] >>> shadeShift) !== 0) {
            dst[off] = rgb;
          }
          off++;
          curU += stepU;
          curV += stepV;
        }
      }
    }
  }
}

// src/graphics/PixMap.ts
class PixMap {
  data;
  width;
  height;
  img;
  ctx;
  paint;
  constructor(width, height, ctx = canvas2d) {
    this.width = width;
    this.height = height;
    this.data = new Int32Array(width * height);
    this.ctx = ctx;
    this.img = this.ctx.createImageData(width, height);
    this.paint = new Uint32Array(this.img.data.buffer);
    this.setPixels();
  }
  setPixels() {
    Pix2D.setPixels(this.data, this.width, this.height);
  }
  draw(x, y) {
    this.prepareCanvas();
    this.ctx.putImageData(this.img, x, y);
  }
  prepareCanvas() {
    const data = this.data;
    const paint = this.paint;
    const len = data.length;
    let i = 0;
    const unroll = len - len % 4;
    for (;i < unroll; i += 4) {
      const p0 = data[i];
      const p1 = data[i + 1];
      const p2 = data[i + 2];
      const p3 = data[i + 3];
      paint[i] = (p0 & 16711680) >> 16 | p0 & 65280 | (p0 & 255) << 16 | 4278190080;
      paint[i + 1] = (p1 & 16711680) >> 16 | p1 & 65280 | (p1 & 255) << 16 | 4278190080;
      paint[i + 2] = (p2 & 16711680) >> 16 | p2 & 65280 | (p2 & 255) << 16 | 4278190080;
      paint[i + 3] = (p3 & 16711680) >> 16 | p3 & 65280 | (p3 & 255) << 16 | 4278190080;
    }
    for (;i < len; i++) {
      const pixel = data[i];
      paint[i] = (pixel & 16711680) >> 16 | pixel & 65280 | (pixel & 255) << 16 | 4278190080;
    }
  }
}

// src/client/GameShell.ts
class GameShell {
  static cameraZoom = 1;
  state = 0;
  deltime = 20;
  mindel = 1;
  otim = new Array(10);
  fps = 0;
  debug = false;
  drawArea = null;
  redrawScreen = true;
  focus = true;
  idleTimer = performance.now();
  mouseButton = 0;
  mouseX = -1;
  mouseY = -1;
  nextMouseClickButton = 0;
  nextMouseClickX = -1;
  nextMouseClickY = -1;
  mouseClickButton = 0;
  mouseClickX = -1;
  mouseClickY = -1;
  nextMouseClickTime = 0;
  mouseClickTime = 0;
  keyHeld = [];
  keyQueue = [];
  keyQueueReadPos = 0;
  keyQueueWritePos = 0;
  resizeToFit = false;
  tfps = 50;
  async maininit() {}
  async mainloop() {}
  async maindraw() {}
  refresh() {}
  constructor(resizetoFit = false) {
    canvas.tabIndex = -1;
    canvas2d.fillStyle = "black";
    canvas2d.fillRect(0, 0, canvas.width, canvas.height);
    this.resizeToFit = resizetoFit;
    if (this.resizeToFit) {
      this.resize(window.innerWidth, window.innerHeight);
    } else {
      this.resize(canvas.width, canvas.height);
    }
  }
  get sWid() {
    return canvas.width;
  }
  get sHei() {
    return canvas.height;
  }
  resize(width, height) {
    canvas.width = width;
    canvas.height = height;
    this.drawArea = new PixMap(width, height);
    Pix3D.setRenderClipping();
  }
  async run() {
    canvas.addEventListener("resize", () => {
      if (this.resizeToFit) {
        this.resize(window.innerWidth, window.innerHeight);
      }
    }, false);
    canvas.onfocus = this.onfocus.bind(this);
    canvas.onblur = this.onblur.bind(this);
    canvas.onkeydown = this.onkeydown.bind(this);
    canvas.onkeyup = this.onkeyup.bind(this);
    canvas.onwheel = this.onwheel.bind(this);
    canvas.onmousedown = this.onmousedown.bind(this);
    canvas.onpointerdown = this.onpointerdown.bind(this);
    canvas.onmouseup = this.onmouseup.bind(this);
    canvas.onpointerup = this.onpointerup.bind(this);
    canvas.onpointerenter = this.onpointerenter.bind(this);
    canvas.onpointerleave = this.onpointerleave.bind(this);
    canvas.onpointermove = this.onpointermove.bind(this);
    window.onmouseup = this.windowMouseUp.bind(this);
    window.onmousemove = this.windowMouseMove.bind(this);
    if (this.isTouchDevice) {
      if (this.hasTouchEvents) {
        canvas.ontouchstart = this.ontouchstart.bind(this);
      } else {
        canvas.style.touchAction = "none";
      }
    }
    canvas.oncontextmenu = (e) => {
      e.preventDefault();
    };
    window.oncontextmenu = (e) => {
      e.preventDefault();
    };
    await this.messageBox("Loading...", 0);
    await this.maininit();
    let ntime = 0;
    let opos = 0;
    let ratio = 256;
    let delta = 1;
    let count = 0;
    for (let i = 0;i < 10; i++) {
      this.otim[i] = performance.now();
    }
    while (this.state >= 0) {
      if (this.state > 0) {
        this.state--;
        if (this.state === 0) {
          this.shutdown();
          return;
        }
      }
      const lastRatio = ratio;
      const lastDelta = delta;
      ratio = 300;
      delta = 1;
      ntime = performance.now();
      const otim = this.otim[opos];
      if (otim === 0) {
        ratio = lastRatio;
        delta = lastDelta;
      } else if (ntime > otim) {
        ratio = this.deltime * 2560 / (ntime - otim) | 0;
      }
      if (ratio < 25) {
        ratio = 25;
      } else if (ratio > 256) {
        ratio = 256;
        delta = this.deltime - (ntime - otim) / 10 | 0;
      }
      this.otim[opos] = ntime;
      opos = (opos + 1) % 10;
      if (delta > 1) {
        for (let i = 0;i < 10; i++) {
          if (this.otim[i] !== 0) {
            this.otim[i] += delta;
          }
        }
      }
      if (delta < this.mindel) {
        delta = this.mindel;
      }
      await sleep(delta);
      while (count < 256) {
        this.mouseClickButton = this.nextMouseClickButton;
        this.mouseClickX = this.nextMouseClickX;
        this.mouseClickY = this.nextMouseClickY;
        this.mouseClickTime = this.nextMouseClickTime;
        this.nextMouseClickButton = 0;
        await this.mainloop();
        count += ratio;
      }
      count &= 255;
      if (this.deltime > 0) {
        this.fps = ratio * 1000 / (this.deltime * 256) | 0;
      }
      await this.maindraw();
      if (this.tfps < 50) {
        const tfps = 1000 / this.tfps - (performance.now() - ntime);
        if (tfps > 0) {
          await sleep(tfps);
        }
      }
      if (this.debug) {
        console.log("ntime:" + ntime);
        for (let i = 0;i < 10; i++) {
          const o = (opos - i - 1 + 20) % 10;
          console.log("otim" + o + ":" + this.otim[o]);
        }
        console.log("fps:" + this.fps + " ratio:" + ratio + " count:" + count);
        console.log("del:" + delta + " deltime:" + this.deltime + " mindel:" + this.mindel);
        console.log("opos:" + opos);
        this.debug = false;
      }
    }
    if (this.state === -1) {
      this.shutdown();
    }
  }
  shutdown() {
    this.state = -2;
  }
  setFramerate(rate) {
    this.deltime = 1000 / rate | 0;
  }
  setTargetedFramerate(rate) {
    this.tfps = Math.max(Math.min(50, rate | 0), 0);
  }
  start() {
    if (this.state >= 0) {
      this.state = 0;
    }
  }
  stop() {
    if (this.state >= 0) {
      this.state = 4000 / this.deltime | 0;
    }
  }
  async messageBox(message, progress) {
    const width = this.sWid;
    const height = this.sHei;
    if (this.redrawScreen) {
      canvas2d.fillStyle = "black";
      canvas2d.fillRect(0, 0, width, height);
      this.redrawScreen = false;
    }
    const y = height / 2 - 18;
    canvas2d.strokeStyle = "rgb(140, 17, 17)";
    canvas2d.strokeRect((width / 2 | 0) - 152, y, 304, 34);
    canvas2d.fillStyle = "rgb(140, 17, 17)";
    canvas2d.fillRect((width / 2 | 0) - 150, y + 2, progress * 3, 30);
    canvas2d.fillStyle = "black";
    canvas2d.fillRect((width / 2 | 0) - 150 + progress * 3, y + 2, 300 - progress * 3, 30);
    canvas2d.font = "bold 13px helvetica, sans-serif";
    canvas2d.textAlign = "center";
    canvas2d.fillStyle = "white";
    canvas2d.fillText(message, width / 2 | 0, y + 22);
    await sleep(5);
  }
  onmousedown(e) {
    if (e.clientX < 0 || e.clientY < 0) {
      return;
    }
    const { x, y } = this.getMousePos(e);
    this.mouseDown(x, y, e);
  }
  onwheel(e) {
    const ZOOM_STEP = 0.5;
    const MIN_ZOOM = 0;
    const MAX_ZOOM = 3;
    if (e.deltaY > 0) {
      GameShell.cameraZoom = Math.min(MAX_ZOOM, GameShell.cameraZoom + ZOOM_STEP);
    } else {
      GameShell.cameraZoom = Math.max(MIN_ZOOM, GameShell.cameraZoom - ZOOM_STEP);
    }
  }
  mouseDown(x, y, e) {
    this.idleTimer = performance.now();
    this.nextMouseClickX = x;
    this.nextMouseClickY = y;
    this.nextMouseClickTime = performance.now();
    this.mouseX = x;
    this.mouseY = y;
    if (e.button === 2) {
      this.nextMouseClickButton = 2;
      this.mouseButton = 2;
    } else {
      this.nextMouseClickButton = 1;
      this.mouseButton = 1;
    }
    if (InputTracking.active) {
      InputTracking.mousePressed(x, y, e.button, "mouse");
    }
  }
  onpointerdown(e) {
    if (e.clientX < 0 || e.clientY < 0) {
      return;
    }
    const { x, y } = this.getMousePos(e);
    this.pointerDown(x, y, e);
  }
  pointerDown(_x, _y, _e) {}
  onmouseup(e) {
    const { x, y } = this.getMousePos(e);
    this.mouseUp(x, y, e);
  }
  mouseUp(x, y, e) {
    this.idleTimer = performance.now();
    this.mouseButton = 0;
    if (InputTracking.active) {
      InputTracking.mouseReleased(e.button, "mouse");
    }
    this.mouseX = x;
    this.mouseY = y;
  }
  onpointerup(e) {
    const { x, y } = this.getMousePos(e);
    this.pointerUp(x, y, e);
  }
  pointerUp(_x, _y, _e) {}
  onpointerenter(e) {
    if (e.clientX < 0 || e.clientY < 0) {
      return;
    }
    const { x, y } = this.getMousePos(e);
    this.pointerEnter(x, y, e);
  }
  pointerEnter(x, y, _e) {
    this.mouseX = x;
    this.mouseY = y;
    if (InputTracking.active) {
      InputTracking.mouseEntered();
    }
  }
  onpointerleave(e) {
    this.pointerLeave(e);
  }
  pointerLeave(_e) {
    this.idleTimer = performance.now();
    this.mouseX = -1;
    this.mouseY = -1;
    if (InputTracking.active) {
      InputTracking.mouseExited();
    }
    this.nextMouseClickX = -1;
    this.nextMouseClickY = -1;
    this.nextMouseClickButton = 0;
    this.mouseButton = 0;
  }
  onpointermove(e) {
    if (e.clientX < 0 || e.clientY < 0) {
      return;
    }
    const { x, y } = this.getMousePos(e);
    this.pointerMove(x, y, e);
  }
  pointerMove(x, y, e) {
    this.idleTimer = performance.now();
    this.mouseX = x;
    this.mouseY = y;
    if (InputTracking.active) {
      InputTracking.mouseMoved(x, y, e.pointerType);
    }
  }
  windowMouseUp(e) {}
  windowMouseMove(e) {}
  ontouchstart(e) {
    this.touchStart(e);
  }
  touchStart(e) {
    if (e.touches.length < 2) {
      e.preventDefault();
    }
  }
  onkeydown(e) {
    this.idleTimer = performance.now();
    const keyCode = KeyCodes.get(e.key);
    if (!keyCode || e.code.length === 0 && !e.isTrusted) {
      return;
    }
    let ch = keyCode.ch;
    if (e.ctrlKey) {
      if (ch >= 65 && ch <= 93 || ch == 95) {
        ch -= 65 - 1;
      } else if (ch >= 97 && ch <= 122) {
        ch -= 97 - 1;
      }
    }
    if (ch > 0 && ch < 128) {
      this.keyHeld[ch] = 1;
    }
    if (ch > 4) {
      this.keyQueue[this.keyQueueWritePos] = ch;
      this.keyQueueWritePos = this.keyQueueWritePos + 1 & 127;
    }
    if (InputTracking.active) {
      InputTracking.keyPressed(ch);
    }
    if (!CanvasEnabledKeys.includes(e.key)) {
      e.preventDefault();
    }
  }
  onkeyup(e) {
    this.idleTimer = performance.now();
    const keyCode = KeyCodes.get(e.key);
    if (!keyCode || e.code.length === 0 && !e.isTrusted) {
      return;
    }
    let ch = keyCode.ch;
    if (e.ctrlKey) {
      if (ch >= 65 && ch <= 93 || ch == 95) {
        ch -= 65 - 1;
      } else if (ch >= 97 && ch <= 122) {
        ch -= 97 - 1;
      }
    }
    if (ch > 0 && ch < 128) {
      this.keyHeld[ch] = 0;
    }
    if (InputTracking.active) {
      InputTracking.keyReleased(ch);
    }
    if (!CanvasEnabledKeys.includes(e.key)) {
      e.preventDefault();
    }
  }
  pollKey() {
    let key = -1;
    if (this.keyQueueWritePos !== this.keyQueueReadPos) {
      key = this.keyQueue[this.keyQueueReadPos];
      this.keyQueueReadPos = this.keyQueueReadPos + 1 & 127;
    }
    return key;
  }
  onfocus(_e) {
    this.focus = true;
    this.redrawScreen = true;
    this.refresh();
    if (InputTracking.active) {
      InputTracking.focusGained();
    }
  }
  onblur(_e) {
    this.focus = false;
    for (let i = 0;i < 128; i++) {
      this.keyHeld[i] = 0;
    }
    if (InputTracking.active) {
      InputTracking.focusLost();
    }
  }
  get hasTouchEvents() {
    return "ontouchstart" in window;
  }
  get isTouchDevice() {
    return this.hasTouchEvents || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
  }
  get isMobile() {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone|Mobile/i.test(navigator.userAgent)) {
      return true;
    }
    return this.isTouchDevice;
  }
  isFullScreen() {
    return document.fullscreenElement !== null;
  }
  getMousePos(e) {
    const fixedWidth = this.sWid;
    const fixedHeight = this.sHei;
    const canvasBounds = canvas.getBoundingClientRect();
    const clickLocWithinCanvas = {
      x: e.clientX - canvasBounds.left,
      y: e.clientY - canvasBounds.top
    };
    let x = 0;
    let y = 0;
    if (this.isFullScreen()) {
      const gameAspectRatio = fixedWidth / fixedHeight;
      const ourAspectRatio = window.innerWidth / window.innerHeight;
      const wider = ourAspectRatio >= gameAspectRatio;
      let trueCanvasWidth = 0;
      let trueCanvasHeight = 0;
      let offsetX = 0;
      let offsetY = 0;
      if (wider) {
        trueCanvasWidth = window.innerHeight * gameAspectRatio;
        trueCanvasHeight = window.innerHeight;
        offsetX = (window.innerWidth - trueCanvasWidth) / 2;
      } else {
        trueCanvasWidth = window.innerWidth;
        trueCanvasHeight = window.innerWidth / gameAspectRatio;
        offsetY = (window.innerHeight - trueCanvasHeight) / 2;
      }
      const scaleX = fixedWidth / trueCanvasWidth;
      const scaleY = fixedHeight / trueCanvasHeight;
      x = (clickLocWithinCanvas.x - offsetX) * scaleX | 0;
      y = (clickLocWithinCanvas.y - offsetY) * scaleY | 0;
    } else {
      const scaleX = canvas.width / canvasBounds.width;
      const scaleY = canvas.height / canvasBounds.height;
      x = clickLocWithinCanvas.x * scaleX | 0;
      y = clickLocWithinCanvas.y * scaleY | 0;
    }
    if (x < 0) {
      x = 0;
    }
    if (x > fixedWidth) {
      x = fixedWidth;
    }
    if (y < 0) {
      y = 0;
    }
    if (y > fixedHeight) {
      y = fixedHeight;
    }
    return { x, y };
  }
}

// src/graphics/Jpeg.ts
var jpegCanvas = document.createElement("canvas");
var jpegImg = document.createElement("img");
var jpeg2d = jpegCanvas.getContext("2d", {
  willReadFrequently: true
});
async function decodeJpeg(data) {
  if (data[0] !== 255) {
    data[0] = 255;
  }
  URL.revokeObjectURL(jpegImg.src);
  jpegImg.src = URL.createObjectURL(new Blob([data], { type: "image/jpeg" }));
  await new Promise((resolve) => jpegImg.onload = () => resolve());
  jpeg2d.clearRect(0, 0, jpegCanvas.width, jpegCanvas.height);
  const width = jpegImg.naturalWidth;
  const height = jpegImg.naturalHeight;
  jpegCanvas.width = width;
  jpegCanvas.height = height;
  jpeg2d.drawImage(jpegImg, 0, 0);
  return jpeg2d.getImageData(0, 0, width, height);
}

// src/graphics/Pix32.ts
class Pix32 extends Pix2D {
  data;
  wi;
  hi;
  xof;
  yof;
  owi;
  ohi;
  constructor(width, height) {
    super();
    this.data = new Int32Array(width * height);
    this.wi = this.owi = width;
    this.hi = this.ohi = height;
    this.xof = this.yof = 0;
  }
  static async fromJpeg(archive, name) {
    const dat = archive.read(name + ".dat");
    if (!dat) {
      throw new Error;
    }
    const jpeg = await decodeJpeg(dat);
    const image = new Pix32(jpeg.width, jpeg.height);
    const data = new Uint32Array(jpeg.data.buffer);
    for (let i = 0;i < image.data.length; i++) {
      const pixel = data[i];
      image.data[i] = (pixel >> 24 & 255) << 24 | (pixel & 255) << 16 | (pixel >> 8 & 255) << 8 | pixel >> 16 & 255;
    }
    return image;
  }
  static depack(jag, name, sprite = 0) {
    const dat = new Packet(jag.read(name + ".dat"));
    const index = new Packet(jag.read("index.dat"));
    index.pos = dat.g2();
    const owi = index.g2();
    const ohi = index.g2();
    const bpalCount = index.g1();
    const bpal = new Int32Array(bpalCount);
    for (let i = 0;i < bpalCount - 1; i++) {
      bpal[i + 1] = index.g3();
      if (bpal[i + 1] === 0) {
        bpal[i + 1] = 1;
      }
    }
    for (let i = 0;i < sprite; i++) {
      index.pos += 2;
      dat.pos += index.g2() * index.g2();
      index.pos += 1;
    }
    if (dat.pos > dat.length || index.pos > index.length) {
      throw new Error;
    }
    const xof = index.g1();
    const yof = index.g1();
    const wi = index.g2();
    const hi = index.g2();
    const image = new Pix32(wi, hi);
    image.xof = xof;
    image.yof = yof;
    image.owi = owi;
    image.ohi = ohi;
    const encoding = index.g1();
    if (encoding === 0) {
      for (let i = 0;i < image.wi * image.hi; i++) {
        image.data[i] = bpal[dat.g1()];
      }
    } else if (encoding === 1) {
      for (let x = 0;x < image.wi; x++) {
        for (let y = 0;y < image.hi; y++) {
          image.data[x + y * image.wi] = bpal[dat.g1()];
        }
      }
    }
    return image;
  }
  setPixels() {
    Pix2D.setPixels(this.data, this.wi, this.hi);
  }
  rgbAdjust(r, g, b) {
    for (let i = 0;i < this.data.length; i++) {
      const rgb = this.data[i];
      if (rgb !== 0) {
        let red = rgb >> 16 & 255;
        red += r;
        if (red < 1) {
          red = 1;
        } else if (red > 255) {
          red = 255;
        }
        let green = rgb >> 8 & 255;
        green += g;
        if (green < 1) {
          green = 1;
        } else if (green > 255) {
          green = 255;
        }
        let blue = rgb & 255;
        blue += b;
        if (blue < 1) {
          blue = 1;
        } else if (blue > 255) {
          blue = 255;
        }
        this.data[i] = (red << 16) + (green << 8) + blue;
      }
    }
  }
  trim() {
    const pixels = new Int32Array(this.owi * this.ohi);
    for (let y = 0;y < this.hi; y++) {
      for (let x = 0;x < this.wi; x++) {
        pixels[(this.yof + y) * this.owi + this.xof + x] = this.data[this.wi * y + x];
      }
    }
    this.data = pixels;
    this.wi = this.owi;
    this.hi = this.ohi;
    this.xof = 0;
    this.yof = 0;
  }
  hflip() {
    const pixels = this.data;
    const width = this.wi;
    const height = this.hi;
    for (let y = 0;y < height; y++) {
      const div = width / 2 | 0;
      for (let x = 0;x < div; x++) {
        const off1 = x + y * width;
        const off2 = width - x - 1 + y * width;
        const tmp = pixels[off1];
        pixels[off1] = pixels[off2];
        pixels[off2] = tmp;
      }
    }
  }
  vflip() {
    const pixels = this.data;
    const width = this.wi;
    const height = this.hi;
    for (let y = 0;y < (height / 2 | 0); y++) {
      for (let x = 0;x < width; x++) {
        const off1 = x + y * width;
        const off2 = x + (height - y - 1) * width;
        const tmp = pixels[off1];
        pixels[off1] = pixels[off2];
        pixels[off2] = tmp;
      }
    }
  }
  quickPlotSprite(x, y) {
    x |= 0;
    y |= 0;
    x += this.xof;
    y += this.yof;
    let dstOff = x + y * Pix2D.width;
    let srcOff = 0;
    let h = this.hi;
    let w = this.wi;
    let dstStep = Pix2D.width - w;
    let srcStep = 0;
    if (y < Pix2D.clipMinY) {
      const cutoff = Pix2D.clipMinY - y;
      h -= cutoff;
      y = Pix2D.clipMinY;
      srcOff += cutoff * w;
      dstOff += cutoff * Pix2D.width;
    }
    if (y + h > Pix2D.clipMaxY) {
      h -= y + h - Pix2D.clipMaxY;
    }
    if (x < Pix2D.clipMinX) {
      const cutoff = Pix2D.clipMinX - x;
      w -= cutoff;
      x = Pix2D.clipMinX;
      srcOff += cutoff;
      dstOff += cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (x + w > Pix2D.clipMaxX) {
      const cutoff = x + w - Pix2D.clipMaxX;
      w -= cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (w > 0 && h > 0) {
      this.plotQuick(w, h, this.data, srcOff, srcStep, Pix2D.pixels, dstOff, dstStep);
    }
  }
  plotQuick(w, h, src, srcOff, srcStep, dst, dstOff, dstStep) {
    const qw = -(w >> 2);
    w = -(w & 3);
    for (let y = -h;y < 0; y++) {
      for (let x = qw;x < 0; x++) {
        dst[dstOff++] = src[srcOff++];
        dst[dstOff++] = src[srcOff++];
        dst[dstOff++] = src[srcOff++];
        dst[dstOff++] = src[srcOff++];
      }
      for (let x = w;x < 0; x++) {
        dst[dstOff++] = src[srcOff++];
      }
      dstOff += dstStep;
      srcOff += srcStep;
    }
  }
  plotSprite(x, y) {
    x |= 0;
    y |= 0;
    x += this.xof;
    y += this.yof;
    let dstOff = x + y * Pix2D.width;
    let srcOff = 0;
    let h = this.hi;
    let w = this.wi;
    let dstStep = Pix2D.width - w;
    let srcStep = 0;
    if (y < Pix2D.clipMinY) {
      const cutoff = Pix2D.clipMinY - y;
      h -= cutoff;
      y = Pix2D.clipMinY;
      srcOff += cutoff * w;
      dstOff += cutoff * Pix2D.width;
    }
    if (y + h > Pix2D.clipMaxY) {
      h -= y + h - Pix2D.clipMaxY;
    }
    if (x < Pix2D.clipMinX) {
      const cutoff = Pix2D.clipMinX - x;
      w -= cutoff;
      x = Pix2D.clipMinX;
      srcOff += cutoff;
      dstOff += cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (x + w > Pix2D.clipMaxX) {
      const cutoff = x + w - Pix2D.clipMaxX;
      w -= cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (w > 0 && h > 0) {
      this.plot(w, h, this.data, srcOff, srcStep, Pix2D.pixels, dstOff, dstStep);
    }
  }
  plot(w, h, src, srcOff, srcStep, dst, dstOff, dstStep) {
    const qw = -(w >> 2);
    w = -(w & 3);
    for (let y = -h;y < 0; y++) {
      for (let x = qw;x < 0; x++) {
        let rgb = src[srcOff++];
        if (rgb === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
        rgb = src[srcOff++];
        if (rgb === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
        rgb = src[srcOff++];
        if (rgb === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
        rgb = src[srcOff++];
        if (rgb === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
      }
      for (let x = w;x < 0; x++) {
        const rgb = src[srcOff++];
        if (rgb === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
      }
      dstOff += dstStep;
      srcOff += srcStep;
    }
  }
  transPlotSprite(x, y, alpha) {
    x |= 0;
    y |= 0;
    x += this.xof;
    y += this.yof;
    let dstStep = x + y * Pix2D.width;
    let srcStep = 0;
    let h = this.hi;
    let w = this.wi;
    let dstOff = Pix2D.width - w;
    let srcOff = 0;
    if (y < Pix2D.clipMinY) {
      const cutoff = Pix2D.clipMinY - y;
      h -= cutoff;
      y = Pix2D.clipMinY;
      srcStep += cutoff * w;
      dstStep += cutoff * Pix2D.width;
    }
    if (y + h > Pix2D.clipMaxY) {
      h -= y + h - Pix2D.clipMaxY;
    }
    if (x < Pix2D.clipMinX) {
      const cutoff = Pix2D.clipMinX - x;
      w -= cutoff;
      x = Pix2D.clipMinX;
      srcStep += cutoff;
      dstStep += cutoff;
      srcOff += cutoff;
      dstOff += cutoff;
    }
    if (x + w > Pix2D.clipMaxX) {
      const cutoff = x + w - Pix2D.clipMaxX;
      w -= cutoff;
      srcOff += cutoff;
      dstOff += cutoff;
    }
    if (w > 0 && h > 0) {
      this.tranSprite(Pix2D.pixels, this.data, srcStep, dstStep, w, h, dstOff, srcOff, alpha);
    }
  }
  tranSprite(dst, src, srcOff, dstOff, w, h, dstStep, srcStep, alpha) {
    const invAlpha = 256 - alpha;
    for (let y = -h;y < 0; y++) {
      for (let x = -w;x < 0; x++) {
        const rgb = src[srcOff++];
        if (rgb === 0) {
          dstOff++;
        } else {
          const dstRgb = dst[dstOff];
          dst[dstOff++] = ((rgb & 16711935) * alpha + (dstRgb & 16711935) * invAlpha & 4278255360) + ((rgb & 65280) * alpha + (dstRgb & 65280) * invAlpha & 16711680) >> 8;
        }
      }
      dstOff += dstStep;
      srcOff += srcStep;
    }
  }
  scanlineRotatePlotSprite(x, y, w, h, anchorX, anchorY, theta, zoom, lineStart, lineWidth) {
    x |= 0;
    y |= 0;
    w |= 0;
    h |= 0;
    try {
      const centerX = -w / 2 | 0;
      const centerY = -h / 2 | 0;
      const sin = Math.sin(theta / 326.11) * 65536 | 0;
      const cos = Math.cos(theta / 326.11) * 65536 | 0;
      const sinZoom = sin * zoom >> 8;
      const cosZoom = cos * zoom >> 8;
      let leftX = (anchorX << 16) + centerY * sinZoom + centerX * cosZoom;
      let leftY = (anchorY << 16) + (centerY * cosZoom - centerX * sinZoom);
      let leftOff = x + y * Pix2D.width;
      for (let i = 0;i < h; i++) {
        const dstOff = lineStart[i];
        let dstX = leftOff + dstOff;
        let srcX = leftX + cosZoom * dstOff;
        let srcY = leftY - sinZoom * dstOff;
        for (let j = -lineWidth[i];j < 0; j++) {
          Pix2D.pixels[dstX++] = this.data[(srcX >> 16) + (srcY >> 16) * this.wi];
          srcX += cosZoom;
          srcY -= sinZoom;
        }
        leftX += sinZoom;
        leftY += cosZoom;
        leftOff += Pix2D.width;
      }
    } catch (_e) {}
  }
  rotatePlotSprite(x, y, w, h, anchorX, anchorY, theta, zoom) {
    x |= 0;
    y |= 0;
    w |= 0;
    h |= 0;
    try {
      const centerX = -w / 2 | 0;
      const centerY = -h / 2 | 0;
      const sin = Math.sin(theta) * 65536 | 0;
      const cos = Math.cos(theta) * 65536 | 0;
      const sinZoom = sin * zoom >> 8;
      const cosZoom = cos * zoom >> 8;
      let leftX = (anchorX << 16) + (centerY * sinZoom + centerX * cosZoom);
      let leftY = (anchorY << 16) + (centerY * cosZoom - centerX * sinZoom);
      let leftOff = x + y * Pix2D.width;
      for (let i = 0;i < h; i++) {
        let dstX = leftOff;
        let srcX = leftX;
        let srcY = leftY;
        for (let j = -w;j < 0; j++) {
          const rgb = this.data[(srcX >> 16) + (srcY >> 16) * this.owi];
          if (rgb == 0) {
            dstX++;
          } else {
            Pix2D.pixels[dstX++] = rgb;
          }
          srcX += cosZoom;
          srcY -= sinZoom;
        }
        leftX += sinZoom;
        leftY += cosZoom;
        leftOff += Pix2D.width;
      }
    } catch (_e) {}
  }
  scanlinePlotSprite(mask, x, y) {
    x |= 0;
    y |= 0;
    x += this.xof;
    y += this.yof;
    let dstStep = x + y * Pix2D.width;
    let srcStep = 0;
    let h = this.hi;
    let w = this.wi;
    let dstOff = Pix2D.width - w;
    let srcOff = 0;
    if (y < Pix2D.clipMinY) {
      const cutoff = Pix2D.clipMinY - y;
      h -= cutoff;
      y = Pix2D.clipMinY;
      srcStep += cutoff * w;
      dstStep += cutoff * Pix2D.width;
    }
    if (y + h > Pix2D.clipMaxY) {
      h -= y + h - Pix2D.clipMaxY;
    }
    if (x < Pix2D.clipMinX) {
      const cutoff = Pix2D.clipMinX - x;
      w -= cutoff;
      x = Pix2D.clipMinX;
      srcStep += cutoff;
      dstStep += cutoff;
      srcOff += cutoff;
      dstOff += cutoff;
    }
    if (x + w > Pix2D.clipMaxX) {
      const cutoff = x + w - Pix2D.clipMaxX;
      w -= cutoff;
      srcOff += cutoff;
      dstOff += cutoff;
    }
    if (w > 0 && h > 0) {
      this.plotScanline(Pix2D.pixels, this.data, srcStep, dstStep, w, h, dstOff, srcOff, mask.data);
    }
  }
  plotScanline(dst, src, srcOff, dstOff, w, h, dstStep, srcStep, mask) {
    const qw = -(w >> 2);
    w = -(w & 3);
    for (let y = -h;y < 0; y++) {
      for (let x = qw;x < 0; x++) {
        let rgb = src[srcOff++];
        if (rgb !== 0 && mask[dstOff] === 0) {
          dst[dstOff++] = rgb;
        } else {
          dstOff++;
        }
        rgb = src[srcOff++];
        if (rgb !== 0 && mask[dstOff] === 0) {
          dst[dstOff++] = rgb;
        } else {
          dstOff++;
        }
        rgb = src[srcOff++];
        if (rgb !== 0 && mask[dstOff] === 0) {
          dst[dstOff++] = rgb;
        } else {
          dstOff++;
        }
        rgb = src[srcOff++];
        if (rgb !== 0 && mask[dstOff] === 0) {
          dst[dstOff++] = rgb;
        } else {
          dstOff++;
        }
      }
      for (let x = w;x < 0; x++) {
        const rgb = src[srcOff++];
        if (rgb !== 0 && mask[dstOff] === 0) {
          dst[dstOff++] = rgb;
        } else {
          dstOff++;
        }
      }
      dstOff += dstStep;
      srcOff += srcStep;
    }
  }
}

// src/util/JavaRandom.ts
var p2_16 = 65536;
var p2_24 = 16777216;
var p2_27 = 134217728;
var p2_31 = 2147483648;
var p2_32 = 4294967296;
var p2_48 = 281474976710656;
var p2_53 = Math.pow(2, 53);
var m2_16 = 65535;
var [c2, c1, c0] = [5, 57068, 58989];
var s2 = 0;
var s1 = 0;
var s0 = 0;
function _next() {
  let carry = 11;
  let r0 = s0 * c0 + carry;
  carry = r0 >>> 16;
  r0 &= m2_16;
  let r1 = s1 * c0 + s0 * c1 + carry;
  carry = r1 >>> 16;
  r1 &= m2_16;
  let r2 = s2 * c0 + s1 * c1 + s0 * c2 + carry;
  r2 &= m2_16;
  [s2, s1, s0] = [r2, r1, r0];
  return s2 * p2_16 + s1;
}
function next_signed(bits) {
  return _next() >> 32 - bits;
}
function next(bits) {
  return _next() >>> 32 - bits;
}
function checkIsPositiveInt(n, r = Number.MAX_SAFE_INTEGER) {
  if (n < 0 || n > r) {
    throw RangeError("number must be > 0");
  }
}

class JavaRandom {
  constructor(seedval) {
    if (typeof seedval === "undefined") {
      seedval = Math.floor(Math.random() * p2_48);
    }
    this.setSeed(seedval);
  }
  setSeed(n) {
    checkIsPositiveInt(n);
    s0 = n & m2_16 ^ c0;
    s1 = n / p2_16 & m2_16 ^ c1;
    s2 = n / p2_32 & m2_16 ^ c2;
  }
  nextInt(bound) {
    if (bound === undefined) {
      return next_signed(32);
    }
    checkIsPositiveInt(bound, 2147483647);
    if ((bound & -bound) === bound) {
      const r = next(31) / p2_31;
      return ~~(bound * r);
    }
    let bits, val;
    do {
      bits = next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0);
    return val;
  }
  nextLong() {
    const msb = BigInt(next_signed(32));
    const lsb = BigInt(next_signed(32));
    const p2_32n = BigInt(p2_32);
    return msb * p2_32n + lsb;
  }
  nextBoolean() {
    return next(1) != 0;
  }
  nextFloat() {
    return next(24) / p2_24;
  }
  nextDouble() {
    return (p2_27 * next(26) + next(27)) / p2_53;
  }
}

// src/graphics/PixFont.ts
class PixFont extends Linkable2 {
  static CHARSET = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!"£$%^&*()-_=+[{]};:'@#~,<.>/?\\| `;
  static CHARCODESET = [];
  charMask = [];
  charMaskWidth = new Int32Array(94);
  charMaskHeight = new Int32Array(94);
  charOffsetX = new Int32Array(94);
  charOffsetY = new Int32Array(94);
  charAdvance = new Int32Array(95);
  drawWidth = new Int32Array(256);
  rand = new JavaRandom(Date.now());
  strikeout = false;
  height2d = 0;
  static {
    const isCapacitor = navigator.userAgent.includes("Capacitor");
    for (let i = 0;i < 256; i++) {
      let c = PixFont.CHARSET.indexOf(String.fromCharCode(i));
      if (isCapacitor) {
        if (c >= 63) {
          c--;
        }
      }
      if (c === -1) {
        c = 74;
      }
      PixFont.CHARCODESET[i] = c;
    }
  }
  static depack(archive, name) {
    const dat = new Packet(archive.read(name + ".dat"));
    const idx = new Packet(archive.read("index.dat"));
    idx.pos = dat.g2() + 4;
    const off = idx.g1();
    if (off > 0) {
      idx.pos += (off - 1) * 3;
    }
    const font = new PixFont;
    for (let i = 0;i < 94; i++) {
      font.charOffsetX[i] = idx.g1();
      font.charOffsetY[i] = idx.g1();
      const w = font.charMaskWidth[i] = idx.g2();
      const h = font.charMaskHeight[i] = idx.g2();
      const type = idx.g1();
      const len = w * h;
      font.charMask[i] = new Int8Array(len);
      if (type === 0) {
        for (let j = 0;j < w * h; j++) {
          font.charMask[i][j] = dat.g1b();
        }
      } else if (type === 1) {
        for (let x = 0;x < w; x++) {
          for (let y = 0;y < h; y++) {
            font.charMask[i][x + y * w] = dat.g1b();
          }
        }
      }
      if (h > font.height2d) {
        font.height2d = h;
      }
      font.charOffsetX[i] = 1;
      font.charAdvance[i] = w + 2;
      {
        let space = 0;
        for (let y = h / 7 | 0;y < h; y++) {
          space += font.charMask[i][y * w];
        }
        if (space <= (h / 7 | 0)) {
          font.charAdvance[i]--;
          font.charOffsetX[i] = 0;
        }
      }
      {
        let space = 0;
        for (let y = h / 7 | 0;y < h; y++) {
          space += font.charMask[i][w + y * w - 1];
        }
        if (space <= (h / 7 | 0)) {
          font.charAdvance[i]--;
        }
      }
    }
    font.charAdvance[94] = font.charAdvance[8];
    for (let i = 0;i < 256; i++) {
      font.drawWidth[i] = font.charAdvance[PixFont.CHARCODESET[i]];
    }
    return font;
  }
  centreString(str, x, y, rgb) {
    if (!str) {
      return;
    }
    x |= 0;
    y |= 0;
    this.drawString(str, x - (this.stringWid(str) / 2 | 0), y, rgb);
  }
  centreStringTag(str, x, y, rgb, shadowed) {
    x |= 0;
    y |= 0;
    this.drawStringTag(str, x - (this.stringWid(str) / 2 | 0), y, rgb, shadowed);
  }
  stringWid(str) {
    if (!str) {
      return 0;
    }
    const length = str.length;
    let w = 0;
    for (let i = 0;i < length; i++) {
      if (str.charAt(i) === "@" && i + 4 < length && str.charAt(i + 4) === "@") {
        i += 4;
      } else {
        w += this.drawWidth[str.charCodeAt(i)];
      }
    }
    return w;
  }
  drawString(str, x, y, rgb) {
    if (!str) {
      return;
    }
    x |= 0;
    y |= 0;
    y -= this.height2d;
    for (let i = 0;i < str.length; i++) {
      const c = PixFont.CHARCODESET[str.charCodeAt(i)];
      if (c !== 94) {
        this.plotLetter(this.charMask[c], x + this.charOffsetX[c], y + this.charOffsetY[c], this.charMaskWidth[c], this.charMaskHeight[c], rgb);
      }
      x += this.charAdvance[c];
    }
  }
  centerStringWave(str, x, y, rgb, phase) {
    if (!str) {
      return;
    }
    x |= 0;
    y |= 0;
    x -= this.stringWid(str) / 2 | 0;
    const offY = y - this.height2d;
    for (let i = 0;i < str.length; i++) {
      const c = PixFont.CHARCODESET[str.charCodeAt(i)];
      if (c != 94) {
        this.plotLetter(this.charMask[c], x + this.charOffsetX[c], offY + this.charOffsetY[c] + (Math.sin(i / 2 + phase / 5) * 5 | 0), this.charMaskWidth[c], this.charMaskHeight[c], rgb);
      }
      x += this.charAdvance[c];
    }
  }
  drawStringTag(str, x, y, rgb, shadowed) {
    x |= 0;
    y |= 0;
    this.strikeout = false;
    const startX = x;
    const length = str.length;
    y -= this.height2d;
    for (let i = 0;i < length; i++) {
      if (str.charAt(i) === "@" && i + 4 < length && str.charAt(i + 4) === "@") {
        const tag = this.updateState(str.substring(i + 1, i + 4));
        if (tag !== -1) {
          rgb = tag;
        }
        i += 4;
      } else {
        const c = PixFont.CHARCODESET[str.charCodeAt(i)];
        if (c !== 94) {
          if (shadowed) {
            this.plotLetter(this.charMask[c], x + this.charOffsetX[c] + 1, y + this.charOffsetY[c] + 1, this.charMaskWidth[c], this.charMaskHeight[c], 0 /* BLACK */);
          }
          this.plotLetter(this.charMask[c], x + this.charOffsetX[c], y + this.charOffsetY[c], this.charMaskWidth[c], this.charMaskHeight[c], rgb);
        }
        x += this.charAdvance[c];
      }
    }
    if (this.strikeout) {
      Pix2D.hline(startX, y + (this.height2d * 0.7 | 0), x - startX, 8388608 /* DARKRED */);
    }
  }
  drawStringAntiMacro(str, x, y, rgb, shadowed, seed) {
    x |= 0;
    y |= 0;
    this.rand.setSeed(seed);
    const rand = (this.rand.nextInt() & 31) + 192;
    const offY = y - this.height2d;
    for (let i = 0;i < str.length; i++) {
      if (str.charAt(i) === "@" && i + 4 < str.length && str.charAt(i + 4) === "@") {
        const tag = this.updateState(str.substring(i + 1, i + 4));
        if (tag !== -1) {
          rgb = tag;
        }
        i += 4;
      } else {
        const c = PixFont.CHARCODESET[str.charCodeAt(i)];
        if (c !== 94) {
          if (shadowed) {
            this.plotLetterTrans(this.charMask[c], x + this.charOffsetX[c] + 1, offY + this.charOffsetY[c] + 1, this.charMaskWidth[c], this.charMaskHeight[c], 0 /* BLACK */, 192);
          }
          this.plotLetterTrans(this.charMask[c], x + this.charOffsetX[c], offY + this.charOffsetY[c], this.charMaskWidth[c], this.charMaskHeight[c], rgb, rand);
        }
        x += this.charAdvance[c];
        if ((this.rand.nextInt() & 3) === 0) {
          x++;
        }
      }
    }
  }
  updateState(tag) {
    if (tag === "red") {
      return 16711680 /* RED */;
    } else if (tag === "gre") {
      return 65280 /* GREEN */;
    } else if (tag === "blu") {
      return 255 /* BLUE */;
    } else if (tag === "yel") {
      return 16776960 /* YELLOW */;
    } else if (tag === "cya") {
      return 65535 /* CYAN */;
    } else if (tag === "mag") {
      return 16711935 /* MAGENTA */;
    } else if (tag === "whi") {
      return 16777215 /* WHITE */;
    } else if (tag === "bla") {
      return 0 /* BLACK */;
    } else if (tag === "lre") {
      return 16748608 /* LIGHTRED */;
    } else if (tag === "dre") {
      return 8388608 /* DARKRED */;
    } else if (tag === "dbl") {
      return 128 /* DARKBLUE */;
    } else if (tag === "or1") {
      return 16756736 /* ORANGE1 */;
    } else if (tag === "or2") {
      return 16740352 /* ORANGE2 */;
    } else if (tag === "or3") {
      return 16723968 /* ORANGE3 */;
    } else if (tag === "gr1") {
      return 12648192 /* GREEN1 */;
    } else if (tag === "gr2") {
      return 8453888 /* GREEN2 */;
    } else if (tag === "gr3") {
      return 4259584 /* GREEN3 */;
    } else {
      if (tag === "str") {
        this.strikeout = true;
      }
      return -1;
    }
  }
  drawStringRight(str, x, y, rgb, shadowed = true) {
    x |= 0;
    y |= 0;
    if (shadowed) {
      this.drawString(str, x - this.stringWid(str) + 1, y + 1, 0 /* BLACK */);
    }
    this.drawString(str, x - this.stringWid(str), y, rgb);
  }
  plotLetter(data, x, y, w, h, rgb) {
    x |= 0;
    y |= 0;
    w |= 0;
    h |= 0;
    let dstOff = x + y * Pix2D.width;
    let dstStep = Pix2D.width - w;
    let srcStep = 0;
    let srcOff = 0;
    if (y < Pix2D.clipMinY) {
      const cutoff = Pix2D.clipMinY - y;
      h -= cutoff;
      y = Pix2D.clipMinY;
      srcOff += cutoff * w;
      dstOff += cutoff * Pix2D.width;
    }
    if (y + h >= Pix2D.clipMaxY) {
      h -= y + h + 1 - Pix2D.clipMaxY;
    }
    if (x < Pix2D.clipMinX) {
      const cutoff = Pix2D.clipMinX - x;
      w -= cutoff;
      x = Pix2D.clipMinX;
      srcOff += cutoff;
      dstOff += cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (x + w >= Pix2D.clipMaxX) {
      const cutoff = x + w + 1 - Pix2D.clipMaxX;
      w -= cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (w > 0 && h > 0) {
      this.plot(Pix2D.pixels, data, rgb, srcOff, dstOff, w, h, dstStep, srcStep);
    }
  }
  plot(dst, src, rgb, srcOff, dstOff, w, h, dstStep, srcStep) {
    w |= 0;
    h |= 0;
    const hw = -(w >> 2);
    w = -(w & 3);
    for (let y = -h;y < 0; y++) {
      for (let x = hw;x < 0; x++) {
        if (src[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
        if (src[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
        if (src[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
        if (src[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
      }
      for (let x = w;x < 0; x++) {
        if (src[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
      }
      dstOff += dstStep;
      srcOff += srcStep;
    }
  }
  plotLetterTrans(data, x, y, w, h, rgb, alpha) {
    x |= 0;
    y |= 0;
    w |= 0;
    h |= 0;
    let dstOff = x + y * Pix2D.width;
    let dstStep = Pix2D.width - w;
    let srcStep = 0;
    let srcOff = 0;
    if (y < Pix2D.clipMinY) {
      const cutoff = Pix2D.clipMinY - y;
      h -= cutoff;
      y = Pix2D.clipMinY;
      srcOff += cutoff * w;
      dstOff += cutoff * Pix2D.width;
    }
    if (y + h >= Pix2D.clipMaxY) {
      h -= y + h + 1 - Pix2D.clipMaxY;
    }
    if (x < Pix2D.clipMinX) {
      const cutoff = Pix2D.clipMinX - x;
      w -= cutoff;
      x = Pix2D.clipMinX;
      srcOff += cutoff;
      dstOff += cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (x + w >= Pix2D.clipMaxX) {
      const cutoff = x + w + 1 - Pix2D.clipMaxX;
      w -= cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (w > 0 && h > 0) {
      this.plotTrans(Pix2D.pixels, data, rgb, srcOff, dstOff, w, h, dstStep, srcStep, alpha);
    }
  }
  plotTrans(dst, src, rgb, srcOff, dstOff, w, h, dstStep, srcStep, alpha) {
    w |= 0;
    h |= 0;
    const mixed = ((rgb & 16711935) * alpha & 4278255360) + ((rgb & 65280) * alpha & 16711680) >> 8;
    const invAlpha = 256 - alpha;
    for (let y = -h;y < 0; y++) {
      for (let x = -w;x < 0; x++) {
        if (src[srcOff++] === 0) {
          dstOff++;
        } else {
          const dstRgb = dst[dstOff];
          dst[dstOff++] = (((dstRgb & 16711935) * invAlpha & 4278255360) + ((dstRgb & 65280) * invAlpha & 16711680) >> 8) + mixed;
        }
      }
      dstOff += dstStep;
      srcOff += srcStep;
    }
  }
}

// src/io/BZip2.js
var crc32Table = [
  0,
  79764919,
  159529838,
  222504665,
  319059676,
  398814059,
  445009330,
  507990021,
  638119352,
  583659535,
  797628118,
  726387553,
  890018660,
  835552979,
  1015980042,
  944750013,
  1276238704,
  1221641927,
  1167319070,
  1095957929,
  1595256236,
  1540665371,
  1452775106,
  1381403509,
  1780037320,
  1859660671,
  1671105958,
  1733955601,
  2031960084,
  2111593891,
  1889500026,
  1952343757,
  2552477408,
  2632100695,
  2443283854,
  2506133561,
  2334638140,
  2414271883,
  2191915858,
  2254759653,
  3190512472,
  3135915759,
  3081330742,
  3009969537,
  2905550212,
  2850959411,
  2762807018,
  2691435357,
  3560074640,
  3505614887,
  3719321342,
  3648080713,
  3342211916,
  3287746299,
  3467911202,
  3396681109,
  4063920168,
  4143685023,
  4223187782,
  4286162673,
  3779000052,
  3858754371,
  3904687514,
  3967668269,
  881225847,
  809987520,
  1023691545,
  969234094,
  662832811,
  591600412,
  771767749,
  717299826,
  311336399,
  374308984,
  453813921,
  533576470,
  25881363,
  88864420,
  134795389,
  214552010,
  2023205639,
  2086057648,
  1897238633,
  1976864222,
  1804852699,
  1867694188,
  1645340341,
  1724971778,
  1587496639,
  1516133128,
  1461550545,
  1406951526,
  1302016099,
  1230646740,
  1142491917,
  1087903418,
  2896545431,
  2825181984,
  2770861561,
  2716262478,
  3215044683,
  3143675388,
  3055782693,
  3001194130,
  2326604591,
  2389456536,
  2200899649,
  2280525302,
  2578013683,
  2640855108,
  2418763421,
  2498394922,
  3769900519,
  3832873040,
  3912640137,
  3992402750,
  4088425275,
  4151408268,
  4197601365,
  4277358050,
  3334271071,
  3263032808,
  3476998961,
  3422541446,
  3585640067,
  3514407732,
  3694837229,
  3640369242,
  1762451694,
  1842216281,
  1619975040,
  1682949687,
  2047383090,
  2127137669,
  1938468188,
  2001449195,
  1325665622,
  1271206113,
  1183200824,
  1111960463,
  1543535498,
  1489069629,
  1434599652,
  1363369299,
  622672798,
  568075817,
  748617968,
  677256519,
  907627842,
  853037301,
  1067152940,
  995781531,
  51762726,
  131386257,
  177728840,
  240578815,
  269590778,
  349224269,
  429104020,
  491947555,
  4046411278,
  4126034873,
  4172115296,
  4234965207,
  3794477266,
  3874110821,
  3953728444,
  4016571915,
  3609705398,
  3555108353,
  3735388376,
  3664026991,
  3290680682,
  3236090077,
  3449943556,
  3378572211,
  3174993278,
  3120533705,
  3032266256,
  2961025959,
  2923101090,
  2868635157,
  2813903052,
  2742672763,
  2604032198,
  2683796849,
  2461293480,
  2524268063,
  2284983834,
  2364738477,
  2175806836,
  2238787779,
  1569362073,
  1498123566,
  1409854455,
  1355396672,
  1317987909,
  1246755826,
  1192025387,
  1137557660,
  2072149281,
  2135122070,
  1912620623,
  1992383480,
  1753615357,
  1816598090,
  1627664531,
  1707420964,
  295390185,
  358241886,
  404320391,
  483945776,
  43990325,
  106832002,
  186451547,
  266083308,
  932423249,
  861060070,
  1041341759,
  986742920,
  613929101,
  542559546,
  756411363,
  701822548,
  3316196985,
  3244833742,
  3425377559,
  3370778784,
  3601682597,
  3530312978,
  3744426955,
  3689838204,
  3819031489,
  3881883254,
  3928223919,
  4007849240,
  4037393693,
  4100235434,
  4180117107,
  4259748804,
  2310601993,
  2373574846,
  2151335527,
  2231098320,
  2596047829,
  2659030626,
  2470359227,
  2550115596,
  2947551409,
  2876312838,
  2788305887,
  2733848168,
  3165939309,
  3094707162,
  3040238851,
  2985771188
];
var masks = [
  0,
  1,
  3,
  7,
  15,
  31,
  63,
  127,
  255,
  511,
  1023,
  2047,
  4095,
  8191,
  16383,
  32767,
  65535,
  131071,
  262143,
  524287,
  1048575,
  2097151,
  4194303,
  8388607,
  16777215,
  33554431,
  67108863,
  134217727,
  268435455,
  536870911,
  1073741823,
  -2147483648
];
function createOrderedHuffmanTable(lengths) {
  const z = [];
  for (let i = 0;i < lengths.length; i += 1) {
    z.push([i, lengths[i]]);
  }
  z.push([lengths.length, -1]);
  const table = [];
  let start = z[0][0];
  let bits = z[0][1];
  for (let i = 0;i < z.length; i += 1) {
    const finish = z[i][0];
    const endbits = z[i][1];
    if (bits) {
      for (let code = start;code < finish; code += 1) {
        table.push({ code, bits, symbol: undefined });
      }
    }
    start = finish;
    bits = endbits;
    if (endbits === -1) {
      break;
    }
  }
  table.sort((a, b) => a.bits - b.bits || a.code - b.code);
  let tempBits = 0;
  let symbol = -1;
  const fastAccess = [];
  let current;
  for (let i = 0;i < table.length; i += 1) {
    const t = table[i];
    symbol += 1;
    if (t.bits !== tempBits) {
      symbol <<= t.bits - tempBits;
      tempBits = t.bits;
      current = fastAccess[tempBits] = {};
    }
    t.symbol = symbol;
    current[symbol] = t;
  }
  return {
    table,
    fastAccess
  };
}
function bwtReverse(src, primary) {
  if (primary < 0 || primary >= src.length) {
    throw RangeError("Out of bound");
  }
  const unsorted = src.slice();
  src.sort((a, b) => a - b);
  const start = {};
  for (let i2 = src.length - 1;i2 >= 0; i2 -= 1) {
    start[src[i2]] = i2;
  }
  const links = [];
  for (let i2 = 0;i2 < src.length; i2 += 1) {
    links.push(start[unsorted[i2]]++);
  }
  let i;
  const first = src[i = primary];
  const ret = [];
  for (let j = 1;j < src.length; j += 1) {
    const x = src[i = links[i]];
    if (x === undefined) {
      ret.push(255);
    } else {
      ret.push(x);
    }
  }
  ret.push(first);
  ret.reverse();
  return ret;
}
function bunzip2(bytes, checkMagic = false, checkCRC = false) {
  let index = 0;
  let bitfield = 0;
  let bits = 0;
  const read = (n) => {
    if (n >= 32) {
      const nd = n >> 1;
      return read(nd) * (1 << nd) + read(n - nd);
    }
    while (bits < n) {
      bitfield = (bitfield << 8) + bytes[index];
      index += 1;
      bits += 8;
    }
    const m = masks[n];
    const r = bitfield >> bits - n & m;
    bits -= n;
    bitfield &= ~(m << bits);
    return r;
  };
  let blocksize = 1;
  if (checkMagic) {
    const magic = read(16);
    if (magic !== 16986) {
      throw new Error("Invalid magic");
    }
    const method = read(8);
    if (method !== 104) {
      throw new Error("Invalid method");
    }
    blocksize = read(8);
    if (blocksize >= 49 && blocksize <= 57) {
      blocksize -= 48;
    } else {
      throw new Error("Invalid blocksize");
    }
  }
  let out = new Uint8Array(bytes.length * 1.5);
  let outIndex = 0;
  let newCRC = -1;
  while (true) {
    const blocktype = read(48);
    const crc = read(32) | 0;
    if (blocktype === 54156738319193) {
      if (read(1)) {
        throw new Error("do not support randomised");
      }
      const pointer = read(24);
      const used = [];
      const usedGroups = read(16);
      for (let i2 = 1 << 15;i2 > 0; i2 >>= 1) {
        if (!(usedGroups & i2)) {
          for (let j = 0;j < 16; j += 1) {
            used.push(false);
          }
          continue;
        }
        const usedChars = read(16);
        for (let j = 1 << 15;j > 0; j >>= 1) {
          used.push(!!(usedChars & j));
        }
      }
      const groups = read(3);
      if (groups < 2 || groups > 6) {
        throw new Error("Invalid number of huffman groups");
      }
      const selectorsUsed = read(15);
      const selectors = [];
      const mtf = Array.from({ length: groups }, (_, i2) => i2);
      for (let i2 = 0;i2 < selectorsUsed; i2 += 1) {
        let c = 0;
        while (read(1)) {
          c += 1;
          if (c >= groups) {
            throw new Error("MTF table out of range");
          }
        }
        const v = mtf[c];
        for (let j = c;j > 0; mtf[j] = mtf[--j]) {}
        selectors.push(v);
        mtf[0] = v;
      }
      const symbolsInUse = used.reduce((a, b) => a + b, 0) + 2;
      const tables = [];
      for (let i2 = 0;i2 < groups; i2 += 1) {
        let length = read(5);
        const lengths = [];
        for (let j = 0;j < symbolsInUse; j += 1) {
          if (length < 0 || length > 20) {
            throw new Error("Huffman group length outside range");
          }
          while (read(1)) {
            length -= read(1) * 2 - 1;
          }
          lengths.push(length);
        }
        tables.push(createOrderedHuffmanTable(lengths));
      }
      const favourites = [];
      for (let i2 = 0;i2 < used.length - 1; i2 += 1) {
        if (used[i2]) {
          favourites.push(i2);
        }
      }
      let decoded = 0;
      let selectorPointer = 0;
      let t;
      let r;
      let repeat = 0;
      let repeatPower = 0;
      const buffer = [];
      while (true) {
        decoded -= 1;
        if (decoded <= 0) {
          decoded = 50;
          if (selectorPointer <= selectors.length) {
            t = tables[selectors[selectorPointer]];
            selectorPointer += 1;
          }
        }
        for (const b in t.fastAccess) {
          if (!Object.prototype.hasOwnProperty.call(t.fastAccess, b)) {
            continue;
          }
          if (bits < b) {
            bitfield = (bitfield << 8) + bytes[index];
            index += 1;
            bits += 8;
          }
          r = t.fastAccess[b][bitfield >> bits - b];
          if (r) {
            bitfield &= masks[bits -= b];
            r = r.code;
            break;
          }
        }
        if (r >= 0 && r <= 1) {
          if (repeat === 0) {
            repeatPower = 1;
          }
          repeat += repeatPower << r;
          repeatPower <<= 1;
          continue;
        } else {
          const v = favourites[0];
          for (;repeat > 0; repeat -= 1) {
            buffer.push(v);
          }
        }
        if (r === symbolsInUse - 1) {
          break;
        } else {
          const v = favourites[r - 1];
          for (let j = r - 1;j > 0; favourites[j] = favourites[--j]) {}
          favourites[0] = v;
          buffer.push(v);
        }
      }
      const nt = bwtReverse(buffer, pointer);
      let i = 0;
      while (i < nt.length) {
        const c = nt[i];
        let count = 1;
        if (i < nt.length - 4 && nt[i + 1] === c && nt[i + 2] === c && nt[i + 3] === c) {
          count = nt[i + 4] + 4;
          i += 5;
        } else {
          i += 1;
        }
        if (outIndex + count >= out.length) {
          const old = out;
          out = new Uint8Array(old.length * 2);
          out.set(old);
        }
        for (let j = 0;j < count; j += 1) {
          if (checkCRC) {
            newCRC = newCRC << 8 ^ crc32Table[(newCRC >> 24 ^ c) & 255];
          }
          out[outIndex] = c;
          outIndex += 1;
        }
      }
      if (checkCRC) {
        const calculatedCRC = newCRC ^ -1;
        if (calculatedCRC !== crc) {
          throw new Error(`CRC mismatch: ${calculatedCRC} !== ${crc}`);
        }
        newCRC = -1;
      }
    } else if (blocktype === 25779555029136) {
      read(bits & 7);
      break;
    } else {
      throw new Error("Invalid bz2 blocktype");
    }
  }
  return out.subarray(0, outIndex);
}

// src/io/Jagfile.ts
class Jagfile {
  static genHash(name) {
    let hash = 0;
    name = name.toUpperCase();
    for (let i = 0;i < name.length; i++) {
      hash = hash * 61 + name.charCodeAt(i) - 32 | 0;
    }
    return hash;
  }
  data;
  unpacked;
  fileCount;
  fileHash;
  fileUnpackedSize;
  filePackedSize;
  fileOffset;
  fileUnpacked = [];
  constructor(src) {
    let data = new Packet(new Uint8Array(src));
    const unpackedSize = data.g3();
    const packedSize = data.g3();
    if (unpackedSize === packedSize) {
      this.data = src;
      this.unpacked = false;
    } else {
      this.data = bunzip2(src.subarray(6));
      data = new Packet(new Uint8Array(this.data));
      this.unpacked = true;
    }
    this.fileCount = data.g2();
    this.fileHash = [];
    this.fileUnpackedSize = [];
    this.filePackedSize = [];
    this.fileOffset = [];
    let offset = data.pos + this.fileCount * 10;
    for (let i = 0;i < this.fileCount; i++) {
      this.fileHash.push(data.g4());
      this.fileUnpackedSize.push(data.g3());
      this.filePackedSize.push(data.g3());
      this.fileOffset.push(offset);
      offset += this.filePackedSize[i];
    }
  }
  read(name) {
    const hash = Jagfile.genHash(name);
    const index = this.fileHash.indexOf(hash);
    if (index === -1) {
      return null;
    }
    return this.readIndex(index);
  }
  readIndex(index) {
    if (index < 0 || index >= this.fileCount) {
      return null;
    }
    if (this.fileUnpacked[index]) {
      return this.fileUnpacked[index];
    }
    const offset = this.fileOffset[index];
    const length = this.filePackedSize[index];
    const src = new Uint8Array(this.data.subarray(offset, offset + length));
    if (this.unpacked) {
      this.fileUnpacked[index] = src;
      return src;
    } else {
      const data = bunzip2(src);
      this.fileUnpacked[index] = data;
      return data;
    }
  }
}

// src/mapview/WorldMapFont.ts
class WorldMapFont extends Pix2D {
  static CHARSET = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!"£$%^&*()-_=+[{]};:'@#~,<.>/?\\| `;
  static fontChar = new TypedArray1d(256, 0);
  static fonts = "Arial, Helvetica, sans-serif";
  static {
    for (let i = 0;i < 256; i++) {
      let c = WorldMapFont.CHARSET.indexOf(String.fromCharCode(i));
      if (c === -1) {
        c = 74;
      }
      WorldMapFont.fontChar[i] = c * 9;
    }
  }
  fontCharTrans = false;
  fontCharPos = 0;
  fontCharInfo = new Uint8Array(1e5);
  canvas;
  ctx;
  static load(jag, name) {
    const font = new WorldMapFont;
    const fm = jag.read(`${name}.dat`);
    if (!fm) {
      throw new Error;
    }
    font.fontCharTrans = false;
    font.fontCharInfo = fm;
    font.fontCharPos = fm.length;
    return font;
  }
  static fromSystem(size, bold) {
    const font = new WorldMapFont;
    font.fontCharPos = 855;
    font.fontCharTrans = false;
    font.canvas = document.createElement("canvas");
    font.canvas.width = size + 50;
    font.canvas.height = size + 50;
    font.ctx = font.canvas.getContext("2d", { willReadFrequently: true });
    const style = bold ? "bold" : "";
    font.ctx.font = `${style} ${size}px ${WorldMapFont.fonts}`;
    for (let i = 0;i < 95; i++) {
      font.loadGlyph(WorldMapFont.CHARSET[i], i, false);
    }
    if (bold && font.fontCharTrans) {
      font.ctx.font = `${size}px ${WorldMapFont.fonts}`;
      for (let i = 0;i < 95; i++) {
        font.loadGlyph(WorldMapFont.CHARSET[i], i, false);
      }
      if (!font.fontCharTrans) {
        font.fontCharPos = 855;
        font.fontCharTrans = false;
        for (let i = 0;i < 95; i++) {
          font.loadGlyph(WorldMapFont.CHARSET[i], i, true);
        }
      }
    }
    font.fontCharInfo = font.fontCharInfo.slice(0, font.fontCharPos);
    return font;
  }
  loadGlyph(c, id, offset) {
    const metrics = this.ctx.measureText(c);
    let width = Math.ceil(metrics.width);
    const initialWidth = width;
    if (offset) {
      if (c === "/") {
        offset = false;
      }
      if (c === "f" || c === "t" || c === "w" || c === "v" || c === "k" || c === "x" || c === "y" || c === "A" || c === "V" || c === "W") {
        width++;
      }
    }
    const maxAscent = Math.ceil(metrics.actualBoundingBoxAscent);
    const maxDescent = Math.ceil(metrics.actualBoundingBoxDescent);
    const totalDescent = maxAscent + maxDescent;
    const height = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.fillStyle = "white";
    this.ctx.fillText(c, 0, maxAscent);
    if (offset) {
      this.ctx.fillText(c, 1, maxAscent);
    }
    const imageData = this.ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    let top = totalDescent;
    let left = width;
    let bottom = 0;
    let right = 0;
    for (let y = 0;y < totalDescent; y++) {
      for (let x = 0;x < width; x++) {
        const alpha = pixels[(x + y * width) * 4];
        if (alpha !== 0) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y + 1);
          left = Math.min(left, x);
          right = Math.max(right, x + 1);
        }
      }
    }
    this.fontCharInfo[id * 9 + 0] = this.fontCharPos >> 14;
    this.fontCharInfo[id * 9 + 1] = this.fontCharPos >> 7 & 127;
    this.fontCharInfo[id * 9 + 2] = this.fontCharPos & 127;
    this.fontCharInfo[id * 9 + 3] = right - left;
    this.fontCharInfo[id * 9 + 4] = bottom - top;
    this.fontCharInfo[id * 9 + 5] = left;
    this.fontCharInfo[id * 9 + 6] = maxAscent - top;
    this.fontCharInfo[id * 9 + 7] = initialWidth;
    this.fontCharInfo[id * 9 + 8] = height;
    for (let y = top;y < bottom; y++) {
      for (let x = left;x < right; x++) {
        const alpha = pixels[(x + y * width) * 4] & 255;
        if (alpha > 30 && alpha < 230) {
          this.fontCharTrans = true;
        }
        this.fontCharInfo[this.fontCharPos++] = alpha;
      }
    }
  }
  centreString(str, x, y, rgb, shadowed) {
    this.drawString(str, x - (this.stringWid(str) / 2 | 0), y, rgb, shadowed);
  }
  stringWid(str) {
    const length = str.length;
    let w = 0;
    for (let i = 0;i < length; i++) {
      if (str.charAt(i) === "@" && i + 4 < length && str.charAt(i + 4) === "@") {
        i += 4;
      } else if (str.charAt(i) === "~" && i + 4 < length && str.charAt(i + 4) === "~") {
        i += 4;
      } else {
        const c = WorldMapFont.fontChar[str.charCodeAt(i)];
        w += this.fontCharInfo[c + 7];
      }
    }
    return w;
  }
  drawString(str, x, y, rgb, shadowed) {
    if (this.fontCharTrans || rgb === 0) {
      shadowed = false;
    }
    for (let i = 0;i < str.length; i++) {
      const c = WorldMapFont.fontChar[str.charCodeAt(i)];
      if (shadowed) {
        this.drawChar(c, x + 1, y, 0);
        this.drawChar(c, x, y + 1, 0);
      }
      this.drawChar(c, x, y, rgb);
      x += this.fontCharInfo[c + 7];
    }
  }
  drawChar(c, x, y, rgb) {
    const info = this.fontCharInfo;
    let dx = x + info[c + 5];
    let dy = y - info[c + 6];
    let w = info[c + 3];
    let h = info[c + 4];
    let srcOff = info[c] << 14 | info[c + 1] << 7 | info[c + 2];
    let srcStep = 0;
    let dstOff = dx + dy * Pix2D.width;
    let dstStep = Pix2D.width - w;
    if (y < Pix2D.clipMinY) {
      const cutoff = Pix2D.clipMinY - y;
      h -= cutoff;
      y = Pix2D.clipMinY;
      srcOff += cutoff * w;
      dstOff += cutoff * Pix2D.width;
    }
    if (y + h > Pix2D.clipMaxY) {
      h -= y + h - Pix2D.clipMaxY;
    }
    if (x < Pix2D.clipMinX) {
      const cutoff = Pix2D.clipMinX - x;
      w -= cutoff;
      x = Pix2D.clipMinX;
      srcOff += cutoff;
      dstOff += cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (x + w > Pix2D.clipMaxX) {
      const cutoff = x + w - Pix2D.clipMaxX;
      w -= cutoff;
      srcStep += cutoff;
      dstStep += cutoff;
    }
    if (w > 0 && h > 0) {
      if (this.fontCharTrans) {
        this.plotLetterTrans(w, h, info, rgb, srcOff, srcStep, Pix2D.pixels, dstOff, dstStep);
      } else {
        this.plotLetter(w, h, info, rgb, srcOff, srcStep, Pix2D.pixels, dstOff, dstStep);
      }
    }
  }
  plotLetter(w, h, mask, rgb, srcOff, srcStep, dst, dstOff, dstStep) {
    const qw = -(w >> 2);
    w = -(w & 3);
    for (let y = -h;y < 0; y++) {
      for (let x = qw;x < 0; x++) {
        if (mask[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
        if (mask[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
        if (mask[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
        if (mask[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
      }
      for (let x = w;x < 0; x++) {
        if (mask[srcOff++] === 0) {
          dstOff++;
        } else {
          dst[dstOff++] = rgb;
        }
      }
      dstOff += dstStep;
      srcOff += srcStep;
    }
  }
  plotLetterTrans(w, h, mask, rgb, srcOff, srcStep, dst, dstOff, dstStep) {
    for (let y = -h;y < 0; y++) {
      for (let x = -w;x < 0; x++) {
        const trans = mask[srcOff++] & 255;
        if (trans === 0) {
          dstOff++;
        } else if (trans >= 230) {
          dst[dstOff++] = rgb;
        } else {
          const dstRgb = dst[dstOff];
          dst[dstOff++] = ((rgb & 16711935) * trans + (dstRgb & 16711935) * (256 - trans) & 4278255360) + ((rgb & 65280) * trans + (dstRgb & 65280) * (256 - trans) & 16711680) >> 8;
        }
      }
      dstOff += dstStep;
      srcOff += srcStep;
    }
  }
  getHeight() {
    return this.fontCharInfo[8] - 1;
  }
  getYOffset() {
    return this.fontCharInfo[6];
  }
}

// src/mapview/MapView.ts
class MapView extends GameShell {
  static shouldDrawBorders = false;
  static shouldDrawLabels = true;
  static shouldDrawNpcs = false;
  static shouldDrawItems = false;
  static shouldDrawMultimap = false;
  static shouldDrawFreemap = false;
  mapStartX = 50 << 6;
  mapStartZ = 50 << 6;
  mapWidth = 20 << 6;
  mapHeight = 19 << 6;
  mapOriginX = 36 << 6;
  mapOriginZ = 44 << 6;
  focusX = this.mapStartX - this.mapOriginX;
  focusZ = this.mapOriginZ + this.mapHeight - this.mapStartZ;
  mapArea = 0;
  hasPlayerPos = false;
  maxLabelCount = 1000;
  mapLabelCount = 0;
  mapLabel = [];
  mapLabelX = [];
  mapLabelY = [];
  mapLabelSize = [];
  floorcol1 = [0];
  floorcol2 = [0];
  floort1 = [];
  floort2 = [];
  floorsr = [];
  locWall = [];
  locMapscene = [];
  locMapfunction = [];
  objPos = [];
  npcPos = [];
  multiPos = [];
  freePos = [];
  mapscene = [];
  mapfunction = [];
  mapdot0 = null;
  mapdot1 = null;
  b12 = null;
  f11 = null;
  f12 = null;
  f14 = null;
  f17 = null;
  f19 = null;
  f22 = null;
  f26 = null;
  f30 = null;
  blendedGroundColour = [];
  redraw = true;
  redrawTimer = 0;
  dragFocusX = -1;
  dragFocusZ = -1;
  keyX = 5;
  keyY = 13;
  keyWidth = 140;
  keyHeight = 470;
  showKey = false;
  keyPage = 0;
  lastKeyPage = 0;
  currentKeyHover = -1;
  lastKeyHover = 0;
  currentKey = 0;
  flashTimer = 0;
  visibleMapFunctionsX = new Int32Array(2000);
  visibleMapFunctionsY = new Int32Array(2000);
  visibleMapFunctions = new Int32Array(2000);
  activeMapFunctionX = new Int32Array(2000);
  activeMapFunctionZ = new Int32Array(2000);
  activeMapFunctions = new Int32Array(2000);
  activeMapFunctionCount = 0;
  overview = null;
  overviewHeight = 200;
  overviewWidth = this.overviewHeight * this.mapWidth / this.mapHeight | 0;
  overviewX = 635 - this.overviewWidth - 5;
  overviewY = 503 - this.overviewHeight - 20;
  showOverview = false;
  INACTIVE_BORDER_TL = 8943445;
  INACTIVE = 7824964;
  INACTIVE_BORDER_BR = 6706483;
  ACTIVE_BORDER_TL = 11141120;
  ACTIVE = 10027008;
  ACTIVE_BORDER_BR = 8912896;
  zoom = 4;
  targetZoom = 4;
  keyNames = [
    "General Store",
    "Sword Shop",
    "Magic Shop",
    "Axe Shop",
    "Helmet Shop",
    "Bank",
    "Quest Start",
    "Amulet Shop",
    "Mining Site",
    "Furnace",
    "Anvil",
    "Combat Training",
    "Dungeon",
    "Staff Shop",
    "Platebody Shop",
    "Platelegs Shop",
    "Scimitar Shop",
    "Archery Shop",
    "Shield Shop",
    "Altar",
    "Herbalist",
    "Jewelery",
    "Gem Shop",
    "Crafting Shop",
    "Candle Shop",
    "Fishing Shop",
    "Fishing Spot",
    "Clothes Shop",
    "Apothecary",
    "Silk Trader",
    "Kebab Seller",
    "Pub/Bar",
    "Mace Shop",
    "Tannery",
    "Rare Trees",
    "Spinning Wheel",
    "Food Shop",
    "Cookery Shop",
    "???",
    "Water Source",
    "Cooking Range",
    "Skirt Shop",
    "Potters Wheel",
    "Windmill",
    "Mining Shop",
    "Chainmail Shop",
    "Silver Shop",
    "Fur Trader",
    "Spice Shop"
  ];
  constructor() {
    super(true);
    this.run();
  }
  async maininit() {
    this.keyHeight = this.sHei - this.keyY - 20;
    this.overviewX = this.sWid - this.overviewWidth - 5;
    this.overviewY = this.sHei - this.overviewHeight - 20;
    this.redrawScreen = true;
    canvas.style.cursor = "grab";
    const worldmap = await this.loadWorldmap();
    await this.messageBox("Please wait... Rendering Map", 100);
    const labels = new Packet(worldmap.read("labels.dat"));
    this.mapLabelCount = labels.g2();
    for (let i = 0;i < this.mapLabelCount; i++) {
      this.mapLabel[i] = labels.gjstr();
      this.mapLabelX[i] = labels.g2();
      this.mapLabelY[i] = labels.g2();
      this.mapLabelSize[i] = labels.g1();
    }
    const floorcol = new Packet(worldmap.read("floorcol.dat"));
    const floorcolCount = floorcol.g2();
    for (let i = 0;i < floorcolCount; i++) {
      this.floorcol1[i + 1] = floorcol.g4();
      this.floorcol2[i + 1] = floorcol.g4();
    }
    const underlay = new Packet(worldmap.read("underlay.dat"));
    this.floort1 = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
    this.loadUnderlay(underlay);
    const overlay = new Packet(worldmap.read("overlay.dat"));
    this.floort2 = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
    this.floorsr = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
    this.loadOverlay(overlay);
    const loc = new Packet(worldmap.read("loc.dat"));
    this.locWall = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
    this.locMapscene = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
    this.locMapfunction = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
    this.loadLoc(loc);
    try {
      const obj = new Packet(worldmap.read("obj.dat"));
      this.objPos = new TypedArray2d(this.mapWidth, this.mapHeight, false);
      this.loadObj(obj);
      const npc = new Packet(worldmap.read("npc.dat"));
      this.npcPos = new TypedArray2d(this.mapWidth, this.mapHeight, false);
      this.loadNpc(npc);
      const multi = new Packet(worldmap.read("multi.dat"));
      this.multiPos = new TypedArray2d(this.mapWidth, this.mapHeight, false);
      this.loadMulti(multi);
      const free = new Packet(worldmap.read("free.dat"));
      this.freePos = new TypedArray2d(this.mapWidth, this.mapHeight, false);
      this.loadFree(free);
    } catch (_e) {}
    try {
      for (let i = 0;i < 100; i++) {
        this.mapscene[i] = Pix8.depack(worldmap, "mapscene", i);
      }
    } catch (_e) {}
    try {
      for (let i = 0;i < 100; i++) {
        this.mapfunction[i] = Pix32.depack(worldmap, "mapfunction", i);
      }
    } catch (_e) {}
    try {
      this.mapdot0 = Pix32.depack(worldmap, "mapdots", 0);
      this.mapdot1 = Pix32.depack(worldmap, "mapdots", 1);
    } catch (_e) {}
    this.b12 = PixFont.depack(worldmap, "b12");
    try {
      this.f11 = WorldMapFont.load(worldmap, "f11");
      this.f12 = WorldMapFont.load(worldmap, "f12");
      this.f14 = WorldMapFont.load(worldmap, "f14");
      this.f17 = WorldMapFont.load(worldmap, "f17");
      this.f19 = WorldMapFont.load(worldmap, "f19");
      this.f22 = WorldMapFont.load(worldmap, "f22");
      this.f26 = WorldMapFont.load(worldmap, "f26");
      this.f30 = WorldMapFont.load(worldmap, "f30");
    } catch (err) {
      console.error(err);
      this.f11 = WorldMapFont.fromSystem(11, true);
      this.f12 = WorldMapFont.fromSystem(12, true);
      this.f14 = WorldMapFont.fromSystem(14, true);
      this.f17 = WorldMapFont.fromSystem(17, true);
      this.f19 = WorldMapFont.fromSystem(19, true);
      this.f22 = WorldMapFont.fromSystem(22, true);
      this.f26 = WorldMapFont.fromSystem(26, true);
      this.f30 = WorldMapFont.fromSystem(30, true);
    }
    this.blendedGroundColour = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
    this.getBlendedGroundColour();
    this.overview = new Pix32(this.overviewWidth, this.overviewHeight);
    this.overview.setPixels();
    this.renderWorldMap(0, 0, this.mapWidth, this.mapHeight, 0, 0, this.overviewWidth, this.overviewHeight);
    Pix2D.drawRect(0, 0, this.overviewWidth, this.overviewHeight, 0);
    Pix2D.drawRect(1, 1, this.overviewWidth - 2, this.overviewHeight - 2, this.INACTIVE_BORDER_TL);
    this.drawArea?.setPixels();
    const _params = new URLSearchParams(window.location.search);
    if (_params.has("nolabels"))
      MapView.shouldDrawLabels = false;
    if (_params.has("noborders"))
      MapView.shouldDrawBorders = false;
    if (_params.has("autoexport")) {
      const _w = this.mapWidth * 2;
      const _h = this.mapHeight * 2;
      const _buf = new Pix32(_w, _h);
      _buf.setPixels();
      this.renderWorldMap(0, 0, this.mapWidth, this.mapHeight, 0, 0, _w, _h);
      const _c = document.createElement("canvas");
      _c.width = _w;
      _c.height = _h;
      const _ctx = _c.getContext("2d");
      const _pm = new PixMap(_w, _h, _ctx);
      _pm.setPixels();
      _buf.quickPlotSprite(0, 0);
      _pm.draw(0, 0);
      this.drawArea?.setPixels();
      const _url = _c.toDataURL("image/png").replace(/^data:image\/[^;]/, "data:application/octet-stream");
      saveDataURL(_url, "map-254-clean.png");
    }
    window.addEventListener("resize", () => {
      this.resize(window.innerWidth, window.innerHeight);
      this.redraw = true;
    });
    window.addEventListener("message", (e) => {
      if (!e.data || e.data.type !== "playerPos")
        return;
      this.focusX = (e.data.tileX | 0) - this.mapOriginX;
      this.focusZ = this.mapOriginZ + this.mapHeight - (e.data.tileZ | 0);
      this.hasPlayerPos = true;
      this.redraw = true;
    });
    window.parent.postMessage({ type: "mapviewReady" }, "*");
  }
  async maindraw() {
    if (this.redraw) {
      this.redraw = false;
      this.redrawTimer = 0;
      Pix2D.cls();
      const left = this.focusX - (this.sWid / this.zoom | 0);
      const top = this.focusZ - (this.sHei / this.zoom | 0);
      const right = this.focusX + (this.sWid / this.zoom | 0);
      const bottom = this.focusZ + (this.sHei / this.zoom | 0);
      this.renderWorldMap(left, top, right, bottom, 0, 0, this.sWid, this.sHei);
      if (this.showOverview) {
        this.overview?.quickPlotSprite(this.overviewX, this.overviewY);
        Pix2D.fillRectTrans(this.overviewX + this.overviewWidth * left / this.mapWidth | 0, this.overviewY + this.overviewHeight * top / this.mapHeight | 0, (right - left) * this.overviewWidth / this.mapWidth | 0, (bottom - top) * this.overviewHeight / this.mapHeight | 0, 16711680, 128);
        Pix2D.drawRect(this.overviewX + this.overviewWidth * left / this.mapWidth | 0, this.overviewY + this.overviewHeight * top / this.mapHeight | 0, (right - left) * this.overviewWidth / this.mapWidth | 0, (bottom - top) * this.overviewHeight / this.mapHeight | 0, 16711680);
        if (this.flashTimer > 0 && this.flashTimer % 10 < 5) {
          for (let i = 0;i < this.activeMapFunctionCount; i++) {
            if (this.activeMapFunctions[i] == this.currentKey) {
              const x = this.overviewX + this.overviewWidth * this.activeMapFunctionX[i] / this.mapWidth | 0;
              const y2 = this.overviewY + this.overviewHeight * this.activeMapFunctionZ[i] / this.mapHeight | 0;
              Pix2D.fillCircle(x, y2, 2, 16776960, 256);
            }
          }
        }
      }
      if (this.showKey) {
        this.drawStringBox(this.keyX, this.keyY, this.keyWidth, 18, 10066329, 7829367, 5592405, "Prev page");
        this.drawStringBox(this.keyX, this.keyY + 18, this.keyWidth, this.keyHeight - 36, 10066329, 7829367, 5592405, "");
        this.drawStringBox(this.keyX, this.keyY + this.keyHeight - 18, this.keyWidth, 18, 10066329, 7829367, 5592405, "Next page");
        const maxKeys = (this.keyHeight - 20) / 18;
        let y2 = this.keyY + 18 + 3;
        for (let row = 0;row < maxKeys; row++) {
          if (row + this.lastKeyPage < this.mapfunction.length && row + this.lastKeyPage < this.keyNames.length) {
            if (this.keyNames[row + this.lastKeyPage] === "???") {
              continue;
            }
            this.mapfunction[row + this.lastKeyPage].plotSprite(this.keyX + 3, y2);
            this.b12?.drawString(this.keyNames[row + this.lastKeyPage], this.keyX + 21, y2 + 14, 0);
            let rgb = 16777215;
            if (this.currentKeyHover == row + this.lastKeyPage) {
              rgb = 12298922;
            }
            if (this.flashTimer > 0 && this.flashTimer % 10 < 5 && this.currentKey == row + this.lastKeyPage) {
              rgb = 16776960;
            }
            this.b12?.drawString(this.keyNames[row + this.lastKeyPage], this.keyX + 20, y2 + 13, rgb);
          }
          y2 += 17;
        }
      }
      this.drawStringBox(this.overviewX, this.overviewY + this.overviewHeight, this.overviewWidth, 18, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, "Overview");
      this.drawStringBox(this.keyX, this.keyY + this.keyHeight, this.keyWidth, 18, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, "Key");
      const y = this.sHei - this.keyY - 20 + 1;
      if (this.targetZoom == 3) {
        this.drawStringBox(170, y, 50, 30, this.ACTIVE_BORDER_TL, this.ACTIVE, this.ACTIVE_BORDER_BR, "37%");
      } else {
        this.drawStringBox(170, y, 50, 30, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, "37%");
      }
      if (this.targetZoom == 4) {
        this.drawStringBox(230, y, 50, 30, this.ACTIVE_BORDER_TL, this.ACTIVE, this.ACTIVE_BORDER_BR, "50%");
      } else {
        this.drawStringBox(230, y, 50, 30, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, "50%");
      }
      if (this.targetZoom == 6) {
        this.drawStringBox(290, y, 50, 30, this.ACTIVE_BORDER_TL, this.ACTIVE, this.ACTIVE_BORDER_BR, "75%");
      } else {
        this.drawStringBox(290, y, 50, 30, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, "75%");
      }
      if (this.targetZoom == 8) {
        this.drawStringBox(350, y, 50, 30, this.ACTIVE_BORDER_TL, this.ACTIVE, this.ACTIVE_BORDER_BR, "100%");
      } else {
        this.drawStringBox(350, y, 50, 30, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, "100%");
      }
    }
    this.redrawTimer--;
    if (this.redrawTimer <= 0) {
      this.drawArea?.draw(0, 0);
      this.redrawTimer = 50;
      if (this.hasPlayerPos) {
        const ctx2d = canvas.getContext("2d");
        const cx = this.sWid / 2 | 0;
        const cy = this.sHei / 2 | 0;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx2d.fillStyle = "#0055ff";
        ctx2d.fill();
        ctx2d.lineWidth = 2;
        ctx2d.strokeStyle = "#ffffff";
        ctx2d.stroke();
      }
    }
  }
  refresh() {
    this.redrawTimer = 0;
  }
  async mainloop() {
    if (this.keyHeld[1] == 1) {
      this.focusX = this.focusX - 16 / this.zoom | 0;
      this.redraw = true;
    }
    if (this.keyHeld[2] == 1) {
      this.focusX = this.focusX + 16 / this.zoom | 0;
      this.redraw = true;
    }
    if (this.keyHeld[3] == 1) {
      this.focusZ = this.focusZ - 16 / this.zoom | 0;
      this.redraw = true;
    }
    if (this.keyHeld[4] == 1) {
      this.focusZ = this.focusZ + 16 / this.zoom | 0;
      this.redraw = true;
    }
    let key = 1;
    do {
      key = this.pollKey();
      if (key === -1) {
        break;
      }
      if (key == 49) {
        this.targetZoom = 3;
        this.redraw = true;
      } else if (key == 50) {
        this.targetZoom = 4;
        this.redraw = true;
      } else if (key == 51) {
        this.targetZoom = 6;
        this.redraw = true;
      } else if (key == 52) {
        this.targetZoom = 8;
        this.redraw = true;
      } else if (key == 107 || key == 75) {
        this.showKey = !this.showKey;
        this.redraw = true;
      } else if (key == 111 || key == 79) {
        this.showOverview = !this.showOverview;
        this.redraw = true;
      } else if (key == 101 || key == 69) {
        const width = this.mapWidth * 2;
        const height = this.mapHeight * 2;
        const fullRender = new Pix32(width, height);
        fullRender.setPixels();
        this.renderWorldMap(0, 0, this.mapWidth, this.mapHeight, 0, 0, width, height);
        const canvas2 = document.createElement("canvas");
        canvas2.width = width;
        canvas2.height = height;
        const ctx = canvas2.getContext("2d");
        const out = new PixMap(width, height, ctx);
        out.setPixels();
        fullRender.quickPlotSprite(0, 0);
        out.draw(0, 0);
        this.drawArea?.setPixels();
        const map = canvas2.toDataURL("image/png").replace(/^data:image\/[^;]/, "data:application/octet-stream");
        saveDataURL(map, "worldmap.png");
      } else if (key == 110 || key == 78) {
        MapView.shouldDrawNpcs = !MapView.shouldDrawNpcs;
        this.redraw = true;
      } else if (key == 105 || key == 73) {
        MapView.shouldDrawItems = !MapView.shouldDrawItems;
        this.redraw = true;
      } else if (key == 108 || key == 76) {
        MapView.shouldDrawLabels = !MapView.shouldDrawLabels;
        this.redraw = true;
      } else if (key == 98 || key == 66) {
        MapView.shouldDrawBorders = !MapView.shouldDrawBorders;
        this.redraw = true;
      } else if (key == 109 || key == 77) {
        MapView.shouldDrawMultimap = !MapView.shouldDrawMultimap;
        this.redraw = true;
      } else if (key == 102 || key == 70) {
        MapView.shouldDrawFreemap = !MapView.shouldDrawFreemap;
        this.redraw = true;
      } else if (key === 91) {
        await this.reloadMain();
      } else if (key === 93) {
        await this.reloadDungeon();
      } else if (key === 92) {
        await this.reloadExtra();
      }
    } while (key > 0);
    if (this.mouseClickButton == 1) {
      this.nextMouseClickX = this.mouseClickX;
      this.nextMouseClickY = this.mouseClickY;
      this.dragFocusX = this.focusX;
      this.dragFocusZ = this.focusZ;
      const zoomY = this.sHei - this.keyY - 20 + 1;
      if (this.mouseClickX > 170 && this.mouseClickX < 220 && this.mouseClickY > zoomY) {
        this.targetZoom = 3;
        this.nextMouseClickX = -1;
      } else if (this.mouseClickX > 230 && this.mouseClickX < 280 && this.mouseClickY > zoomY) {
        this.targetZoom = 4;
        this.nextMouseClickX = -1;
      } else if (this.mouseClickX > 290 && this.mouseClickX < 340 && this.mouseClickY > zoomY) {
        this.targetZoom = 6;
        this.nextMouseClickX = -1;
      } else if (this.mouseClickX > 350 && this.mouseClickX < 400 && this.mouseClickY > zoomY) {
        this.targetZoom = 8;
        this.nextMouseClickX = -1;
      } else if (this.mouseClickX > this.keyX && this.mouseClickY > this.keyY + this.keyHeight && this.mouseClickX < this.keyX + this.keyWidth) {
        this.showKey = !this.showKey;
        this.nextMouseClickX = -1;
      } else if (this.mouseClickX > this.overviewX && this.mouseClickY > this.overviewY + this.overviewHeight && this.mouseClickX < this.overviewX + this.overviewWidth) {
        this.showOverview = !this.showOverview;
        this.nextMouseClickX = -1;
      }
      if (this.showKey) {
        if (this.mouseClickX > this.keyX && this.mouseClickY > this.keyY && this.mouseClickX < this.keyX + this.keyWidth && this.mouseClickY < this.keyY + this.keyHeight) {
          this.nextMouseClickX = -1;
        }
        if (this.mouseClickX > this.keyX && this.mouseClickY > this.keyY && this.mouseClickX < this.keyX + this.keyWidth && this.mouseClickY < this.keyY + 18) {
          this.keyPage = 0;
        } else if (this.mouseClickX > this.keyX && this.mouseClickY > this.keyY + this.keyHeight - 18 && this.mouseClickX < this.keyX + this.keyWidth && this.mouseClickY < this.keyY + this.keyHeight) {
          this.keyPage = 25;
        }
      }
      this.redraw = true;
    }
    if (this.showKey) {
      this.currentKeyHover = -1;
      if (this.mouseX > this.keyX && this.mouseX < this.keyX + this.keyWidth) {
        const maxKeys = (this.keyHeight - 20) / 18;
        let y = this.keyY + 21 + 5;
        for (let row = 0;row < maxKeys; row++) {
          if (row + this.lastKeyPage < this.keyNames.length && this.keyNames[row + this.lastKeyPage] !== "???") {
            if (this.mouseY >= y && this.mouseY < y + 17) {
              this.currentKeyHover = row + this.lastKeyPage;
              if (this.mouseClickButton == 1) {
                this.currentKey = row + this.lastKeyPage;
                this.flashTimer = 50;
              }
            }
            y += 17;
          }
        }
      }
      if (this.currentKeyHover != this.lastKeyHover) {
        this.lastKeyHover = this.currentKeyHover;
        this.redraw = true;
      }
    }
    if ((this.mouseButton == 1 || this.mouseClickButton == 1) && this.showOverview) {
      let mouseClickX = this.mouseClickX;
      let mouseClickY = this.mouseClickY;
      if (this.mouseButton == 1) {
        mouseClickX = this.mouseX;
        mouseClickY = this.mouseY;
      }
      if (mouseClickX > this.overviewX && mouseClickY > this.overviewY && mouseClickX < this.overviewX + this.overviewWidth && mouseClickY < this.overviewY + this.overviewHeight) {
        this.focusX = (mouseClickX - this.overviewX) * this.mapWidth / this.overviewWidth | 0;
        this.focusZ = (mouseClickY - this.overviewY) * this.mapHeight / this.overviewHeight | 0;
        this.nextMouseClickX = -1;
        this.redraw = true;
      }
    }
    if (this.mouseButton == 1 && this.nextMouseClickX != -1) {
      this.focusX = this.dragFocusX + ((this.nextMouseClickX - this.mouseX) * 2 / this.targetZoom | 0);
      this.focusZ = this.dragFocusZ + ((this.nextMouseClickY - this.mouseY) * 2 / this.targetZoom | 0);
      this.redraw = true;
    }
    if (this.zoom < this.targetZoom) {
      this.redraw = true;
      this.zoom += this.zoom / 30;
      if (this.zoom > this.targetZoom) {
        this.zoom = this.targetZoom;
      }
    }
    if (this.zoom > this.targetZoom) {
      this.redraw = true;
      this.zoom -= this.zoom / 30;
      if (this.zoom < this.targetZoom) {
        this.zoom = this.targetZoom;
      }
    }
    if (this.lastKeyPage < this.keyPage) {
      this.redraw = true;
      this.lastKeyPage++;
    }
    if (this.lastKeyPage > this.keyPage) {
      this.redraw = true;
      this.lastKeyPage--;
    }
    if (this.flashTimer > 0) {
      this.redraw = true;
      this.flashTimer--;
    }
    const left = this.focusX - (this.sWid / this.zoom | 0);
    const top = this.focusZ - (this.sHei / this.zoom | 0);
    const right = this.focusX + (this.sWid / this.zoom | 0);
    const bottom = this.focusZ + (this.sHei / this.zoom | 0);
    if (left < 48) {
      this.focusX = (this.sWid / this.zoom | 0) + 48;
    }
    if (top < 48) {
      this.focusZ = (this.sHei / this.zoom | 0) + 48;
    }
    if (right > this.mapWidth - 48) {
      this.focusX = this.mapWidth - 48 - (this.sWid / this.zoom | 0);
    }
    if (bottom > this.mapHeight - 48) {
      this.focusZ = this.mapHeight - 48 - (this.sHei / this.zoom | 0);
    }
  }
  worldmap = null;
  async loadWorldmap() {
    if (this.worldmap) {
      return this.worldmap;
    }
    let data = undefined;
    let retry = 5;
    while (!data) {
      await this.messageBox("Requesting map", 0);
      try {
        data = await downloadUrl("/worldmap.jag");
      } catch (_e) {
        data = undefined;
        for (let i = retry;i > 0; i--) {
          await this.messageBox(`Error loading - Will retry in ${i} secs.`, 0);
          await sleep(1000);
        }
        retry *= 2;
        if (retry > 60) {
          retry = 60;
        }
      }
    }
    this.worldmap = new Jagfile(data);
    return this.worldmap;
  }
  drawStringBox(x, y, width, height, borderTL, fill, borderBR, str) {
    x = Math.trunc(x);
    y = Math.trunc(y);
    width = Math.trunc(width);
    height = Math.trunc(height);
    Pix2D.drawRect(x, y, width, height, 0);
    const xPad = x + 1;
    const yPad = y + 1;
    const widthPad = width - 2;
    const heightPad = height - 2;
    Pix2D.fillRect(xPad, yPad, widthPad, heightPad, fill);
    Pix2D.hline(xPad, yPad, widthPad, borderTL);
    Pix2D.vline(xPad, yPad, heightPad, borderTL);
    Pix2D.hline(xPad, yPad + heightPad - 1, widthPad, borderBR);
    Pix2D.vline(xPad + widthPad - 1, yPad, heightPad, borderBR);
    this.b12?.centreString(str, xPad + (widthPad / 2 | 0) + 1, yPad + (heightPad / 2 | 0) + 1 + 4, 0);
    this.b12?.centreString(str, xPad + (widthPad / 2 | 0), yPad + (heightPad / 2 | 0) + 4, 16777215);
  }
  getBlendedGroundColour() {
    const maxX = this.mapWidth;
    const maxZ = this.mapHeight;
    const average = new TypedArray1d(maxZ, 0);
    for (let x = 5;x < maxX - 5; x++) {
      const east = this.floort1[x + 5];
      const west = this.floort1[x - 5];
      for (let z = 0;z < maxZ; z++) {
        average[z] += this.floorcol1[east[z]] - this.floorcol1[west[z]];
      }
      if (x > 10 && x < maxX - 10) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let z = 5;z < maxZ - 5; z++) {
          const north = average[z + 5];
          const south = average[z - 5];
          r += (north >> 20) - (south >> 20);
          g += (north >> 10 & 1023) - (south >> 10 & 1023);
          b += (north & 1023) - (south & 1023);
          if (b > 0) {
            this.blendedGroundColour[x][z] = this.getRgb(r / 8533, g / 8533, b / 8533);
          }
        }
      }
    }
  }
  loadUnderlay(data) {
    while (data.available > 0) {
      const mx = data.g1() * 64 - this.mapOriginX;
      const mz = data.g1() * 64 - this.mapOriginZ;
      if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
        for (let x = 0;x < 64; x++) {
          let zIndex = this.mapHeight - mz - 1;
          for (let z = -64;z < 0; z++) {
            this.floort1[mx + x][zIndex--] = data.g1();
          }
        }
      } else {
        data.pos += 4096;
      }
    }
  }
  loadOverlay(data) {
    while (data.available > 0) {
      const mx = data.g1() * 64 - this.mapOriginX;
      const mz = data.g1() * 64 - this.mapOriginZ;
      if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
        for (let x = 0;x < 64; x++) {
          let zIndex = this.mapHeight - mz - 1;
          for (let z = -64;z < 0; z++) {
            const opcode = data.g1();
            if (opcode === 0) {
              this.floort2[x + mx][zIndex--] = 0;
            } else {
              this.floorsr[x + mx][zIndex] = data.g1();
              this.floort2[x + mx][zIndex--] = this.floorcol2[opcode];
            }
          }
        }
      } else {
        for (let i = -4096;i < 0; i++) {
          const opcode = data.g1();
          if (opcode != 0) {
            data.g1();
          }
        }
      }
    }
  }
  loadLoc(data) {
    while (data.available > 0) {
      const mx = data.g1() * 64 - this.mapOriginX;
      const mz = data.g1() * 64 - this.mapOriginZ;
      if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
        for (let x = 0;x < 64; x++) {
          let zIndex = this.mapHeight - mz - 1;
          for (let z = -64;z < 0; z++) {
            while (true) {
              const opcode = data.g1();
              if (opcode === 0) {
                zIndex--;
                break;
              }
              if (opcode < 29) {
                this.locWall[x + mx][zIndex] = opcode;
              } else if (opcode < 160) {
                this.locMapscene[x + mx][zIndex] = opcode - 28;
              } else {
                this.locMapfunction[x + mx][zIndex] = opcode - 159;
                this.activeMapFunctions[this.activeMapFunctionCount] = opcode - 160;
                this.activeMapFunctionX[this.activeMapFunctionCount] = x + mx;
                this.activeMapFunctionZ[this.activeMapFunctionCount] = zIndex;
                this.activeMapFunctionCount++;
              }
            }
          }
        }
      } else {
        for (let x = 0;x < 64; x++) {
          let opcode = 0;
          for (let z = -64;z < 0; z++) {
            do {
              opcode = data.g1();
            } while (opcode != 0);
          }
        }
      }
    }
  }
  loadObj(data) {
    while (data.available > 0) {
      const mx = data.g1() * 64 - this.mapOriginX;
      const mz = data.g1() * 64 - this.mapOriginZ;
      if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
        for (let x = 0;x < 64; x++) {
          let zIndex = this.mapHeight - mz - 1;
          for (let z = -64;z < 0; z++) {
            this.objPos[x + mx][zIndex--] = data.g1() == 1;
          }
        }
      } else {
        data.pos += 4096;
      }
    }
  }
  loadNpc(data) {
    while (data.available > 0) {
      const mx = data.g1() * 64 - this.mapOriginX;
      const mz = data.g1() * 64 - this.mapOriginZ;
      if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
        for (let x = 0;x < 64; x++) {
          let zIndex = this.mapHeight - mz - 1;
          for (let z = -64;z < 0; z++) {
            this.npcPos[x + mx][zIndex--] = data.g1() == 1;
          }
        }
      } else {
        data.pos += 4096;
      }
    }
  }
  loadMulti(data) {
    while (data.available > 0) {
      const mx = data.g1() * 64 - this.mapOriginX;
      const mz = data.g1() * 64 - this.mapOriginZ;
      if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
        for (let x = 0;x < 64; x++) {
          let zIndex = this.mapHeight - mz - 1;
          for (let z = -64;z < 0; z++) {
            this.multiPos[x + mx][zIndex--] = data.g1() == 1;
          }
        }
      } else {
        data.pos += 4096;
      }
    }
  }
  loadFree(data) {
    while (data.available > 0) {
      const mx = data.g1() * 64 - this.mapOriginX;
      const mz = data.g1() * 64 - this.mapOriginZ;
      if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
        for (let x = 0;x < 64; x++) {
          let zIndex = this.mapHeight - mz - 1;
          for (let z = -64;z < 0; z++) {
            this.freePos[x + mx][zIndex--] = data.g1() == 1;
          }
        }
      } else {
        data.pos += 4096;
      }
    }
  }
  getRgb(hue, saturation, lightness) {
    let r = lightness;
    let g = lightness;
    let b = lightness;
    if (saturation !== 0) {
      let q;
      if (lightness < 0.5) {
        q = lightness * (saturation + 1);
      } else {
        q = lightness + saturation - lightness * saturation;
      }
      const p = lightness * 2 - q;
      let t = hue + 0.3333333333333333;
      if (t > 1) {
        t--;
      }
      let d11 = hue - 0.3333333333333333;
      if (d11 < 0) {
        d11++;
      }
      if (t * 6 < 1) {
        r = p + (q - p) * 6 * t;
      } else if (t * 2 < 1) {
        r = q;
      } else if (t * 3 < 2) {
        r = p + (q - p) * (0.6666666666666666 - t) * 6;
      } else {
        r = p;
      }
      if (hue * 6 < 1) {
        g = p + (q - p) * 6 * hue;
      } else if (hue * 2 < 1) {
        g = q;
      } else if (hue * 3 < 2) {
        g = p + (q - p) * (0.6666666666666666 - hue) * 6;
      } else {
        g = p;
      }
      if (d11 * 6 < 1) {
        b = p + (q - p) * 6 * d11;
      } else if (d11 * 2 < 1) {
        b = q;
      } else if (d11 * 3 < 2) {
        b = p + (q - p) * (0.6666666666666666 - d11) * 6;
      } else {
        b = p;
      }
    }
    const intR = r * 256 | 0;
    const intG = g * 256 | 0;
    const intB = b * 256 | 0;
    return (intR << 16) + (intG << 8) + intB;
  }
  renderWorldMap(left, top, right, bottom, widthOffset, heightOffset, width, height) {
    const visibleX = right - left;
    const visibleY = bottom - top;
    const widthRatio = (width - widthOffset << 16) / visibleX | 0;
    const heightRatio = (height - heightOffset << 16) / visibleY | 0;
    for (let x = 0;x < visibleX; x++) {
      let startX = widthRatio * x >> 16;
      let endX = widthRatio * (x + 1) >> 16;
      const lengthX = endX - startX;
      if (lengthX <= 0) {
        continue;
      }
      startX += widthOffset;
      endX += widthOffset;
      const colours = this.blendedGroundColour[x + left];
      const overlays = this.floort2[x + left];
      const shapes = this.floorsr[x + left];
      for (let y = 0;y < visibleY; y++) {
        let startY = heightRatio * y >> 16;
        let endY = heightRatio * (y + 1) >> 16;
        const lengthY = endY - startY;
        if (lengthY <= 0) {
          continue;
        }
        startY += heightOffset;
        endY += heightOffset;
        const overlay = overlays[y + top];
        if (overlay === 0) {
          Pix2D.fillRect(startX, startY, endX - startX, endY - startY, colours[y + top]);
        } else {
          const info = shapes[y + top];
          const shape = info & 252;
          if (shape == 0 || lengthX <= 1 || lengthY <= 1) {
            Pix2D.fillRect(startX, startY, lengthX, lengthY, overlay);
          } else {
            this.drawOverlayShape(Pix2D.pixels, startY * Pix2D.width + startX, colours[y + top], overlay, lengthX, lengthY, shape >> 2, info & 3);
          }
        }
      }
    }
    if (right - left > width - widthOffset) {
      return;
    }
    let visibleMapFunctionCount = 0;
    for (let x = 0;x < visibleX; x++) {
      let startX = widthRatio * x >> 16;
      let endX = widthRatio * (x + 1) >> 16;
      const lengthX = endX - startX;
      if (lengthX <= 0) {
        continue;
      }
      const walls = this.locWall[x + left];
      const mapscenes = this.locMapscene[x + left];
      const mapfunctions = this.locMapfunction[x + left];
      for (let y = 0;y < visibleY; y++) {
        let startY = heightRatio * y >> 16;
        let endY = heightRatio * (y + 1) >> 16;
        const lengthY = endY - startY;
        if (lengthY <= 0) {
          continue;
        }
        let wall = walls[y + top] & 255;
        if (wall != 0) {
          let edgeX;
          if (lengthX == 1) {
            edgeX = startX;
          } else {
            edgeX = endX - 1;
          }
          let edgeY;
          if (lengthY == 1) {
            edgeY = startY;
          } else {
            edgeY = endY - 1;
          }
          let rgb = 13421772;
          if (wall >= 5 && wall <= 8 || wall >= 13 && wall <= 16 || wall >= 21 && wall <= 24) {
            rgb = 13369344;
            wall -= 4;
          }
          if (wall == 27 || wall == 28) {
            rgb = 13369344;
            wall -= 2;
          }
          if (wall == 1) {
            Pix2D.vline(startX, startY, lengthY, rgb);
          } else if (wall == 2) {
            Pix2D.hline(startX, startY, lengthX, rgb);
          } else if (wall == 3) {
            Pix2D.vline(edgeX, startY, lengthY, rgb);
          } else if (wall == 4) {
            Pix2D.hline(startX, edgeY, lengthX, rgb);
          } else if (wall == 9) {
            Pix2D.vline(startX, startY, lengthY, 16777215);
            Pix2D.hline(startX, startY, lengthX, rgb);
          } else if (wall == 10) {
            Pix2D.vline(edgeX, startY, lengthY, 16777215);
            Pix2D.hline(startX, startY, lengthX, rgb);
          } else if (wall == 11) {
            Pix2D.vline(edgeX, startY, lengthY, 16777215);
            Pix2D.hline(startX, edgeY, lengthX, rgb);
          } else if (wall == 12) {
            Pix2D.vline(startX, startY, lengthY, 16777215);
            Pix2D.hline(startX, edgeY, lengthX, rgb);
          } else if (wall == 17) {
            Pix2D.hline(startX, startY, 1, rgb);
          } else if (wall == 18) {
            Pix2D.hline(edgeX, startY, 1, rgb);
          } else if (wall == 19) {
            Pix2D.hline(edgeX, edgeY, 1, rgb);
          } else if (wall == 20) {
            Pix2D.hline(startX, edgeY, 1, rgb);
          } else if (wall == 25) {
            for (let i = 0;i < lengthY; i++) {
              Pix2D.hline(startX + i, edgeY - i, 1, rgb);
            }
          } else if (wall == 26) {
            for (let i = 0;i < lengthY; i++) {
              Pix2D.hline(startX + i, startY + i, 1, rgb);
            }
          }
        }
        const mapscene = mapscenes[y + top];
        if (mapscene != 0) {
          this.mapscene[mapscene - 1].scalePlotSprite(startX - (lengthX / 2 | 0), startY - (lengthY / 2 | 0), lengthX * 2, lengthY * 2);
        }
        const mapfunction = mapfunctions[y + top];
        if (mapfunction != 0) {
          this.visibleMapFunctions[visibleMapFunctionCount] = mapfunction - 1;
          this.visibleMapFunctionsX[visibleMapFunctionCount] = startX + (lengthX / 2 | 0);
          this.visibleMapFunctionsY[visibleMapFunctionCount] = startY + (lengthY / 2 | 0);
          visibleMapFunctionCount++;
        }
      }
    }
    for (let i = 0;i < visibleMapFunctionCount; i++) {
      this.mapfunction[this.visibleMapFunctions[i]].plotSprite(this.visibleMapFunctionsX[i] - 7, this.visibleMapFunctionsY[i] - 7);
    }
    if (MapView.shouldDrawFreemap) {
      for (let x = 0;x < visibleX; x++) {
        let startX = widthRatio * x >> 16;
        let endX = widthRatio * (x + 1) >> 16;
        let lengthX = endX - startX;
        if (lengthX <= 0) {
          continue;
        }
        startX += widthOffset;
        endX += widthOffset;
        let multi = this.freePos[x + left];
        for (let y = 0;y < visibleY; y++) {
          let startY = heightRatio * y >> 16;
          let endY = heightRatio * (y + 1) >> 16;
          let lengthY = endY - startY;
          if (lengthY <= 0) {
            continue;
          }
          startY += heightOffset;
          endY += heightOffset;
          if (multi[y + top]) {
            Pix2D.fillRectTrans(startX, startY, lengthX, lengthY, 65280, 96);
          }
        }
      }
    }
    if (MapView.shouldDrawMultimap) {
      for (let x = 0;x < visibleX; x++) {
        let startX = widthRatio * x >> 16;
        let endX = widthRatio * (x + 1) >> 16;
        let lengthX = endX - startX;
        if (lengthX <= 0) {
          continue;
        }
        startX += widthOffset;
        endX += widthOffset;
        let multi = this.multiPos[x + left];
        for (let y = 0;y < visibleY; y++) {
          let startY = heightRatio * y >> 16;
          let endY = heightRatio * (y + 1) >> 16;
          let lengthY = endY - startY;
          if (lengthY <= 0) {
            continue;
          }
          startY += heightOffset;
          endY += heightOffset;
          if (multi[y + top]) {
            Pix2D.fillRectTrans(startX, startY, lengthX, lengthY, 16711680, 96);
          }
        }
      }
    }
    if (MapView.shouldDrawItems) {
      for (let x = 0;x < visibleX; x++) {
        let startX = widthRatio * x >> 16;
        let endX = widthRatio * (x + 1) >> 16;
        const lengthX = endX - startX;
        if (lengthX <= 0) {
          continue;
        }
        startX += widthOffset;
        endX += widthOffset;
        for (let y = 0;y < visibleY; y++) {
          let startY = heightRatio * y >> 16;
          let endY = heightRatio * (y + 1) >> 16;
          const lengthY = endY - startY;
          if (lengthY <= 0) {
            continue;
          }
          startY += heightOffset;
          endY += heightOffset;
          if (this.objPos[x + left][y + top]) {
            this.mapdot0?.plotSprite(startX, startY);
          }
        }
      }
    }
    if (MapView.shouldDrawNpcs) {
      for (let x = 0;x < visibleX; x++) {
        let startX = widthRatio * x >> 16;
        let endX = widthRatio * (x + 1) >> 16;
        const lengthX = endX - startX;
        if (lengthX <= 0) {
          continue;
        }
        startX += widthOffset;
        endX += widthOffset;
        for (let y = 0;y < visibleY; y++) {
          let startY = heightRatio * y >> 16;
          let endY = heightRatio * (y + 1) >> 16;
          const lengthY = endY - startY;
          if (lengthY <= 0) {
            continue;
          }
          startY += heightOffset;
          endY += heightOffset;
          if (this.npcPos[x + left][y + top]) {
            this.mapdot1?.plotSprite(startX, startY);
          }
        }
      }
    }
    if (this.flashTimer > 0) {
      for (let i = 0;i < visibleMapFunctionCount; i++) {
        if (this.visibleMapFunctions[i] == this.currentKey) {
          this.mapfunction[this.visibleMapFunctions[i]].plotSprite(this.visibleMapFunctionsX[i] - 7, this.visibleMapFunctionsY[i] - 7);
          if (this.flashTimer % 10 < 5) {
            Pix2D.fillCircle(this.visibleMapFunctionsX[i], this.visibleMapFunctionsY[i], 15, 16776960, 128);
            Pix2D.fillCircle(this.visibleMapFunctionsX[i], this.visibleMapFunctionsY[i], 7, 16777215, 256);
          }
        }
      }
    }
    if (this.zoom == this.targetZoom && MapView.shouldDrawLabels) {
      for (let i = 0;i < this.mapLabelCount; i++) {
        let x = this.mapLabelX[i];
        let y = this.mapLabelY[i];
        x -= this.mapOriginX;
        y = this.mapOriginZ + this.mapHeight - y;
        const drawX = widthOffset + (width - widthOffset) * (x - left) / (right - left) | 0;
        let drawY = heightOffset + (height - heightOffset) * (y - top) / (bottom - top) | 0;
        const labelSize = this.mapLabelSize[i];
        let rgb = 16777215;
        let font = null;
        if (labelSize == 0) {
          if (this.zoom == 3) {
            font = this.f11;
          } else if (this.zoom == 4) {
            font = this.f12;
          } else if (this.zoom == 6) {
            font = this.f14;
          } else if (this.zoom == 8) {
            font = this.f17;
          }
        } else if (labelSize == 1) {
          if (this.zoom == 3) {
            font = this.f14;
          } else if (this.zoom == 4) {
            font = this.f17;
          } else if (this.zoom == 6) {
            font = this.f19;
          } else if (this.zoom == 8) {
            font = this.f22;
          }
        } else if (labelSize == 2) {
          rgb = 16755200;
          if (this.zoom == 3) {
            font = this.f19;
          } else if (this.zoom == 4) {
            font = this.f22;
          } else if (this.zoom == 6) {
            font = this.f26;
          } else if (this.zoom == 8) {
            font = this.f30;
          }
        }
        if (font !== null) {
          let label = this.mapLabel[i];
          let lineCount = 1;
          for (let j = 0;j < label.length; j++) {
            if (label[j] === "/") {
              lineCount++;
            }
          }
          drawY -= font.getHeight() * (lineCount - 1) / 2 | 0;
          drawY += font.getYOffset() / 2 | 0;
          while (true) {
            const newline = label.indexOf("/");
            if (newline === -1) {
              font.centreString(label, drawX, drawY, rgb, true);
              break;
            }
            const part = label.substring(0, newline);
            font.centreString(part, drawX, drawY, rgb, true);
            drawY += font.getHeight();
            label = label.substring(newline + 1);
          }
        }
      }
    }
    if (MapView.shouldDrawBorders) {
      for (let mx = this.mapOriginX / 64;mx < (this.mapOriginX + this.mapWidth) / 64; mx++) {
        for (let mz = this.mapOriginZ / 64;mz < (this.mapOriginZ + this.mapHeight) / 64; mz++) {
          let x = mx * 64;
          let z = mz * 64;
          x -= this.mapOriginX;
          z = this.mapOriginZ + this.mapHeight - z;
          const drawLeft = widthOffset + (width - widthOffset) * (x - left) / (right - left) | 0;
          const drawTop = heightOffset + (height - heightOffset) * (z - 64 - top) / (bottom - top) | 0;
          const drawRight = widthOffset + (width - widthOffset) * (x + 64 - left) / (right - left) | 0;
          const drawBottom = heightOffset + (height - heightOffset) * (z - top) / (bottom - top) | 0;
          if (drawLeft >= width || drawTop >= height || drawRight <= 0 || drawBottom <= 0) {
            continue;
          }
          Pix2D.drawRect(drawLeft, drawTop, drawRight - drawLeft, drawBottom - drawTop, 16777215);
          this.b12?.drawStringRight(mx + "_" + mz, drawRight - 5, drawBottom - 5, 16777215, false);
          if (mx == 33 && mz >= 71 && mz <= 73) {
            this.b12?.centreString("u_pass", (drawRight + drawLeft) / 2 | 0, (drawBottom + drawTop) / 2 | 0, 16711680);
          } else if (mx >= 32 && mx <= 34 && mz >= 70 && mz <= 74) {
            this.b12?.centreString("u_pass", (drawRight + drawLeft) / 2 | 0, (drawBottom + drawTop) / 2 | 0, 16776960);
          }
        }
      }
    }
  }
  drawOverlayShape(data, off, underlay, overlay, width, height, shape, rotation) {
    const step = Pix2D.width - width;
    if (shape == 9) {
      shape = 1;
      rotation = rotation + 1 & 3;
    } else if (shape == 10) {
      shape = 1;
      rotation = rotation + 3 & 3;
    } else if (shape == 11) {
      shape = 8;
      rotation = rotation + 3 & 3;
    }
    if (shape == 1) {
      if (rotation == 0) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x <= y) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 1) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = 0;x < width; x++) {
            if (x <= y) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 2) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x >= y) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 3) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = 0;x < width; x++) {
            if (x >= y) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      }
    } else if (shape == 2) {
      if (rotation == 0) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = 0;x < width; x++) {
            if (x <= y >> 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 1) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x >= y << 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 2) {
        for (let y = 0;y < height; y++) {
          for (let x = width - 1;x >= 0; x--) {
            if (x <= y >> 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 3) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = width - 1;x >= 0; x--) {
            if (x >= y << 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      }
    } else if (shape == 3) {
      if (rotation == 0) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = width - 1;x >= 0; x--) {
            if (x <= y >> 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 1) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = 0;x < width; x++) {
            if (x >= y << 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 2) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x <= y >> 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 3) {
        for (let y = 0;y < height; y++) {
          for (let x = width - 1;x >= 0; x--) {
            if (x >= y << 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      }
    } else if (shape == 4) {
      if (rotation == 0) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = 0;x < width; x++) {
            if (x >= y >> 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 1) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x <= y << 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 2) {
        for (let y = 0;y < height; y++) {
          for (let x = width - 1;x >= 0; x--) {
            if (x >= y >> 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 3) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = width - 1;x >= 0; x--) {
            if (x <= y << 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      }
    } else if (shape == 5) {
      if (rotation == 0) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = width - 1;x >= 0; x--) {
            if (x >= y >> 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 1) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = 0;x < width; x++) {
            if (x <= y << 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 2) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x >= y >> 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 3) {
        for (let y = 0;y < height; y++) {
          for (let x = width - 1;x >= 0; x--) {
            if (x <= y << 1) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      }
    } else if (shape == 6) {
      if (rotation == 0) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x <= (width / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 1) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (y <= (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 2) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x >= (width / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 3) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (y >= (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      }
    } else if (shape == 7) {
      if (rotation == 0) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x <= y - (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 1) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = 0;x < width; x++) {
            if (x <= y - (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 2) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = width - 1;x >= 0; x--) {
            if (x <= y - (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 3) {
        for (let y = 0;y < height; y++) {
          for (let x = width - 1;x >= 0; x--) {
            if (x <= y - (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      }
    } else if (shape == 8) {
      if (rotation == 0) {
        for (let y = 0;y < height; y++) {
          for (let x = 0;x < width; x++) {
            if (x >= y - (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 1) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = 0;x < width; x++) {
            if (x >= y - (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 2) {
        for (let y = height - 1;y >= 0; y--) {
          for (let x = width - 1;x >= 0; x--) {
            if (x >= y - (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      } else if (rotation == 3) {
        for (let y = 0;y < height; y++) {
          for (let x = width - 1;x >= 0; x--) {
            if (x >= y - (height / 2 | 0)) {
              data[off++] = overlay;
            } else {
              data[off++] = underlay;
            }
          }
          off += step;
        }
      }
    }
  }
  async reloadMain() {
    if (this.mapArea === 0) {
      return;
    }
    this.mapStartX = 50 << 6;
    this.mapStartZ = 50 << 6;
    this.mapWidth = 20 << 6;
    this.mapHeight = 19 << 6;
    this.mapOriginX = 36 << 6;
    this.mapOriginZ = 44 << 6;
    this.mapArea = 0;
    this.focusX = this.mapStartX - this.mapOriginX;
    this.focusZ = this.mapOriginZ + this.mapHeight - this.mapStartZ;
    this.dragFocusX = -1;
    this.dragFocusZ = -1;
    this.redraw = true;
    Pix2D.cls();
    await this.maininit();
  }
  async reloadDungeon() {
    if (this.mapArea === 1) {
      return;
    }
    this.mapStartX = 50 << 6;
    this.mapStartZ = 150 << 6;
    this.mapWidth = 21 << 6;
    this.mapHeight = 19 << 6;
    this.mapOriginX = 35 << 6;
    this.mapOriginZ = 144 << 6;
    this.mapArea = 1;
    this.focusX = this.mapStartX - this.mapOriginX;
    this.focusZ = this.mapOriginZ + this.mapHeight - this.mapStartZ;
    this.dragFocusX = -1;
    this.dragFocusZ = -1;
    this.redraw = true;
    Pix2D.cls();
    await this.maininit();
  }
  async reloadExtra() {
    if (this.mapArea === 2) {
      return;
    }
    this.mapStartX = 39 << 6;
    this.mapStartZ = 74 << 6;
    this.mapWidth = 21 << 6;
    this.mapHeight = 15 << 6;
    this.mapOriginX = 28 << 6;
    this.mapOriginZ = 65 << 6;
    this.mapArea = 2;
    this.focusX = this.mapStartX - this.mapOriginX;
    this.focusZ = this.mapOriginZ + this.mapHeight - this.mapStartZ;
    this.dragFocusX = -1;
    this.dragFocusZ = -1;
    this.redraw = true;
    await this.maininit();
  }
  dragging = false;
  activePointerId = null;
  mouseDown(x, y, e) {
    this.nextMouseClickX = x;
    this.nextMouseClickY = y;
    this.mouseX = x;
    this.mouseY = y;
    if (e.button === 2) {
      this.nextMouseClickButton = 2;
      this.mouseButton = 2;
    } else {
      this.nextMouseClickButton = 1;
      this.mouseButton = 1;
      canvas.style.cursor = "grabbing";
      this.dragging = true;
    }
  }
  mouseUp(_x, _y, e) {
    this.dragging = false;
    canvas.style.cursor = "grab";
    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseButton = 0;
    this.nextMouseClickX = -1;
    this.nextMouseClickY = -1;
    this.nextMouseClickButton = 0;
  }
  pointerDown(x, y, e) {
    this.idleTimer = performance.now();
    this.mouseX = x;
    this.mouseY = y;
    this.mouseButton = 1;
    this.nextMouseClickX = x;
    this.nextMouseClickY = y;
    this.nextMouseClickButton = 1;
  }
  pointerUp(_x, _y, e) {
    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseButton = 0;
    this.nextMouseClickX = -1;
    this.nextMouseClickY = -1;
    this.nextMouseClickButton = 0;
  }
  pointerEnter() {}
  pointerLeave() {}
  pointerMove(x, y, _e) {
    if (!this.dragging) {
      this.mouseX = x;
      this.mouseY = y;
    }
  }
  windowMouseUp(e) {
    this.dragging = false;
    canvas.style.cursor = "grab";
    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseButton = 0;
    this.nextMouseClickX = -1;
    this.nextMouseClickY = -1;
    this.nextMouseClickButton = 0;
  }
  windowMouseMove(e) {
    if (this.dragging) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left | 0;
      const y = e.clientY - rect.top | 0;
      this.mouseX = x;
      this.mouseY = y;
    }
  }
}
setTimeout(() => {
  try {
    new MapView;
  } catch (e) {
    console.error("MapView auto-start failed:", e);
  }
}, 100);
export {
  MapView
};

//# debugId=B7EE2C502C1A6ED864756E2164756E21
