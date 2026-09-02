import React from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';

/**
 * One disclosure control shared by both shells. Coach keeps the review focused
 * on decisions and move quality; Pro reveals the engine's comparative data.
 */
export const AnalysisExperienceToggle: React.FC = () => {
  const { experience, updateSettings } = useGameStore(
    (state) => ({
      experience: state.settings.analysisExperience,
      updateSettings: state.updateSettings,
    }),
    shallow,
  );

  return (
    <div
      className="analysis-experience-toggle"
      role="group"
      aria-label="Analysis detail"
      data-analysis-experience={experience}
    >
      <button
        type="button"
        className={experience === 'coach' ? 'active' : ''}
        aria-pressed={experience === 'coach'}
        title="Coach: plain-language guidance and move quality"
        onClick={() => updateSettings({ analysisExperience: 'coach' })}
      >
        Coach
      </button>
      <button
        type="button"
        className={experience === 'pro' ? 'active' : ''}
        aria-pressed={experience === 'pro'}
        title="Pro: full win rate, score, visits, policy, and engine detail"
        onClick={() => updateSettings({ analysisExperience: 'pro' })}
      >
        Pro
      </button>
    </div>
  );
};
