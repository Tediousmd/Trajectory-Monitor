import React, { useMemo, useState, useRef, useEffect } from 'react';
import { SavedTrajectory } from '../types';
import { TRAJECTORY_COLORS } from '../App';
import { Database, Eye, EyeOff, Save, Trash2, CheckCircle2 } from 'lucide-react';

interface MemoryDockProps {
  isNight: boolean;
  savedTrajectories: SavedTrajectory[];
  onSaveTrajectory: (color?: string) => void;
  onDeleteTrajectory: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleColorVisibility: (color: string) => void;
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
}

const MemoryDock: React.FC<MemoryDockProps> = ({
  isNight,
  savedTrajectories,
  onSaveTrajectory,
  onDeleteTrajectory,
  onToggleVisibility,
  onToggleColorVisibility,
  selectedIds,
  onToggleSelection
}) => {
  // Aggregate stats by color
  const colorStats = useMemo(() => {
    const stats: Record<string, { items: SavedTrajectory[], visibleCount: number }> = {};
    TRAJECTORY_COLORS.forEach(c => {
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
  }, [savedTrajectories]);

  const totalSaved = savedTrajectories.length;
  
  const glassClasses = isNight 
    ? 'bg-slate-900/80 border-slate-700 text-slate-200' 
    : 'bg-white/80 border-slate-200 text-slate-700';

  // --- Dragging Logic ---
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
      // Initial position: Top Right area
      setPosition({ x: window.innerWidth - 80, y: 100 });
      setIsVisible(true);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragOffset.current = {
          x: e.clientX - position.x,
          y: e.clientY - position.y
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!isDragging) return;
      setPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y
      });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      setIsDragging(false);
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  if (!isVisible) return null;

  return (
    <div 
        style={{ left: position.x, top: position.y }}
        className="fixed z-50 flex flex-col items-center select-none"
    >
      
      {/* Main Dock Container - Vertical & Draggable */}
      <div 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`group flex flex-col items-center gap-2 p-2 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-300 ease-out hover:pb-4 cursor-grab active:cursor-grabbing ${glassClasses} ${totalSaved === 0 ? 'h-auto' : 'h-12 hover:h-auto overflow-hidden hover:overflow-visible'}`}
      >
        
        {/* Dock Handle / Icon */}
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-indigo-500/20 text-indigo-500 relative pointer-events-none">
             <Database size={18} />
             {totalSaved > 0 && (
                 <span className="absolute -top-1 -right-1 w-4 h-4 text-[9px] flex items-center justify-center bg-indigo-500 text-white rounded-full border border-white dark:border-slate-900">
                     {totalSaved}
                 </span>
             )}
        </div>

        {/* Expandable Content (Vertical Stack) */}
        <div className="flex flex-col items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75 transform translate-y-4 group-hover:translate-y-0 h-0 group-hover:h-auto w-full">
             <div className="w-6 h-px bg-slate-400/30 my-1" />
             
             <button 
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
                onClick={() => onSaveTrajectory()}
                className={`flex flex-col items-center justify-center w-8 h-8 rounded-lg transition-all shadow-sm ${isNight ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-indigo-500 hover:bg-indigo-600 text-white'}`}
                title="Save Current"
             >
                <Save size={16} />
             </button>

             <div className="w-6 h-px bg-slate-400/30 my-1" />

             {TRAJECTORY_COLORS.map(color => {
                 const { items, visibleCount } = colorStats[color];
                 const count = items.length;
                 const isAllVisible = count > 0 && visibleCount === count;
                 const hasHidden = count > 0 && visibleCount < count;
                 
                 return (
                     <div key={color} className="relative group/prism">
                         {/* The Data Prism (Chip) - Vertical Bar */}
                         <div 
                            className={`
                                relative w-6 h-10 transition-all duration-300 cursor-pointer 
                                flex flex-col justify-end items-center pb-1
                                hover:-translate-y-1 hover:shadow-[0_0_15px_rgba(0,0,0,0.3)]
                            `}
                         >  
                            {/* Prism Body */}
                            <div 
                                className="absolute inset-0 rounded-sm opacity-80 backdrop-blur-sm border-t border-l border-r border-white/20"
                                style={{ 
                                    backgroundColor: isNight ? `${color}44` : `${color}33`, // Low opacity bg
                                    boxShadow: `inset 0 0 10px ${color}22`,
                                    borderBottom: `3px solid ${color}`
                                }}
                            />
                            
                            {/* Inner "Data" Level indicator */}
                            {count > 0 && (
                                <div 
                                    className="w-3 mx-auto rounded-sm transition-all duration-500"
                                    style={{ 
                                        height: `${Math.min(100, count * 15)}%`, 
                                        backgroundColor: color,
                                        boxShadow: `0 0 5px ${color}`
                                    }}
                                />
                            )}

                            {/* Visibility Dot Indicator */}
                            {hasHidden && (
                                <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-slate-500/80 ring-1 ring-white/50" />
                            )}
                         </div>

                         {/* Dropdown / Tooltip for Trajectory List - Appears to LEFT */}
                         <div className="absolute right-full top-0 mr-3 mt-0 w-48 opacity-0 invisible group-hover/prism:opacity-100 group-hover/prism:visible transition-all duration-200 z-50">
                             <div 
                                className={`p-2 rounded-xl shadow-xl border backdrop-blur-xl flex flex-col gap-1 ${glassClasses}`}
                                onPointerDown={(e) => e.stopPropagation()} // Prevent drag start inside tooltip
                             >
                                 {/* Header */}
                                 <div className="flex justify-between items-center px-1 pb-1 border-b border-slate-500/20 mb-1">
                                    <span className="text-[10px] font-bold opacity-70 uppercase">Freq: {color}</span>
                                    {count > 0 && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onToggleColorVisibility(color); }}
                                            className="hover:bg-slate-500/20 p-1 rounded transition-colors"
                                            title={isAllVisible ? "Hide All" : "Show All"}
                                        >
                                            {isAllVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                                        </button>
                                    )}
                                 </div>

                                 {/* Empty State */}
                                 {count === 0 && (
                                     <div className="text-[10px] text-center py-2 opacity-50">Empty Slot</div>
                                 )}

                                 {/* List */}
                                 <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                                     {items.map(t => (
                                         <div 
                                            key={t.id}
                                            onClick={() => onToggleSelection(t.id)}
                                            className={`
                                                relative p-1.5 rounded flex items-center justify-between text-[10px] cursor-pointer transition-all border
                                                ${selectedIds.includes(t.id) 
                                                    ? 'bg-indigo-500/10 border-indigo-500' 
                                                    : 'hover:bg-slate-500/10 border-transparent'}
                                            `}
                                         >  
                                            {/* Selection Highlight BG */}
                                            {selectedIds.includes(t.id) && <div className="absolute inset-0 bg-indigo-500/5 animate-pulse rounded pointer-events-none" />}

                                            <div className="flex flex-col z-10">
                                                <div className="flex items-center gap-1 font-mono font-bold">
                                                    <span>P:{t.power.toFixed(0)}</span>
                                                    <span className="opacity-50">|</span>
                                                    <span>A:{t.angle}°</span>
                                                </div>
                                                <div className="opacity-60 text-[9px]">W:{t.wind}</div>
                                            </div>

                                            <div className="flex items-center gap-1 z-10">
                                                {selectedIds.includes(t.id) && <CheckCircle2 size={10} className="text-indigo-500" />}
                                                
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(t.id); }}
                                                    className={`p-1 rounded hover:bg-slate-500/20 ${t.visible ? 'opacity-100' : 'opacity-40'}`}
                                                >
                                                    {t.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onDeleteTrajectory(t.id); }}
                                                    className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-500"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                         </div>
                                     ))}
                                 </div>
                                 
                                 {/* Save to this color shortcut */}
                                 <button 
                                    onClick={() => onSaveTrajectory(color)}
                                    className="mt-1 w-full py-1 text-[10px] font-bold text-center rounded bg-slate-500/10 hover:bg-slate-500/20 transition-colors opacity-70 hover:opacity-100"
                                 >
                                    + Add Current
                                 </button>
                             </div>
                         </div>
                     </div>
                 );
             })}
        </div>
      </div>
    </div>
  );
};

export default MemoryDock;