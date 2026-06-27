/**
 * float.ts — exact IEEE-754 decode/encode for FP32, FP16, and BF16.
 *
 * Powers the FloatExploder interactive (spec 9.2): the reader toggles raw bits
 * and watches the represented value change, then switches formats on the *same*
 * value to feel BF16 (wide range, coarse mantissa) versus FP16 (narrow range,
 * finer mantissa).
 *
 * Bit indexing convention (used throughout): bit index 0 is the MOST significant
 * bit = the sign bit, increasing toward the least significant mantissa bit. A bit
 * pattern is a `number[]` of 0/1 with length === format.totalBits.
 */

export type FormatKey = 'fp32' | 'fp16' | 'bf16';

/** Inclusive bit-index range `[start, end]` for a field (sign/exponent/mantissa). */
export interface FieldRange {
  /** First bit index of the field (0 = sign / MSB). */
  start: number;
  /** Last bit index of the field, inclusive. */
  end: number;
}

export interface FloatFormat {
  key: FormatKey;
  label: string;
  totalBits: number;
  exponentBits: number;
  mantissaBits: number;
  /** Exponent bias (2^(exponentBits-1) - 1). */
  bias: number;
  /** Bit-index ranges for each field. sign is always {start:0,end:0}. */
  fields: {
    sign: FieldRange;
    exponent: FieldRange;
    mantissa: FieldRange;
  };
}

function makeFormat(
  key: FormatKey,
  label: string,
  exponentBits: number,
  mantissaBits: number,
): FloatFormat {
  const totalBits = 1 + exponentBits + mantissaBits;
  const bias = 2 ** (exponentBits - 1) - 1;
  return {
    key,
    label,
    totalBits,
    exponentBits,
    mantissaBits,
    bias,
    fields: {
      sign: { start: 0, end: 0 },
      exponent: { start: 1, end: exponentBits },
      mantissa: { start: 1 + exponentBits, end: totalBits - 1 },
    },
  };
}

/** Registry of the three supported formats. */
export const FORMATS: Record<FormatKey, FloatFormat> = {
  fp32: makeFormat('fp32', 'FP32', 8, 23),
  fp16: makeFormat('fp16', 'FP16', 5, 10),
  bf16: makeFormat('bf16', 'BF16', 8, 7),
};

/** Ordered list of formats for UI iteration. */
export const FORMAT_ORDER: FormatKey[] = ['fp32', 'fp16', 'bf16'];

/** Which field a given bit index belongs to. */
export function fieldOfBit(index: number, format: FloatFormat): 'sign' | 'exponent' | 'mantissa' {
  if (index <= format.fields.sign.end) return 'sign';
  if (index <= format.fields.exponent.end) return 'exponent';
  return 'mantissa';
}

/** Read an unsigned integer from a contiguous slice of the bit array (MSB first). */
function bitsToUint(bits: number[], start: number, end: number): number {
  let v = 0;
  for (let i = start; i <= end; i++) {
    v = v * 2 + (bits[i] ? 1 : 0);
  }
  return v;
}

/**
 * Decode a bit pattern to the exact value it represents.
 * Handles normals, subnormals, signed zero, +/-Infinity, and NaN.
 */
export function bitsToValue(bits: number[], format: FloatFormat): number {
  const { exponentBits, mantissaBits, bias, fields } = format;
  const sign = bits[0] ? -1 : 1;
  const exp = bitsToUint(bits, fields.exponent.start, fields.exponent.end);
  const mant = bitsToUint(bits, fields.mantissa.start, fields.mantissa.end);
  const maxExp = (1 << exponentBits) - 1;
  const scale = 2 ** mantissaBits;

  if (exp === 0) {
    // Zero or subnormal: no implicit leading 1, fixed exponent 1 - bias.
    if (mant === 0) return sign * 0;
    return sign * (mant / scale) * 2 ** (1 - bias);
  }

  if (exp === maxExp) {
    return mant === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  }

  // Normal: implicit leading 1.
  const fraction = 1 + mant / scale;
  return sign * fraction * 2 ** (exp - bias);
}

/** Write an unsigned integer into a slice of the bit array (MSB first). */
function uintToBits(value: number, start: number, end: number, out: number[]): void {
  let v = value;
  for (let i = end; i >= start; i--) {
    out[i] = v & 1;
    v = Math.floor(v / 2);
  }
}

/** Build a bit array from a raw unsigned integer of `totalBits` width. */
function uintToPattern(raw: number, format: FloatFormat): number[] {
  const out = new Array<number>(format.totalBits).fill(0);
  uintToBits(raw >>> 0, 0, format.totalBits - 1, out);
  return out;
}

/** Encode a JS number to the exact 32-bit FP32 bit pattern as an unsigned int. */
function fp32Raw(value: number): number {
  const buf = new ArrayBuffer(4);
  const dv = new DataView(buf);
  dv.setFloat32(0, value, false);
  return dv.getUint32(0, false) >>> 0;
}

/** Convert a JS number to FP16 (binary16) raw bits via round-to-nearest-even. */
function fp16Raw(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;
  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const a = Math.abs(value);
  if (a === Number.POSITIVE_INFINITY) return sign | 0x7c00;
  if (a === 0) return sign;

  // Decompose the FP32 representation of |value|.
  const f = fp32Raw(a);
  const f32exp = (f >>> 23) & 0xff;
  const f32mant = f & 0x7fffff;
  // Unbiased exponent of FP32.
  let e = f32exp - 127;

  if (e > 15) {
    // Overflow to Infinity.
    return sign | 0x7c00;
  }

  if (e >= -14) {
    // Normal FP16. Round the 23-bit mantissa down to 10 bits (round-half-even).
    let mant = f32mant >>> 13;
    const roundBits = f32mant & 0x1fff;
    const half = 0x1000;
    if (roundBits > half || (roundBits === half && (mant & 1) === 1)) {
      mant += 1;
      if (mant === 0x400) {
        // Mantissa overflow → bump exponent.
        mant = 0;
        e += 1;
        if (e > 15) return sign | 0x7c00;
      }
    }
    return sign | ((e + 15) << 10) | mant;
  }

  // Subnormal FP16 (or underflow to zero). Build full significand with implicit 1.
  if (e < -25) return sign; // far below smallest subnormal → +/-0
  const significand = f32mant | 0x800000; // 24-bit value (1.mantissa)
  // Shift so the result aligns to a 10-bit subnormal mantissa.
  const shift = -e - 14 + 13; // bits to discard
  let mant = significand >>> shift;
  const roundMask = (1 << shift) - 1;
  const roundBits = significand & roundMask;
  const half = 1 << (shift - 1);
  if (roundBits > half || (roundBits === half && (mant & 1) === 1)) {
    mant += 1;
    // mant may carry into 0x400, which is exactly the smallest normal — correct.
  }
  return sign | mant;
}

/** Convert a JS number to BF16 raw bits = high 16 bits of FP32 (round-to-nearest-even). */
function bf16Raw(value: number): number {
  if (Number.isNaN(value)) return 0x7fc0;
  const f = fp32Raw(value);
  const lower = f & 0xffff;
  let upper = (f >>> 16) & 0xffff;
  const half = 0x8000;
  if (lower > half || (lower === half && (upper & 1) === 1)) {
    upper += 1;
    // upper may overflow into 0x10000 carrying into exponent; mask to 16 bits.
    upper &= 0xffff;
  }
  return upper;
}

/**
 * Encode a JS number to the nearest representable bit pattern for `format`.
 * FP32 is exact; BF16/FP16 use round-to-nearest-even.
 */
export function valueToBits(value: number, format: FloatFormat): number[] {
  switch (format.key) {
    case 'fp32':
      return uintToPattern(fp32Raw(value), format);
    case 'bf16':
      return uintToPattern(bf16Raw(value), format);
    case 'fp16':
      return uintToPattern(fp16Raw(value), format);
    default:
      return uintToPattern(0, format);
  }
}

/** Pack a bit pattern into its raw unsigned integer (handy for tests/hex display). */
export function bitsToRaw(bits: number[]): number {
  return bitsToUint(bits, 0, bits.length - 1) >>> 0;
}

/** Classify a decoded value for labeling in the UI. */
export type ValueClass = 'normal' | 'subnormal' | 'zero' | 'infinity' | 'nan';

export function classifyBits(bits: number[], format: FloatFormat): ValueClass {
  const { exponentBits, fields } = format;
  const exp = bitsToUint(bits, fields.exponent.start, fields.exponent.end);
  const mant = bitsToUint(bits, fields.mantissa.start, fields.mantissa.end);
  const maxExp = (1 << exponentBits) - 1;
  if (exp === 0) return mant === 0 ? 'zero' : 'subnormal';
  if (exp === maxExp) return mant === 0 ? 'infinity' : 'nan';
  return 'normal';
}

/** Largest finite normal value for a format. */
export function largestNormal(format: FloatFormat): number {
  const bits = new Array<number>(format.totalBits).fill(1);
  bits[0] = 0; // positive
  // exponent = all ones except the last bit (maxExp - 1), mantissa all ones.
  bits[format.fields.exponent.end] = 0;
  return bitsToValue(bits, format);
}

/** Smallest positive subnormal value for a format. */
export function smallestSubnormal(format: FloatFormat): number {
  const bits = new Array<number>(format.totalBits).fill(0);
  bits[format.totalBits - 1] = 1; // single least-significant mantissa bit
  return bitsToValue(bits, format);
}
