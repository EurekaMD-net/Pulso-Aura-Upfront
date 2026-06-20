import { describe, expect, it } from 'vitest';
import { isRawToolResultLeak } from './delivery-guard.js';

describe('isRawToolResultLeak', () => {
  it('flags the exact confabulated payload observed in production', () => {
    // The real 2026-06-20 leak — note the "No p se encontró" typo and the
    // `sugerencias` field that no tool produces.
    expect(
      isRawToolResultLeak(
        '{ "error": "No p se encontró la cuenta con nombre \'Bayer de México\'.", "sugerencias": [ "BAYER", "BAYER Mexico" ] }',
      ),
    ).toBe(true);
  });

  it('flags a bare JSON object message', () => {
    expect(
      isRawToolResultLeak(
        '{"error": "No se encontró el nombre \'BAYER Mexico\' en el CRM."}',
      ),
    ).toBe(true);
  });

  it('flags a bare JSON array message', () => {
    expect(
      isRawToolResultLeak('[{"nombre":"BAYER"},{"nombre":"NISSAN"}]'),
    ).toBe(true);
  });

  it('flags JSON with leading/trailing whitespace', () => {
    expect(isRawToolResultLeak('\n  {"cuentas": []}  \n')).toBe(true);
  });

  it('lets a normal natural-language answer through', () => {
    expect(
      isRawToolResultLeak(
        'La cuenta de Bayer aparece como BAYER. ¿Quieres ver su pipeline?',
      ),
    ).toBe(false);
  });

  it('lets prose that merely starts with a brace through', () => {
    // Not valid JSON → not a leak.
    expect(isRawToolResultLeak('{esto no es json, es una nota}')).toBe(false);
  });

  it('lets a message that mentions JSON-looking text through when not pure JSON', () => {
    expect(
      isRawToolResultLeak(
        'El resultado fue {"ok": true}, lo cual significa que sí.',
      ),
    ).toBe(false);
  });

  it('does not flag empty or whitespace-only text', () => {
    expect(isRawToolResultLeak('')).toBe(false);
    expect(isRawToolResultLeak('   ')).toBe(false);
  });

  it('does not flag a bare JSON primitive (not object/array)', () => {
    // A number/string/bool alone is not a tool-result payload shape.
    expect(isRawToolResultLeak('42')).toBe(false);
    expect(isRawToolResultLeak('"hola"')).toBe(false);
  });
});
