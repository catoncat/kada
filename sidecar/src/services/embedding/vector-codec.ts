export function sanitizeVector(values: number[]): number[] {
  return values.map((value) => (Number.isFinite(value) ? value : 0));
}

export function calculateVectorNorm(values: number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

export function normalizeVector(values: number[]): number[] {
  const norm = calculateVectorNorm(values);
  if (norm <= 0) return values;
  return values.map((value) => value / norm);
}

export function toFloat32Buffer(values: number[]): Buffer {
  const sanitized = sanitizeVector(values);
  const floatArray = Float32Array.from(sanitized);
  return Buffer.from(
    floatArray.buffer,
    floatArray.byteOffset,
    floatArray.byteLength,
  );
}

export function fromFloat32Buffer(buffer: Buffer): number[] {
  if (buffer.byteLength % 4 !== 0) {
    throw new Error(`Invalid float32 buffer length: ${buffer.byteLength}`);
  }
  const copied = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return Array.from(new Float32Array(copied));
}
