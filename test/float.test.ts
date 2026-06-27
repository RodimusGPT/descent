import { describe, expect, it } from 'vitest';
import {
  FORMATS,
  type FormatKey,
  bitsToRaw,
  bitsToValue,
  classifyBits,
  largestNormal,
  smallestSubnormal,
  valueToBits,
} from '../src/lib/float';

const formats: FormatKey[] = ['fp32', 'fp16', 'bf16'];

describe('field boundaries', () => {
  it('fp32 is 1 / 8 / 23 with correct index ranges', () => {
    const f = FORMATS.fp32;
    expect([f.exponentBits, f.mantissaBits, f.totalBits]).toEqual([8, 23, 32]);
    expect(f.bias).toBe(127);
    expect(f.fields.sign).toEqual({ start: 0, end: 0 });
    expect(f.fields.exponent).toEqual({ start: 1, end: 8 });
    expect(f.fields.mantissa).toEqual({ start: 9, end: 31 });
  });

  it('fp16 is 1 / 5 / 10 with correct index ranges', () => {
    const f = FORMATS.fp16;
    expect([f.exponentBits, f.mantissaBits, f.totalBits]).toEqual([5, 10, 16]);
    expect(f.bias).toBe(15);
    expect(f.fields.sign).toEqual({ start: 0, end: 0 });
    expect(f.fields.exponent).toEqual({ start: 1, end: 5 });
    expect(f.fields.mantissa).toEqual({ start: 6, end: 15 });
  });

  it('bf16 is 1 / 8 / 7 with correct index ranges', () => {
    const f = FORMATS.bf16;
    expect([f.exponentBits, f.mantissaBits, f.totalBits]).toEqual([8, 7, 16]);
    expect(f.bias).toBe(127);
    expect(f.fields.sign).toEqual({ start: 0, end: 0 });
    expect(f.fields.exponent).toEqual({ start: 1, end: 8 });
    expect(f.fields.mantissa).toEqual({ start: 9, end: 15 });
  });
});

describe('FP32 exact encoding', () => {
  it('encodes 1.0 to 0x3F800000 with the canonical bit pattern', () => {
    const bits = valueToBits(1.0, FORMATS.fp32);
    expect(bitsToRaw(bits) >>> 0).toBe(0x3f800000);
    // sign 0 | exponent 127 = 01111111 | mantissa 0
    const expected = [0, 0, 1, 1, 1, 1, 1, 1, 1, ...new Array(23).fill(0)];
    expect(bits).toEqual(expected);
  });

  it('encodes -2.0 to 0xC0000000', () => {
    expect(bitsToRaw(valueToBits(-2.0, FORMATS.fp32)) >>> 0).toBe(0xc0000000);
  });

  it('encodes 0.5 to 0x3F000000', () => {
    expect(bitsToRaw(valueToBits(0.5, FORMATS.fp32)) >>> 0).toBe(0x3f000000);
  });
});

describe('round-trips', () => {
  const exactValues = [0, 1, -1, 0.5, 2, -2, 0.15625, 4, 0.25, 256];
  for (const fmt of formats) {
    for (const x of exactValues) {
      it(`${fmt} round-trips ${x}`, () => {
        const bits = valueToBits(x, FORMATS[fmt]);
        const decoded = bitsToValue(bits, FORMATS[fmt]);
        expect(decoded).toBe(x);
      });
    }
  }

  it('signed zero round-trips in fp32', () => {
    const bits = valueToBits(-0, FORMATS.fp32);
    const decoded = bitsToValue(bits, FORMATS.fp32);
    expect(Object.is(decoded, -0)).toBe(true);
  });

  it('0.1 round-trips approximately across formats', () => {
    for (const fmt of formats) {
      const decoded = bitsToValue(valueToBits(0.1, FORMATS[fmt]), FORMATS[fmt]);
      const tol = fmt === 'fp32' ? 1e-7 : fmt === 'fp16' ? 1e-3 : 1e-2;
      expect(Math.abs(decoded - 0.1)).toBeLessThan(tol);
    }
  });
});

describe('special values', () => {
  it('exp-all-ones, mantissa 0 decodes to +Infinity (fp16)', () => {
    const f = FORMATS.fp16;
    const bits = new Array<number>(f.totalBits).fill(0);
    for (let i = f.fields.exponent.start; i <= f.fields.exponent.end; i++) bits[i] = 1;
    expect(bitsToValue(bits, f)).toBe(Number.POSITIVE_INFINITY);
    bits[0] = 1;
    expect(bitsToValue(bits, f)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('exp-all-ones, mantissa nonzero decodes to NaN (fp32)', () => {
    const f = FORMATS.fp32;
    const bits = new Array<number>(f.totalBits).fill(0);
    for (let i = f.fields.exponent.start; i <= f.fields.exponent.end; i++) bits[i] = 1;
    bits[f.totalBits - 1] = 1;
    expect(Number.isNaN(bitsToValue(bits, f))).toBe(true);
    expect(classifyBits(bits, f)).toBe('nan');
  });

  it('encodes Infinity and NaN', () => {
    expect(bitsToValue(valueToBits(Number.POSITIVE_INFINITY, FORMATS.fp16), FORMATS.fp16)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(Number.isNaN(bitsToValue(valueToBits(Number.NaN, FORMATS.bf16), FORMATS.bf16))).toBe(
      true,
    );
  });
});

describe('subnormals', () => {
  it('smallest positive subnormal decodes correctly (fp16 = 2^-24)', () => {
    const f = FORMATS.fp16;
    const v = smallestSubnormal(f);
    expect(v).toBe(2 ** -24);
    expect(classifyBits(valueToBits(v, f), f)).toBe('subnormal');
    expect(bitsToValue(valueToBits(v, f), f)).toBe(v);
  });

  it('smallest positive subnormal decodes correctly (fp32 = 2^-149)', () => {
    const f = FORMATS.fp32;
    expect(smallestSubnormal(f)).toBe(2 ** -149);
  });

  it('largest finite normal matches known constants', () => {
    expect(largestNormal(FORMATS.fp32)).toBe(3.4028234663852886e38);
    expect(largestNormal(FORMATS.fp16)).toBe(65504);
  });
});
