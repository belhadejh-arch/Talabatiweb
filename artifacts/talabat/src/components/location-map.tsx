import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin, Check } from 'lucide-react';

// Custom SVG pin marker to avoid missing Leaflet icon images
const createCustomPin = () => {
  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center;">
      <div style="background-color: #e11d48; color: white; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2px solid white;">
        <div style="width: 10px; height: 10px; background-color: white; border-radius: 50%;"></div>
      </div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
};

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  label?: string;
  readOnly?: boolean;
}

export default function LocationPickerMap({
  latitude,
  longitude,
  onChange,
  label = 'موقع التوصيل على الخريطة',
  readOnly = false
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  // Default coordinate: Tripoli, Libya (32.8872, 13.1913) if none provided
  const initialLat = latitude != null && Number.isFinite(latitude) ? latitude : 32.8872;
  const initialLng = longitude != null && Number.isFinite(longitude) ? longitude : 13.1913;

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
      zoom: latitude != null ? 15 : 12,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    L.control.attribution({ position: 'bottomright', prefix: 'OpenStreetMap' }).addTo(map);

    const marker = L.marker([initialLat, initialLng], {
      icon: createCustomPin(),
      draggable: !readOnly
    }).addTo(map);

    if (!readOnly) {
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onChange(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
    }

    mapInstanceRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && latitude != null && longitude != null) {
      const curPos = markerRef.current.getLatLng();
      if (Math.abs(curPos.lat - latitude) > 0.0001 || Math.abs(curPos.lng - longitude) > 0.0001) {
        markerRef.current.setLatLng([latitude, longitude]);
        mapInstanceRef.current.panTo([latitude, longitude], { animate: true });
      }
    }
  }, [latitude, longitude]);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('المتصفح لا يدعم تحديد الموقع.');
      return;
    }
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        onChange(lat, lng);
        if (mapInstanceRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
        }
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === 1 ? 'تم رفض إذن الوصول للموقع. يمكنك النقر على الخريطة لتحديده.' : 'تعذر الحصول على الموقع الجغرافي حالياً.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          <MapPin size={16} className="text-primary"/>
          <span>{label}</span>
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={handleGetCurrentLocation}
            disabled={locating}
            className="btn btn-outline text-xs px-2.5 py-1 flex items-center gap-1.5"
            data-testid="button-map-geolocate"
          >
            <Crosshair size={14} className={locating ? 'animate-spin' : ''} />
            <span>{locating ? 'جارٍ تحديد موقعك...' : 'تحديد موقعي الحالي (GPS)'}</span>
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="w-full h-64 rounded-xl border border-border shadow-sm overflow-hidden z-0 relative"
        style={{ minHeight: '260px' }}
        data-testid="map-container"
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2 pt-1">
        {latitude != null && longitude != null ? (
          <div className="inline-flex items-center gap-1 font-mono text-foreground font-medium" dir="ltr">
            <Check size={13} className="text-green-600 inline" />
            <span>Lat: {latitude.toFixed(5)}, Lng: {longitude.toFixed(5)}</span>
          </div>
        ) : (
          <span className="text-destructive font-medium">لم يتم تحديد إحداثيات الموقع بعد (انقر على الخريطة أو استخدم زر GPS).</span>
        )}
        {!readOnly && <span className="text-muted-foreground">يمكنك النقر أو سحب الدبوس لضبط الموقع بدقة</span>}
      </div>

      {geoError && <p className="text-xs text-destructive mt-1" role="alert">{geoError}</p>}
    </div>
  );
}
