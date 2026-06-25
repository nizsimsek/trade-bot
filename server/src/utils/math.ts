export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
