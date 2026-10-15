export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export function getPosition(timeoutMs = 20000): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Thiết bị không hỗ trợ định vị."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }),
      (err) => {
        const msg = err.code === err.PERMISSION_DENIED
          ? "Bạn chưa cho phép truy cập vị trí. Vào Cài đặt trình duyệt → Quyền vị trí → Cho phép."
          : err.code === err.TIMEOUT ? "Không lấy được vị trí (quá thời gian). Hãy bật GPS và thử lại."
          : "Không lấy được vị trí. Hãy bật GPS và thử lại.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
