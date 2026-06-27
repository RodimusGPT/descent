/**
 * paged.ts — KV cache as OS-style paging (spec 10.3).
 *
 * The mental model: treat the KV cache like virtual memory. Tokens live in
 * fixed-size BLOCKS, and a BLOCK TABLE maps each (sequence, logical block) to a
 * PHYSICAL block in a shared pool.
 *
 *   contiguous allocation — every sequence RESERVES room for the maximum length
 *                           up front, so short sequences waste whole blocks
 *                           (internal fragmentation).
 *   paged allocation      — blocks are handed out ON DEMAND, one at a time, so
 *                           the only waste is the unused tail of the last block.
 *   prefix sharing        — two sequences with an identical leading prefix can
 *                           map their first logical blocks to the SAME physical
 *                           blocks, storing that prefix once.
 *
 * Pure, deterministic teaching arithmetic — no allocator state, no randomness.
 */

/** Tokens stored per block (the page size of the KV cache). */
export const BLOCK_SIZE = 4;

/** Number of blocks needed to hold `tokens` tokens at `blockSize` per block. */
export function blocksFor(tokens: number, blockSize: number): number {
  if (tokens <= 0) return 0;
  return Math.ceil(tokens / blockSize);
}

/** A sequence: an id plus its current token length. */
export interface Seq {
  id: number;
  len: number;
}

/** Result of contiguous (reserve-max) allocation, counted in BLOCKS. */
export interface ContiguousResult {
  /** Blocks reserved across all sequences (each reserves ceil(maxLen/block)). */
  reserved: number;
  /** Blocks actually backing real tokens (each uses ceil(len/block)). */
  used: number;
  /** Reserved minus used — whole blocks held but never written. */
  wasted: number;
}

/**
 * Contiguous allocation: every sequence reserves a fixed run of
 * `ceil(maxLen / blockSize)` blocks regardless of how long it actually is.
 * Short sequences leave most of their reservation empty.
 */
export function allocateContiguous(
  seqs: Seq[],
  maxLen: number,
  blockSize: number,
): ContiguousResult {
  const perSeqReserved = blocksFor(maxLen, blockSize);
  let reserved = 0;
  let used = 0;
  for (const s of seqs) {
    reserved += perSeqReserved;
    used += blocksFor(Math.min(s.len, maxLen), blockSize);
  }
  return { reserved, used, wasted: reserved - used };
}

/** Result of paged (on-demand) allocation. */
export interface PagedResult {
  /** seq id -> the physical block indices backing it, in logical order. */
  blockTable: Record<number, number[]>;
  /** Total physical blocks handed out (sum of ceil(len/block)). */
  physicalUsed: number;
  /** Unused token SLOTS in every sequence's last partial block. */
  wasted: number;
}

/**
 * Paged allocation: hand out `ceil(len / blockSize)` physical blocks per
 * sequence on demand from a shared pool. Distinct sequences never share a
 * physical block here (see `withSharedPrefix` for the sharing case). The only
 * waste is the unfilled tail of each sequence's final block.
 */
export function allocatePaged(seqs: Seq[], blockSize: number): PagedResult {
  const blockTable: Record<number, number[]> = {};
  let next = 0;
  let wasted = 0;
  for (const s of seqs) {
    const nBlocks = blocksFor(s.len, blockSize);
    const blocks: number[] = [];
    for (let b = 0; b < nBlocks; b++) {
      blocks.push(next);
      next += 1;
    }
    blockTable[s.id] = blocks;
    if (nBlocks > 0) {
      wasted += nBlocks * blockSize - s.len; // unfilled slots in the last block
    }
  }
  return { blockTable, physicalUsed: next, wasted };
}

/** Result of allocating two sequences that share a leading prefix. */
export interface SharedPrefixResult {
  /** Physical blocks backing sequence A, in logical order. */
  tableA: number[];
  /** Physical blocks backing sequence B, in logical order. */
  tableB: number[];
  /** The leading physical blocks common to both A and B. */
  sharedBlocks: number[];
}

/**
 * Allocate two sequences whose first `sharedTokens` tokens are identical. The
 * leading `ceil(sharedTokens / blockSize)` physical blocks are shared (stored
 * once, pointed at by both block tables); every block after that is distinct
 * per sequence.
 */
export function withSharedPrefix(
  seqA: Seq,
  seqB: Seq,
  sharedTokens: number,
  blockSize: number,
): SharedPrefixResult {
  const blocksA = blocksFor(seqA.len, blockSize);
  const blocksB = blocksFor(seqB.len, blockSize);
  // Can't share more leading blocks than either sequence actually has.
  const shared = Math.min(blocksFor(sharedTokens, blockSize), blocksA, blocksB);

  const sharedBlocks: number[] = [];
  for (let i = 0; i < shared; i++) sharedBlocks.push(i);

  let next = shared;
  const tableA = [...sharedBlocks];
  for (let i = shared; i < blocksA; i++) {
    tableA.push(next);
    next += 1;
  }
  const tableB = [...sharedBlocks];
  for (let i = shared; i < blocksB; i++) {
    tableB.push(next);
    next += 1;
  }

  return { tableA, tableB, sharedBlocks };
}
