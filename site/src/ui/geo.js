/* Find the city or town from the phone's location, entirely on the device (no lookup service). */
const R = 6371;
function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* coords: { "Calamba": [lat, lng], ... } (town centres). Returns {name, km} or null when too far from all. */
export function nearestLgu(lat, lng, coords, maxKm = 20) {
  let best = null;
  Object.keys(coords || {}).forEach((name) => {
    const d = km([lat, lng], coords[name]);
    if (!best || d < best.km) best = { name, km: d };
  });
  return best && best.km <= maxKm ? best : null;
}

/* Ask the browser for a position. Resolves {lat,lng} or rejects with 'denied' | 'unavailable'. */
export function locate() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('unavailable'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e && e.code === 1 ? 'denied' : 'unavailable')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
}

/* True when the person already allowed location for this site, so we can prefill without a prompt. */
export function locationAllowed() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve(false);
    return navigator.permissions.query({ name: 'geolocation' }).then((s) => s.state === 'granted').catch(() => false);
  } catch (e) { return Promise.resolve(false); }
}
