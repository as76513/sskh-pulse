// Haversine distance in meters between two lat/lng points.
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // earth radius meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinGeofence(userLat, userLng, officeLat, officeLng, radius) {
  return distanceMeters(userLat, userLng, officeLat, officeLng) <= radius;
}

// Indoor / junction GPS is often 30–150m off. Allow that error so a punch
// at the office is not stored as a miss (admin then shows "absent").
const DEFAULT_SLACK_M = 50;
const MAX_ACCURACY_SLACK_M = 150;

export function geofenceAllowance(radius, accuracy) {
  const r = Number(radius) || 0;
  const acc = Number(accuracy);
  const reported = Number.isFinite(acc) && acc > 0 ? Math.min(acc, MAX_ACCURACY_SLACK_M) : 0;
  return r + Math.max(DEFAULT_SLACK_M, reported);
}
