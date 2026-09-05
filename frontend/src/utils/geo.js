export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(new Error(err.message || 'Location denied')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}
