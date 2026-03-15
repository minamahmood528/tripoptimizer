import { useEffect, useRef, useState } from 'react';
import { MapPin, AlertCircle, Key } from 'lucide-react';
import type { Activity, Accommodation, LatLng } from '../../types';
import { getCategoryIcon } from '../../utils/itinerary';
import { useAuth } from '../../context/AuthContext';
import { useGoogleMaps } from '../../hooks/useGoogleMaps';

interface TripMapProps {
  accommodation: Accommodation;
  activities: Activity[];
  height?: string;
  showRoute?: boolean;
  onMarkerClick?: (activity: Activity) => void;
  onMapIdle?: (center: LatLng) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  tourist: '#7C3AED',
  culture: '#EC4899',
  food: '#F59E0B',
  nightlife: '#6366F1',
  shopping: '#06B6D4',
  outdoor: '#10B981',
  essential: '#EF4444',
};

export default function TripMap({ accommodation, activities, height = '400px', showRoute = true, onMarkerClick, onMapIdle }: TripMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const { user } = useAuth();
  const apiKey = user?.preferences?.googleMapsApiKey ?? '';
  const { isLoaded, isError } = useGoogleMaps(apiKey);
  const [mapError, setMapError] = useState<string | null>(null);

  // Initialise map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google?.maps) return;
    try {
      const center = { lat: accommodation.lat, lng: accommodation.lng };
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 14,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        styles: DARK_MAP_STYLE,
      });
      mapInstanceRef.current = map;
      if (onMapIdle) {
        map.addListener('idle', () => {
          const c = map.getCenter();
          if (c) onMapIdle({ lat: c.lat(), lng: c.lng() });
        });
      }
      setMapError(null);
    } catch (e) {
      setMapError('Failed to load map. Check your API key.');
    }
  }, [isLoaded, accommodation.lat, accommodation.lng, onMapIdle]);

  // Draw markers & route
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;

    // Clear previous
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylineRef.current?.setMap(null);
    infoWindowRef.current?.close();
    infoWindowRef.current = new window.google.maps.InfoWindow();

    const map = mapInstanceRef.current;
    const path: LatLng[] = [{ lat: accommodation.lat, lng: accommodation.lng }];

    // Accommodation marker
    const hotelMarker = new window.google.maps.Marker({
      position: { lat: accommodation.lat, lng: accommodation.lng },
      map,
      title: accommodation.name,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: '#10B981',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
      },
      zIndex: 1000,
    });
    hotelMarker.addListener('click', () => {
      infoWindowRef.current?.setContent(`
        <div style="padding:8px;color:#fff;font-family:Inter,sans-serif">
          <div style="font-size:12px;color:#10B981;font-weight:600;margin-bottom:4px">🏨 ACCOMMODATION</div>
          <div style="font-weight:700;font-size:14px">${accommodation.name}</div>
          <div style="font-size:12px;opacity:0.7;margin-top:4px">${accommodation.address}</div>
        </div>
      `);
      infoWindowRef.current?.open(map, hotelMarker);
    });
    markersRef.current.push(hotelMarker);

    // Activity markers
    activities.forEach((act, i) => {
      const color = CATEGORY_COLORS[act.category] ?? '#7C3AED';
      const position = { lat: act.lat, lng: act.lng };
      path.push(position);

      const marker = new window.google.maps.Marker({
        position,
        map,
        title: act.name,
        label: {
          text: String(i + 1),
          color: '#fff',
          fontSize: '12px',
          fontWeight: '700',
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 100 + i,
      });

      marker.addListener('click', () => {
        infoWindowRef.current?.setContent(`
          <div style="padding:8px;color:#fff;font-family:Inter,sans-serif;max-width:220px">
            <div style="font-size:11px;color:${color};font-weight:600;text-transform:uppercase;margin-bottom:4px">
              ${getCategoryIcon(act.type)} Stop ${i + 1}
            </div>
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">${act.name}</div>
            <div style="display:flex;gap:8px;font-size:12px;opacity:0.8">
              <span>⏱ ${act.durationMin}m</span>
              ${act.distanceFromPrevKm ? `<span>📍 ${act.distanceFromPrevKm}km</span>` : ''}
              <span>${'⭐'.repeat(Math.round(act.rating / 1))} ${act.rating}</span>
            </div>
            ${act.requiresBooking ? `<div style="margin-top:6px;font-size:11px;background:rgba(124,58,237,0.3);padding:3px 8px;border-radius:8px;display:inline-block">📋 Booking required</div>` : ''}
          </div>
        `);
        infoWindowRef.current?.open(map, marker);
        onMarkerClick?.(act);
      });
      markersRef.current.push(marker);
    });

    if (showRoute) {
      // Return-to-hotel path
      path.push({ lat: accommodation.lat, lng: accommodation.lng });

      // Draw polyline route
      polylineRef.current = new window.google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#7C3AED',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        icons: [{
          icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 4 },
          offset: '50%',
          repeat: '80px',
        }],
      });
      polylineRef.current.setMap(map);
    }

    // Fit bounds only when there are activities to show
    if (activities.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }
  }, [isLoaded, activities, accommodation, onMarkerClick, showRoute]);

  if (!apiKey) {
    return (
      <div style={{ height }} className="map-container flex flex-col items-center justify-center bg-white/5 gap-4 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/20 flex items-center justify-center">
          <Key size={28} className="text-violet-400" />
        </div>
        <div>
          <p className="text-white font-semibold mb-1">Google Maps API Key Required</p>
          <p className="text-white/50 text-sm">Add your API key in Profile → Settings to enable interactive maps</p>
        </div>
        <a href="/profile" className="btn-primary text-sm px-4 py-2">Go to Settings →</a>
        {/* Static preview fallback */}
        <div className="w-full mt-4 rounded-2xl overflow-hidden opacity-40">
          <div className="bg-gradient-to-br from-slate-700 to-slate-900 h-32 flex items-center justify-center">
            <MapPin size={40} className="text-violet-400" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || mapError) {
    return (
      <div style={{ height }} className="map-container flex flex-col items-center justify-center bg-white/5 gap-3 p-6 text-center">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-red-400 font-medium">Map failed to load</p>
        <p className="text-white/50 text-sm">Check your Google Maps API key in settings</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{ height }} className="map-container flex items-center justify-center bg-white/5">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Loading map...</p>
        </div>
      </div>
    );
  }

  return <div ref={mapRef} style={{ height }} className="map-container w-full" />;
}

// ─── Dark Map Style ───────────────────────────────────────────────────────────

const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1f35' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a9bb8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f35' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9aa4ba' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c6cfd8' }] },
  { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283148' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#1e3a3a' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4b7f6b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3555' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a45' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8d9db5' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4b7a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2d3d66' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#b0bfd0' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#98a5bc' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#283148' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1b2a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d6685' }] },
];
