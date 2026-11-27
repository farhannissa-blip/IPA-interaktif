/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NarrationPart,
  NarrationPlayer,
  NarrationState,
} from './audio/narrationPlayer';
import { SoundEngine } from './audio/soundEngine';
import { MiniQuizModal } from './components/MiniQuizModal';
import { WaterCycleHUD } from './components/WaterCycleHUD';
import {
  STAGE_ORDER,
  WATER_CYCLE_STAGES,
  WaterCycleStageId,
} from './data/waterCycleData';
import {
  detectRecommendedQuality,
  HotspotScreenPosition,
  InteractiveZoneId,
  QualityMode,
  WaterCycleEngine,
} from './three/WaterCycleEngine';

const HOTSPOT_IDS: InteractiveZoneId[] = [
  'evaporasi',
  'transpirasi',
  'kondensasi',
  'presipitasi',
  'infiltrasi',
];

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<WaterCycleEngine | null>(null);
  const narrationRef = useRef<NarrationPlayer | null>(null);
  const ambientRef = useRef<SoundEngine | null>(null);
  const autoTourDelayRef = useRef<number | null>(null);
  const hotspotDomRefs = useRef<Record<InteractiveZoneId, HTMLButtonElement | null>>({
    evaporasi: null,
    transpirasi: null,
    kondensasi: null,
    presipitasi: null,
    infiltrasi: null,
  });

  const [activeStage, setActiveStage] = useState<WaterCycleStageId>('overview');
  const [autoPlay, setAutoPlay] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [narrationEnabled, setNarrationEnabled] = useState(true);
  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [narrationState, setNarrationState] = useState<NarrationState>({
    isPlaying: false,
    stageId: null,
    part: null,
  });
  const [qualityMode, setQualityMode] = useState<QualityMode>(() => detectRecommendedQuality());
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const initialQualityRef = useRef<QualityMode>(qualityMode);

  // Refs for callbacks so WebGL engine mounts strictly once
  const activeStageRef = useRef<WaterCycleStageId>(activeStage);
  activeStageRef.current = activeStage;

  const showGuidesRef = useRef<boolean>(showGuides);
  showGuidesRef.current = showGuides;

  const narrationEnabledRef = useRef<boolean>(narrationEnabled);
  narrationEnabledRef.current = narrationEnabled;

  const clearAutoTourDelay = useCallback(() => {
    if (autoTourDelayRef.current !== null) {
      window.clearTimeout(autoTourDelayRef.current);
      autoTourDelayRef.current = null;
    }
  }, []);

  // Initialize NarrationPlayer & Three.js WebGL Engine once in isolated ref container
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const ambient = new SoundEngine();
    ambientRef.current = ambient;

    const narration = new NarrationPlayer((state) => {
      setNarrationState(state);
      ambient.setDucked(state.isPlaying);
    });
    narration.setEnabled(narrationEnabledRef.current);
    narrationRef.current = narration;

    const handleHotspotsProject = (positions: HotspotScreenPosition[]) => {
      const visibleGuides = showGuidesRef.current;
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const btn = hotspotDomRefs.current[pos.id];
        if (!btn) continue;
        if (!visibleGuides || !pos.visible) {
          btn.style.opacity = '0';
          btn.style.pointerEvents = 'none';
        } else {
          btn.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
        }
      }
    };

    const engine = new WaterCycleEngine(
      mountEl,
      {
        onStageSelect: (stageId, fromTouch) => {
          setActiveStage(stageId);
          if (fromTouch) {
            setAutoPlay(false);
            clearAutoTourDelay();
          }
          ambient.setStage(stageId);
          if (narrationEnabledRef.current) {
            narration.play(stageId, 'main');
          }
        },
        onHotspotsProject: handleHotspotsProject,
        onContextLost: () => setContextLost(true),
        onContextRestored: () => setContextLost(false),
      },
      initialQualityRef.current
    );

    engineRef.current = engine;

    return () => {
      clearAutoTourDelay();
      engine.dispose();
      engineRef.current = null;
      narration.dispose();
      narrationRef.current = null;
      ambient.dispose();
      ambientRef.current = null;
    };
  }, [clearAutoTourDelay]);

  // Select stage programmatically from HUD / Quiz / Labels / Keyboard
  const handleSelectStage = useCallback(
    (stageId: WaterCycleStageId, onNarrationEnd?: () => void) => {
      setActiveStage(stageId);
      engineRef.current?.setStage(stageId, true);
      ambientRef.current?.setStage(stageId);
      if (narrationEnabledRef.current) {
        narrationRef.current?.play(stageId, 'main', onNarrationEnd);
      } else {
        narrationRef.current?.stop();
      }
    },
    []
  );

  const handleNextStage = useCallback(() => {
    setAutoPlay(false);
    clearAutoTourDelay();
    const idx = STAGE_ORDER.indexOf(activeStageRef.current);
    const next = STAGE_ORDER[(idx + 1) % STAGE_ORDER.length];
    handleSelectStage(next);
  }, [clearAutoTourDelay, handleSelectStage]);

  const handlePrevStage = useCallback(() => {
    setAutoPlay(false);
    clearAutoTourDelay();
    const idx = STAGE_ORDER.indexOf(activeStageRef.current);
    const prev = STAGE_ORDER[(idx - 1 + STAGE_ORDER.length) % STAGE_ORDER.length];
    handleSelectStage(prev);
  }, [clearAutoTourDelay, handleSelectStage]);

  // Smart Auto-Tour: waits for voice narration to finish before gliding to next stage!
  useEffect(() => {
    clearAutoTourDelay();
    if (!autoPlay || quizOpen) return;

    let cancelled = false;

    const advanceTour = (targetStage: WaterCycleStageId) => {
      if (cancelled) return;
      const scheduleNext = () => {
        if (cancelled) return;
        const delayMs = narrationEnabledRef.current ? 1600 : 6500;
        autoTourDelayRef.current = window.setTimeout(() => {
          if (cancelled) return;
          const idx = STAGE_ORDER.indexOf(activeStageRef.current);
          const next = STAGE_ORDER[(idx + 1) % STAGE_ORDER.length];
          advanceTour(next);
        }, delayMs);
      };

      setActiveStage(targetStage);
      engineRef.current?.setStage(targetStage, true);
      ambientRef.current?.setStage(targetStage);

      if (narrationEnabledRef.current) {
        narrationRef.current?.play(targetStage, 'main', scheduleNext);
      } else {
        scheduleNext();
      }
    };

    advanceTour(activeStageRef.current);

    return () => {
      cancelled = true;
      clearAutoTourDelay();
    };
  }, [autoPlay, quizOpen, narrationEnabled, clearAutoTourDelay]);

  // Sync 3D flow guide visibility
  useEffect(() => {
    engineRef.current?.setFlowGuidesVisible(showGuides);
  }, [showGuides]);

  // Sync rendering quality mode (Ringan / Tinggi)
  useEffect(() => {
    engineRef.current?.setQualityMode(qualityMode);
  }, [qualityMode]);

  // Toggle global narration ON/OFF
  const handleToggleNarrationEnabled = useCallback(() => {
    setNarrationEnabled((prev) => {
      const next = !prev;
      narrationRef.current?.setEnabled(next);
      if (next) {
        narrationRef.current?.play(activeStageRef.current, 'main');
      }
      return next;
    });
  }, []);

  // Toggle procedural nature ambient soundscape ON/OFF
  const handleToggleAmbient = useCallback(() => {
    setAmbientEnabled((prev) => {
      const next = !prev;
      ambientRef.current?.setEnabled(next);
      if (next) {
        ambientRef.current?.setStage(activeStageRef.current);
      }
      return next;
    });
  }, []);

  // Play/Pause main or extra narration for current stage
  const handleTogglePlayPart = useCallback((part: NarrationPart) => {
    setAutoPlay(false);
    clearAutoTourDelay();
    setNarrationEnabled(true);
    ambientRef.current?.setStage(activeStageRef.current);
    narrationRef.current?.toggle(activeStageRef.current, part);
  }, [clearAutoTourDelay]);

  // Automatically play Fakta & Contoh extra narration when expanded (if narration is enabled)
  const handleOpenFacts = useCallback(() => {
    if (!narrationEnabledRef.current) return;
    setAutoPlay(false);
    clearAutoTourDelay();
    narrationRef.current?.play(activeStageRef.current, 'extra');
  }, [clearAutoTourDelay]);

  // Keyboard shortcuts (ArrowLeft, ArrowRight, Space, H for Cinema mode)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (quizOpen) {
        if (e.key === 'Escape') setQuizOpen(false);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleNextStage();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevStage();
      } else if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quizOpen, handleNextStage, handlePrevStage]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-gradient-to-b from-[#2c82cf] via-[#74c1f2] to-[#bce3fc]">
      {/* Dedicated Isolated WebGL Canvas Container */}
      <div
        ref={canvasMountRef}
        className="canvas-touch-stage absolute inset-0 w-full h-full"
        aria-label="Diorama 3D interaktif siklus air — sentuh layar untuk berpindah proses demi proses"
      />

      {/* Graceful WebGL Context Loss Fallback */}
      {contextLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#1c5c99]/92 p-6 text-center">
          <div className="max-w-md space-y-3">
            <h2 className="font-display text-2xl font-semibold text-white">
              Tampilan 3D Sedang Memulihkan Grafis
            </h2>
            <p className="text-sm text-[#e1f1ff]">
              Konteks WebGL terhenti sementara. Muat ulang halaman jika tampilan tidak muncul kembali secara otomatis.
            </p>
          </div>
        </div>
      )}

      {/* Semantic 3D Projected Hotspot Labels (Updated via direct DOM transforms at 60fps) */}
      <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden" aria-hidden={!showGuides}>
        {HOTSPOT_IDS.map((id) => {
          const st = WATER_CYCLE_STAGES[id];
          const isActive = activeStage === id;
          const isExplainingNow =
            isActive &&
            (autoPlay || (narrationState.isPlaying && narrationState.stageId === id));
          return (
            <button
              key={id}
              ref={(el) => {
                hotspotDomRefs.current[id] = el;
              }}
              type="button"
              onClick={() => {
                setAutoPlay(false);
                clearAutoTourDelay();
                handleSelectStage(id);
              }}
              style={{
                opacity: 0,
                willChange: 'transform, opacity',
                borderColor: isActive ? st.accentHex : undefined,
                boxShadow: isActive
                  ? isExplainingNow
                    ? `0 0 0 2px ${st.accentHex}66, 0 0 24px ${st.accentHex}99, 0 8px 20px rgba(4,12,26,0.65)`
                    : `0 0 0 1px ${st.accentHex}55, 0 0 16px ${st.accentHex}66, 0 6px 16px rgba(4,12,26,0.55)`
                  : undefined,
                backgroundColor: isActive ? 'rgba(9, 22, 42, 0.96)' : undefined,
              }}
              className={`fixed top-0 left-0 flex items-center gap-2 rounded-lg border transition-all duration-200 cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'px-3.5 py-1.5 text-white z-20'
                  : 'px-2.5 py-1 bg-[#091220]/76 border-white/16 text-[#c7d6e8] hover:border-[#d4af6a]/65 hover:text-white'
              }`}
            >
              {isActive && (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {isExplainingNow && (
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-80"
                      style={{ backgroundColor: st.accentHex }}
                    />
                  )}
                  <span
                    className="relative inline-flex rounded-full h-2.5 w-2.5"
                    style={{ backgroundColor: st.accentHex }}
                  />
                </span>
              )}
              <span
                className={`font-mono-tabular ${isActive ? 'text-xs font-bold' : 'text-[11px] font-medium'}`}
                style={{ color: st.accentHex }}
              >
                {st.stepNumber}
              </span>
              <span
                className={
                  isActive
                    ? 'text-[13px] font-bold tracking-wide text-white'
                    : 'text-xs font-medium tracking-wide'
                }
              >
                {st.shortLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Luxury Editorial HUD & Unified Collapsible Bottom Dock */}
      <WaterCycleHUD
        activeStage={activeStage}
        onSelectStage={(id) => {
          setAutoPlay(false);
          clearAutoTourDelay();
          handleSelectStage(id);
        }}
        onPrevStage={handlePrevStage}
        onNextStage={handleNextStage}
        autoPlay={autoPlay}
        onToggleAutoPlay={() => setAutoPlay((prev) => !prev)}
        showGuides={showGuides}
        onToggleGuides={() => setShowGuides((prev) => !prev)}
        narrationEnabled={narrationEnabled}
        onToggleNarrationEnabled={handleToggleNarrationEnabled}
        ambientEnabled={ambientEnabled}
        onToggleAmbient={handleToggleAmbient}
        narrationState={narrationState}
        onTogglePlayPart={handleTogglePlayPart}
        onOpenFacts={handleOpenFacts}
        qualityMode={qualityMode}
        onToggleQuality={() =>
          setQualityMode((prev) => (prev === 'ringan' ? 'tinggi' : 'ringan'))
        }
        onResetCamera={() => engineRef.current?.resetCamera()}
        onOpenQuiz={() => {
          setAutoPlay(false);
          clearAutoTourDelay();
          narrationRef.current?.stop();
          setQuizOpen(true);
        }}
        dockCollapsed={dockCollapsed}
        onToggleDock={() => setDockCollapsed((prev) => !prev)}
      />

      {/* Grade 5 Interactive Water Cycle Quiz Modal */}
      <MiniQuizModal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        onInspectStage={(stageId) => {
          setAutoPlay(false);
          clearAutoTourDelay();
          handleSelectStage(stageId);
        }}
      />
    </main>
  );
}
