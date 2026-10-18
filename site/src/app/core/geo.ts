/* Find the city or town from the phone's location, entirely on the device (no lookup service). */
/* Ask the browser for a position. Resolves {lat,lng} or rejects with 'denied' | 'unavailable'. */
export function locate(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('unavailable'));
    navigator.geolocation.getCurrentPosition(
      (p: GeolocationPosition) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e: GeolocationPositionError) => reject(new Error(e && e.code === 1 ? 'denied' : 'unavailable')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
}

/* True when the person already allowed location for this site, so we can prefill without a prompt. */
export function locationAllowed(): Promise<boolean> {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve(false);
    return navigator.permissions.query({ name: 'geolocation' }).then((s: PermissionStatus) => s.state === 'granted').catch(() => false);
  } catch (e) { return Promise.resolve(false); }
}
