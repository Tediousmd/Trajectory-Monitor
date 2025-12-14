import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Point, PHYSICS_CONSTANTS, SavedTrajectory, AnalysisItem } from '../types';
import { Wind, ZoomIn, ZoomOut, Calculator } from 'lucide-react';
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
  setZoom: (z: number) => void;
  isNight: boolean;
  wind: number;
  setWind: (w: number) => void;
  snapToGrid: boolean;
  savedTrajectories: SavedTrajectory[];
  analysisItems?: AnalysisItem[]; // New prop for separately managed analysis items
  onDeleteAnalysis?: (id: string) => void; // Handler to delete analysis item
  showCurrentTrajectory: boolean;
  // Selection
  selectedIds?: string[];
  onToggleSelection?: (id: string) => void;
  onAnalyze?: (id1: string, id2: string) => void;
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
  setZoom,
  isNight,
  wind,
  setWind,
  snapToGrid,
  savedTrajectories,
  analysisItems = [],
  onDeleteAnalysis,
  showCurrentTrajectory,
  selectedIds = [],
  onToggleSelection,
  onAnalyze
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Track container size for responsive aspect ratio
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Widget Hover States
  const [isWindExpanded, setIsWindExpanded] = useState(false);
  const windTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isZoomExpanded, setIsZoomExpanded] = useState(false);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Interaction Logic for Wind Widget ---
  const handleWindEnter = () => {
    if (windTimeoutRef.current) clearTimeout(windTimeoutRef.current);
    setIsWindExpanded(true);
  };

  const handleWindLeave = () => {
    windTimeoutRef.current = setTimeout(() => {
        setIsWindExpanded(false);
    }, 1500); // 1.5s delay before collapsing
  };

  // --- Interaction Logic for Zoom Widget ---
  const handleZoomEnter = () => {
    if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    setIsZoomExpanded(true);
  };

  const handleZoomLeave = () => {
    zoomTimeoutRef.current = setTimeout(() => {
        setIsZoomExpanded(false);
    }, 1500); // 1.5s delay before collapsing
  };


  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateSize = () => {
        if (containerRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            if (width > 0 && height > 0) {
                setContainerSize({ width, height });
            }
        }
    };

    // Initial size
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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

  // --- Pinch Zoom State ---
  const pinchRef = useRef({
      active: false,
      initialDist: 0,
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      centerX: 0.5, // normalized 0-1
      centerY: 0.5  // normalized 0-1
  });

  // --- Viewport Calculations ---
  // We anchor the Vertical range and the Left side (Min X) based on constants + zoom.
  // We expand the Right side (Max X) based on the aspect ratio of the container.
  
  const aspectRatio = containerSize.height > 0 ? containerSize.width / containerSize.height : 1;
  
  // Base heights from constants
  const baseHeight = PHYSICS_CONSTANTS.MAX_Y - PHYSICS_CONSTANTS.MIN_Y;
  
  // Calculate visible range in physics units
  const currentHeight = baseHeight * zoom;
  const currentWidth = currentHeight * aspectRatio;

  const currentMinY = (PHYSICS_CONSTANTS.MIN_Y * zoom) + pan.y;
  const currentMaxY = currentMinY + currentHeight;

  // Anchor Left side to MIN_X
  const currentMinX = (PHYSICS_CONSTANTS.MIN_X * zoom) + pan.x;
  const currentMaxX = currentMinX + currentWidth;

  // Fixed SVG Resolution scaling
  const PIXELS_PER_UNIT = 40; 
  const VIEWBOX_WIDTH = currentWidth * PIXELS_PER_UNIT; 
  const VIEWBOX_HEIGHT = currentHeight * PIXELS_PER_UNIT;
  
  // --- Scale Factor for UI Elements ---
  // Calculates how many SVG units correspond to 1 screen pixel.
  // This allows us to scale text/UI so they look constant size on screen.
  const pixelScale = useMemo(() => {
    if (containerSize.width <= 0) return 1;
    return VIEWBOX_WIDTH / containerSize.width;
  }, [VIEWBOX_WIDTH, containerSize.width]);

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

  const trajectoryPath = useMemo(() => pointsToPath(trajectory), [trajectory, currentMinX, currentMinY, currentWidth, currentHeight]); 

  // --- Saved Data Preparation ---
  // Pre-calculate positions for rendering and hit-testing
  // Refactored to handle dependency chain (Standard Labels -> Analysis Labels)
  const savedData = useMemo(() => {
    // We mix SavedTrajectories and AnalysisItems into a single render list
    // Standard trajectories first, so Analysis can find them
    const sortedByTime = [...savedTrajectories].sort((a, b) => a.timestamp - b.timestamp);
    
    // Map to store calculated label positions for lookup
    const processedMap = new Map<string, any>();

    sortedByTime.forEach((t) => {
        if (!t.visible) return;

        const d = pointsToPath(calculateTrajectory(tankPos, t.power, t.angle, t.wind));
        const targetSvg = toSvg(t.target);
        const dx = (t.target.x - tankPos.x).toFixed(1);
        const dy = (t.target.y - tankPos.y).toFixed(1);

        // Standard Positioning
        const originalIndex = savedTrajectories.findIndex(st => st.id === t.id);
        const defaultOffsetPx = { x: 0, y: -(40 + (originalIndex % 5) * 45) };
        const defaultOffsetSvg = { 
            x: defaultOffsetPx.x * pixelScale, 
            y: defaultOffsetPx.y * pixelScale 
        };

        const offset = labelOffsets[t.id] || defaultOffsetSvg;
        const usedOffset = offset;
        const labelPos = { x: targetSvg.x + offset.x, y: targetSvg.y + offset.y };

        const data = { 
           id: t.id, 
           d, 
           power: t.power,
           angle: t.angle, 
           wind: t.wind, 
           dx, dy, 
           targetPos: targetSvg,
           labelPos,
           color: t.color,
           isAnalysis: false,
           offset: usedOffset
        };

        processedMap.set(t.id, data);
    });

    // Process Analysis Items
    analysisItems.forEach((item) => {
        if (!item.visible) return;

        let labelPos = { x: 0, y: 0 };
        let connectorStartPoints = undefined; // [ {x,y}, {x,y} ] - Coordinates of parent right edges
        let usedOffset = { x: 0, y: 0 };

        if (item.parentIds && item.parentIds.length === 2) {
             const p1 = processedMap.get(item.parentIds[0]);
             const p2 = processedMap.get(item.parentIds[1]);
             
             // VISIBILITY LOGIC: ONLY SHOW DIFF IF BOTH PARENTS ARE VISIBLE
             if (p1 && p2) {
                 // Dynamic Positioning: To the right of parents
                 // Standard Label Half-Width = 85 (Total 170)
                 const p1Right = p1.labelPos.x + (85 * pixelScale);
                 const p2Right = p2.labelPos.x + (85 * pixelScale);

                 // Base position is right of the furthest parent + gap
                 const baseX = Math.max(p1Right, p2Right) + (70 * pixelScale); 
                 const baseY = (p1.labelPos.y + p2.labelPos.y) / 2;
                 
                 connectorStartPoints = [
                     { x: p1Right, y: p1.labelPos.y },
                     { x: p2Right, y: p2.labelPos.y }
                 ];

                 const offset = labelOffsets[item.id] || { x: 0, y: 0 };
                 usedOffset = offset;
                 labelPos = { x: baseX + offset.x, y: baseY + offset.y };
                 
                 const data = {
                    id: item.id,
                    power: item.powerDiff, // Reuse power field for Diff
                    labelPos,
                    color: item.color,
                    isAnalysis: true,
                    connectorStartPoints,
                    offset: usedOffset,
                    targetPos: toSvg(item.target), // Just for hit testing proximity if needed
                };
                processedMap.set(item.id, data);
             } 
             // If parents not found in processedMap (means they are invisible), do not render this item.
        }
    });

    // Return array: Standard Trajectories followed by Analysis Items (so Analysis renders on top)
    const renderList = [
        ...sortedByTime.map(t => processedMap.get(t.id)),
        ...analysisItems.map(a => processedMap.get(a.id))
    ].filter(Boolean);

    return renderList;

  }, [savedTrajectories, analysisItems, tankPos, zoom, currentMinX, currentMinY, currentWidth, currentHeight, labelOffsets, pixelScale]);

  // Calculate mid-point for "Create Diff" button if exactly 2 items selected
  const selectionMidPoint = useMemo(() => {
      if (selectedIds.length !== 2) return null;
      
      const t1 = savedTrajectories.find(t => t.id === selectedIds[0]);
      const t2 = savedTrajectories.find(t => t.id === selectedIds[1]);
      
      if (!t1 || !t2) return null;

      // Find SVG positions using savedData logic or recalculate
      // Simple recalculate for robustness
      const t1Svg = toSvg(t1.target);
      const t2Svg = toSvg(t2.target);

      // We place the button between the two targets
      return {
          x: (t1Svg.x + t2Svg.x) / 2,
          y: (t1Svg.y + t2Svg.y) / 2
      };

  }, [selectedIds, savedTrajectories, currentMinX, currentMinY, currentWidth, currentHeight]);


  // --- Interaction Handlers ---

  const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
          e.preventDefault();
          const t1 = e.touches[0];
          const t2 = e.touches[1];

          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          
          // Calculate centroid relative to container
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          
          const cx = ((t1.clientX + t2.clientX) / 2) - rect.left;
          const cy = ((t1.clientY + t2.clientY) / 2) - rect.top;

          pinchRef.current = {
              active: true,
              initialDist: dist,
              initialZoom: zoom,
              initialPan: { ...pan },
              centerX: cx / rect.width,
              centerY: cy / rect.height
          };

          // Cancel any active drag/pan
          setDragState(prev => ({ ...prev, mode: 'IDLE' }));
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current.active) {
          e.preventDefault();
          e.stopPropagation();

          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

          if (pinchRef.current.initialDist > 10 && dist > 10) {
              const ratio = dist / pinchRef.current.initialDist;
              // Larger distance (spread) -> Smaller zoom value (Zoom In/Close up)
              let newZoom = pinchRef.current.initialZoom / ratio;
              newZoom = Math.max(0.25, Math.min(2.5, newZoom));

              // Calculate Pan compensation to zoom towards center
              // Formula: pan_new = pan_old + M * (z_old - z_new)
              const deltaZ = pinchRef.current.initialZoom - newZoom;
              
              // M_x = MIN_X + CenterX * Height * AR
              const Mx = PHYSICS_CONSTANTS.MIN_X + (pinchRef.current.centerX * baseHeight * aspectRatio);
              
              // M_y = MIN_Y + (1 - CenterY) * Height
              // Note: CenterY is 0 at top, 1 at bottom. Physics Y is 0 at bottom (relative to MIN_Y).
              const My = PHYSICS_CONSTANTS.MIN_Y + ((1 - pinchRef.current.centerY) * baseHeight);

              const newPanX = pinchRef.current.initialPan.x + (Mx * deltaZ);
              const newPanY = pinchRef.current.initialPan.y + (My * deltaZ);

              setZoom(newZoom);
              setPan({ x: newPanX, y: newPanY });
          }
      }
  };

  const handleTouchEnd = () => {
      pinchRef.current.active = false;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // If pinch is active, ignore single pointer events
    if (pinchRef.current.active) return;
    
    if (!svgRef.current) return;
    (e.target as Element).setPointerCapture(e.pointerId);

    const { x: clickX, y: clickY } = getSvgPoint(e.clientX, e.clientY);
    const screenPt = { x: e.clientX, y: e.clientY };
    
    // 1. Check Angle Knob / Area (Only if active)
    const tankSvg = toSvg(tankPos);
    
    // Visual radius of the knob control (roughly 80px on screen)
    const knobRadius = 80 * pixelScale;
    const distToTank = Math.hypot(clickX - tankSvg.x, clickY - tankSvg.y);
    
    if (showCurrentTrajectory && distToTank < knobRadius + (10 * pixelScale)) {
        setDragState({ mode: 'KNOB', startScreen: screenPt, startPan: pan });
        return;
    }

    // 2. Check Saved Labels (Top-most first for hitting, so iterate reverse of render order?)
    // savedData is Old -> New (Render Order). 
    // Hit test should be New -> Old (Top -> Bottom).
    for (let i = savedData.length - 1; i >= 0; i--) {
        const item = savedData[i];
        
        // Define Hitbox size based on type
        // Analysis: 56x24 (Half 28x12) -> Compact pill
        // Standard: 170x34 (Half 85x17)
        const halfW = item.isAnalysis ? 28 * pixelScale : 85 * pixelScale;
        const halfH = item.isAnalysis ? 12 * pixelScale : 17 * pixelScale;

        if (
            clickX >= item.labelPos.x - halfW && clickX <= item.labelPos.x + halfW &&
            clickY >= item.labelPos.y - halfH && clickY <= item.labelPos.y + halfH
        ) {
            setDragState({ 
                mode: 'LABEL', 
                startScreen: screenPt, 
                startPan: pan, 
                activeId: item.id,
                hasMoved: false
            });
            return;
        }
    }

    // 3. Check Active Target (Only if active)
    const targetSvg = toSvg(target);
    const targetHitRadius = 30 * pixelScale;
    if (showCurrentTrajectory && Math.hypot(clickX - targetSvg.x, clickY - targetSvg.y) < targetHitRadius) {
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
    // If pinch active, ignore
    if (pinchRef.current.active) return;

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
        
        // Snap to integer angle for cleaner UI
        setAngle(Math.round(newAngle));

    } else if (dragState.mode === 'LABEL' && dragState.activeId) {
        // Track movement to distinguish click from drag
        if (Math.hypot(dxScreen, dyScreen) > 5) {
             setDragState(prev => ({ ...prev, hasMoved: true }));
             
             const currentItem = savedData.find(sd => sd.id === dragState.activeId);
             if (currentItem && currentItem.offset) {
                  const basePosX = currentItem.labelPos.x - currentItem.offset.x;
                  const basePosY = currentItem.labelPos.y - currentItem.offset.y;
                  
                  let destX = pointerX;
                  let destY = pointerY;
                  
                  // Snap logic
                  if (snapToGrid) {
                      const physPoint = fromSvg(destX, destY);
                      const snappedPhysX = Math.round(physPoint.x);
                      const snappedPhysY = Math.round(physPoint.y);
                      const snappedSvg = toSvg({ x: snappedPhysX, y: snappedPhysY });
                      destX = snappedSvg.x;
                      destY = snappedSvg.y;
                  }
                  
                  setLabelOffsets(prev => ({
                     ...prev,
                     [dragState.activeId!]: {
                         x: destX - basePosX,
                         y: destY - basePosY
                     }
                  }));
             }
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
        if (dragState.mode === 'AWAIT_PAN_OR_CLICK') {
            setDragState(prev => ({ ...prev, mode: 'PAN', hasMoved: true }));
        }
        
        const ctm = svgRef.current?.getScreenCTM();
        const scaleX = ctm ? ctm.a : 1; 
        
        const dxPhys = -dxScreen / (PIXELS_PER_UNIT * scaleX);
        const dyPhys = dyScreen / (PIXELS_PER_UNIT * scaleX);
        
        setPan({
            x: dragState.startPan.x + dxPhys,
            y: dragState.startPan.y + dyPhys
        });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    
    // Click Detection for Selection (If LABEL clicked but not moved)
    if (dragState.mode === 'LABEL' && !dragState.hasMoved && dragState.activeId) {
        if (onToggleSelection) {
             const item = savedData.find(sd => sd.id === dragState.activeId);
             // Only select SavedTrajectories (not Analysis items) for now, 
             // although logic permits analysis selection, we only need it for Diff generation
             if (item && !item.isAnalysis) {
                onToggleSelection(dragState.activeId);
             }
        }
    }

    if (showCurrentTrajectory && dragState.mode === 'AWAIT_PAN_OR_CLICK' && !dragState.hasMoved) {
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

    const strokeW = Math.max(1 * pixelScale, 1); 
    const fontSz = 12 * pixelScale; 
    
    const useSparseGrid = zoom > 1.5;

    for (let i = startX; i <= endX; i++) {
        const p = toSvg({ x: i, y: 0 }); 
        const x = p.x;
        if (x < -50 * pixelScale || x > VIEWBOX_WIDTH + 50 * pixelScale) continue;
        const isAxis = i === 0;
        const isMajor = i !== 0 && i % 12 === 0; 
        
        if (useSparseGrid && !isAxis && !isMajor) continue;

        lines.push(
            <line 
                key={`v-${i}`} 
                x1={x} y1={0} x2={x} y2={VIEWBOX_HEIGHT} 
                stroke={isAxis ? axisColor : (isMajor ? highlightColor : minorColor)} 
                strokeWidth={isAxis ? strokeW * 2 : strokeW} 
                strokeDasharray={isAxis || isMajor ? "" : `${4 * pixelScale},${2 * pixelScale}`}
            />
        );
        
        lines.push(
            <text 
                key={`tv-${i}`} 
                x={x + (4 * pixelScale)} 
                y={VIEWBOX_HEIGHT - (10 * pixelScale)} 
                fill={isAxis ? axisColor : textColor} 
                fontSize={fontSz}
                fontWeight={isAxis || isMajor ? "bold" : "normal"}
                opacity={isAxis || isMajor ? 1 : 0.7}
                style={{ userSelect: 'none' }}
            >
                {i}
            </text>
        );
    }

    for (let i = startY; i <= endY; i++) {
        const p = toSvg({ x: 0, y: i }); 
        const y = p.y;
        if (y < -50 * pixelScale || y > VIEWBOX_HEIGHT + 50 * pixelScale) continue;
        const isAxis = i === 0;
        const isMajor = i !== 0 && i % 6 === 0;

        if (useSparseGrid && !isAxis && !isMajor) continue;

        lines.push(
            <line 
                key={`h-${i}`} 
                x1={0} y1={y} x2={VIEWBOX_WIDTH} y2={y} 
                stroke={isAxis ? axisColor : (isMajor ? highlightColor : minorColor)} 
                strokeWidth={isAxis ? strokeW * 2 : strokeW} 
                strokeDasharray={isAxis || isMajor ? "" : `${4 * pixelScale},${2 * pixelScale}`}
            />
        );
        
        lines.push(
            <text 
                key={`th-${i}`} 
                x={10 * pixelScale} 
                y={y - (4 * pixelScale)} 
                fill={isAxis ? axisColor : textColor} 
                fontSize={fontSz}
                fontWeight={isAxis || isMajor ? "bold" : "normal"}
                opacity={isAxis || isMajor ? 1 : 0.7}
                style={{ userSelect: 'none' }}
            >
                {i}
            </text>
        );
    }
    return lines;
  }, [currentMinX, currentMaxX, currentMinY, currentMaxY, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, isNight, toSvg, pixelScale, zoom]);

  const knobRadius = 80 * pixelScale; 
  const knobRad = (angle * Math.PI) / 180;
  const knobHandleX = tankSvg.x + knobRadius * Math.cos(knobRad);
  const knobHandleY = tankSvg.y - knobRadius * Math.sin(knobRad);

  // Dynamic Styles for Wind Widget
  const windWidgetClasses = isNight 
    ? 'bg-slate-800/95 border-slate-600'
    : 'bg-white/95 border-slate-200';
  
  const windTextClasses = isNight ? 'text-slate-300' : 'text-slate-700';
  const windLabelClasses = isNight ? 'text-slate-500' : 'text-slate-500';
  const windBtnClasses = isNight 
    ? 'bg-slate-700 hover:bg-slate-600 text-white' 
    : 'bg-slate-200 hover:bg-slate-300 text-slate-800';

  const mainColor = isNight ? "#38bdf8" : "#0284c7";

  if (containerSize.width === 0) return <div ref={containerRef} className="w-full h-full" />;

  return (
    <div 
        ref={containerRef}
        className={`relative w-full h-full ${isNight ? 'bg-slate-900' : 'bg-slate-50'} transition-colors duration-500 rounded-xl overflow-hidden select-none`}
    >
      {/* Floating Create Diff Button */}
      {selectionMidPoint && onAnalyze && selectedIds.length === 2 && (
          <div 
             className="absolute z-30 transform -translate-x-1/2 -translate-y-1/2 animate-in zoom-in slide-in-from-bottom-2 fade-in"
             style={{ left: selectionMidPoint.x, top: selectionMidPoint.y }}
          >
              <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onAnalyze(selectedIds[0], selectedIds[1]);
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-400 text-amber-950 rounded-full shadow-lg font-bold text-xs hover:bg-amber-300 hover:scale-105 transition-all"
              >
                  <Calculator size={14} /> Link / Diff
              </button>
          </div>
      )}

      {/* Wind Control Widget */}
      <div 
        onMouseEnter={handleWindEnter}
        onMouseLeave={handleWindLeave}
        className={`absolute top-4 left-1/2 -translate-x-1/2 backdrop-blur rounded-xl border shadow-xl flex flex-col items-center z-20 transition-all duration-300 ease-in-out overflow-hidden ${windWidgetClasses} ${isWindExpanded ? 'w-60 p-2' : 'w-auto px-4 py-2 hover:w-60 hover:p-2 cursor-pointer'}`}
      >
        {isWindExpanded ? (
            <>
                <div className={`text-[10px] font-bold ${windTextClasses} mb-1 w-full flex justify-between items-center`}>
                    <span className={`text-[9px] ${windLabelClasses}`}>WEST</span>
                    <span className={`flex items-center gap-1 ${wind === 0 ? (isNight ? 'text-slate-400' : 'text-slate-400') : wind > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        <Wind size={10} />
                        WIND: {Math.abs(wind).toFixed(1)}
                    </span>
                    <span className={`text-[9px] ${windLabelClasses}`}>EAST</span>
                </div>
                <div className="flex items-center w-full gap-2 opacity-100 transition-opacity duration-300 delay-100">
                    <button onClick={() => setWind(Number((wind - 0.5).toFixed(1)))} className={`w-6 h-6 flex items-center justify-center rounded font-bold text-sm ${windBtnClasses}`}>-</button>
                    <div className="relative flex-1 h-5 flex items-center mx-1">
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-400 z-0"></div>
                        <input type="range" min="-150" max="150" step="0.5" value={wind} onChange={(e) => setWind(Number(e.target.value))} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-sky-500 z-10 relative ${isNight ? 'bg-slate-700/50' : 'bg-slate-300/50'}`}/>
                    </div>
                    <button onClick={() => setWind(Number((wind + 0.5).toFixed(1)))} className={`w-6 h-6 flex items-center justify-center rounded font-bold text-sm ${windBtnClasses}`}>+</button>
                </div>
            </>
        ) : (
             <div className="flex items-center gap-2">
                <Wind size={14} className={wind === 0 ? 'text-slate-400' : wind > 0 ? 'text-emerald-500' : 'text-rose-500'} />
                <span className={`text-xs font-bold font-mono ${wind === 0 ? (isNight ? 'text-slate-400' : 'text-slate-500') : wind > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {wind.toFixed(1)}
                </span>
            </div>
        )}
      </div>

      {/* Zoom Control Widget */}
      <div 
        onMouseEnter={handleZoomEnter}
        onMouseLeave={handleZoomLeave}
        className={`absolute bottom-12 right-4 backdrop-blur rounded-xl border shadow-xl flex items-center z-20 transition-all duration-300 ease-in-out overflow-hidden ${windWidgetClasses} ${isZoomExpanded ? 'w-64 p-3 gap-3' : 'w-24 p-2 gap-2 cursor-pointer hover:w-64 hover:p-3 hover:gap-3'}`}
      >
        {isZoomExpanded ? (
            <>
                <button onClick={() => setZoom(Math.max(0.25, zoom - 0.1))} className={`w-6 h-6 flex items-center justify-center rounded font-bold text-sm ${windBtnClasses}`}>
                    <ZoomOut size={12} />
                </button>
                <div className="flex-1 flex flex-col items-center">
                    <div className="flex justify-between w-full text-[10px] font-bold mb-1 opacity-80">
                         <span className={windLabelClasses}>VIEW RANGE</span>
                         <span className={isNight ? 'text-indigo-300' : 'text-indigo-600'}>{(zoom * 100).toFixed(0)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0.25"
                        max="2.5"
                        step="0.1"
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500 z-10 ${isNight ? 'bg-slate-700/50' : 'bg-slate-300/50'}`}
                    />
                </div>
                <button onClick={() => setZoom(Math.min(2.5, zoom + 0.1))} className={`w-6 h-6 flex items-center justify-center rounded font-bold text-sm ${windBtnClasses}`}>
                    <ZoomIn size={12} />
                </button>
            </>
        ) : (
            <>
                <input
                    type="range"
                    min="0.25"
                    max="2.5"
                    step="0.1"
                    value={zoom}
                    readOnly
                    className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500 z-10 ${isNight ? 'bg-slate-700/50' : 'bg-slate-300/50'}`}
                />
            </>
        )}
      </div>

      <div className={`absolute top-4 left-4 z-10 pointer-events-none backdrop-blur-md p-3 rounded-xl border shadow-sm ${isNight ? 'bg-slate-900/85 border-slate-700' : 'bg-white/85 border-slate-200'}`}>
        <h2 className={`text-xs font-bold ${isNight ? 'text-slate-400' : 'text-slate-600'} uppercase tracking-widest mb-0.5`}>Curve Analysis View</h2>
        <div className={`text-[10px] font-mono ${isNight ? 'text-slate-500' : 'text-slate-500'}`}>
            X: {currentMinX.toFixed(0)} to {currentMaxX.toFixed(0)} <span className="opacity-30 mx-1">|</span> Y: {currentMinY.toFixed(0)} to {currentMaxY.toFixed(0)}
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

        // Touch Events for Pinch Zoom
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        
        preserveAspectRatio="none"
      >
        <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" fill="#a855f7" />
            </marker>
            <radialGradient id="angleGradient" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor={mainColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={mainColor} stopOpacity="0" />
            </radialGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy={2 * pixelScale} stdDeviation={2 * pixelScale} floodColor="#000000" floodOpacity="0.3" />
            </filter>
            <filter id="simpleBlur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={2 * pixelScale} />
            </filter>
        </defs>

        {/* Grid Lines */}
        {gridLines}

        {/* LAYER 1: Trajectories, Rings, Connectors, Targets, and Leader Lines */}
        {savedData.map((sd) => (
            <g key={`lines-${sd.id}`} style={{ pointerEvents: 'none' }}>
                {/* Only draw path if it's NOT an analysis item */}
                {!sd.isAnalysis && (
                    <path d={sd.d} fill="none" stroke={sd.color} strokeWidth={2 * pixelScale} strokeDasharray={`${5*pixelScale},${5*pixelScale}`} className="opacity-60" />
                )}

                {/* Selection Ring (Visual Highlight) */}
                {selectedIds.includes(sd.id) && (
                    <g transform={`translate(${sd.targetPos.x}, ${sd.targetPos.y})`}>
                        <circle r={14 * pixelScale} fill="none" stroke="#38bdf8" strokeWidth={2 * pixelScale} className="animate-pulse" />
                        <circle r={18 * pixelScale} fill="none" stroke="#38bdf8" strokeWidth={1 * pixelScale} strokeDasharray={`${2*pixelScale},${2*pixelScale}`} opacity="0.5" />
                    </g>
                )}

                {/* Draw Analysis Connector Lines (Simplified Straight Lines) */}
                {sd.isAnalysis && sd.connectorStartPoints && (
                    <>
                        {sd.connectorStartPoints.map((pt: Point, idx: number) => {
                             // Analysis Label Left Edge
                             // Pill width is 48, centered at labelPos.x
                             // Left edge = labelPos.x - 24 * pixelScale
                             const endX = sd.labelPos.x - (24 * pixelScale); 
                             const endY = sd.labelPos.y;
                             
                             return (
                                 <line 
                                    key={idx}
                                    x1={pt.x} y1={pt.y}
                                    x2={endX} y2={endY}
                                    stroke={sd.color}
                                    strokeWidth={0.8 * pixelScale}
                                    strokeDasharray={`${2*pixelScale},${2*pixelScale}`}
                                    opacity="0.5"
                                 />
                             );
                        })}
                    </>
                )}
                
                <g transform={`translate(${sd.targetPos.x}, ${sd.targetPos.y})`}>
                     <circle r={sd.isAnalysis ? 3 * pixelScale : 6 * pixelScale} fill="none" stroke={sd.color} strokeWidth={sd.isAnalysis ? 1 * pixelScale : 3 * pixelScale} />
                     <circle r={2 * pixelScale} fill={sd.color} />
                </g>

                {!sd.isAnalysis && (
                    <line 
                        x1={sd.labelPos.x} y1={sd.labelPos.y} 
                        x2={sd.targetPos.x} y2={sd.targetPos.y} 
                        stroke={sd.color} strokeWidth={0.8 * pixelScale} 
                        strokeDasharray={`${4*pixelScale},${2*pixelScale}`}
                        opacity="0.8"
                    />
                )}
            </g>
        ))}

        {/* LAYER 2: Draggable Labels (Always on top of lines) */}
        {savedData.map((sd) => (
             <g 
                key={`label-${sd.id}`}
                transform={`translate(${sd.labelPos.x}, ${sd.labelPos.y}) scale(${pixelScale})`} 
                className="cursor-move group"
            > 
                {sd.isAnalysis ? (
                    <>
                         {/* Ultra Compact Analysis Label (Pill) - White BG, Black Text */}
                         <rect 
                            x="-24" y="-12" width="48" height="24" rx="12" 
                            fill="white" 
                            stroke={sd.color} strokeWidth="1.5"
                            filter="url(#shadow)"
                        />
                        
                        {/* Main Value - Black Text */}
                        <text x="0" y="5" textAnchor="middle" fill="#0f172a" fontSize="13" fontWeight="800" fontFamily="'Varela Round', sans-serif" className="pointer-events-none select-none">
                            {sd.power > 0 ? '+' : ''}{sd.power.toFixed(1)}
                        </text>

                        {/* Close Button - Tiny circle on top right edge */}
                        {onDeleteAnalysis && (
                            <g 
                                transform="translate(20, -10)" 
                                className="cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent drag start
                                    onDeleteAnalysis(sd.id);
                                }}
                                onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on touch
                            >
                                <circle cx="0" cy="0" r="6" fill="#ef4444" stroke="white" strokeWidth="1" />
                                <path d="M-2 -2 L2 2 M2 -2 L-2 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                            </g>
                        )}
                    </>
                ) : (
                    <>
                         {/* Selection Highlight Frame */}
                        {selectedIds.includes(sd.id) && (
                            <rect 
                                x="-88" y="-20" width="176" height="40" rx="8" 
                                fill="none" 
                                stroke="#38bdf8" 
                                strokeWidth="2.5"
                                opacity="1"
                            />
                        )}

                        {/* Standard Label Background - Height 34 */}
                        <rect 
                            x="-85" y="-17" width="170" height="34" rx="6" 
                            fill={isNight ? "#1e293b" : "#ffffff"} 
                            stroke={sd.color} strokeWidth="2" 
                            filter="url(#shadow)"
                        />
                        {/* Custom Left Decorative Shape */}
                        <path 
                            d="M -35 -17 L -79 -17 Q -85 -17 -85 -11 L -85 11 Q -85 17 -79 17 L -35 17 Z" 
                            fill={sd.color} 
                        />
                        {/* Standard Label Layout */}
                        <text x="-60" y="-4" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="8" fontWeight="bold" fontFamily="'Varela Round', sans-serif" className="pointer-events-none select-none">
                            POWER
                        </text>
                        <text x="-60" y="10" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="'Varela Round', sans-serif" className="pointer-events-none select-none">
                            {sd.power.toFixed(1)}
                        </text>

                        {/* Right Side: Data - Row 1: Angle & Wind */}
                        <text x="-25" y="-3" textAnchor="start" fontSize="10" fontFamily="'Varela Round', sans-serif" className="pointer-events-none select-none">
                            <tspan fill={isNight ? "#94a3b8" : "#64748b"}>A:</tspan> <tspan fontWeight="bold" fill={isNight ? "#e2e8f0" : "#334155"}>{sd.angle}°</tspan>
                            <tspan dx="8" fill={isNight ? "#94a3b8" : "#64748b"}>W:</tspan> <tspan fontWeight="bold" fill={sd.wind === 0 ? (isNight ? "#94a3b8" : "#64748b") : (sd.wind > 0 ? "#10b981" : "#f43f5e")}>{sd.wind}</tspan>
                        </text>

                        {/* Right Side: Data - Row 2: Coordinates */}
                        <text x="-25" y="9" textAnchor="start" fontSize="10" fontFamily="'Varela Round', sans-serif" className="pointer-events-none select-none">
                            <tspan fill={isNight ? "#94a3b8" : "#64748b"}>X:</tspan> <tspan fontWeight="bold" fill={isNight ? "#e2e8f0" : "#334155"}>{sd.dx}</tspan>
                            <tspan dx="8" fill={isNight ? "#94a3b8" : "#64748b"}>Y:</tspan> <tspan fontWeight="bold" fill={isNight ? "#e2e8f0" : "#334155"}>{sd.dy}</tspan>
                        </text>
                    </>
                )}
            </g>
        ))}

        {/* Active Elements */}
        {showCurrentTrajectory && (
            <>
                <circle 
                    cx={tankSvg.x} 
                    cy={tankSvg.y} 
                    r={knobRadius} 
                    fill="url(#angleGradient)" 
                    className="cursor-pointer hover:opacity-100 transition-opacity"
                    style={{ opacity: 0.8 }}
                />

                <path d={trajectoryPath} fill="none" stroke={mainColor} strokeWidth={4 * pixelScale} strokeDasharray={`${10*pixelScale},${10*pixelScale}`} className="opacity-80" />

                <g className="cursor-pointer" style={{ pointerEvents: 'none' }}> 
                    <path d={`M ${tankSvg.x - knobRadius} ${tankSvg.y} A ${knobRadius} ${knobRadius} 0 0 1 ${tankSvg.x + knobRadius} ${tankSvg.y}`} fill="none" stroke={isNight ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} strokeWidth={2 * pixelScale} strokeDasharray={`${4*pixelScale},${4*pixelScale}`}/>
                    
                    <line x1={tankSvg.x} y1={tankSvg.y} x2={knobHandleX} y2={knobHandleY} 
                        stroke="#dc2626" strokeWidth={8 * pixelScale} strokeLinecap="round" opacity="0.3" filter="url(#simpleBlur)" />
                    
                    <line x1={tankSvg.x} y1={tankSvg.y} x2={knobHandleX} y2={knobHandleY} 
                        stroke="#dc2626" strokeWidth={3 * pixelScale} strokeLinecap="round" />
                    
                    <line x1={tankSvg.x} y1={tankSvg.y} x2={knobHandleX} y2={knobHandleY} 
                         stroke="transparent" strokeWidth={20 * pixelScale} strokeLinecap="round" style={{ pointerEvents: 'auto' }} />
                </g>

                <g>
                    <circle 
                        cx={tankSvg.x} 
                        cy={tankSvg.y} 
                        r={18 * pixelScale} 
                        fill={isNight ? "#0f172a" : "#ffffff"} 
                        stroke={mainColor} 
                        strokeWidth={3 * pixelScale} 
                    />
                    <text 
                        x={tankSvg.x} 
                        y={tankSvg.y} 
                        dy={4 * pixelScale} 
                        textAnchor="middle" 
                        fill={mainColor} 
                        fontSize={11 * pixelScale} 
                        fontWeight="bold" 
                        fontFamily="'Varela Round', sans-serif"
                        className="pointer-events-none select-none"
                    >
                        {angle}°
                    </text>
                </g>

                <g transform={`translate(${targetSvg.x}, ${targetSvg.y})`}>
                    <circle r={5 * pixelScale} fill={mainColor} />
                    <circle r={12 * pixelScale} fill="none" stroke={mainColor} strokeWidth={1.5 * pixelScale} opacity="0.6" className="animate-pulse" />
                    
                    {/* Tooltip scaled by pixelScale */}
                    <g transform={`translate(0, -${65 * pixelScale}) scale(${pixelScale})`}>
                        <rect x="-70" y="0" width="140" height="50" rx="6" fill={isNight ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.9)"} stroke={isNight ? "#334155" : "#cbd5e1"} strokeWidth="1" />
                        <text x="0" y="20" textAnchor="middle" fill={isNight ? "#e2e8f0" : "#1e293b"} fontSize="16" fontWeight="bold" fontFamily="'Varela Round', sans-serif">
                            ({dx}, {dy})
                        </text>
                        <text x="0" y="38" textAnchor="middle" fill={isNight ? "#10b981" : "#059669"} fontSize="12" fontWeight="bold" fontFamily="'Varela Round', sans-serif">
                            Wind: {wind}
                        </text>
                    </g>
                </g>

                {impactSvg && (
                    <circle cx={impactSvg.x} cy={impactSvg.y} r={8 * pixelScale} fill="#fbbf24" stroke="white" strokeWidth={1 * pixelScale} />
                )}
            </>
        )}
      </svg>
    </div>
  );
};

export default GameCanvas;