import { describe, expect, it } from 'vitest';
import {
  BLOCK_SIZE,
  allocateContiguous,
  allocatePaged,
  blocksFor,
  withSharedPrefix,
} from '../src/lib/paged';

describe('blocksFor', () => {
  it('rounds up to whole blocks', () => {
    expect(blocksFor(10, 4)).toBe(3);
    expect(blocksFor(8, 4)).toBe(2);
    expect(blocksFor(1, 4)).toBe(1);
  });

  it('is zero for zero tokens', () => {
    expect(blocksFor(0, 4)).toBe(0);
    expect(blocksFor(-3, 4)).toBe(0);
  });

  it('BLOCK_SIZE is the documented default page size', () => {
    expect(BLOCK_SIZE).toBe(4);
  });
});

describe('allocateContiguous vs allocatePaged', () => {
  const seqs = [
    { id: 0, len: 5 },
    { id: 1, len: 10 },
    { id: 2, len: 3 },
  ];
  const maxLen = 32;

  it('contiguous wastes more than paged when lengths are below maxLen', () => {
    const cont = allocateContiguous(seqs, maxLen, BLOCK_SIZE);
    const paged = allocatePaged(seqs, BLOCK_SIZE);
    expect(cont.wasted).toBeGreaterThan(paged.wasted);
  });

  it('contiguous reserved = used + wasted', () => {
    const cont = allocateContiguous(seqs, maxLen, BLOCK_SIZE);
    expect(cont.reserved).toBe(cont.used + cont.wasted);
    // each of 3 seqs reserves ceil(32/4) = 8 blocks
    expect(cont.reserved).toBe(3 * 8);
  });

  it('paged physicalUsed equals sum of ceil(len/blockSize)', () => {
    const paged = allocatePaged(seqs, BLOCK_SIZE);
    const expected = seqs.reduce((acc, s) => acc + blocksFor(s.len, BLOCK_SIZE), 0);
    expect(paged.physicalUsed).toBe(expected);
    expect(expected).toBe(2 + 3 + 1); // ceil(5/4)+ceil(10/4)+ceil(3/4)
  });

  it('paged total blocks <= contiguous reserved blocks', () => {
    const cont = allocateContiguous(seqs, maxLen, BLOCK_SIZE);
    const paged = allocatePaged(seqs, BLOCK_SIZE);
    expect(paged.physicalUsed).toBeLessThanOrEqual(cont.reserved);
  });

  it('paged block table uses distinct physical blocks across sequences (no overlap)', () => {
    const { blockTable } = allocatePaged(seqs, BLOCK_SIZE);
    const all: number[] = [];
    for (const s of seqs) all.push(...blockTable[s.id]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('paged waste is the unfilled tail of each last block', () => {
    const { wasted } = allocatePaged(seqs, BLOCK_SIZE);
    // len 5 -> 2 blocks (8 slots) -> 3 wasted; len 10 -> 3 blocks (12) -> 2; len 3 -> 1 block (4) -> 1
    expect(wasted).toBe(3 + 2 + 1);
  });
});

describe('withSharedPrefix', () => {
  it('shares exactly ceil(sharedTokens/blockSize) leading blocks and differs after', () => {
    const sharedTokens = 6; // ceil(6/4) = 2 shared blocks
    const { tableA, tableB, sharedBlocks } = withSharedPrefix(
      { id: 0, len: 10 },
      { id: 1, len: 14 },
      sharedTokens,
      BLOCK_SIZE,
    );
    expect(sharedBlocks.length).toBe(2);
    // leading blocks identical
    expect(tableA.slice(0, 2)).toEqual(sharedBlocks);
    expect(tableB.slice(0, 2)).toEqual(sharedBlocks);
    // tails are disjoint
    const tailA = tableA.slice(2);
    const tailB = tableB.slice(2);
    expect(tailA.length).toBeGreaterThan(0);
    expect(tailB.length).toBeGreaterThan(0);
    for (const id of tailA) expect(tailB).not.toContain(id);
  });

  it('every physical block id is unique except the shared prefix', () => {
    const { tableA, tableB, sharedBlocks } = withSharedPrefix(
      { id: 0, len: 9 },
      { id: 1, len: 7 },
      4,
      BLOCK_SIZE,
    );
    const union = new Set([...tableA, ...tableB]);
    // total distinct = sharedBlocks + (blocksA - shared) + (blocksB - shared)
    const blocksA = tableA.length;
    const blocksB = tableB.length;
    expect(union.size).toBe(
      sharedBlocks.length + (blocksA - sharedBlocks.length) + (blocksB - sharedBlocks.length),
    );
  });

  it('cannot share more blocks than the shorter sequence has', () => {
    const { sharedBlocks } = withSharedPrefix(
      { id: 0, len: 3 }, // only 1 block
      { id: 1, len: 20 },
      16, // would be 4 shared blocks, but A only has 1
      BLOCK_SIZE,
    );
    expect(sharedBlocks.length).toBe(1);
  });
});
