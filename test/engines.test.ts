import { describe, expect, it } from 'vitest';
import {
  DIM_KEYS,
  DIM_LABELS,
  DIM_MAX,
  ENGINES,
  type EngineDims,
  engineByKey,
} from '../src/lib/engines';

describe('ENGINES — shape', () => {
  it('has exactly five engines', () => {
    expect(ENGINES.length).toBe(5);
  });

  it('covers the four expected engines by key', () => {
    const keys = ENGINES.map((e) => e.key);
    expect(keys).toContain('llama.cpp');
    expect(keys).toContain('vllm');
    expect(keys).toContain('sglang');
    expect(keys).toContain('trtllm');
  });

  it('has unique keys', () => {
    const keys = ENGINES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has non-empty name/tagline/bestFor/keyTech for every engine', () => {
    for (const e of ENGINES) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.tagline.length).toBeGreaterThan(0);
      expect(e.bestFor.length).toBeGreaterThan(0);
      expect(e.keyTech.length).toBeGreaterThan(0);
    }
  });
});

describe('ENGINES — dims', () => {
  it('every dimension rating is an integer in [1, 5]', () => {
    for (const e of ENGINES) {
      for (const k of DIM_KEYS) {
        const v = e.dims[k];
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(DIM_MAX);
      }
    }
  });

  it('exposes the four dimension keys with labels', () => {
    expect(DIM_KEYS.length).toBe(4);
    for (const k of DIM_KEYS) {
      expect(DIM_LABELS[k as keyof EngineDims].length).toBeGreaterThan(0);
    }
  });
});

describe('ENGINES — character', () => {
  it('llama.cpp has the strictly highest portability', () => {
    const llama = engineByKey('llama.cpp');
    expect(llama).toBeDefined();
    if (!llama) return;
    for (const e of ENGINES) {
      if (e.key === 'llama.cpp') continue;
      expect(llama.dims.portability).toBeGreaterThan(e.dims.portability);
    }
  });

  it('TensorRT-LLM has the strictly highest throughput', () => {
    const trt = engineByKey('trtllm');
    expect(trt).toBeDefined();
    if (!trt) return;
    for (const e of ENGINES) {
      if (e.key === 'trtllm') continue;
      expect(trt.dims.throughput).toBeGreaterThan(e.dims.throughput);
    }
  });

  it('SGLang leads on prefix caching (RadixAttention)', () => {
    const sg = engineByKey('sglang');
    expect(sg).toBeDefined();
    if (!sg) return;
    const maxPrefix = Math.max(...ENGINES.map((e) => e.dims.prefixCaching));
    expect(sg.dims.prefixCaching).toBe(maxPrefix);
  });
});

describe('engineByKey', () => {
  it('returns the matching engine', () => {
    expect(engineByKey('vllm')?.name).toBe('vLLM');
  });

  it('returns undefined for an unknown key', () => {
    expect(engineByKey('nope')).toBeUndefined();
  });
});
