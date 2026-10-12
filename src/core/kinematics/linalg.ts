// Fixed-size dense linear algebra for 6×6 problems. Row-major Float64Arrays.

export const N = 6;

/** Solve A x = b in place (A and b are overwritten). Partial pivoting. Returns false if singular. */
export function solve6(A: Float64Array, b: Float64Array, x: Float64Array): boolean {
  for (let c = 0; c < N; c++) {
    let piv = c;
    let best = Math.abs(A[c * N + c]);
    for (let r = c + 1; r < N; r++) {
      const v = Math.abs(A[r * N + c]);
      if (v > best) { best = v; piv = r; }
    }
    if (best < 1e-14) return false;
    if (piv !== c) {
      for (let k = 0; k < N; k++) {
        const t = A[c * N + k]; A[c * N + k] = A[piv * N + k]; A[piv * N + k] = t;
      }
      const t = b[c]; b[c] = b[piv]; b[piv] = t;
    }
    const d = A[c * N + c];
    for (let r = c + 1; r < N; r++) {
      const f = A[r * N + c] / d;
      if (f === 0) continue;
      for (let k = c; k < N; k++) A[r * N + k] -= f * A[c * N + k];
      b[r] -= f * b[c];
    }
  }
  for (let r = N - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < N; k++) s -= A[r * N + k] * x[k];
    x[r] = s / A[r * N + r];
  }
  return true;
}

/** Determinant of a 6×6 matrix (copy is made). */
export function det6(M: Float64Array): number {
  const A = M.slice();
  let det = 1;
  for (let c = 0; c < N; c++) {
    let piv = c;
    let best = Math.abs(A[c * N + c]);
    for (let r = c + 1; r < N; r++) {
      const v = Math.abs(A[r * N + c]);
      if (v > best) { best = v; piv = r; }
    }
    if (best < 1e-300) return 0;
    if (piv !== c) {
      det = -det;
      for (let k = 0; k < N; k++) {
        const t = A[c * N + k]; A[c * N + k] = A[piv * N + k]; A[piv * N + k] = t;
      }
    }
    const d = A[c * N + c];
    det *= d;
    for (let r = c + 1; r < N; r++) {
      const f = A[r * N + c] / d;
      for (let k = c; k < N; k++) A[r * N + k] -= f * A[c * N + k];
    }
  }
  return det;
}

/** out = J Jᵀ (6×6). */
export function jjt(J: Float64Array, out: Float64Array) {
  for (let r = 0; r < N; r++) {
    for (let c = r; c < N; c++) {
      let s = 0;
      for (let k = 0; k < N; k++) s += J[r * N + k] * J[c * N + k];
      out[r * N + c] = s;
      out[c * N + r] = s;
    }
  }
  return out;
}
