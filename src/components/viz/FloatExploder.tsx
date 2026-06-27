import { COLOR, withAlpha } from '@/lib/encoding';
import {
  FORMATS,
  FORMAT_ORDER,
  type FloatFormat,
  type FormatKey,
  bitsToRaw,
  bitsToValue,
  classifyBits,
  fieldOfBit,
  largestNormal,
  smallestSubnormal,
  valueToBits,
} from '@/lib/float';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import type { CSSProperties } from 'react';
import { useCallback, useMemo, useState } from 'react';

/**
 * FloatExploder (spec 9.2) — toggle the raw bits of an IEEE-754 number and watch
 * its value recompute, then switch FP32 / FP16 / BF16 on the *same* value to feel
 * how BF16 keeps FP32's range while shedding mantissa precision, and how FP16
 * trades range for finer mantissa.
 *
 * Self-contained: renders standalone with zero required props.
 */

type FieldKind = 'sign' | 'exponent' | 'mantissa';

const FIELD_COLOR: Record<FieldKind, string> = {
  sign: COLOR.activeHot,
  exponent: COLOR.modelAccent,
  mantissa: COLOR.hwAccent,
};

const FIELD_LABEL: Record<FieldKind, string> = {
  sign: 'sign',
  exponent: 'exponent',
  mantissa: 'mantissa',
};

interface Preset {
  label: string;
  value: number;
}

function presetsFor(format: FloatFormat): Preset[] {
  return [
    { label: '0.1', value: 0.1 },
    { label: '1 / 3', value: 1 / 3 },
    { label: 'max normal', value: largestNormal(format) },
    { label: 'min subnormal', value: smallestSubnormal(format) },
  ];
}

function formatValue(bits: number[], format: FloatFormat): string {
  const cls = classifyBits(bits, format);
  if (cls === 'nan') return 'NaN';
  const value = bitsToValue(bits, format);
  const sign = bits[0] ? '-' : '';
  if (cls === 'infinity') return `${sign}Infinity`;
  if (cls === 'zero') return `${sign}0`;
  // Use a precision wide enough to distinguish the formats.
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e7)) return value.toExponential(6);
  return Number(value.toPrecision(9)).toString();
}

const CLASS_LABEL: Record<ReturnType<typeof classifyBits>, string> = {
  normal: 'normal',
  subnormal: 'subnormal',
  zero: 'zero',
  infinity: 'infinity',
  nan: 'not a number',
};

export interface FloatExploderProps {
  /** Initial format. */
  initialFormat?: FormatKey;
  /** Initial numeric value to encode. */
  initialValue?: number;
  className?: string;
}

export function FloatExploder({
  initialFormat = 'fp32',
  initialValue = 0.15625,
  className = '',
}: FloatExploderProps) {
  const reduced = usePrefersReducedMotion();
  const [formatKey, setFormatKey] = useState<FormatKey>(initialFormat);
  const format = FORMATS[formatKey];
  const [bits, setBits] = useState<number[]>(() =>
    valueToBits(initialValue, FORMATS[initialFormat]),
  );

  const toggleBit = useCallback((index: number) => {
    setBits((prev) => {
      const next = prev.slice();
      next[index] = next[index] ? 0 : 1;
      return next;
    });
  }, []);

  const switchFormat = useCallback(
    (key: FormatKey) => {
      if (key === formatKey) return;
      // Keep the current numeric value and re-encode into the new format.
      const value = bitsToValue(bits, format);
      setFormatKey(key);
      setBits(valueToBits(value, FORMATS[key]));
    },
    [bits, format, formatKey],
  );

  const loadPreset = useCallback(
    (value: number) => {
      setBits(valueToBits(value, format));
    },
    [format],
  );

  const valueString = useMemo(() => formatValue(bits, format), [bits, format]);
  const cls = useMemo(() => classifyBits(bits, format), [bits, format]);
  const rawHex = useMemo(() => {
    const hexDigits = Math.ceil(format.totalBits / 4);
    return `0x${(bitsToRaw(bits) >>> 0).toString(16).toUpperCase().padStart(hexDigits, '0')}`;
  }, [bits, format]);

  const presets = useMemo(() => presetsFor(format), [format]);

  const transition: CSSProperties = reduced
    ? {}
    : { transition: 'background-color 120ms, color 120ms' };

  return (
    <section
      className={`flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 text-ink ${className}`}
      aria-label="IEEE-754 float bit explorer"
    >
      {/* Format switcher */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Number format">
        <span className="text-xs uppercase tracking-wide text-faint">Format</span>
        {FORMAT_ORDER.map((key) => {
          const active = key === formatKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => switchFormat(key)}
              aria-pressed={active}
              className="rounded-md border px-3 py-1 font-mono text-sm focus-visible:outline-none"
              style={{
                borderColor: active ? COLOR.active : COLOR.border,
                backgroundColor: active ? withAlpha(COLOR.active, 0.18) : 'transparent',
                color: active ? COLOR.active : COLOR.muted,
                ...transition,
              }}
            >
              {FORMATS[key].label}
            </button>
          );
        })}
      </div>

      {/* Bit grid */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label={`${format.label} bits`}>
          {bits.map((bit, index) => {
            const kind = fieldOfBit(index, format);
            const hue = FIELD_COLOR[kind];
            const on = bit === 1;
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleBit(index)}
                aria-label={`${FIELD_LABEL[kind]} bit ${index}, value ${bit}`}
                aria-pressed={on}
                title={`${FIELD_LABEL[kind]} bit ${index}`}
                className="h-9 w-7 rounded font-mono text-sm tabular-nums focus-visible:outline-none"
                style={{
                  border: `1px solid ${hue}`,
                  backgroundColor: on ? withAlpha(hue, 0.32) : withAlpha(hue, 0.06),
                  color: on ? COLOR.ink : COLOR.faint,
                  ...transition,
                }}
              >
                {bit}
              </button>
            );
          })}
        </div>

        {/* Field legend / delineation */}
        <div className="flex flex-wrap gap-3 text-xs">
          {(['sign', 'exponent', 'mantissa'] as FieldKind[]).map((kind) => {
            const range = format.fields[kind];
            const count = range.end - range.start + 1;
            return (
              <span key={kind} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{
                    backgroundColor: withAlpha(FIELD_COLOR[kind], 0.5),
                    border: `1px solid ${FIELD_COLOR[kind]}`,
                  }}
                />
                <span style={{ color: FIELD_COLOR[kind] }}>{FIELD_LABEL[kind]}</span>
                <span className="text-faint">
                  ({count} bit{count === 1 ? '' : 's'})
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Live value readout */}
      <div className="flex flex-col gap-1 rounded-md border border-border bg-bg p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-faint">Value</span>
          <span className="font-mono text-xs text-muted">{rawHex}</span>
        </div>
        <output
          className="break-all font-mono text-2xl"
          style={{ color: cls === 'nan' || cls === 'infinity' ? COLOR.activeHot : COLOR.active }}
        >
          {valueString}
        </output>
        <span className="text-xs text-muted">
          {format.label} · {CLASS_LABEL[cls]}
        </span>
      </div>

      {/* Presets */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Load preset value"
      >
        <span className="text-xs uppercase tracking-wide text-faint">Load</span>
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => loadPreset(preset.value)}
            className="rounded-md border border-border px-3 py-1 font-mono text-sm text-muted focus-visible:outline-none hover:text-ink"
            style={transition}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default FloatExploder;
