import React, { useState, useEffect, useMemo } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameMode, Point, SavedTrajectory, AnalysisItem } from './types';
import { solvePower, calculateTrajectory } from './services/physicsEngine';

// Tank position is fixed at origin for analysis view
const TANK_POS: Point = { x: 0, y: 0 }; 
// Initial target placed in a typical "shot" location (positive X, slight positive Y)
const INITIAL_TARGET: Point = { x: 15, y: 5 };

export const TRAJECTORY_COLORS = [
  '#a855f7', // Purple
  '#ef4444', // Red
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#f97316', // Orange
  '#06b6d4', // Cyan
];

function App() {
  const [mode, setMode] = useState<GameMode>(GameMode.AUTO_AIM);
  const [isNight, setIsNight] = useState(false); // Default to Day mode
  const [zoom, setZoom] = useState(0.7); // Default view range 70%
  const [snapToGrid, setSnapToGrid] = useState(true); // Default to Snap ON
  const [showCurrentTrajectory, setShowCurrentTrajectory] = useState(true); 
  
  // Inputs
  const [angle, setAngle] = useState(65);
  const [wind, setWind] = useState(0);
  const [manualPower, setManualPower] = useState(50);
  const [target, setTarget] = useState<Point>(INITIAL_TARGET);

  // Memory / History
  const [savedTrajectories, setSavedTrajectories] = useState<SavedTrajectory[]>([]);
  
  // Analysis Items (Managed on Canvas now)
  const [analysisItems, setAnalysisItems] = useState<AnalysisItem[]>([]);

  // Selection State (Shared)
  // Order matters: [FirstSelected, SecondSelected]
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Derived State
  const [calculatedPower, setCalculatedPower] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 0. Theme Sync Effect: Ensure body background matches app theme to prevent "black bars"
  useEffect(() => {
    document.body.className = isNight 
        ? 'bg-slate-950 text-slate-100 overflow-hidden' 
        : 'bg-slate-100 text-slate-900 overflow-hidden';
  }, [isNight]);

  // 1. Logic Loop: Handle Physics Calculation
  useEffect(() => {
    // Relative distance components
    const dist = target.x - TANK_POS.x;
    const height = target.y - TANK_POS.y;

    if (dist <= 0) {
        setError("Target must be to the right of the player");
        setCalculatedPower(null);
        return;
    }

    // Try to solve for power
    const neededPower = solvePower(dist, height, angle, wind);
    
    if (neededPower === null) {
       setError("Target unreachable with current angle/wind");
       setCalculatedPower(null);
    } else if (neededPower === -99999) {
        setError("Force insufficient (Out of range or strong headwind)");
        setCalculatedPower(null);
    } else {
        setError(null);
        setCalculatedPower(neededPower);
        
        // If in Auto-Aim, sync manual power for smoother transition
        if (mode === GameMode.AUTO_AIM) {
            // Check bounds
            if (neededPower > 100) {
               setError("Required power exceeds limit (100)");
               setManualPower(100); 
            } else {
               setManualPower(neededPower);
            }
        }
    }
  }, [target, angle, wind, mode]);

  // 2. Logic Loop: Generate Trajectory Points
  const trajectory = useMemo(() => {
    return calculateTrajectory(TANK_POS, manualPower, angle, wind);
  }, [manualPower, angle, wind]);

  // Find where it hits ground or target height
  const impactPoint = useMemo(() => {
      if (trajectory.length === 0) return null;
      return trajectory[trajectory.length - 1];
  }, [trajectory]);

  // --- Memory Functions ---
  const saveCurrentTrajectory = (preferredColor?: string) => {
      const newEntry: SavedTrajectory = {
          id: Date.now().toString(),
          power: manualPower,
          angle: angle,
          wind: wind,
          target: { ...target },
          visible: true,
          color: preferredColor || TRAJECTORY_COLORS[0], 
          timestamp: Date.now()
      };
      setSavedTrajectories(prev => [newEntry, ...prev]);
  };

  const deleteTrajectory = (id: string) => {
      setSavedTrajectories(prev => prev.filter(t => t.id !== id));
      // Also cleanup analysis items that depend on this
      setAnalysisItems(prev => prev.filter(a => !a.parentIds.includes(id)));
      // Cleanup selection
      setSelectedIds(prev => prev.filter(pid => pid !== id));
  };

  const updateTrajectoryColor = (id: string, newColor: string) => {
      setSavedTrajectories(prev => prev.map(t => 
          t.id === id ? { ...t, color: newColor } : t
      ));
  };

  const toggleTrajectoryVisibility = (id: string) => {
      setSavedTrajectories(prev => prev.map(t => 
        t.id === id ? { ...t, visible: !t.visible } : t
      ));
  };

  const toggleColorVisibility = (color: string) => {
      setSavedTrajectories(prev => {
          const group = prev.filter(t => t.color === color);
          if (group.length === 0) return prev;
          const allVisible = group.every(t => t.visible);
          return prev.map(t => {
              if (t.color === color) {
                  return { ...t, visible: !allVisible };
              }
              return t;
          });
      });
  };

  // --- Analysis Functions ---
  const handleToggleSelection = (id: string) => {
      setSelectedIds(prev => {
          if (prev.includes(id)) {
              // Unselect
              return prev.filter(pid => pid !== id);
          } else {
              // Select
              if (prev.length >= 2) {
                  // If we already have 2, shift the oldest one out (First selected becomes the one that remains)
                  return [prev[1], id]; 
              }
              return [...prev, id];
          }
      });
  };

  const handleSelectExclusive = (id: string) => {
      setSelectedIds(prev => {
          // If this ID is already the single selection, toggle it off
          if (prev.length === 1 && prev[0] === id) {
              return [];
          }
          // Otherwise, select it exclusively
          return [id];
      });
  };

  const handleAnalyze = (id1: string, id2: string) => {
      const t1 = savedTrajectories.find(t => t.id === id1);
      const t2 = savedTrajectories.find(t => t.id === id2);
      
      if (!t1 || !t2) return;

      // Logic: First Selected (t1) - Second Selected (t2)
      const diffPower = t1.power - t2.power;
      
      const midX = (t1.target.x + t2.target.x) / 2;
      const midY = (t1.target.y + t2.target.y) / 2;

      const newItem: AnalysisItem = {
          id: `diff-${Date.now()}`,
          powerDiff: diffPower,
          target: { x: midX, y: midY },
          parentIds: [id1, id2],
          visible: true,
          color: t1.color, // Inherit color from the first selected trajectory
      };

      setAnalysisItems(prev => [newItem, ...prev]);
      setSelectedIds([]); // Clear selection after creating Diff
  };

  const deleteAnalysisItem = (id: string) => {
      setAnalysisItems(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className={`fixed inset-0 w-full h-full flex overflow-hidden transition-colors duration-500 ${isNight ? 'bg-slate-950' : 'bg-slate-100'}`}>
        <style>{`
          ::-webkit-scrollbar-thumb {
            background-color: ${isNight ? '#334155' : '#cbd5e1'};
          }
          ::-webkit-scrollbar-thumb:hover {
            background-color: ${isNight ? '#475569' : '#94a3b8'};
          }
          ::-webkit-scrollbar-track {
            background-color: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }
        `}</style>

        <div className="flex-1 relative z-0 h-full w-full min-w-0 flex flex-col items-center justify-center transition-all duration-300 ease-in-out">
            <div className="w-full h-full relative flex items-center justify-center">
                <div className="w-full h-full overflow-hidden relative">
                    <GameCanvas 
                        trajectory={trajectory}
                        target={target}
                        tankPos={TANK_POS}
                        onSetTarget={setTarget}
                        impactPoint={impactPoint}
                        angle={angle}
                        setAngle={setAngle}
                        zoom={zoom}
                        setZoom={setZoom}
                        isNight={isNight}
                        setIsNight={setIsNight}
                        wind={wind}
                        setWind={setWind}
                        power={manualPower}
                        setPower={setManualPower}
                        mode={mode}
                        setMode={setMode}
                        error={error}
                        snapToGrid={snapToGrid}
                        setSnapToGrid={setSnapToGrid}
                        
                        // Trajectory Data
                        savedTrajectories={savedTrajectories}
                        analysisItems={analysisItems}
                        trajectoryColors={TRAJECTORY_COLORS}

                        // Memory Actions
                        onSaveTrajectory={saveCurrentTrajectory}
                        onDeleteTrajectory={deleteTrajectory}
                        onUpdateTrajectoryColor={updateTrajectoryColor}
                        onToggleVisibility={toggleTrajectoryVisibility}
                        onToggleColorVisibility={toggleColorVisibility}
                        onDeleteAnalysis={deleteAnalysisItem}
                        
                        // Analysis Actions
                        showCurrentTrajectory={showCurrentTrajectory}
                        setShowCurrentTrajectory={setShowCurrentTrajectory}
                        selectedIds={selectedIds} 
                        onToggleSelection={handleToggleSelection} 
                        onSelectExclusive={handleSelectExclusive}
                        onAnalyze={handleAnalyze} 
                    />
                </div>
            </div>
        </div>
    </div>
  );
}

export default App;