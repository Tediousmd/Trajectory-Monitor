import React from 'react';
import { GameMode, Point, SavedTrajectory } from '../types';
import { Wind, Crosshair, Zap, MousePointer2, Sun, Moon, ZoomIn, ZoomOut, Magnet, Save, Trash2, Eye, EyeOff, Plus, Minus } from 'lucide-react';

interface ControlsProps {
  angle: number;
  setAngle: (v: number) => void;
  wind: number;
  setWind: (v: number) => void;
  power: number;
  setPower: (v: number) => void;
  mode: GameMode;
  setMode: (m: GameMode) => void;
  target: Point;
  tankPos: Point;
  calculationResult: number | null;
  error: string | null;
  isNight: boolean;
  setIsNight: (v: boolean) => void;
  zoom: number;
  setZoom: (v: number) => void;
  snapToGrid: boolean;
  setSnapToGrid: (v: boolean) => void;
  // Memory props
  onSaveTrajectory: () => void;
  savedTrajectories: SavedTrajectory[];
  onDeleteTrajectory: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

const Controls: React.FC<ControlsProps> = ({
  angle,
  setAngle,
  wind,
  setWind,
  power,
  setPower,
  mode,
  setMode,
  target,
  tankPos,
  calculationResult,
  error,
  isNight,
  setIsNight,
  zoom,
  setZoom,
  snapToGrid,
  setSnapToGrid,
  onSaveTrajectory,
  savedTrajectories,
  onDeleteTrajectory,
  onToggleVisibility
}) => {
  const dist = Math.abs(target.x - tankPos.x).toFixed(2);
  const heightDiff = (target.y - tankPos.y).toFixed(2);

  const handleModeToggle = (newMode: GameMode) => {
    setMode(newMode);
    if (newMode === GameMode.AUTO_AIM && calculationResult) {
      setPower(calculationResult);
    }
  };

  const adjustAngle = (delta: number) => {
    setAngle(Math.min(180, Math.max(0, angle + delta)));
  };

  const adjustWind = (delta: number) => {
    setWind(Number((Math.min(150, Math.max(-150, wind + delta))).toFixed(1)));
  };

  const adjustPower = (delta: number) => {
     setMode(GameMode.MANUAL);
     setPower(Number((Math.min(100, Math.max(0, power + delta))).toFixed(1)));
  };

  const themeClasses = isNight 
    ? {
      bg: 'bg-slate-900',
      border: 'border-slate-700',
      text: 'text-white',
      subText: 'text-slate-400',
      inputBg: 'bg-slate-700',
      btnBg: 'bg-slate-800 hover:bg-slate-700',
      panelBg: 'bg-slate-800'
    } 
    : {
      bg: 'bg-white',
      border: 'border-slate-200',
      text: 'text-slate-900',
      subText: 'text-slate-500',
      inputBg: 'bg-slate-200',
      btnBg: 'bg-slate-100 hover:bg-slate-200',
      panelBg: 'bg-slate-50'
    };

  return (
    <div className={`flex flex-col h-full ${themeClasses.bg} border-l ${themeClasses.border} shadow-xl w-full max-w-sm overflow-hidden transition-colors duration-500`}>
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="flex justify-between items-start">
            <div>
                <h1 className={`text-2xl font-bold ${themeClasses.text} mb-1 flex items-center gap-2`}>
                <Crosshair className="text-sky-500" />
                Ballistic Master
                </h1>
                <p className={`${themeClasses.subText} text-sm`}>Trajectory Calculation System</p>
            </div>
            <button 
                onClick={() => setIsNight(!isNight)}
                className={`p-2 rounded-full ${isNight ? 'bg-slate-800 text-yellow-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} transition-colors`}
            >
                {isNight ? <Moon size={20} /> : <Sun size={20} />}
            </button>
        </div>

        {/* Mode Switcher */}
        <div className={`grid grid-cols-2 gap-2 p-1 ${isNight ? 'bg-slate-800' : 'bg-slate-200'} rounded-lg`}>
            <button
            onClick={() => handleModeToggle(GameMode.AUTO_AIM)}
            className={`flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                mode === GameMode.AUTO_AIM
                ? 'bg-sky-600 text-white shadow-lg'
                : `${themeClasses.subText} hover:${themeClasses.text} hover:bg-white/10`
            }`}
            >
            <Zap size={16} />
            Auto-Aim
            </button>
            <button
            onClick={() => handleModeToggle(GameMode.MANUAL)}
            className={`flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                mode === GameMode.MANUAL
                ? 'bg-orange-600 text-white shadow-lg'
                : `${themeClasses.subText} hover:${themeClasses.text} hover:bg-white/10`
            }`}
            >
            <MousePointer2 size={16} />
            Manual
            </button>
        </div>

        {/* Target Info & Zoom */}
        <div className="space-y-4">
            <div className={`${isNight ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'} p-4 rounded-lg border`}>
                <div className="flex justify-between items-center mb-3">
                    <h3 className={`text-xs font-bold ${themeClasses.subText} uppercase tracking-wider`}>Target Data</h3>
                    <button
                        onClick={() => setSnapToGrid(!snapToGrid)}
                        className={`text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                            snapToGrid 
                            ? 'bg-indigo-600 border-indigo-500 text-white' 
                            : `${isNight ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-300'} ${themeClasses.subText}`
                        }`}
                        title="Snap to nearest integer coordinate"
                    >
                        <Magnet size={12} />
                        {snapToGrid ? 'Snap ON' : 'Snap OFF'}
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                    <div className={`${themeClasses.subText} text-xs mb-1`}>Distance</div>
                    <div className={`text-xl font-mono ${themeClasses.text}`}>{dist}</div>
                    </div>
                    <div>
                    <div className={`${themeClasses.subText} text-xs mb-1`}>Height Diff</div>
                    <div className={`text-xl font-mono ${themeClasses.text}`}>{heightDiff}</div>
                    </div>
                </div>
            </div>

            {/* Global Zoom */}
            <div>
                <div className="flex justify-between items-end mb-2">
                <label className={`text-sm font-medium ${isNight ? 'text-indigo-200' : 'text-indigo-600'} flex items-center gap-2`}>
                    <ZoomOut size={14} /> View Range <ZoomIn size={14} />
                </label>
                <span className={`text-sm font-bold font-mono ${themeClasses.text}`}>{(zoom * 100).toFixed(0)}%</span>
                </div>
                <input
                type="range"
                min="0.25"
                max="2.5"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className={`w-full h-2 ${themeClasses.inputBg} rounded-lg appearance-none cursor-pointer accent-indigo-500`}
                />
            </div>
        </div>

        {/* Inputs */}
        <div className="space-y-6">
            {/* Angle */}
            <div>
                <div className="flex justify-between items-end mb-2">
                    <label className={`text-sm font-medium ${isNight ? 'text-sky-200' : 'text-sky-600'}`}>Angle</label>
                    <span className={`text-2xl font-bold font-mono ${themeClasses.text}`}>{angle}°</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => adjustAngle(-1)} className={`p-2 rounded-md ${themeClasses.btnBg} transition-colors ${themeClasses.text}`}>
                        <Minus size={16} />
                    </button>
                    <input
                        type="range"
                        min="0"
                        max="180"
                        step="1"
                        value={angle}
                        onChange={(e) => setAngle(Number(e.target.value))}
                        className={`flex-1 h-2 ${themeClasses.inputBg} rounded-lg appearance-none cursor-pointer accent-sky-500`}
                    />
                     <button onClick={() => adjustAngle(1)} className={`p-2 rounded-md ${themeClasses.btnBg} transition-colors ${themeClasses.text}`}>
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {/* Wind */}
            <div>
                <div className="flex justify-between items-end mb-2">
                    <label className={`text-sm font-medium ${isNight ? 'text-emerald-200' : 'text-emerald-700'} flex items-center gap-1`}>
                        <Wind size={14} /> Wind
                    </label>
                    <span className={`text-2xl font-bold font-mono ${themeClasses.text}`}>{wind}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => adjustWind(-0.5)} className={`p-2 rounded-md ${themeClasses.btnBg} transition-colors ${themeClasses.text}`}>
                        <Minus size={16} />
                    </button>
                    <div className="relative pt-1 flex-1">
                        <input
                            type="range"
                            min="-150"
                            max="150"
                            step="0.5"
                            value={wind}
                            onChange={(e) => setWind(Number(e.target.value))}
                            className={`w-full h-2 ${themeClasses.inputBg} rounded-lg appearance-none cursor-pointer accent-emerald-500`}
                        />
                        <div className="absolute top-0 left-1/2 w-0.5 h-4 bg-slate-400 -translate-x-1/2 -translate-y-1"></div>
                    </div>
                    <button onClick={() => adjustWind(0.5)} className={`p-2 rounded-md ${themeClasses.btnBg} transition-colors ${themeClasses.text}`}>
                        <Plus size={16} />
                    </button>
                </div>
                <div className={`flex justify-between text-xs ${themeClasses.subText} mt-1`}>
                    <span>Against (-150)</span>
                    <span>0</span>
                    <span>With (+150)</span>
                </div>
            </div>

            {/* Power */}
            <div className={`transition-opacity duration-300 ${mode === GameMode.AUTO_AIM ? 'opacity-80 pointer-events-none grayscale' : 'opacity-100'}`}>
                <div className="flex justify-between items-end mb-2">
                    <label className={`text-sm font-medium ${isNight ? 'text-orange-200' : 'text-orange-600'}`}>Power</label>
                    <span className={`text-2xl font-bold font-mono ${themeClasses.text}`}>{power.toFixed(1)}</span>
                </div>
                <div className="relative flex items-center gap-2">
                     <button onClick={() => adjustPower(-1)} className={`p-2 rounded-md ${themeClasses.btnBg} transition-colors ${themeClasses.text}`}>
                        <Minus size={16} />
                    </button>
                    <div className="flex-1 relative">
                        <input
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        value={power}
                        onChange={(e) => {
                            setPower(Number(e.target.value));
                            setMode(GameMode.MANUAL);
                        }}
                        className={`w-full h-2 ${themeClasses.inputBg} rounded-lg appearance-none cursor-pointer accent-orange-500`}
                        />
                         {mode === GameMode.AUTO_AIM && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center">
                                <span className={`text-xs ${isNight ? 'bg-slate-800 border-sky-900' : 'bg-white border-sky-200'} text-sky-500 px-2 py-0.5 rounded border shadow-sm`}>Auto-Calculated</span>
                            </div>
                        )}
                    </div>
                     <button onClick={() => adjustPower(1)} className={`p-2 rounded-md ${themeClasses.btnBg} transition-colors ${themeClasses.text}`}>
                        <Plus size={16} />
                    </button>
                </div>
            </div>
        </div>

        {/* Memory / Saved Trajectories */}
        <div>
            <div className="flex justify-between items-center mb-3">
                <h3 className={`text-xs font-bold ${themeClasses.subText} uppercase tracking-wider`}>Memory Bank</h3>
                <button 
                    onClick={onSaveTrajectory}
                    className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded transition-colors"
                >
                    <Save size={12} /> Save
                </button>
            </div>
            
            <div className={`max-h-48 overflow-y-auto space-y-2 pr-1 ${isNight ? 'scrollbar-track-slate-800 scrollbar-thumb-slate-600' : ''}`}>
                {savedTrajectories.length === 0 ? (
                    <div className={`text-xs ${themeClasses.subText} text-center py-4 italic`}>
                        No saved trajectories
                    </div>
                ) : (
                    savedTrajectories.map(t => (
                        <div key={t.id} className={`p-2 rounded text-xs flex items-center justify-between group ${isNight ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'} border`}>
                             <div className="flex flex-col gap-0.5">
                                 <div className="font-mono text-[10px] text-purple-400">
                                     P:{t.power.toFixed(1)} A:{t.angle}° W:{t.wind}
                                 </div>
                                 <div className={`${themeClasses.subText} text-[10px]`}>
                                     Target: ({t.target.x.toFixed(1)}, {t.target.y.toFixed(1)})
                                 </div>
                             </div>
                             <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                 <button onClick={() => onToggleVisibility(t.id)} className={`p-1 hover:bg-white/10 rounded ${t.visible ? 'text-sky-400' : 'text-slate-500'}`}>
                                     {t.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                 </button>
                                 <button onClick={() => onDeleteTrajectory(t.id)} className="p-1 hover:bg-white/10 rounded text-red-400 hover:text-red-500">
                                     <Trash2 size={14} />
                                 </button>
                             </div>
                        </div>
                    ))
                )}
            </div>
        </div>

      </div>

      {/* Status Footer */}
      <div className={`p-6 border-t ${themeClasses.border}`}>
        {error ? (
           <div className="bg-red-500/10 border border-red-500/30 p-3 rounded text-red-500 text-sm flex items-center gap-2">
             <span className="font-bold">ERROR:</span> {error}
           </div>
        ) : (
            <div className="flex items-center justify-between text-sm">
                 <span className={themeClasses.subText}>System Status</span>
                 <span className="text-emerald-500 font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    READY
                 </span>
            </div>
        )}
      </div>
    </div>
  );
};

export default Controls;