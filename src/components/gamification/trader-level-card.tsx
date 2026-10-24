'use client';

import React from 'react';
import { TraderProfile, AchievementBadge } from '@/lib/gamification/trader-achievements';

interface TraderLevelCardProps {
  profile: TraderProfile;
  onClaimBadge?: (badgeId: string) => void;
}

export const TraderLevelCard: React.FC<TraderLevelCardProps> = ({ profile }) => {
  const xpPercent = Math.min(
    100,
    Math.max(0, ((500 - profile.xpToNextLevel) / 500) * 100)
  );

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl text-white shadow-2xl space-y-6">
      {/* Header with Level & Rank */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">
            {profile.rank}
          </span>
          <h2 className="text-2xl font-bold tracking-tight">Nível {profile.currentLevel}</h2>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full text-emerald-400 text-sm font-medium">
          <span>🔥</span>
          <span>Streak: {profile.disciplinedTradesStreak} trades</span>
        </div>
      </div>

      {/* XP Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>{profile.totalXp} XP Acumulados</span>
          <span>Faltam {profile.xpToNextLevel} XP para o próximo nível</span>
        </div>
        <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
      </div>

      {/* Badges Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center justify-between">
          <span>Conquistas de Disciplina</span>
          <span className="text-xs text-slate-500">
            {profile.badges.filter((b) => b.unlockedAt).length} / {profile.badges.length}
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {profile.badges.map((badge: AchievementBadge) => {
            const isUnlocked = !!badge.unlockedAt;
            return (
              <div
                key={badge.id}
                className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                  isUnlocked
                    ? 'bg-slate-800/60 border-emerald-500/30'
                    : 'bg-slate-950/40 border-slate-800/80 opacity-60'
                }`}
              >
                <div className="text-2xl p-2 bg-slate-800 rounded-lg">{badge.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium truncate text-slate-200">
                      {badge.name}
                    </h4>
                    {isUnlocked && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                        +{badge.xpReward} XP
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-1">{badge.description}</p>
                  {!isUnlocked && (
                    <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full rounded-full"
                        style={{ width: `${badge.progressPct}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
