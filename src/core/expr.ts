/**
 * Tiny arithmetic evaluator for amount fields, so "120+45.5" or "3*250" work like a calculator.
 * Supports + - * / and parentheses. Never uses eval. Returns null on invalid input.
 */
export function evaluate(input: string): number | null {
  const src = input.replace(/[,\s]/g, '');
  if (!src) return null;
  let pos = 0;

  const peek = () => src[pos];
  function number(): number | null {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(pos));
    if (!m) return null;
    pos += m[0].length;
    return Number(m[0]);
  }
  function factor(): number | null {
    if (peek() === '-') {
      pos++;
      const v = factor();
      return v === null ? null : -v;
    }
    if (peek() === '+') {
      pos++;
      return factor();
    }
    if (peek() === '(') {
      pos++;
      const v = expr();
      if (v === null || peek() !== ')') return null;
      pos++;
      return v;
    }
    return number();
  }
  function term(): number | null {
    let v = factor();
    while (v !== null && (peek() === '*' || peek() === '/' || peek() === '×' || peek() === '÷')) {
      const op = src[pos++];
      const r = factor();
      if (r === null) return null;
      if (op === '*' || op === '×') v *= r;
      else {
        if (r === 0) return null;
        v /= r;
      }
    }
    return v;
  }
  function expr(): number | null {
    let v = term();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = src[pos++];
      const r = term();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  const result = expr();
  if (result === null || pos !== src.length || !Number.isFinite(result)) return null;
  return result;
}

/** True when the input contains an operator (i.e. is more than a plain number). */
export const isExpression = (s: string) => /\d\s*[-+*/×÷]\s*[\d(]/.test(s);
