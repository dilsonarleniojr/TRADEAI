/**
 * TraderAchievements & Gamification Engine
 * ----------------------------------------
 * Institutional discipline rewards:
 * - XP progression and Trader Ranks (Cadet -> Titan)
 * - Anti-overtrading and risk compliance badges
 * - Operational streak tracking
 */

export type TraderRank =
  | 'Novice Apprentice'
  | 'Risk Disciplined Trader'
  | 'Quantitative Analyst'
  | 'Portfolio Strategist'
  | 'Institutional Titan';

export interface AchievementBadge {
  id: string;
  name: string;
  description: string;
  category: 'risk_management' | 'discipline' | 'quant_mastery' | 'execution';
  unlockedAt?: string;
  progressPct: number;
  xpReward: number;
  icon: string;
}

export interface TraderProfile {
  totalXp: number;
  currentLevel: number;
  rank: TraderRank;
  xpToNextLevel: number;
  disciplinedTradesStreak: number;
  totalCompliantTrades: number;
  badges: AchievementBadge[];
}

export interface TradeEvaluationContext {
  respectsStopLoss: boolean;
  riskPctOfNav: number; // e.g. 1.5%
  cooldownRespected: boolean; // anti-revenge trading
  usedConformalPrediction?: boolean;
  usedVisionScan?: boolean;
  pnlRealizedPct: number;
  sharpeRatio?: number;
}

const INITIAL_BADGES: AchievementBadge[] = [
  {
    id: 'stop_loss_guardian',
    name: 'Stop Loss Guardian',
    description: 'Execute 10 trades strictly respecting pre-set stop losses without manual override.',
    category: 'risk_management',
    progressPct: 0,
    xpReward: 300,
    icon: '🛡️',
  },
  {
    id: 'anti_revenge_monk',
    name: 'Discipline Monk',
    description: 'Respect cooldown period after a loss without impulsive revenge trading.',
    category: 'discipline',
    progressPct: 0,
    xpReward: 250,
    icon: '🧘',
  },
  {
    id: 'conformal_scout',
    name: 'Conformal Scout',
    description: 'Size operations utilizing calibrated conformal prediction bounds.',
    category: 'quant_mastery',
    progressPct: 0,
    xpReward: 400,
    icon: '📐',
  },
  {
    id: 'vision_pioneer',
    name: 'Vision Pioneer',
    description: 'Complete multimodal visual chart interpretation via Gemini 2.5 Flash.',
    category: 'execution',
    progressPct: 0,
    xpReward: 200,
    icon: '👁️',
  },
  {
    id: 'institutional_titan',
    name: 'Institutional Titan',
    description: 'Achieve 50 consecutive trades with strict max 2% NAV risk limit.',
    category: 'risk_management',
    progressPct: 0,
    xpReward: 1000,
    icon: '👑',
  },
];

export class TraderGamificationEngine {
  private profile: TraderProfile;

  constructor(initialProfile?: Partial<TraderProfile>) {
    this.profile = {
      totalXp: initialProfile?.totalXp ?? 0,
      currentLevel: initialProfile?.currentLevel ?? 1,
      rank: initialProfile?.rank ?? 'Novice Apprentice',
      xpToNextLevel: initialProfile?.xpToNextLevel ?? 500,
      disciplinedTradesStreak: initialProfile?.disciplinedTradesStreak ?? 0,
      totalCompliantTrades: initialProfile?.totalCompliantTrades ?? 0,
      badges: initialProfile?.badges ?? JSON.parse(JSON.stringify(INITIAL_BADGES)),
    };
    this.recomputeLevel();
  }

  getProfile(): TraderProfile {
    return JSON.parse(JSON.stringify(this.profile));
  }

  addXp(amount: number, reason: string): { newTotalXp: number; leveledUp: boolean; newLevel: number } {
    const prevLevel = this.profile.currentLevel;
    this.profile.totalXp += Math.max(0, amount);
    this.recomputeLevel();

    return {
      newTotalXp: this.profile.totalXp,
      leveledUp: this.profile.currentLevel > prevLevel,
      newLevel: this.profile.currentLevel,
    };
  }

  /**
   * Evaluates a trade execution event and rewards operational discipline.
   */
  evaluateTrade(context: TradeEvaluationContext): {
    awardedXp: number;
    unlockedBadges: string[];
    streak: number;
  } {
    let earnedXp = 50; // base execution XP
    const newlyUnlocked: string[] = [];

    // Rule 1: Risk limit <= 2.0%
    const isRiskCompliant = context.riskPctOfNav <= 2.0;
    if (isRiskCompliant) {
      earnedXp += 50;
      this.profile.totalCompliantTrades++;
    }

    // Rule 2: Respecting Stop Loss
    if (context.respectsStopLoss) {
      earnedXp += 50;
      this.profile.disciplinedTradesStreak++;
    } else {
      this.profile.disciplinedTradesStreak = 0; // reset streak if SL breached
    }

    // Rule 3: Anti-revenge cooldown
    if (context.cooldownRespected) {
      earnedXp += 30;
    }

    // Check Badge: Stop Loss Guardian (10 in a row)
    const slBadge = this.profile.badges.find((b) => b.id === 'stop_loss_guardian');
    if (slBadge && !slBadge.unlockedAt) {
      slBadge.progressPct = Math.min(100, (this.profile.disciplinedTradesStreak / 10) * 100);
      if (slBadge.progressPct >= 100) {
        slBadge.unlockedAt = new Date().toISOString();
        earnedXp += slBadge.xpReward;
        newlyUnlocked.push(slBadge.name);
      }
    }

    // Check Badge: Anti Revenge Monk
    const monkBadge = this.profile.badges.find((b) => b.id === 'anti_revenge_monk');
    if (monkBadge && !monkBadge.unlockedAt && context.cooldownRespected) {
      monkBadge.progressPct = 100;
      monkBadge.unlockedAt = new Date().toISOString();
      earnedXp += monkBadge.xpReward;
      newlyUnlocked.push(monkBadge.name);
    }

    // Check Badge: Conformal Scout
    if (context.usedConformalPrediction) {
      const confBadge = this.profile.badges.find((b) => b.id === 'conformal_scout');
      if (confBadge && !confBadge.unlockedAt) {
        confBadge.progressPct = 100;
        confBadge.unlockedAt = new Date().toISOString();
        earnedXp += confBadge.xpReward;
        newlyUnlocked.push(confBadge.name);
      }
    }

    // Check Badge: Vision Pioneer
    if (context.usedVisionScan) {
      const visBadge = this.profile.badges.find((b) => b.id === 'vision_pioneer');
      if (visBadge && !visBadge.unlockedAt) {
        visBadge.progressPct = 100;
        visBadge.unlockedAt = new Date().toISOString();
        earnedXp += visBadge.xpReward;
        newlyUnlocked.push(visBadge.name);
      }
    }

    // Check Badge: Institutional Titan (50 compliant trades)
    const titanBadge = this.profile.badges.find((b) => b.id === 'institutional_titan');
    if (titanBadge && !titanBadge.unlockedAt) {
      titanBadge.progressPct = Math.min(100, (this.profile.totalCompliantTrades / 50) * 100);
      if (titanBadge.progressPct >= 100) {
        titanBadge.unlockedAt = new Date().toISOString();
        earnedXp += titanBadge.xpReward;
        newlyUnlocked.push(titanBadge.name);
      }
    }

    this.addXp(earnedXp, 'Trade disciplined execution');

    return {
      awardedXp: earnedXp,
      unlockedBadges: newlyUnlocked,
      streak: this.profile.disciplinedTradesStreak,
    };
  }

  private recomputeLevel(): void {
    const xpPerLevel = 500;
    this.profile.currentLevel = Math.floor(this.profile.totalXp / xpPerLevel) + 1;
    this.profile.xpToNextLevel = xpPerLevel - (this.profile.totalXp % xpPerLevel);

    if (this.profile.currentLevel >= 20) {
      this.profile.rank = 'Institutional Titan';
    } else if (this.profile.currentLevel >= 12) {
      this.profile.rank = 'Portfolio Strategist';
    } else if (this.profile.currentLevel >= 6) {
      this.profile.rank = 'Quantitative Analyst';
    } else if (this.profile.currentLevel >= 2) {
      this.profile.rank = 'Risk Disciplined Trader';
    } else {
      this.profile.rank = 'Novice Apprentice';
    }
  }
}
