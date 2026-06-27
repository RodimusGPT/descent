import { describe, expect, it } from 'vitest';
import { BLOCK, MODEL_PRESETS, paramBreakdown } from '../src/lib/transformer';

describe('BLOCK — pre-norm layer structure', () => {
  it('has the six sub-blocks in pre-norm order', () => {
    expect(BLOCK.map((b) => b.kind)).toEqual([
      'norm',
      'attention',
      'residual',
      'norm',
      'ffn',
      'residual',
    ]);
  });

  it('normalizes before attention (pre-norm), not after', () => {
    const normIdx = BLOCK.findIndex((b) => b.kind === 'norm');
    const attnIdx = BLOCK.findIndex((b) => b.kind === 'attention');
    expect(normIdx).toBeGreaterThanOrEqual(0);
    expect(attnIdx).toBeGreaterThan(normIdx);
  });

  it('adds the residual after attention', () => {
    const attnIdx = BLOCK.findIndex((b) => b.kind === 'attention');
    const residualIdx = BLOCK.findIndex((b, i) => i > attnIdx && b.kind === 'residual');
    expect(residualIdx).toBeGreaterThan(attnIdx);
  });

  it('normalizes again before the FFN', () => {
    const ffnIdx = BLOCK.findIndex((b) => b.kind === 'ffn');
    const normBeforeFfn = BLOCK.slice(0, ffnIdx).filter((b) => b.kind === 'norm').length;
    // both RMSNorms precede the FFN
    expect(normBeforeFfn).toBe(2);
    expect(BLOCK[ffnIdx - 1].kind).toBe('norm');
  });

  it('ends with a residual add after the FFN', () => {
    expect(BLOCK[BLOCK.length - 1].kind).toBe('residual');
    const ffnIdx = BLOCK.findIndex((b) => b.kind === 'ffn');
    expect(BLOCK.length - 1).toBeGreaterThan(ffnIdx);
  });

  it('gives every sub-block a unique id, label and note', () => {
    const ids = BLOCK.map((b) => b.id);
    expect(new Set(ids).size).toBe(BLOCK.length);
    for (const b of BLOCK) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.note.length).toBeGreaterThan(0);
    }
  });
});

describe('paramBreakdown', () => {
  it('has at least two realistic presets', () => {
    expect(MODEL_PRESETS.length).toBeGreaterThanOrEqual(2);
    for (const p of MODEL_PRESETS) {
      // dFF is large relative to dModel (≥ ~2.5·dModel; SwiGLU FFNs use ~8/3·dModel).
      expect(p.dFF).toBeGreaterThanOrEqual(2.5 * p.dModel);
    }
  });

  it('FFN holds more parameters than attention for every preset', () => {
    for (const p of MODEL_PRESETS) {
      const b = paramBreakdown(p);
      expect(b.ffnParams).toBeGreaterThan(b.attnParams);
    }
  });

  it('perLayer equals attnParams + ffnParams', () => {
    for (const p of MODEL_PRESETS) {
      const b = paramBreakdown(p);
      expect(b.perLayer).toBe(b.attnParams + b.ffnParams);
    }
  });

  it('total equals nLayers × perLayer', () => {
    for (const p of MODEL_PRESETS) {
      const b = paramBreakdown(p);
      expect(b.total).toBe(p.nLayers * b.perLayer);
    }
  });

  it('uses standard shapes: attn ≈ 4·dModel², ffn ≈ 2·dModel·dFF', () => {
    for (const p of MODEL_PRESETS) {
      const b = paramBreakdown(p);
      expect(b.attnParams).toBe(4 * p.dModel * p.dModel);
      expect(b.ffnParams).toBe(2 * p.dModel * p.dFF);
    }
  });

  it('produces a roughly realistic total (GPT-2 preset within an order of magnitude of 85M transformer params)', () => {
    const gpt2 = MODEL_PRESETS.find((p) => p.name.includes('GPT-2'));
    expect(gpt2).toBeDefined();
    if (gpt2) {
      const { total } = paramBreakdown(gpt2);
      expect(total).toBeGreaterThan(50e6);
      expect(total).toBeLessThan(200e6);
    }
  });
});
