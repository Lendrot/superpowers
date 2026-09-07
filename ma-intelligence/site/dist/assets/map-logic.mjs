export const formatNumber = n => new Intl.NumberFormat('de-DE').format(n);
export const pinSize = zoom => Math.max(12, Math.min(27, 29 - zoom * 1.25));
export const clusterSize = zoom => Math.max(36, Math.min(56, 59 - zoom * 1.8));
export const clusterRadius = zoom => Math.max(28, 80 - zoom * 5);
export const zoomLabel = zoom => zoom < 3 ? 'Weltansicht' : zoom < 6 ? 'Regionen' : zoom < 10 ? 'Städte' : 'Standorte';
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export const normalizeLongitude = longitude => ((longitude + 180) % 360 + 360) % 360 - 180;
export function inBounds(location, bounds) {
  if (location.lat < bounds.south || location.lat > bounds.north) return false;
  if (bounds.east - bounds.west >= 360) return true;
  const lng = normalizeLongitude(location.lon);
  const west = normalizeLongitude(bounds.west);
  const east = normalizeLongitude(bounds.east);
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
}
