// plain JS helper
export function recomputeDerived(row) {
  const { red, green, blue } = row;
  const avg = (red + green + blue) / 3;
  const intensity = Math.round((avg / 255) * 100);
  const kelvin = 2000 + Math.round((intensity / 100) * 3000);
  return {
    ...row,
    kelvin,
    intensity
  };
}
