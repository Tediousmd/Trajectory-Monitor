import React, { useRef, useMemo, useState } from 'react';
import { Point, PHYSICS_CONSTANTS, SavedTrajectory } from '../types';
import { Wind } from 'lucide-react';
import { calculateTrajectory } from '../services/physicsEngine';

interface GameCanvasProps {
  trajectory: Point[];
  target: Point;
  tankPos: Point;
  onSetTarget: (p: Point) => void;
  impactPoint: Point | null;
  angle: number;
  setAngle: (a: number) => void;
  zoom: number;
  isNight: boolean;
  wind: number;
  setWind: (w: number) => void;
  snapToGrid: boolean;
  savedTrajectories: SavedTrajectory[];
}

interface DragState {
    mode: 'IDLE' | 'PAN' | 'TARGET' | 'KNOB' | 'LABEL' | 'AWAIT_PAN_OR_CLICK';
    startScreen: Point;
    startPan: Point; // Physics units
    activeId?: string;
    hasMoved?: boolean;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  trajectory, 
  target, 
  tankPos, 
  onSetTarget, 
  impactPoint,
  angle,
  setAngle,
  zoom,
  isNight,
  wind,
  setWind,
  snapToGrid,
  savedTrajectories
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Viewport State: Pan Offset in Physics Units
  const [pan, setPan] = useState({ x: 0, y: 0 }); 
  
  // Custom offsets for saved labels (SVG px relative to target)
  const [labelOffsets, setLabelOffsets] = useState<Record<string, Point>>({});

  // Interaction State Machine
  const [dragState, setDragState] = useState<DragState>({ 
      mode: 'IDLE', 
      startScreen: { x: 0, y: 0 }, 
      startPan: { x: 0, y: 0 } 
  });

  // --- Viewport Calculations ---
  // Apply Zoom and Pan to the viewing range
  // Zoom scales the range size, Pan shifts the window
  const currentMinX = (PHYSICS_CONSTANTS.MIN_X * zoom) + pan.x;
  const currentMaxX = (PHYSICS_CONSTANTS.MAX_X * zoom) + pan.x;
  const currentMinY = (PHYSICS_CONSTANTS.MIN_Y * zoom) + pan.y;
  const currentMaxY = (PHYSICS_CONSTANTS.MAX_Y * zoom) + pan.y;

  const currentWidth = currentMaxX - currentMinX;
  const currentHeight = currentMaxY - currentMinY;

  // Fixed SVG Resolution
  const PIXELS_PER_UNIT = 40; 
  const VIEWBOX_WIDTH = currentWidth * PIXELS_PER_UNIT; 
  const VIEWBOX_HEIGHT = currentHeight * PIXELS_PER_UNIT;
  
  const toSvg = (p: Point) => {
    const percentX = (p.x - currentMinX) / currentWidth;
    const percentY = (p.y - currentMinY) / currentHeight;
    return {
        x: percentX * VIEWBOX_WIDTH,
        y: VIEWBOX_HEIGHT - (percentY * VIEWBOX_HEIGHT)
    };
  };

  const fromSvg = (svgX: number, svgY: number): Point => {
    const percentX = svgX / VIEWBOX_WIDTH;
    const percentY = (VIEWBOX_HEIGHT - svgY) / VIEWBOX_HEIGHT; 
    return {
        x: currentMinX + percentX * currentWidth,
        y: currentMinY + percentY * currentHeight
    };
  };

  // Accurate SVG point from screen coordinates
  const getSvgPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    let point = new DOMPoint(clientX, clientY);
    const matrix = svgRef.current.getScreenCTM();
    if (matrix) {
        point = point.matrixTransform(matrix.inverse());
    }
    return { x: point.x, y: point.y };
  };

  const pointsToPath = (pts: Point[]) => {
      if (pts.length === 0) return '';
      const start = toSvg(pts[0]);
      let path = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const p = toSvg(pts[i]);
        path += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }
      return path;
  };

  const trajectoryPath = useMemo(() => pointsToPath(trajectory), [trajectory, currentMinX, currentMinY, zoom, pan]); 

  // --- Saved Data Preparation ---
  // Pre-calculate positions for rendering and hit-testing
  const savedData = useMemo(() => {
    return savedTrajectories.filter(t => t.visible).map((t, i) => {
       const points = calculateTrajectory(tankPos, t.power, t.angle, t.wind);
       const d = pointsToPath(points);
       const targetSvg = toSvg(t.target);
       
       const dx = (t.target.x - tankPos.x).toFixed(1);
       const dy = (t.target.y - tankPos.y).toFixed(1);

       // Default Stacked Offset (upwards)
       const defaultOffset = { x: 0, y: -(45 + (i % 5) * 80) };
       
       // Use manual offset if available, else default
       const offset = labelOffsets[t.id] || defaultOffset;
       
       const labelPos = {
           x: targetSvg.x + offset.x,
           y: targetSvg.y + offset.y
       };

       return { 
           id: t.id, 
           d, 
           power: t.power,
           angle: t.angle, 
           wind: t.wind, 
           dx, dy, 
           targetPos: targetSvg,
           labelPos,
           offset // Store relative offset
       };
    });
  }, [savedTrajectories, tankPos, zoom, currentMinX, currentMinY, labelOffsets]);

  // --- Interaction Handlers ---

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    (e.target as Element).setPointerCapture(e.pointerId);

    const { x: clickX, y: clickY } = getSvgPoint(e.clientX, e.clientY);
    const screenPt = { x: e.clientX, y: e.clientY };
    
    // 1. Check Angle Knob
    const tankSvg = toSvg(tankPos);
    const knobRadius = 80;
    const rad = (angle * Math.PI) / 180;
    const knobX = tankSvg.x + knobRadius * Math.cos(rad); 
    const knobY = tankSvg.y - knobRadius * Math.sin(rad); 
    if (Math.hypot(clickX - knobX, clickY - knobY) < 30) {
        setDragState({ mode: 'KNOB', startScreen: screenPt, startPan: pan });
        return;
    }

    // 2. Check Saved Labels (Top-most first)
    // Reverse iterate to catch top-most visual elements first
    for (let i = savedData.length - 1; i >= 0; i--) {
        const item = savedData[i];
        // Rect hit test (110x70 centered at labelPos)
        if (
            clickX >= item.labelPos.x - 55 && clickX <= item.labelPos.x + 55 &&
            clickY >= item.labelPos.y - 35 && clickY <= item.labelPos.y + 35
        ) {
            setDragState({ 
                mode: 'LABEL', 
                startScreen: screenPt, 
                startPan: pan, 
                activeId: item.id
            });
            return;
        }
    }

    // 3. Check Active Target
    const targetSvg = toSvg(target);
    if (Math.hypot(clickX - targetSvg.x, clickY - targetSvg.y) < 30) {
        setDragState({ mode: 'TARGET', startScreen: screenPt, startPan: pan });
        return;
    }

    // 4. Background -> Pan or Click
    setDragState({ 
        mode: 'AWAIT_PAN_OR_CLICK', 
        startScreen: screenPt, 
        startPan: pan,
        hasMoved: false
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const { x: pointerX, y: pointerY } = getSvgPoint(e.clientX, e.clientY);
    
    // Calculate screen deltas
    const dxScreen = e.clientX - dragState.startScreen.x;
    const dyScreen = e.clientY - dragState.startScreen.y;

    if (dragState.mode === 'KNOB') {
        const tankSvg = toSvg(tankPos);
        // Angle calc
        let newAngle = Math.atan2(-(pointerY - tankSvg.y), (pointerX - tankSvg.x)) * (180 / Math.PI);
        if (newAngle < 0) newAngle += 360;
        if (newAngle > 180) newAngle = 180; 
        setAngle(Math.round(newAngle));

    } else if (dragState.mode === 'LABEL' && dragState.activeId) {
        // Find the target associated with this label to calculate relative offset
        const associatedTraj = savedTrajectories.find(t => t.id === dragState.activeId);
        if (associatedTraj) {
            const targetSvg = toSvg(associatedTraj.target);
            // Snap center of label to cursor
            setLabelOffsets(prev => ({
                ...prev,
                [dragState.activeId!]: {
                    x: pointerX - targetSvg.x,
                    y: pointerY - targetSvg.y
                }
            }));
        }

    } else if (dragState.mode === 'TARGET') {
        const physicsPoint = fromSvg(pointerX, pointerY);
        let clampedX = Math.max(currentMinX, Math.min(physicsPoint.x, currentMaxX));
        let clampedY = Math.max(currentMinY, Math.min(physicsPoint.y, currentMaxY));
        if (snapToGrid) {
            clampedX = Math.round(clampedX);
            clampedY = Math.round(clampedY);
        }
        onSetTarget({ x: clampedX, y: clampedY });

    } else if (dragState.mode === 'PAN' || (dragState.mode === 'AWAIT_PAN_OR_CLICK' && Math.hypot(dxScreen, dyScreen) > 5)) {
        // Transition to PAN mode if threshold exceeded
        if (dragState.mode === 'AWAIT_PAN_OR_CLICK') {
            setDragState(prev => ({ ...prev, mode: 'PAN', hasMoved: true }));
        }
        
        // Pan Logic: Convert Screen Pixels to Physics Units
        // Get scale factor from CTM (Screen px / SVG px)
        const ctm = svgRef.current?.getScreenCTM();
        const scaleX = ctm ? ctm.a : 1; 
        
        // Physics Delta = Screen Delta / (Scale * PixelsPerUnit)
        // Dragging Right (positive dx) -> Move Camera Left (decrease minX) -> decrease pan
        // So we subtract dx
        const dxPhys = -dxScreen / (PIXELS_PER_UNIT * scaleX);
        const dyPhys = dyScreen / (PIXELS_PER_UNIT * scaleX); // Y inverted for physics
        
        setPan({
            x: dragState.startPan.x + dxPhys,
            y: dragState.startPan.y + dyPhys
        });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    
    // If we clicked background without moving much, treat as Set Target
    if (dragState.mode === 'AWAIT_PAN_OR_CLICK' && !dragState.hasMoved) {
        const { x, y } = getSvgPoint(e.clientX, e.clientY);
        const physicsPoint = fromSvg(x, y);
        let clampedX = Math.max(currentMinX, Math.min(physicsPoint.x, currentMaxX));
        let clampedY = Math.max(currentMinY, Math.min(physicsPoint.y, currentMaxY));
        if (snapToGrid) {
            clampedX = Math.round(clampedX);
            clampedY = Math.round(clampedY);
        }
        onSetTarget({ x: clampedX, y: clampedY });
    }
    
    setDragState({ mode: 'IDLE', startScreen: {x:0, y:0}, startPan: {x:0, y:0} });
  };

  const tankSvg = toSvg(tankPos);
  const targetSvg = toSvg(target);
  const impactSvg = impactPoint ? toSvg(impactPoint) : null;

  const dx = Math.abs(target.x - tankPos.x).toFixed(2);
  const dy = (target.y - tankPos.y).toFixed(2); 

  // Generate Grid Lines
  const gridLines = useMemo(() => {
    const lines = [];
    const startX = Math.floor(currentMinX);
    const endX = Math.ceil(currentMaxX);
    const startY = Math.floor(currentMinY);
    const endY = Math.ceil(currentMaxY);

    const baseColor = isNight ? "#1e293b" : "#e2e8f0";
    const highlightColor = isNight ? "#64748b" : "#94a3b8";
    const axisColor = isNight ? "#94a3b8" : "#475569"; 
    const minorColor = isNight ? "rgba(51, 65, 85, 0.4)" : "rgba(203, 213, 225, 0.6)";
    const textColor = isNight ? "#64748b" : "#94a3b8";

    for (let i = startX; i <= endX; i++) {
        const p = toSvg({ x: i, y: 0 }); 
        const x = p.x;
        if (x < -1 || x > VIEWBOX_WIDTH + 1) continue;
        const isAxis = i === 0;
        const isMajor = i !== 0 && i % 12 === 0; 
        
        lines.push(
            <line 
                key={`v-${i}`} 
                x1={x} y1={0} x2={x} y2={VIEWBOX_HEIGHT} 
                stroke={isAxis ? axisColor : (isMajor ? highlightColor : minorColor)} 
                strokeWidth={isAxis ? "3" : (isMajor ? "2" : "1")} 
                strokeDasharray={isAxis || isMajor ? "" : "4,2"}
            />
        );
        
        lines.push(
            <text 
                key={`tv-${i}`} 
                x={x + 4} 
                y={VIEWBOX_HEIGHT - 10} 
                fill={isAxis ? axisColor : textColor} 
                fontSize={isAxis ? "20" : (isMajor ? "18" : "14")}
                fontWeight={isAxis || isMajor ? "bold" : "normal"}
                opacity={isAxis || isMajor ? 1 : 0.7}
            >
                {i}
            </text>
        );
    }

    for (let i = startY; i <= endY; i++) {
        const p = toSvg({ x: 0, y: i }); 
        const y = p.y;
        if (y < -1 || y > VIEWBOX_HEIGHT + 1) continue;
        const isAxis = i === 0;
        const isMajor = i !== 0 && i % 6 === 0;

        lines.push(
            <line 
                key={`h-${i}`} 
                x1={0} y1={y} x2={VIEWBOX_WIDTH} y2={y} 
                stroke={isAxis ? axisColor : (isMajor ? highlightColor : minorColor)} 
                strokeWidth={isAxis ? "3" : (isMajor ? "2" : "1")} 
                strokeDasharray={isAxis || isMajor ? "" : "4,2"}
            />
        );
        
        lines.push(
            <text 
                key={`th-${i}`} 
                x={10} 
                y={y - 4} 
                fill={isAxis ? axisColor : textColor} 
                fontSize={isAxis ? "20" : (isMajor ? "18" : "14")}
                fontWeight={isAxis || isMajor ? "bold" : "normal"}
                opacity={isAxis || isMajor ? 1 : 0.7}
            >
                {i}
            </text>
        );
    }
    return lines;
  }, [currentMinX, currentMaxX, currentMinY, currentMaxY, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, isNight, toSvg]);

  const knobRadius = 80; 
  const knobRad = (angle * Math.PI) / 180;
  const knobHandleX = tankSvg.x + knobRadius * Math.cos(knobRad);
  const knobHandleY = tankSvg.y - knobRadius * Math.sin(knobRad);

  return (
    <div className={`relative w-full h-full ${isNight ? 'bg-slate-900' : 'bg-slate-50'} transition-colors duration-500 rounded-xl overflow-hidden select-none`}>
      {/* Top Center Wind Control Widget */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur p-4 rounded-xl border border-slate-600 shadow-xl flex flex-col items-center w-72 z-20">
        <div className="text-xs font-bold text-slate-300 mb-2 w-full flex justify-between items-center">
            <span className="text-[10px] text-slate-500">WEST</span>
            <span className={`flex items-center gap-1 ${wind === 0 ? 'text-slate-400' : wind > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                <Wind size={12} />
                WIND: {Math.abs(wind).toFixed(1)}
            </span>
            <span className="text-[10px] text-slate-500">EAST</span>
        </div>
        <div className="flex items-center w-full gap-2">
            <button onClick={() => setWind(Number((wind - 0.5).toFixed(1)))} className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-lg">-</button>
            <div className="relative flex-1 h-6 flex items-center mx-1">
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-400 z-0"></div>
                <input type="range" min="-150" max="150" step="0.5" value={wind} onChange={(e) => setWind(Number(e.target.value))} className="w-full h-2 bg-slate-700/50 rounded-lg appearance-none cursor-pointer accent-sky-400 z-10 relative"/>
            </div>
            <button onClick={() => setWind(Number((wind + 0.5).toFixed(1)))} className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-lg">+</button>
        </div>
      </div>

      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h2 className={`text-xs font-bold ${isNight ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-widest`}>Curve Analysis View</h2>
        <div className={`text-[10px] ${isNight ? 'text-slate-600' : 'text-slate-400'}`}>
            X: {currentMinX.toFixed(0)} to {currentMaxX.toFixed(0)} | Y: {currentMinY.toFixed(0)} to {currentMaxY.toFixed(0)}
        </div>
      </div>
      
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className={`w-full h-full block touch-none ${
            dragState.mode === 'PAN' ? 'cursor-grabbing' : 
            dragState.mode === 'LABEL' ? 'cursor-move' : 
            dragState.mode === 'TARGET' ? 'cursor-crosshair' : 
            dragState.mode === 'KNOB' ? 'cursor-grab' : 'cursor-grab'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
            {/* Arrow Marker for Label Pointers */}
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" fill="#a855f7" />
            </marker>
        </defs>

        {/* Grid Lines */}
        {gridLines}

        {/* Saved Trajectories and Labels */}
        {savedData.map((sd) => (
            <g key={sd.id}>
                {/* Curve */}
                <path d={sd.d} fill="none" stroke="#a855f7" strokeWidth="2" strokeDasharray="5,5" className="opacity-60" />
                
                {/* Saved Target Marker */}
                <g transform={`translate(${sd.targetPos.x}, ${sd.targetPos.y})`}>
                     {/* Purple Bold Circle for saved target */}
                     <circle r="6" fill="none" stroke="#a855f7" strokeWidth="3" />
                     <circle r="2" fill="#a855f7" />
                </g>

                {/* Connecting Arrow (From Label Center to Target) */}
                <line 
                    x1={sd.labelPos.x} y1={sd.labelPos.y} 
                    x2={sd.targetPos.x} y2={sd.targetPos.y} 
                    stroke="#a855f7" strokeWidth="1.5" 
                    strokeDasharray="4,2"
                    markerEnd="url(#arrow)"
                    opacity="0.8"
                />

                {/* Draggable Label Box */}
                <g transform={`translate(${sd.labelPos.x}, ${sd.labelPos.y})`} className="cursor-move"> 
                    {/* Box */}
                    <rect 
                        x="-55" y="-35" width="110" height="70" rx="4" 
                        fill={isNight ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)"} 
                        stroke="#a855f7" strokeWidth="2" 
                    />
                    
                    {/* Power & Angle - Round Font */}
                    <text x="0" y="-18" textAnchor="middle" fill="#a855f7" fontSize="12" fontWeight="bold" fontFamily="'Varela Round', sans-serif" className="pointer-events-none select-none">
                        P: {sd.power.toFixed(1)} • A: {sd.angle}°
                    </text>
                    
                    {/* Coords - Round Font (No Monospace) */}
                    <text x="0" y="2" textAnchor="middle" fill={isNight ? "#e2e8f0" : "#1e293b"} fontSize="14" fontWeight="bold" fontFamily="'Varela Round', sans-serif" className="pointer-events-none select-none">
                        ({sd.dx}, {sd.dy})
                    </text>
                    
                    {/* Wind - Round Font */}
                    <text x="0" y="20" textAnchor="middle" fill={isNight ? "#10b981" : "#059669"} fontSize="11" fontWeight="bold" fontFamily="'Varela Round', sans-serif" className="pointer-events-none select-none">
                        Wind: {sd.wind}
                    </text>
                </g>
            </g>
        ))}

        {/* Active Trajectory */}
        <path d={trajectoryPath} fill="none" stroke={isNight ? "#38bdf8" : "#0284c7"} strokeWidth="4" strokeDasharray="10,10" className="opacity-80" />

        {/* Angle Indicator */}
        <g className="cursor-pointer" style={{ pointerEvents: 'none' }}> 
            <path d={`M ${tankSvg.x - knobRadius} ${tankSvg.y} A ${knobRadius} ${knobRadius} 0 0 1 ${tankSvg.x + knobRadius} ${tankSvg.y}`} fill="none" stroke={isNight ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} strokeWidth="2" strokeDasharray="4,4"/>
            <line x1={tankSvg.x} y1={tankSvg.y} x2={knobHandleX} y2={knobHandleY} stroke={isNight ? "#38bdf8" : "#0284c7"} strokeWidth="4" />
            <circle cx={knobHandleX} cy={knobHandleY} r={dragState.mode === 'KNOB' ? 12 : 8} fill={isNight ? "#38bdf8" : "#0284c7"} stroke="white" strokeWidth="2" className="transition-all duration-100 ease-in-out hover:r-12 pointer-events-auto"/>
            <text x={knobHandleX + 15} y={knobHandleY - 15} fill={isNight ? "#38bdf8" : "#0284c7"} fontSize="16" fontWeight="bold">{angle}°</text>
        </g>

        {/* Tank / Player (At Origin) */}
        <circle cx={tankSvg.x} cy={tankSvg.y} r="15" fill={isNight ? "#e2e8f0" : "#475569"} stroke={isNight ? "#475569" : "#1e293b"} strokeWidth="4" />
        <text x={tankSvg.x + 20} y={tankSvg.y - 20} textAnchor="start" fill={isNight ? "white" : "#1e293b"} fontSize="20" fontWeight="bold">YOU (0,0)</text>

        {/* Target Marker */}
        <g transform={`translate(${targetSvg.x}, ${targetSvg.y})`}>
          <circle r="20" fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" strokeWidth="2" className="animate-pulse" />
          <line x1="-25" y1="0" x2="25" y2="0" stroke="#ef4444" strokeWidth="2" />
          <line x1="0" y1="-25" x2="0" y2="25" stroke="#ef4444" strokeWidth="2" />
          <text x="0" y="-35" textAnchor="middle" fill="#ef4444" fontSize="20" fontWeight="bold">TARGET</text>
          
          {/* Info Label - Redesigned */}
          <rect x="-70" y="-95" width="140" height="50" rx="6" fill={isNight ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.9)"} stroke={isNight ? "#334155" : "#cbd5e1"} strokeWidth="1" />
          {/* Coordinate tuple - Round Font */}
          <text x="0" y="-75" textAnchor="middle" fill={isNight ? "#e2e8f0" : "#1e293b"} fontSize="16" fontWeight="bold" fontFamily="'Varela Round', sans-serif">
              ({dx}, {dy})
          </text>
          {/* Wind Info in Green - Round Font */}
          <text x="0" y="-57" textAnchor="middle" fill={isNight ? "#10b981" : "#059669"} fontSize="12" fontWeight="bold" fontFamily="'Varela Round', sans-serif">
              Wind: {wind}
          </text>
        </g>

        {/* Impact Point */}
        {impactSvg && (
             <circle cx={impactSvg.x} cy={impactSvg.y} r="8" fill="#fbbf24" stroke="white" strokeWidth="1" />
        )}
      </svg>
    </div>
  );
};

export default GameCanvas;