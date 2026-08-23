'use client';

import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/theme';

// Carga Leaflet desde CDN una sola vez (sin dependencia npm, sin API key).
let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('no window');
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    // CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    // JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => {
      leafletPromise = null;
      reject(new Error('No se pudo cargar Leaflet'));
    };
    document.body.appendChild(script);
  });
  return leafletPromise;
}

export interface LatLng { lat: number; lng: number; }
export interface MapTerritory {
  id: string;
  name: string;
  number?: number | null;
  color?: string | null;
  coordinates?: LatLng[];
}

interface Props {
  territories: MapTerritory[];
  selectedId: string | null;
  drawing: boolean;
  draftCoords: LatLng[];
  draftColor: string;
  onMapClick: (ll: LatLng) => void;
  onSelect: (id: string) => void;
  center?: [number, number];
  boundary?: LatLng[] | null;
  drawingBoundary?: boolean;
}

// Pátzcuaro, Michoacán por defecto (congregación La Estación).
const DEFAULT_CENTER: [number, number] = [19.5126, -101.6093];

// Tiles según tema (CartoDB Dark Matter en modo oscuro).
const TILES = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO',
  },
};

export default function TerritoryMap({
  territories, selectedId, drawing, draftCoords, draftColor, onMapClick, onSelect, center,
  boundary, drawingBoundary,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const savedLayerRef = useRef<any>(null);
  const draftLayerRef = useRef<any>(null);
  const boundaryLayerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const { mode } = useTheme();
  const isDark = mode === 'dark';

  // Refs para handlers/props frescos dentro del closure de Leaflet.
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const darkRef = useRef(isDark);
  darkRef.current = isDark;

  // Montaje: crear mapa.
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        tap: false, // Evita que Leaflet bloquee eventos táctiles/clicks en iPadOS
      }).setView(center || DEFAULT_CENTER, 14);
      const tiles = darkRef.current ? TILES.dark : TILES.light;
      tileLayerRef.current = L.tileLayer(tiles.url, {
        attribution: tiles.attribution,
        maxZoom: 19,
      }).addTo(map);
      boundaryLayerRef.current = L.layerGroup().addTo(map);
      savedLayerRef.current = L.layerGroup().addTo(map);
      draftLayerRef.current = L.layerGroup().addTo(map);
      map.on('click', (e: any) => {
        if (drawingRef.current) clickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      mapRef.current = map;
      readyRef.current = true;

      // Observador de redimensionamiento para rotación de iPad y reacomodo de pantalla
      if (containerRef.current && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize();
          }
        });
        resizeObserver.observe(containerRef.current);
      }

      // Forzar redibujo inicial
      setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 150);
      drawBoundary();
      drawSaved();
      drawDraft();
    });
    return () => {
      cancelled = true;
      if (resizeObserver) resizeObserver.disconnect();
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; readyRef.current = false; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capa no interactiva del límite de la congregación (polígono gris punteado).
  function drawBoundary() {
    const L = (window as any).L;
    if (!L || !boundaryLayerRef.current) return;
    boundaryLayerRef.current.clearLayers();
    const coords = (boundary || []).map((c) => [c.lat, c.lng]) as [number, number][];
    if (coords.length >= 3) {
      L.polygon(coords, {
        color: '#6b7280',
        weight: 2,
        dashArray: '8,6',
        fillOpacity: 0.05,
        interactive: false,
      }).bindTooltip('Límite de la congregación', { sticky: false, permanent: false })
        .addTo(boundaryLayerRef.current);
    }
    // Draw draft boundary vertices while in boundary drawing mode.
    if (drawingBoundary && draftCoords.length) {
      const lls = draftCoords.map((c) => [c.lat, c.lng]) as [number, number][];
      draftCoords.forEach((c, i) => {
        L.circleMarker([c.lat, c.lng], { radius: 4, color: '#6b7280', fillColor: '#fff', fillOpacity: 1, interactive: false })
          .bindTooltip(String(i + 1)).addTo(boundaryLayerRef.current);
      });
      if (lls.length >= 3) {
        L.polygon(lls, { color: '#6b7280', weight: 2, dashArray: '8,6', fillOpacity: 0.08, interactive: false }).addTo(boundaryLayerRef.current);
      } else if (lls.length === 2) {
        L.polyline(lls, { color: '#6b7280', weight: 2, dashArray: '8,6', interactive: false }).addTo(boundaryLayerRef.current);
      }
    }
  }

  // Redibujar territorios guardados.
  function drawSaved() {
    const L = (window as any).L;
    if (!L || !savedLayerRef.current) return;
    savedLayerRef.current.clearLayers();
    const bounds: any[] = [];
    for (const t of territories) {
      const coords = (t.coordinates || []).map((c) => [c.lat, c.lng]) as [number, number][];
      if (coords.length < 3) continue;
      const isSel = t.id === selectedId;
      const poly = L.polygon(coords, {
        color: t.color || '#3d7d8e',
        weight: isSel ? 4 : 2,
        fillOpacity: isSel ? 0.45 : 0.25,
      });
      poly.on('click', (e: any) => { L.DomEvent.stop(e); selectRef.current(t.id); });
      poly.bindTooltip(`${t.number != null ? t.number + '. ' : ''}${t.name}`, { sticky: true });
      poly.addTo(savedLayerRef.current);
      if (isSel) bounds.push(...coords);
    }
    if (bounds.length && mapRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }

  // Redibujar borrador (territorio en construcción).
  function drawDraft() {
    const L = (window as any).L;
    if (!L || !draftLayerRef.current) return;
    draftLayerRef.current.clearLayers();
    if (!draftCoords.length) return;
    const latlngs = draftCoords.map((c) => [c.lat, c.lng]) as [number, number][];
    draftCoords.forEach((c, i) => {
      L.circleMarker([c.lat, c.lng], { radius: 5, color: draftColor, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(String(i + 1)).addTo(draftLayerRef.current);
    });
    if (latlngs.length >= 3) {
      L.polygon(latlngs, { color: draftColor, weight: 2, dashArray: '5,5', fillOpacity: 0.2 }).addTo(draftLayerRef.current);
    } else if (latlngs.length === 2) {
      L.polyline(latlngs, { color: draftColor, weight: 2, dashArray: '5,5' }).addTo(draftLayerRef.current);
    }
  }

  // Cambiar tiles en vivo al alternar tema claro/oscuro.
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || !tileLayerRef.current) return;
    mapRef.current.removeLayer(tileLayerRef.current);
    const tiles = isDark ? TILES.dark : TILES.light;
    tileLayerRef.current = L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: 19 }).addTo(mapRef.current);
  }, [isDark]);

  useEffect(() => { if (readyRef.current) drawBoundary(); /* eslint-disable-next-line */ }, [boundary, drawingBoundary, draftCoords]);
  useEffect(() => { if (readyRef.current) drawSaved(); /* eslint-disable-next-line */ }, [territories, selectedId]);
  useEffect(() => { if (readyRef.current) drawDraft(); /* eslint-disable-next-line */ }, [draftCoords, draftColor]);

  // Cursor crosshair en modo dibujo.
  useEffect(() => {
    if (containerRef.current) containerRef.current.style.cursor = drawing ? 'crosshair' : '';
  }, [drawing]);

  return <div ref={containerRef} className="w-full h-full min-h-[300px]" style={{ background: isDark ? '#1a2228' : '#e8eef0' }} />;
}
