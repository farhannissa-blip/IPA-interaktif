import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  GraduationCap,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  BookOpen,
  Zap,
  Wind,
} from 'lucide-react';
import {
  STAGE_ORDER,
  WATER_CYCLE_STAGES,
  WaterCycleStageId,
} from '../data/waterCycleData';
import { NarrationPart, NarrationState } from '../audio/narrationPlayer';
import { STAGE_AMBIENT_LABELS } from '../audio/soundEngine';
import { QualityMode } from '../three/WaterCycleEngine';

interface WaterCycleHUDProps {
  activeStage: WaterCycleStageId;
  onSelectStage: (stageId: WaterCycleStageId) => void;
  onPrevStage: () => void;
  onNextStage: () => void;
  autoPlay: boolean;
  onToggleAutoPlay: () => void;
  showGuides: boolean;
  onToggleGuides: () => void;
  narrationEnabled: boolean;
  onToggleNarrationEnabled: () => void;
  ambientEnabled: boolean;
  onToggleAmbient: () => void;
  narrationState: NarrationState;
  onTogglePlayPart: (part: NarrationPart) => void;
  onOpenFacts: () => void;
  qualityMode: QualityMode;
  onToggleQuality: () => void;
  onResetCamera: () => void;
  onOpenQuiz: () => void;
  dockCollapsed: boolean;
  onToggleDock: () => void;
}

export const WaterCycleHUD: React.FC<WaterCycleHUDProps> = ({
  activeStage,
  onSelectStage,
  onPrevStage,
  onNextStage,
  autoPlay,
  onToggleAutoPlay,
  showGuides,
  onToggleGuides,
  narrationEnabled,
  onToggleNarrationEnabled,
  ambientEnabled,
  onToggleAmbient,
  narrationState,
  onTogglePlayPart,
  onOpenFacts,
  qualityMode,
  onToggleQuality,
  onResetCamera,
  onOpenQuiz,
  dockCollapsed,
  onToggleDock,
}) => {
  const [showMoreFacts, setShowMoreFacts] = useState(false);
  const stage = WATER_CYCLE_STAGES[activeStage];
  const isPlayingMain =
    narrationState.isPlaying &&
    narrationState.stageId === activeStage &&
    narrationState.part === 'main';
  const isPlayingExtra =
    narrationState.isPlaying &&
    narrationState.stageId === activeStage &&
    narrationState.part === 'extra';

  return (
    <>
      {/* Top-Left Minimal Editorial Title (Zero Pill Enclosures, Crisp Over Bright Sky Blue) */}
      <header className="pointer-events-none fixed top-5 left-6 z-20 max-w-md">
        <h1
          className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-none"
          style={{ textShadow: '0 2px 14px rgba(12, 42, 82, 0.45)' }}
        >
          Siklus Air
        </h1>
        <p
          className="mt-1.5 text-xs sm:text-[13px] font-medium text-[#f0f8ff] tracking-wide"
          style={{ textShadow: '0 1px 10px rgba(10, 38, 76, 0.55)' }}
        >
          IPA Kelas 5 SD <span className="mx-1.5 text-[#ffe196]">·</span> Diorama Hidrologi 3D Interaktif
        </p>
      </header>

      {/* Unified Collapsible Bottom Control Dock (Dead-Center on All Viewports, No backdrop-filter) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 sm:bottom-4 z-30 flex justify-center px-3 sm:px-4">
        <div
          className="w-full max-w-[940px] transition-transform duration-300 ease-out"
          style={{
            transform: dockCollapsed ? 'translateY(calc(100% + 16px))' : 'translateY(0)',
          }}
        >
          {/* Attached Collapse / Expand Handle on Top Edge */}
          <div className="flex justify-center mb-1.5">
            <button
              type="button"
              onClick={onToggleDock}
              aria-label={dockCollapsed ? 'Tampilkan panel kontrol' : 'Sembunyikan panel kontrol'}
              className="pointer-events-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-t-xl rounded-b-md bg-[#0a1322]/94 border border-[#d4af6a]/30 text-xs font-medium text-[#d8e1ed] hover:text-white hover:border-[#d4af6a]/65 transition-colors whitespace-nowrap cursor-pointer shadow-lg"
              style={{
                transform: dockCollapsed ? 'translateY(-44px)' : 'translateY(0)',
              }}
            >
              {dockCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-[#d4af6a]" />
                  Tampilkan Panel (H)
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-[#d4af6a]" />
                  Mode Sinema (H)
                </>
              )}
            </button>
          </div>

          {/* Main Luxury Dock Surface (Solid RGBA — Zero backdrop-filter over WebGL) */}
          <section
            aria-label="Panel materi dan navigasi siklus air"
            className="pointer-events-auto rounded-2xl bg-[#0a1322]/94 border border-[#d4af6a]/28 shadow-[0_20px_50px_rgba(2,6,14,0.74)] overflow-hidden"
          >
          {/* Upper Band: Contextual Grade-5 Curriculum Information */}
          <div className="px-4 sm:px-5 pt-3.5 pb-3 border-b border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1.5">
              <div className="flex items-baseline gap-2.5 min-w-0">
                <span
                  className="font-mono-tabular text-xs font-medium shrink-0"
                  style={{ color: stage.accentHex }}
                >
                  {stage.stepNumber} / 05
                </span>
                <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#f8f4ec] leading-tight truncate">
                  {stage.title}
                </h2>
                <span className="hidden md:inline text-xs text-[#9cb0c9] truncate">
                  — {stage.indonesianSubtitle}
                </span>
              </div>

              {/* Clean Unboxed Scientific Metadata with Typographic Separators (Zero Pills) */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-mono-tabular text-[#b8c6d8] shrink-0">
                <span style={{ color: stage.accentHex }}>{stage.phaseTransform}</span>
                <span aria-hidden="true" className="text-white/25">·</span>
                <span>{stage.temperatureLabel}</span>
                <span aria-hidden="true" className="text-white/25">·</span>
                <span>{stage.altitudeLabel}</span>
              </div>
            </div>

            <div className="mt-1.5 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <p className="text-xs sm:text-[13.5px] leading-relaxed text-[#dbe3ee] max-w-3xl">
                {stage.summary}
              </p>
              <div className="flex items-center gap-3 shrink-0 self-start sm:self-end">
                <button
                  type="button"
                  onClick={() => onTogglePlayPart('main')}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer py-1 ${
                    isPlayingMain
                      ? 'text-[#f4d78f]'
                      : 'text-[#8ec8f5] hover:text-[#bee2ff]'
                  }`}
                >
                  {isPlayingMain ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Jeda Narasi</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Dengar Narasi</span>
                    </>
                  )}
                </button>
                <span aria-hidden="true" className="text-white/20 text-xs">·</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !showMoreFacts;
                    setShowMoreFacts(nextOpen);
                    if (nextOpen) {
                      onOpenFacts();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#d4af6a] hover:text-[#ebd096] transition-colors whitespace-nowrap cursor-pointer py-1"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  {showMoreFacts ? 'Ringkas' : 'Fakta & Contoh'}
                </button>
              </div>
            </div>

            {showMoreFacts && (
              <div className="mt-2.5 pt-2.5 border-t border-white/8 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-relaxed text-[#c6d3e3]">
                  <div>
                    <span className="font-semibold text-[#e6c57f]">Fakta Sains: </span>
                    {stage.detailFact}
                  </div>
                  <div>
                    <span className="font-semibold text-[#7fd1f2]">Contoh Sehari-hari: </span>
                    {stage.dailyExample}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onTogglePlayPart('extra')}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer py-0.5 ${
                      isPlayingExtra
                        ? 'text-[#f4d78f]'
                        : 'text-[#7fd1f2] hover:text-[#b4e8ff]'
                    }`}
                  >
                    {isPlayingExtra ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Jeda Narasi Fakta & Contoh</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Dengar Narasi Fakta & Contoh</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Lower Band: Unified Step Controls, Process Tabs & Utility Actions */}
          <div className="px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            {/* Step-by-Step Selector */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5 sm:pb-0">
              <button
                type="button"
                onClick={onPrevStage}
                aria-label="Tahap sebelumnya"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#c7d3e3] hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1" role="tablist" aria-label="Tahapan siklus air">
                {STAGE_ORDER.map((id) => {
                  const s = WATER_CYCLE_STAGES[id];
                  const isActive = activeStage === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onSelectStage(id)}
                      className={`px-2.5 sm:px-3 h-9 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                        isActive
                          ? 'bg-[#17263d] text-[#fbf8f1] border-[#d4af6a]/70'
                          : 'bg-transparent text-[#a8b8cd] border-transparent hover:text-white hover:bg-white/6'
                      }`}
                    >
                      {id === 'overview' ? 'Utuh' : `${Number(s.stepNumber)}. ${s.shortLabel}`}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onNextStage}
                aria-label="Tahap berikutnya"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#c7d3e3] hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Utility Controls */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                onClick={onToggleAutoPlay}
                title={autoPlay ? 'Jeda tur otomatis' : 'Putar tur otomatis tahap demi tahap'}
                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  autoPlay
                    ? 'bg-[#d4af6a] text-[#09111f] border-[#d4af6a]'
                    : 'bg-[#111d30] text-[#dce4ef] border-white/12 hover:border-[#d4af6a]/50'
                }`}
              >
                {autoPlay ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{autoPlay ? 'Jeda' : 'Tur'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleGuides}
                title={showGuides ? 'Sembunyikan label & panah alur 3D' : 'Tampilkan label & panah alur 3D'}
                className={`inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showGuides
                    ? 'bg-[#132238] text-[#e8eef7] border-white/15 hover:border-[#d4af6a]/50'
                    : 'bg-transparent text-[#8fa2ba] border-white/10 hover:text-white'
                }`}
              >
                {showGuides ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">Label</span>
              </button>

              <button
                type="button"
                onClick={onToggleNarrationEnabled}
                title={
                  narrationEnabled
                    ? 'Suara narasi aktif — klik untuk membisukan'
                    : 'Suara narasi nonaktif — klik untuk mengaktifkan'
                }
                aria-label={narrationEnabled ? 'Matikan suara narasi' : 'Nyalakan suara narasi'}
                className={`inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  narrationEnabled
                    ? 'bg-[#15293e] text-[#e6c57f] border-[#d4af6a]/45'
                    : 'bg-transparent text-[#8fa2ba] border-white/10 hover:text-white'
                }`}
              >
                {narrationEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="hidden md:inline">Narasi</span>
              </button>

              <button
                type="button"
                onClick={onToggleAmbient}
                title={
                  ambientEnabled
                    ? `Suara alam aktif (${STAGE_AMBIENT_LABELS[activeStage]}) — klik untuk mematikan`
                    : `Nyalakan suara alam (${STAGE_AMBIENT_LABELS[activeStage]})`
                }
                aria-label={ambientEnabled ? 'Matikan suara alam' : 'Nyalakan suara alam'}
                className={`inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  ambientEnabled
                    ? 'bg-[#112a2e] text-[#78dce8] border-[#38c7d4]/45'
                    : 'bg-transparent text-[#8fa2ba] border-white/10 hover:text-white'
                }`}
              >
                <Wind className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Alam</span>
              </button>

              <button
                type="button"
                onClick={onToggleQuality}
                title={
                  qualityMode === 'ringan'
                    ? 'Mode Ringan aktif (hemat GPU untuk HP & PID) — klik untuk Mode Tinggi'
                    : 'Mode Tinggi aktif (bayangan penuh) — klik untuk Mode Ringan'
                }
                className={`inline-flex items-center gap-1 px-2.5 h-9 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  qualityMode === 'ringan'
                    ? 'bg-[#122a2a] text-[#7be0c3] border-[#52c79a]/45'
                    : 'bg-[#132238] text-[#dce4ef] border-white/15 hover:border-[#d4af6a]/50'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {qualityMode === 'ringan' ? 'Ringan' : 'Tinggi'}
                </span>
              </button>

              <button
                type="button"
                onClick={onResetCamera}
                title="Atur ulang sudut kamera"
                aria-label="Atur ulang sudut kamera"
                className="w-9 h-9 rounded-lg flex items-center justify-center border border-white/10 text-[#9db0c8] hover:text-white hover:border-white/25 transition-colors shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onOpenQuiz}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-[#16273f] border border-[#d4af6a]/45 text-xs font-semibold text-[#f1d594] hover:bg-[#1e3352] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <GraduationCap className="w-4 h-4" />
                <span>Kuis</span>
              </button>
            </div>
          </div>

          {/* Quiet Touch Prompt Footer Line */}
          <div className="px-4 sm:px-5 py-1.5 bg-[#070e1a] border-t border-white/6 flex items-center justify-between gap-2 text-[11px] text-[#8ea1ba]">
            <span className="truncate">{stage.touchPrompt}</span>
            <span className="hidden sm:inline shrink-0 text-[#6e829c]">
              Seret untuk memutar · Cubit/gulir untuk zoom
            </span>
          </div>
          </section>
        </div>
      </div>
    </>
  );
};
