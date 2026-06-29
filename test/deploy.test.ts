import { describe, expect, it } from 'vitest';
import {
  DEPLOY_MODES,
  type DeployTraits,
  TRAIT_KEYS,
  TRAIT_MAX,
  deployModeByKey,
} from '../src/lib/deploy';

describe('deployModeByKey', () => {
  it('finds each of the three modes', () => {
    expect(deployModeByKey('local')?.label).toBe('Local');
    expect(deployModeByKey('selfhosted')?.label).toBe('Self-hosted');
    expect(deployModeByKey('managed')?.label).toBe('Managed API');
  });
  it('returns undefined for an unknown key', () => {
    expect(deployModeByKey('nope')).toBeUndefined();
  });
});

describe('DEPLOY_MODES data', () => {
  it('has exactly the three modes, most-control first', () => {
    expect(DEPLOY_MODES.map((m) => m.key)).toEqual(['local', 'selfhosted', 'managed']);
  });

  it('every mode carries copy, tools, and all five traits in 1..MAX', () => {
    for (const mode of DEPLOY_MODES) {
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.blurb.length).toBeGreaterThan(0);
      expect(mode.tools.length).toBeGreaterThan(0);
      for (const t of mode.tools) {
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.note.length).toBeGreaterThan(0);
      }
      for (const key of TRAIT_KEYS) {
        const v = mode.traits[key as keyof DeployTraits];
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(TRAIT_MAX);
      }
    }
  });

  it('local maximizes control and managed maximizes convenience', () => {
    const local = deployModeByKey('local');
    const managed = deployModeByKey('managed');
    expect(local?.traits.control).toBe(TRAIT_MAX);
    expect(managed?.traits.convenience).toBe(TRAIT_MAX);
    // The defining tension: local has more control than managed.
    expect(local?.traits.control ?? 0).toBeGreaterThan(managed?.traits.control ?? 0);
  });
});
