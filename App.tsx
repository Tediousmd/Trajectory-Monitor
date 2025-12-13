import React, { useState, useEffect, useMemo } from 'react';
import GameCanvas from './components/GameCanvas';
import Controls from './components/Controls';
import { GameMode, Point, PHYSICS_CONSTANTS, ThemeMode, SavedTrajectory } from './types';
import { solvePower, calculateTrajectory } from './services/physicsEngine';

// Tank position is fixed at origin for analysis view
const TANK_POS: Point = { x: 0, y: 0 }; 
// Initial target placed in a typical "shot" location (positive X, slight positive Y)
const INITIAL_TARGET: Point = { x: 15, y: 5 };

function App() {
  const [mode, setMode] = useState<GameMode>(GameMode.AUTO_AIM);
  const [isNight, setIsNight] = useState(true);
  const [zoom, setZoom] = useState(1.0); // 1.0 = Default view range defined in constants
  const [snapToGrid, setSnapToGrid] = useState(false);
  
  // Inputs
  const [angle, setAngle] = useState(65);
  const [wind, setWind] = useState(0);
  const [manualPower, setManualPower] = useState(50);
  const [target, setTarget] = useState<Point>(INITIAL_TARGET);

  // Memory / History
  const [savedTrajectories, setSavedTrajectories] = useState<SavedTrajectory[]>([]);

  // Derived State
  const [calculatedPower, setCalculatedPower] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Screen Size (Used for Aspect Ratio calculation mainly)
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  const saveCurrentTrajectory = () => {
      const newEntry: SavedTrajectory = {
          id: Date.now().toString(),
          power: manualPower,
          angle: angle,
          wind: wind,
          target: { ...target },
          visible: true,
          timestamp: Date.now()
      };
      setSavedTrajectories(prev => [newEntry, ...prev]);
  };

  const deleteTrajectory = (id: string) => {
      setSavedTrajectories(prev => prev.filter(t => t.id !== id));
  };

  const toggleTrajectoryVisibility = (id: string) => {
      setSavedTrajectories(prev => prev.map(t => 
        t.id === id ? { ...t, visible: !t.visible } : t
      ));
  };

  return (
    <div className={`flex h-screen w-screen overflow-hidden transition-colors duration-500 ${isNight ? 'bg-slate-950' : 'bg-slate-100'}`}>
        {/* Main Canvas Area */}
        <div className="flex-1 h-full p-4 flex flex-col items-center justify-center relative">
            <div className="w-full h-full max-w-7xl max-h-[85vh] relative flex items-center justify-center">
                {/* Maintain aspect ratio of the physics world, adapted by zoom */}
                <div 
                  className="w-full h-full shadow-2xl rounded-xl overflow-hidden"
                  // We let the SVG handle aspect ratio internally via viewBox, 
                  // but we want the container to be responsive.
                >
                    <GameCanvas 
                        trajectory={trajectory}
                        target={target}
                        tankPos={TANK_POS}
                        onSetTarget={setTarget}
                        impactPoint={impactPoint}
                        angle={angle}
                        setAngle={setAngle}
                        zoom={zoom}
                        isNight={isNight}
                        wind={wind}
                        setWind={setWind}
                        snapToGrid={snapToGrid}
                        savedTrajectories={savedTrajectories}
                    />
                </div>
            </div>
             <div className={`mt-4 text-sm ${isNight ? 'text-slate-500' : 'text-slate-400'}`}>
                Click map to move target • Drag angle pointer to aim • Zoom to see more
            </div>
        </div>

        {/* Sidebar Controls */}
        <Controls 
            angle={angle}
            setAngle={setAngle}
            wind={wind}
            setWind={setWind}
            power={manualPower}
            setPower={setManualPower}
            mode={mode}
            setMode={setMode}
            target={target}
            tankPos={TANK_POS}
            calculationResult={calculatedPower}
            error={error}
            isNight={isNight}
            setIsNight={setIsNight}
            zoom={zoom}
            setZoom={setZoom}
            snapToGrid={snapToGrid}
            setSnapToGrid={setSnapToGrid}
            onSaveTrajectory={saveCurrentTrajectory}
            savedTrajectories={savedTrajectories}
            onDeleteTrajectory={deleteTrajectory}
            onToggleVisibility={toggleTrajectoryVisibility}
        />
    </div>
  );
}

export default App;