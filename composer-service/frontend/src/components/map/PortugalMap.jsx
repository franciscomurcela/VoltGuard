import { useState, useMemo } from 'react';

// --- High-Resolution Portugal Outline for the Mask ---
const PORTUGAL_PATH = "M58.5,1.5 L65.2,2.1 L72.8,8.5 L85.1,12.3 L92.4,25.6 L88.2,38.9 L95.6,55.2 L92.1,78.4 L98.5,95.1 L105.2,112.4 L95.3,135.6 L102.4,168.2 L90.5,210.1 L95.8,245.3 L88.2,275.4 L75.1,295.2 L45.2,295.2 L32.4,275.1 L15.2,260.4 L18.5,235.2 L32.1,215.4 L25.2,185.1 L38.4,155.6 L32.1,125.4 L45.2,95.1 L42.3,65.4 L55.1,35.2 L52.4,15.1 Z";

// --- Precise District Center Points (aligned to the new high-res path) ---
const DISTRICT_GEOS = [
  { id: 'viana', name: 'Viana do Castelo', cx: 62, cy: 20 },
  { id: 'braga', name: 'Braga', cx: 80, cy: 25 },
  { id: 'vila_real', name: 'Vila Real', cx: 85, cy: 45 },
  { id: 'braganca', name: 'Bragança', cx: 95, cy: 30 },
  { id: 'porto', name: 'Porto', cx: 65, cy: 55 },
  { id: 'aveiro', name: 'Aveiro', cx: 55, cy: 85 },
  { id: 'viseu', name: 'Viseu', cx: 75, cy: 80 },
  { id: 'guarda', name: 'Guarda', cx: 90, cy: 90 },
  { id: 'coimbra', name: 'Coimbra', cx: 58, cy: 115 },
  { id: 'castelo_branco', name: 'Castelo Branco', cx: 85, cy: 135 },
  { id: 'leiria', name: 'Leiria', cx: 45, cy: 145 },
  { id: 'santarem', name: 'Santarém', cx: 55, cy: 175 },
  { id: 'portalegre', name: 'Portalegre', cx: 85, cy: 170 },
  { id: 'lisboa', name: 'Lisboa', cx: 40, cy: 210 },
  { id: 'evora', name: 'Évora', cx: 75, cy: 215 },
  { id: 'setubal', name: 'Setúbal', cx: 45, cy: 235 },
  { id: 'beja', name: 'Beja', cx: 65, cy: 260 },
  { id: 'faro', name: 'Faro', cx: 65, cy: 285 },
];

const GRID_GAP = 3.2; // Space between dots for the stippled effect

export default function PortugalMap({ districts = [], onDistrictClick }) {
  const [hovered, setHovered] = useState(null);

  // 1. Memoize data processing for smooth performance
  const { districtMap, maxRequests } = useMemo(() => {
    const map = new Map(districts.map(d => [d.id.toLowerCase(), d]));
    const max = Math.max(...districts.map(d => d.requests), 1);
    return { districtMap: map, maxRequests: max };
  }, [districts]);

  // 2. Generate the background dot matrix once
  const dotGrid = useMemo(() => {
    const dots = [];
    for (let x = 10; x <= 110; x += GRID_GAP) {
      for (let y = 0; y <= 300; y += GRID_GAP) {
        dots.push({ x, y, id: `dot-${x}-${y}` });
      }
    }
    return dots;
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '600px', background: '#050505', borderRadius: '12px', padding: '20px' }}>
      <svg viewBox="15 0 100 305" style={{ width: '100%', height: '100%' }}>
        <defs>
          {/* MASK: Cuts the dots into the shape of Portugal */}
          <mask id="portugalMask">
            <path d={PORTUGAL_PATH} fill="white" />
          </mask>
          
          {/* GLOW: Makes active dots pop */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* --- Background Dotted Grid --- */}
        <g mask="url(#portugalMask)">
          {dotGrid.map(dot => (
            <rect 
              key={dot.id} 
              x={dot.x} 
              y={dot.y} 
              width="1.4" 
              height="1.4" 
              rx="0.4" 
              fill="#1a1a1a" // Subtle gray dots for empty areas
            />
          ))}
        </g>

        {/* --- Data Layer (Hotspots) --- */}
        {DISTRICT_GEOS.map((geo) => {
          const stats = districtMap.get(geo.id);
          const requests = stats?.requests || 0;
          const isHovered = hovered === geo.id;
          
          const intensity = requests / maxRequests;
          // Blue for low/mid, Red for high activity
          const color = requests > 0 ? (intensity > 0.6 ? '#ef4444' : '#3b82f6') : '#1a1a1a';

          return (
            <g 
              key={geo.id}
              onMouseEnter={() => setHovered(geo.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onDistrictClick?.(geo.id)}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible large target to make hovering easier */}
              <circle cx={geo.cx} cy={geo.cy} r="8" fill="transparent" />

              {/* Pulsing ring for active districts */}
              {requests > 0 && (
                <circle cx={geo.cx} cy={geo.cy} r="4" fill={color} opacity="0.4">
                  <animate attributeName="r" values="2;8;2" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="3s" repeatCount="indefinite" />
                </circle>
              )}

              {/* The Data Point */}
              <circle
                cx={geo.cx}
                cy={geo.cy}
                r={isHovered ? 3.5 : 2.5}
                fill={color}
                filter={isHovered || intensity > 0.8 ? "url(#glow)" : "none"}
                style={{ transition: 'all 0.2s ease' }}
              />
            </g>
          );
        })}
      </svg>

      {/* --- Modern "Glass" Tooltip --- */}
      {hovered && districtMap.has(hovered) && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '12px',
          borderRadius: '8px',
          color: 'white',
          fontFamily: 'sans-serif',
          pointerEvents: 'none',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
        }}>
          <div style={{ fontSize: '10px', opacity: 0.5, letterSpacing: '1px', textTransform: 'uppercase' }}>Region</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{DISTRICT_GEOS.find(d => d.id === hovered).name}</div>
          <div style={{ marginTop: '8px', color: '#3b82f6', fontWeight: 'bold' }}>
            {districtMap.get(hovered).requests.toLocaleString()} Requests
          </div>
        </div>
      )}
    </div>
  );
}
