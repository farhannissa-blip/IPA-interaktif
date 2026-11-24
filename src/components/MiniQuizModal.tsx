import React, { useState } from 'react';
import { Check, RotateCcw, X, ArrowRight } from 'lucide-react';
import { GRADE5_QUIZ, WATER_CYCLE_STAGES, WaterCycleStageId } from '../data/waterCycleData';

interface MiniQuizModalProps {
  open: boolean;
  onClose: () => void;
  onInspectStage: (stageId: WaterCycleStageId) => void;
}

export const MiniQuizModal: React.FC<MiniQuizModalProps> = ({
  open,
  onClose,
  onInspectStage,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  if (!open) return null;

  const question = GRADE5_QUIZ[currentIdx];
  const answered = selectedOption !== null;
  const isCorrect = selectedOption === question.correctIndex;

  const handleSelect = (optionIdx: number) => {
    if (answered) return;
    setSelectedOption(optionIdx);
    if (optionIdx === question.correctIndex) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIdx + 1 < GRADE5_QUIZ.length) {
      setCurrentIdx((prev) => prev + 1);
      setSelectedOption(null);
    } else {
      setFinished(true);
    }
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setSelectedOption(null);
    setScore(0);
    setFinished(false);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#040912]/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-[#0d1626] border border-[#d4af6a]/30 shadow-2xl overflow-hidden text-[#f4f1ea]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <div className="text-xs font-mono-tabular text-[#d4af6a]">
              Evaluasi IPA Kelas 5 SD · {finished ? 'Selesai' : `Soal ${currentIdx + 1} / ${GRADE5_QUIZ.length}`}
            </div>
            <h2 id="quiz-modal-title" className="font-display text-2xl font-semibold tracking-tight text-[#f7f3ea]">
              Kuis Kilat Siklus Air
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kuis"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#b7c2d1] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto custom-scroll">
          {finished ? (
            <div className="space-y-5">
              <div className="py-4 border-b border-white/10">
                <p className="text-sm text-[#a8b6c9]">Hasil Pemahamanmu</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="font-display text-5xl font-semibold text-[#e6c278] font-mono-tabular">
                    {score} / {GRADE5_QUIZ.length}
                  </span>
                  <span className="text-sm text-[#d4dce7]">
                    ({Math.round((score / GRADE5_QUIZ.length) * 100)}%)
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#cfd8e4]">
                  {score === GRADE5_QUIZ.length
                    ? 'Luar biasa! Kamu sudah memahami seluruh tahapan siklus air dengan sangat tepat.'
                    : score >= 3
                      ? 'Bagus sekali! Kamu sudah memahami sebagian besar proses siklus air. Coba amati kembali diorama 3D untuk menyempurnakannya.'
                      : 'Terus semangat belajar! Sentuh setiap bagian diorama 3D untuk mengamati proses siklus air tahap demi tahap.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/15 text-sm font-medium text-[#e4eaf2] hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Ulangi Kuis
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#d4af6a] text-[#09111f] text-sm font-semibold hover:bg-[#e1be7c] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Kembali ke Diorama 3D
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-base leading-relaxed font-medium text-[#f4f1ea]">
                {question.question}
              </p>

              <div className="space-y-2.5">
                {question.options.map((opt, idx) => {
                  const isThisSelected = selectedOption === idx;
                  const isThisCorrect = idx === question.correctIndex;
                  let buttonStyle =
                    'bg-[#132035] border-white/12 text-[#dce4ef] hover:border-[#d4af6a]/55 hover:bg-[#192942]';

                  if (answered) {
                    if (isThisCorrect) {
                      buttonStyle =
                        'bg-[#11312a] border-[#48c99a]/70 text-[#e7fff5]';
                    } else if (isThisSelected) {
                      buttonStyle =
                        'bg-[#381b24] border-[#e56b7d]/70 text-[#ffe6ea]';
                    } else {
                      buttonStyle = 'bg-[#0f192b] border-white/8 text-[#7c8ca3]';
                    }
                  }

                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={answered}
                      onClick={() => handleSelect(idx)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${buttonStyle} ${answered ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span className="text-sm leading-snug">
                        <span className="font-mono-tabular text-xs opacity-70 mr-2.5">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        {opt}
                      </span>
                      {answered && isThisCorrect && (
                        <Check className="w-4 h-4 shrink-0 text-[#5ce0ae]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {answered && (
                <div className="pt-4 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium">
                    <span className={isCorrect ? 'text-[#5ce0ae]' : 'text-[#f28a99]'}>
                      {isCorrect ? 'Jawaban Benar' : 'Kurang Tepat'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onInspectStage(question.relatedStage);
                        onClose();
                      }}
                      className="text-[#d4af6a] hover:underline whitespace-nowrap cursor-pointer"
                    >
                      Lihat {WATER_CYCLE_STAGES[question.relatedStage].shortLabel} di 3D →
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed text-[#cfd8e4]">
                    {question.explanation}
                  </p>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleNext}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#d4af6a] text-[#09111f] text-sm font-semibold hover:bg-[#e1be7c] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {currentIdx + 1 < GRADE5_QUIZ.length ? 'Soal Berikutnya' : 'Lihat Hasil'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
