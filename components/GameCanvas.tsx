import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Point, PHYSICS_CONSTANTS, SavedTrajectory, AnalysisItem, GameMode } from '../types';
import { Wind, ZoomIn, ZoomOut, Calculator, Zap, MousePointer2, Settings, Sun, Moon, Magnet, Activity, AlertTriangle, MapPin, ChevronLeft, ChevronRight, X, Database, Save, Eye, EyeOff, Trash2, CheckCircle2, Palette } from 'lucide-react';
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
  setIsNight: (v: boolean) => void;
  wind: number;
  setWind: (w: number) => void;
  power: number;
  setPower: (p: number) => void;
  mode: GameMode;
  setMode: (m: GameMode) => void;
  error: string | null;
  snapToGrid: boolean;
  setSnapToGrid: (v: boolean) => void;
  savedTrajectories: SavedTrajectory[];
  analysisItems?: AnalysisItem[];
  trajectoryColors?: string[];
  
  // Memory Actions
  onSaveTrajectory?: (color?: string) => void;
  onDeleteTrajectory?: (id: string) => void;
  onUpdateTrajectoryColor?: (id: string, color: string) => void;
  onToggleVisibility?: (id: string) => void;
  onToggleColorVisibility?: (color: string) => void;
  onDeleteAnalysis?: (id: string) => void;

  showCurrentTrajectory: boolean;
  setShowCurrentTrajectory: (v: boolean) => void;
  // Selection
  selectedIds?: string[];
  onToggleSelection?: (id: string) => void;
  onSelectExclusive?: (id: string) => void;
  onAnalyze?: (id1: string, id2: string) => void;
}

interface DragState {
    mode: 'IDLE' | 'PAN' | 'TARGET' | 'KNOB' | 'LABEL' | 'AWAIT_PAN_OR_CLICK' | 'SAVED_TARGET';
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
  setIsNight,
  wind,
  setWind,
  power,
  setPower,
  mode,
  setMode,
  error,
  snapToGrid,
  setSnapToGrid,
  savedTrajectories,
  analysisItems = [],
  trajectoryColors = [],
  onSaveTrajectory,
  onDeleteTrajectory,
  onUpdateTrajectoryColor,
  onToggleVisibility,
  onToggleColorVisibility,
  onDeleteAnalysis,
  showCurrentTrajectory,
  setShowCurrentTrajectory,
  selectedIds = [],
  onToggleSelection,
  onSelectExclusive,
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

  const [isPowerExpanded, setIsPowerExpanded] = useState(false);
  const powerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const settingsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fixed Memory Menu (Top Right)
  const [isFixedMemoryExpanded, setIsFixedMemoryExpanded] = useState(false);
  const fixedMemoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Angle Fine Tune State
  const [isAngleFineTuneOpen, setIsAngleFineTuneOpen] = useState(false);
  
  // Context Memory Menu State (Attached to Target)
  const [isContextMemoryOpen, setIsContextMemoryOpen] = useState(false);
  // Track if the context menu is attached to a specific Saved Target (ID) or the Live Target (null)
  const [contextMenuTargetId, setContextMenuTargetId] = useState<string | null>(null);

  // --- New State for Color Management ---
  // Active color for saving (defaults to first available color)
  const [activeColor, setActiveColor] = useState(trajectoryColors?.[0] || '#a855f7');
  
  // ID of the trajectory currently hovered in the memory list (for focus effect)
  const [hoveredTrajectoryId, setHoveredTrajectoryId] = useState<string | null>(null);
  
  // ID of the trajectory currently being edited (changing group)
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- Calculate Stats for Memory Bank ---
  const colorStats = useMemo(() => {
    const stats: Record<string, { items: SavedTrajectory[], visibleCount: number }> = {};
    trajectoryColors.forEach(c => {
        stats[c] = { items: [], visibleCount: 0 };
    });
    
    savedTrajectories.forEach(t => {
      if (!stats[t.color]) stats[t.color] = { items: [], visibleCount: 0 };
      stats[t.color].items.push(t);
      if (t.visible) stats[t.color].visibleCount++;
    });

    // Sort items inside each color by newest first
    Object.keys(stats).forEach(c => {
        stats[c].items.sort((a, b) => b.timestamp - a.timestamp);
    });

    return stats;
  }, [savedTrajectories, trajectoryColors]);

  // --- Widget Interaction Logic ---
  const createHoverHandlers = (setter: (v: boolean) => void, ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => ({
    onMouseEnter: () => {
        if (ref.current) clearTimeout(ref.current);
        setter(true);
    },
    onMouseLeave: () => {
        ref.current = setTimeout(() => {
            setter(false);
        }, 1500); 
    }
  });

  const windHandlers = createHoverHandlers(setIsWindExpanded, windTimeoutRef);
  const zoomHandlers = createHoverHandlers(setIsZoomExpanded, zoomTimeoutRef);
  const powerHandlers = createHoverHandlers(setIsPowerExpanded, powerTimeoutRef);
  const settingsHandlers = createHoverHandlers(setIsSettingsExpanded, settingsTimeoutRef);
  const fixedMemoryHandlers = createHoverHandlers(setIsFixedMemoryExpanded, fixedMemoryTimeoutRef);

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

  // Effect: Reset context menu target when Live Path is turned ON to ensure priority
  useEffect(() => {
      if (showCurrentTrajectory) {
          setContextMenuTargetId(null);
      }
  }, [showCurrentTrajectory]);

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
  const pixelScale = useMemo(() => {
    if (containerSize.width <= 0) return 1;
    return VIEWBOX_WIDTH / containerSize.width;
  }, [VIEWBOX_WIDTH, containerSize.width]);

  // REDUCED KNOB RADIUS (Smaller Disk)
  const knobRadius = 50 * pixelScale; 

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
    
    // Visual radius for interaction (slightly larger than visual radius)
    const distToTank = Math.hypot(clickX - tankSvg.x, clickY - tankSvg.y);
    
    if (showCurrentTrajectory && distToTank < knobRadius + (10 * pixelScale)) {
        setDragState({ mode: 'KNOB', startScreen: screenPt, startPan: pan, hasMoved: false });
        return;
    }

    // 2. Check Saved Labels
    for (let i = savedData.length - 1; i >= 0; i--) {
        const item = savedData[i];
        
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
            // Close fine tune if open
            if (isAngleFineTuneOpen) setIsAngleFineTuneOpen(false);
            return;
        }
    }

    // 3. Check Active Target (Live)
    const targetSvg = toSvg(target);
    const targetHitRadius = 30 * pixelScale;
    if (showCurrentTrajectory && Math.hypot(clickX - targetSvg.x, clickY - targetSvg.y) < targetHitRadius) {
        setDragState({ mode: 'TARGET', startScreen: screenPt, startPan: pan });
        // Close fine tune if open
        if (isAngleFineTuneOpen) setIsAngleFineTuneOpen(false);
        return;
    }

    // 4. Check Saved Targets (For Color Picking / Context Menu)
    // Check this regardless of showCurrentTrajectory to allow interaction even if live path is hidden
    for (let i = savedData.length - 1; i >= 0; i--) {
        const item = savedData[i];
        if (item.isAnalysis) continue; // Skip analysis points for now

        const dist = Math.hypot(clickX - item.targetPos.x, clickY - item.targetPos.y);
        // Hit radius for saved targets (visually 6px, hit area 20px)
        if (dist < 20 * pixelScale) {
            setDragState({ mode: 'SAVED_TARGET', startScreen: screenPt, startPan: pan, activeId: item.id, hasMoved: false });
            return;
        }
    }

    // 5. Background -> Pan or Click
    // Also Close fine tune if open
    if (isAngleFineTuneOpen) setIsAngleFineTuneOpen(false);
    
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
        // Track movement to separate click from drag
        if (!dragState.hasMoved && Math.hypot(dxScreen, dyScreen) > 5) {
             setDragState(prev => ({ ...prev, hasMoved: true }));
             // If we start dragging, close fine tune
             if (isAngleFineTuneOpen) setIsAngleFineTuneOpen(false);
        }

        const tankSvg = toSvg(tankPos);
        // Angle calc
        let newAngle = Math.atan2(-(pointerY - tankSvg.y), (pointerX - tankSvg.x)) * (180 / Math.PI);
        if (newAngle < 0) newAngle += 360;
        if (newAngle > 180) newAngle = 180; 
        
        // Snap to integer angle for cleaner UI
        setAngle(Math.round(newAngle));

    } else if (dragState.mode === 'LABEL' && dragState.activeId) {
        if (Math.hypot(dxScreen, dyScreen) > 5) {
             setDragState(prev => ({ ...prev, hasMoved: true }));
             
             const currentItem = savedData.find(sd => sd.id === dragState.activeId);
             if (currentItem && currentItem.offset) {
                  const basePosX = currentItem.labelPos.x - currentItem.offset.x;
                  const basePosY = currentItem.labelPos.y - currentItem.offset.y;
                  
                  let destX = pointerX;
                  let destY = pointerY;
                  
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
        // If moving target, close the memory menu
        if (isContextMemoryOpen && Math.hypot(dxScreen, dyScreen) > 5) {
            setIsContextMemoryOpen(false);
        }

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
    
    // Toggle Angle Fine Tune on Click (KNOB Mode + No Movement)
    if (dragState.mode === 'KNOB' && !dragState.hasMoved) {
        setIsAngleFineTuneOpen(prev => !prev);
    }
    
    // Toggle Context Memory Menu on Click (Live TARGET)
    if (dragState.mode === 'TARGET' && !dragState.hasMoved) {
        // Always toggle menu for Live Target when clicked directly
        setIsContextMemoryOpen(prev => !prev); 
        setContextMenuTargetId(null);
        if (isFixedMemoryExpanded) setIsFixedMemoryExpanded(false);
    }

    // Toggle Context Memory on Click Saved Target (New Feature)
    if (dragState.mode === 'SAVED_TARGET' && !dragState.hasMoved && dragState.activeId) {
        const item = savedData.find(s => s.id === dragState.activeId);
        if (item) {
            setActiveColor(item.color);
            
            // Single Exclusive Selection for Targets
            if (onSelectExclusive && !item.isAnalysis) {
                onSelectExclusive(item.id);
            }

            // Menu Logic: Block if Live Path is ON
            if (!showCurrentTrajectory) {
                setContextMenuTargetId(item.id);
                setIsContextMemoryOpen(prev => (contextMenuTargetId === item.id ? !prev : true));
                if (isFixedMemoryExpanded) setIsFixedMemoryExpanded(false);
            }
        }
    }

    // Click Detection for Selection (If LABEL clicked but not moved)
    if (dragState.mode === 'LABEL' && !dragState.hasMoved && dragState.activeId) {
        if (onToggleSelection) {
             const item = savedData.find(sd => sd.id === dragState.activeId);
             if (item && !item.isAnalysis) {
                // Keep multi-selection toggle logic for Labels to allow Diff creation
                onToggleSelection(dragState.activeId);
                // Sync color
                setActiveColor(item.color);
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
  
  // Determine Context Menu Position and Anchor
  // Default to Live Target
  let contextTargetPos = targetSvg;
  // If a Saved Target is selected for the context menu AND live path is OFF, use its position
  if (!showCurrentTrajectory && contextMenuTargetId) {
      const savedItem = savedData.find(d => d.id === contextMenuTargetId);
      if (savedItem) {
          contextTargetPos = savedItem.targetPos;
      }
  }

  // Calculate if Context Menu should be Horizontal (if target is near bottom)
  const isNearBottom = (contextTargetPos.y / VIEWBOX_HEIGHT) > 0.75;
  const contextMenuIsHorizontal = isNearBottom;

  // Determine if context menu should show
  // If showCurrentTrajectory is true: only show if contextMenu is open (implied on live target)
  // If showCurrentTrajectory is false: show if contextMenu is open AND we have a saved target selected
  const shouldShowContextMenu = isContextMemoryOpen && (showCurrentTrajectory || contextMenuTargetId);

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

  const knobRad = (angle * Math.PI) / 180;
  const knobHandleX = tankSvg.x + knobRadius * Math.cos(knobRad);
  const knobHandleY = tankSvg.y - knobRadius * Math.sin(knobRad);

  // Dynamic Styles for Widgets
  const windWidgetClasses = isNight 
    ? 'bg-slate-800/95 border-slate-600'
    : 'bg-white/95 border-slate-200';
  
  const windTextClasses = isNight ? 'text-slate-300' : 'text-slate-700';
  const windLabelClasses = isNight ? 'text-slate-500' : 'text-slate-500';
  const windBtnClasses = isNight 
    ? 'bg-slate-700 hover:bg-slate-600 text-white' 
    : 'bg-slate-200 hover:bg-slate-300 text-slate-800';

  const glassClasses = isNight 
    ? 'bg-slate-900/80 border-slate-700 text-slate-200' 
    : 'bg-white/80 border-slate-200 text-slate-700';

  const mainColor = isNight ? "#38bdf8" : "#0284c7";

  // Shared Memory Item Renderer
  const renderMemoryItems = (isHorizontal: boolean = false) => (
      <div className={`flex items-center gap-2 animate-in slide-in-from-top-2 fade-in duration-200 ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
         <div className={`bg-slate-400/30 ${isHorizontal ? 'w-px h-4 mx-0.5' : 'w-4 h-px my-0.5'}`} />
         
         {/* Save Button */}
         <button 
             onClick={(e) => { e.stopPropagation(); onSaveTrajectory && onSaveTrajectory(activeColor); }}
             className="flex items-center justify-center w-8 h-8 rounded-full transition-all shadow-sm text-white hover:brightness-110"
             style={{ backgroundColor: activeColor }}
             title="Save Current"
         >
            <Save size={14} />
         </button>

         <div className={`bg-slate-400/30 ${isHorizontal ? 'w-px h-4 mx-0.5' : 'w-4 h-px my-0.5'}`} />

         {/* Color Prisms */}
         {trajectoryColors.map(color => {
             const { items, visibleCount } = colorStats[color] || { items: [], visibleCount: 0 };
             const count = items.length;
             const isAllVisible = count > 0 && visibleCount === count;
             const hasHidden = count > 0 && visibleCount < count;
             const isActive = color === activeColor;
             
             return (
                 <div key={color} className="relative group/prism">
                     <div 
                        onClick={(e) => { e.stopPropagation(); setActiveColor(color); }}
                        className={`
                            relative w-5 h-8 transition-all duration-300 cursor-pointer 
                            flex flex-col justify-end items-center pb-0.5
                            ${isActive ? 'scale-125 z-10 -translate-y-1' : 'hover:-translate-y-0.5 opacity-70 hover:opacity-100'}
                        `}
                     >  
                        <div 
                            className={`absolute inset-0 rounded-sm opacity-80 backdrop-blur-sm transition-all duration-300 ${isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent shadow-[0_0_12px_rgba(255,255,255,0.4)]' : 'border-t border-l border-r border-white/20'}`}
                            style={{ 
                                backgroundColor: isNight ? `${color}66` : `${color}55`, 
                                boxShadow: isActive ? `0 0 10px ${color}, inset 0 0 6px white` : `inset 0 0 8px ${color}22`,
                                borderBottom: `2px solid ${color}`
                            }}
                        />
                        
                        {count > 0 && (
                            <div 
                                className="w-2.5 mx-auto rounded-sm transition-all duration-500"
                                style={{ 
                                    height: `${Math.min(100, count * 15)}%`, 
                                    backgroundColor: color,
                                    boxShadow: `0 0 4px ${color}`
                                }}
                            />
                        )}

                        {hasHidden && (
                            <div className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-slate-500/80 ring-1 ring-white/50" />
                        )}
                     </div>

                     {/* Tooltip List */}
                     <div 
                        className={`
                         absolute opacity-0 invisible group-hover/prism:opacity-100 group-hover/prism:visible transition-all duration-200 z-50
                         ${isHorizontal 
                             ? 'bottom-full left-1/2 -translate-x-1/2 mb-3 w-40' // Horizontal mode: Pop UP
                             : 'right-full top-0 mr-3 mt-0 w-40'                 // Vertical mode: Pop LEFT
                         }
                        `}
                        onMouseEnter={() => setActiveColor(color)}
                     >
                         <div 
                            className={`p-2 rounded-xl shadow-xl border backdrop-blur-xl flex flex-col gap-1 ${glassClasses}`}
                            onPointerDown={(e) => e.stopPropagation()}
                         >
                             <div className="flex justify-between items-center px-1 pb-1 border-b border-slate-500/20 mb-1">
                                <span className="text-[9px] font-bold opacity-70 uppercase">Group</span>
                                {count > 0 && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onToggleColorVisibility && onToggleColorVisibility(color); }}
                                        className="hover:bg-slate-500/20 p-1 rounded transition-colors"
                                        title={isAllVisible ? "Hide All" : "Show All"}
                                    >
                                        {isAllVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                                    </button>
                                )}
                             </div>

                             {count === 0 && (
                                 <div className="text-[9px] text-center py-1 opacity-50">Empty</div>
                             )}

                             <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar">
                                 {items.map(t => {
                                     const isEditingThis = editingId === t.id;
                                     return (
                                     <div 
                                        key={t.id}
                                        onClick={() => onToggleSelection && onToggleSelection(t.id)}
                                        onMouseEnter={() => setHoveredTrajectoryId(t.id)}
                                        onMouseLeave={() => setHoveredTrajectoryId(null)}
                                        className={`
                                            relative p-1 rounded flex items-center justify-between text-[9px] cursor-pointer transition-all border
                                            ${selectedIds.includes(t.id) 
                                                ? 'bg-indigo-500/10 border-indigo-500' 
                                                : 'hover:bg-slate-500/10 border-transparent'}
                                        `}
                                     >  
                                        {isEditingThis ? (
                                            <div className="flex flex-wrap gap-1 p-0.5 w-full justify-center">
                                                {trajectoryColors.map(c => (
                                                    <button 
                                                        key={c}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (onUpdateTrajectoryColor) onUpdateTrajectoryColor(t.id, c);
                                                            setEditingId(null);
                                                        }}
                                                        className="w-3 h-3 rounded-full border border-white/20 hover:scale-125 transition-transform"
                                                        style={{ backgroundColor: c }}
                                                    />
                                                ))}
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                                                    className="w-3 h-3 flex items-center justify-center rounded-full bg-slate-500 text-white ml-1"
                                                >
                                                    <X size={8} />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-col z-10 leading-tight">
                                                    <div className="font-mono font-bold">
                                                        P:{t.power.toFixed(0)} <span className="opacity-50">|</span> A:{t.angle}°
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-0.5 z-10">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setEditingId(t.id); }}
                                                        className="p-0.5 rounded hover:bg-slate-500/20 opacity-50 hover:opacity-100"
                                                        title="Change Group"
                                                    >
                                                        <Palette size={9} />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onToggleVisibility && onToggleVisibility(t.id); }}
                                                        className={`p-0.5 rounded hover:bg-slate-500/20 ${t.visible ? 'opacity-100' : 'opacity-40'}`}
                                                    >
                                                        {t.visible ? <Eye size={9} /> : <EyeOff size={9} />}
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onDeleteTrajectory && onDeleteTrajectory(t.id); }}
                                                        className="p-0.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-500"
                                                    >
                                                        <Trash2 size={9} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                     </div>
                                 )})}
                             </div>
                             
                             <button 
                                onClick={() => {
                                    if (onSaveTrajectory) onSaveTrajectory(color);
                                    setActiveColor(color);
                                }}
                                className="mt-1 w-full py-1 text-[9px] font-bold text-center rounded bg-slate-500/10 hover:bg-slate-500/20 transition-colors opacity-70 hover:opacity-100"
                             >
                                + Add
                             </button>
                         </div>
                     </div>
                 </div>
             );
         })}
     </div>
  );

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

      {/* --- Error Toast --- */}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2">
           <div className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border backdrop-blur-md ${isNight ? 'bg-red-900/80 border-red-700 text-red-200' : 'bg-red-50/90 border-red-200 text-red-700'}`}>
                <AlertTriangle size={16} />
                <span className="text-xs font-bold">{error}</span>
           </div>
        </div>
      )}

      {/* --- FIXED Memory Bank Menu (Top Right) --- */}
      <div 
         {...fixedMemoryHandlers}
         className={`absolute top-24 right-4 backdrop-blur rounded-full border shadow-xl flex items-center z-20 transition-all duration-300 ease-in-out overflow-visible ${windWidgetClasses} ${isFixedMemoryExpanded ? 'flex-col p-2' : 'w-10 h-10 p-2 justify-center cursor-pointer hover:p-2'}`}
      >
        <div className="flex items-center justify-center">
             <Database size={16} className={isNight ? 'text-indigo-400' : 'text-indigo-600'} />
             {savedTrajectories.length > 0 && !isFixedMemoryExpanded && (
                 <span className="absolute -top-1 -right-1 w-3 h-3 text-[8px] flex items-center justify-center bg-indigo-500 text-white rounded-full border border-white dark:border-slate-900">
                     {savedTrajectories.length}
                 </span>
             )}
        </div>
        {isFixedMemoryExpanded && renderMemoryItems(false)}
      </div>

      {/* --- CONTEXT Memory Bank Menu (Attached to Target) --- */}
      {shouldShowContextMenu && (
          <div 
             className={`absolute z-30 flex flex-col items-center transition-all duration-300 ease-out`}
             style={{ 
                left: `${(contextTargetPos.x / VIEWBOX_WIDTH) * 100}%`, 
                top: `${(contextTargetPos.y / VIEWBOX_HEIGHT) * 100}%`,
                transform: contextMenuIsHorizontal ? 'translate(-50%, -100%) translateY(-24px)' : 'translate(24px, -22px)'
             }}
          >
              <div 
                className={`group flex items-center gap-2 p-1.5 rounded-full border backdrop-blur-md shadow-xl transition-all duration-300 ease-out cursor-pointer ${glassClasses} ${contextMenuIsHorizontal ? 'flex-row pr-3' : 'flex-col pb-3 rounded-2xl'}`}
                onPointerDown={(e) => e.stopPropagation()}
              >
                 <button 
                     onClick={(e) => {
                         e.stopPropagation();
                         setIsContextMemoryOpen(false);
                         setContextMenuTargetId(null);
                     }}
                     className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-500/20 text-indigo-500 relative"
                 >
                     <Database size={16} />
                     {savedTrajectories.length > 0 && (
                         <span className="absolute -top-1 -right-1 w-3 h-3 text-[8px] flex items-center justify-center bg-indigo-500 text-white rounded-full border border-white dark:border-slate-900">
                             {savedTrajectories.length}
                         </span>
                     )}
                 </button>

                 {/* Expanded Content */}
                 {renderMemoryItems(contextMenuIsHorizontal)}
              </div>
          </div>
      )}

      {/* --- Angle Fine Tune Widget (Floating relative to Tank) --- */}
      {isAngleFineTuneOpen && (
          <div 
            className={`absolute z-40 transform -translate-x-1/2 -translate-y-full mb-4 flex items-center gap-2 p-2 rounded-xl shadow-xl backdrop-blur-md border animate-in fade-in zoom-in-95 slide-in-from-bottom-2 ${windWidgetClasses}`}
            style={{ 
                left: `${(tankSvg.x / VIEWBOX_WIDTH) * 100}%`,
                top: `${(tankSvg.y / VIEWBOX_HEIGHT) * 100}%` 
            }}
            onPointerDown={(e) => e.stopPropagation()} // Prevent closing immediately
          >
              <div className="flex items-center gap-1">
                  <button onClick={() => setAngle(Math.max(0, angle - 1))} className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold ${windBtnClasses}`}>
                      <ChevronLeft size={16} />
                  </button>
                  <div className="flex flex-col items-center px-2 min-w-[3rem]">
                      <span className={`text-[10px] font-bold ${windLabelClasses} uppercase`}>Angle</span>
                      <span className={`text-xl font-bold font-mono ${isNight ? 'text-sky-400' : 'text-sky-600'}`}>{angle}°</span>
                  </div>
                  <button onClick={() => setAngle(Math.min(180, angle + 1))} className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold ${windBtnClasses}`}>
                      <ChevronRight size={16} />
                  </button>
              </div>
              <div className="w-px h-8 bg-slate-500/20 mx-1"></div>
              <button onClick={() => setIsAngleFineTuneOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-500 transition-colors">
                  <X size={14} />
              </button>
          </div>
      )}

      {/* --- Settings Widget (Top Right) --- */}
      <div 
         {...settingsHandlers}
         className={`absolute top-4 right-4 backdrop-blur rounded-xl border shadow-xl flex items-center z-20 transition-all duration-300 ease-in-out overflow-hidden ${windWidgetClasses} ${isSettingsExpanded ? 'w-48 p-2 gap-2' : 'w-10 h-10 p-2 justify-center cursor-pointer hover:w-48 hover:p-2 hover:gap-2'}`}
      >
        {isSettingsExpanded ? (
            <div className="flex w-full justify-between items-center gap-1">
                 <button onClick={() => setIsNight(!isNight)} className={`p-2 rounded-lg flex-1 flex justify-center ${isNight ? 'bg-slate-700 text-yellow-400' : 'bg-slate-200 text-slate-600'}`} title="Toggle Theme">
                    {isNight ? <Moon size={16} /> : <Sun size={16} />}
                 </button>
                 <button onClick={() => setSnapToGrid(!snapToGrid)} className={`p-2 rounded-lg flex-1 flex justify-center ${snapToGrid ? 'bg-indigo-500 text-white' : (isNight ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500')}`} title="Snap to Grid">
                    <Magnet size={16} />
                 </button>
                 <button onClick={() => setShowCurrentTrajectory(!showCurrentTrajectory)} className={`p-2 rounded-lg flex-1 flex justify-center ${showCurrentTrajectory ? 'bg-emerald-500 text-white' : (isNight ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500')}`} title="Toggle Path">
                    <Activity size={16} />
                 </button>
            </div>
        ) : (
            <Settings size={20} className={windTextClasses} />
        )}
      </div>

      {/* --- Wind Control Widget (Top Center) --- */}
      <div 
        {...windHandlers}
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

      {/* --- Power Control Widget (Bottom Right) --- */}
      <div 
        {...powerHandlers}
        className={`absolute bottom-28 right-4 backdrop-blur rounded-xl border shadow-xl flex items-center z-20 transition-all duration-300 ease-in-out overflow-hidden ${windWidgetClasses} ${isPowerExpanded ? 'w-64 p-3 gap-3 flex-col items-stretch' : 'w-24 p-2 gap-2 cursor-pointer hover:w-64 hover:p-3 hover:gap-3 justify-center'}`}
      >
        {isPowerExpanded ? (
             <div className="flex flex-col gap-2">
                 <div className="flex justify-between items-center">
                    <button 
                        onClick={() => setMode(mode === GameMode.AUTO_AIM ? GameMode.MANUAL : GameMode.AUTO_AIM)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-colors ${mode === GameMode.AUTO_AIM ? 'bg-sky-500 text-white' : (isNight ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500')}`}
                    >
                         {mode === GameMode.AUTO_AIM ? <Zap size={12} /> : <MousePointer2 size={12} />}
                         {mode === GameMode.AUTO_AIM ? 'AUTO' : 'MANUAL'}
                    </button>
                    <span className={`text-sm font-bold font-mono ${windTextClasses}`}>{power.toFixed(1)}</span>
                 </div>
                 
                 <div className="flex items-center gap-2">
                    <button onClick={() => { setPower(Math.max(0, Number((power - 1).toFixed(1)))); setMode(GameMode.MANUAL); }} className={`w-6 h-6 flex items-center justify-center rounded font-bold text-sm ${windBtnClasses}`}>-</button>
                    <div className="relative flex-1 h-5 flex items-center">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={power}
                            onChange={(e) => { setPower(Number(e.target.value)); setMode(GameMode.MANUAL); }}
                            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-orange-500 z-10 ${isNight ? 'bg-slate-700/50' : 'bg-slate-300/50'}`}
                        />
                         {mode === GameMode.AUTO_AIM && (
                             <div className="absolute inset-0 z-20 bg-sky-500/10 pointer-events-none rounded-lg border border-sky-500/30 flex items-center justify-center">
                                 <span className="text-[8px] font-bold text-sky-500 tracking-wider">AUTO-CALC</span>
                             </div>
                         )}
                    </div>
                    <button onClick={() => { setPower(Math.min(100, Number((power + 1).toFixed(1)))); setMode(GameMode.MANUAL); }} className={`w-6 h-6 flex items-center justify-center rounded font-bold text-sm ${windBtnClasses}`}>+</button>
                 </div>
             </div>
        ) : (
            <div className="flex items-center justify-center gap-2">
                {mode === GameMode.AUTO_AIM ? <Zap size={14} className="text-sky-500" /> : <MousePointer2 size={14} className="text-orange-500" />}
                <span className={`text-xs font-bold font-mono ${mode === GameMode.AUTO_AIM ? 'text-sky-500' : 'text-orange-500'}`}>
                    {power.toFixed(1)}
                </span>
            </div>
        )}
      </div>

      {/* --- Zoom Control Widget (Bottom Right) --- */}
      <div 
        {...zoomHandlers}
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

      {/* Top Left Analysis Info */}
      <div className={`absolute top-4 left-4 z-10 pointer-events-none backdrop-blur-md p-3 rounded-xl border shadow-sm ${isNight ? 'bg-slate-900/85 border-slate-700' : 'bg-white/85 border-slate-200'}`}>
        <h2 className={`text-xs font-bold ${isNight ? 'text-slate-400' : 'text-slate-600'} uppercase tracking-widest mb-0.5`}>Curve Analysis View</h2>
        <div className={`text-[10px] font-mono ${isNight ? 'text-slate-500' : 'text-slate-500'}`}>
            X: {currentMinX.toFixed(0)} to {currentMaxX.toFixed(0)} <span className="opacity-30 mx-1">|</span> Y: {currentMinY.toFixed(0)} to {currentMaxY.toFixed(0)}
        </div>
      </div>

      {/* Bottom Left Target Coordinate Overlay (Simplified Display with Matching Styles) */}
      {showCurrentTrajectory && (
        <div className={`absolute bottom-4 left-4 z-10 pointer-events-none backdrop-blur-md p-2 rounded-xl border shadow-sm transition-colors duration-300 ${windWidgetClasses}`}>
            <div className="flex items-center gap-2">
                <MapPin size={14} className={isNight ? 'text-sky-400' : 'text-sky-600'} />
                <div className={`text-xs font-bold font-mono ${isNight ? 'text-slate-300' : 'text-slate-600'}`}>
                    <span className="opacity-50 mr-0.5">X:</span>{dx}
                    <span className="opacity-30 mx-1.5">|</span>
                    <span className="opacity-50 mr-0.5">Y:</span>{dy}
                </div>
            </div>
        </div>
      )}
      
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
        {savedData.map((sd) => {
             // Logic for dimming non-focused items
             // If any item is "focused" (hovered or selected), then any item NOT focused is dimmed.
             const isAnyFocused = hoveredTrajectoryId !== null || selectedIds.length > 0;
             const isFocused = hoveredTrajectoryId === sd.id || selectedIds.includes(sd.id);
             const isDimmed = isAnyFocused && !isFocused;

             return (
            <g key={`lines-${sd.id}`} style={{ pointerEvents: 'none', opacity: isDimmed ? 0.2 : 1, filter: isDimmed ? 'grayscale(100%)' : 'none', transition: 'all 0.3s ease' }}>
                {/* Only draw path if it's NOT an analysis item */}
                {!sd.isAnalysis && (
                    <path d={sd.d} fill="none" stroke={sd.color} strokeWidth={(isFocused ? 3 : 2) * pixelScale} strokeDasharray={`${5*pixelScale},${5*pixelScale}`} className={isFocused ? '' : 'opacity-60'} />
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
        )})}

        {/* LAYER 2: Draggable Labels (Always on top of lines) */}
        {savedData.map((sd) => {
             const isAnyFocused = hoveredTrajectoryId !== null || selectedIds.length > 0;
             const isFocused = hoveredTrajectoryId === sd.id || selectedIds.includes(sd.id);
             const isDimmed = isAnyFocused && !isFocused;

             return (
             <g 
                key={`label-${sd.id}`}
                transform={`translate(${sd.labelPos.x}, ${sd.labelPos.y}) scale(${pixelScale})`} 
                className="cursor-move group"
                style={{ opacity: isDimmed ? 0.2 : 1, filter: isDimmed ? 'grayscale(100%)' : 'none', transition: 'all 0.3s ease' }}
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
        )})}

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