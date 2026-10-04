import { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Check } from 'lucide-react';

function ensureLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if ((window as any).L) return Promise.resolve((window as any).L);

  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet="true"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', 'true');
      document.head.appendChild(link);
    }
    const existing = document.querySelector('script[data-leaflet="true"]') as HTMLScriptElement;
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).L));
      existing.addEventListener('error', () => reject(new Error('Failed to load map')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.setAttribute('data-leaflet', 'true');
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error('Failed to load map'));
    document.body.appendChild(script);
  });
}

const createCustomPin = (L: any) => {
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
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);

  const initialLat = latitude != null && Number.isFinite(latitude) ? latitude : 32.8872;
  const initialLng = longitude != null && Number.isFinite(longitude) ? longitude : 13.1913;

  useEffect(() => {
    let cancelled = false;

    ensureLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapInstanceRef.current) return;

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
        icon: createCustomPin(L),
        draggable: !readOnly
      }).addTo(map);

      if (!readOnly) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onChange(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
        });

        map.on('click', (e: any) => {
          marker.setLatLng(e.latlng);
          onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
        });
      }

      mapInstanceRef.current = map;
      markerRef.current = marker;
      setMapLoaded(true);
    }).catch(() => {
      if (!cancelled) setGeoError('تعذر تحميل الخريطة. يمكنك الاستمرار بتحديد الموقع عبر GPS.');
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
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
        className="w-full h-64 rounded-xl border border-border shadow-sm overflow-hidden z-0 relative bg-muted flex items-center justify-center"
        style={{ minHeight: '260px' }}
        data-testid="map-container"
      >
        {!mapLoaded && !geoError && (
          <p className="text-xs text-muted-foreground animate-pulse">جارٍ تحميل الخريطة…</p>
        )}
      </div>

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
