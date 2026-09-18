function readCoords(pos) {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

function locationError(err) {
  if (err?.code === 1)
    return new Error('Location permission denied. Enable location for Chrome / this site.');
  if (err?.code === 2)
    return new Error('Location unavailable. Turn on GPS and try again.');
  if (err?.code === 3)
    return new Error('Location timed out. Move closer to a window and try once more.');
  return new Error(err?.message || 'Could not get location');
}

function once(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(readCoords(pos)),
      reject,
      options
    );
  });
}

// Fast network/cached fix first. GPS only if that fails — high-accuracy +
// maximumAge:0 was timing out on indoor phones and forcing several taps.
export async function getPosition() {
  if (!navigator.geolocation)
    throw new Error('Geolocation not supported');

  try {
    return await once({
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60_000,
    });
  } catch (first) {
    if (first?.code === 1) throw locationError(first);
    try {
      return await once({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 15_000,
      });
    } catch (second) {
      throw locationError(second);
    }
  }
}
