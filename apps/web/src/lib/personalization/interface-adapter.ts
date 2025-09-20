/**
 * FlowReader Interface Adaptation System
 * Real-time interface adaptation based on user behavior patterns
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type {
  InterfacePreferences,
  ContentPreferences,
  UserBehaviorMetrics,
  PersonalizationContext,
  InterfaceAdaptationType,
  PersonalizationRecommendation
} from './types.js';

interface AdaptationRule {
  id: string;
  name: string;
  trigger: AdaptationTrigger;
  adaptation: InterfaceAdaptation;
  priority: number;
  cooldown: number; // minutes
  maxApplicationsPerSession: number;
  reversible: boolean;
}

interface AdaptationTrigger {
  type: 'satisfaction_drop' | 'performance_issue' | 'usage_pattern' | 'device_change' | 'time_based';
  conditions: Record<string, any>;
}

interface InterfaceAdaptation {
  type: InterfaceAdaptationType;
  changes: Record<string, any>;
  description: string;
  impact: {
    usability: number;
    satisfaction: number;
    performance: number;
  };
}

interface AdaptationHistory {
  id: string;
  ruleId: string;
  appliedAt: string;
  reversed?: string;
  userAccepted?: boolean;
  impactScore?: number;
}

interface AdaptationState {
  layoutDensity: 'compact' | 'comfortable' | 'spacious';
  colorScheme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  animationSpeed: 'none' | 'slow' | 'normal' | 'fast';
  sidebarBehavior: 'always_visible' | 'auto_hide' | 'overlay' | 'hidden';
  menuOrganization: 'full' | 'simplified' | 'contextual';
  navigationStyle: 'breadcrumbs' | 'tabs' | 'sidebar' | 'minimal';
  readingMode: 'standard' | 'focus' | 'immersive';
  interactionStyle: 'hover' | 'click' | 'touch_optimized';
}

export class InterfaceAdaptationSystem {
  private adaptationRules: AdaptationRule[] = [];
  private adaptationHistory: Map<string, AdaptationHistory[]> = new Map();
  private sessionAdaptations: Map<string, number> = new Map();

  // Svelte stores for reactive interface state
  public readonly interfaceState: Writable<AdaptationState> = writable({
    layoutDensity: 'comfortable',
    colorScheme: 'auto',
    fontSize: 'medium',
    animationSpeed: 'normal',
    sidebarBehavior: 'auto_hide',
    menuOrganization: 'full',
    navigationStyle: 'sidebar',
    readingMode: 'standard',
    interactionStyle: 'hover'
  });

  public readonly adaptationsApplied: Writable<AdaptationHistory[]> = writable([]);
  public readonly adaptationMetrics: Writable<{
    totalAdaptations: number;
    successfulAdaptations: number;
    userAcceptanceRate: number;
    impactScore: number;
  }> = writable({
    totalAdaptations: 0,
    successfulAdaptations: 0,
    userAcceptanceRate: 0,
    impactScore: 0
  });

  // Derived store for CSS variables
  public readonly cssVariables: Readable<Record<string, string>> = derived(
    this.interfaceState,
    ($state) => this.generateCSSVariables($state)
  );

  constructor() {
    this.initializeAdaptationRules();
  }

  /**
   * Analyze user behavior and apply interface adaptations
   */
  analyzeAndAdapt(
    context: PersonalizationContext,
    sessionId: string,
    maxAdaptations: number = 2
  ): PersonalizationRecommendation[] {
    const recommendations: PersonalizationRecommendation[] = [];
    const currentAdaptations = this.sessionAdaptations.get(sessionId) || 0;

    if (currentAdaptations >= maxAdaptations) {
      return recommendations;
    }

    // Evaluate adaptation rules
    for (const rule of this.adaptationRules) {
      if (this.shouldApplyRule(rule, context, sessionId)) {
        const recommendation = this.createAdaptationRecommendation(rule, context);
        if (recommendation) {
          recommendations.push(recommendation);
        }
      }
    }

    // Sort by priority and impact
    recommendations.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return b.expectedImpact.usabilityImprovement - a.expectedImpact.usabilityImprovement;
    });

    return recommendations.slice(0, maxAdaptations - currentAdaptations);
  }

  /**
   * Apply interface adaptation
   */
  applyAdaptation(
    adaptationId: string,
    sessionId: string,
    userAccepted: boolean = true
  ): boolean {
    const rule = this.adaptationRules.find(r => r.id === adaptationId);
    if (!rule) {
      console.warn('Adaptation rule not found:', adaptationId);
      return false;
    }

    try {
      // Apply the adaptation
      this.interfaceState.update(state => ({
        ...state,
        ...this.applyAdaptationChanges(state, rule.adaptation)
      }));

      // Record in history
      const historyEntry: AdaptationHistory = {
        id: `adapt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        ruleId: rule.id,
        appliedAt: new Date().toISOString(),
        userAccepted,
        impactScore: userAccepted ? this.calculateImpactScore(rule.adaptation.impact) : 0
      };

      const sessionHistory = this.adaptationHistory.get(sessionId) || [];
      sessionHistory.push(historyEntry);
      this.adaptationHistory.set(sessionId, sessionHistory);

      // Update session adaptation count
      this.sessionAdaptations.set(sessionId, (this.sessionAdaptations.get(sessionId) || 0) + 1);

      // Update stores
      this.adaptationsApplied.update(history => [...history, historyEntry]);
      this.updateAdaptationMetrics(sessionId);

      console.log(`Applied interface adaptation: ${rule.name}`, {
        sessionId,
        userAccepted,
        changes: rule.adaptation.changes
      });

      return true;

    } catch (error) {
      console.error('Failed to apply adaptation:', error);
      return false;
    }
  }

  /**
   * Reverse interface adaptation
   */
  reverseAdaptation(adaptationId: string, sessionId: string): boolean {
    const sessionHistory = this.adaptationHistory.get(sessionId) || [];
    const adaptation = sessionHistory.find(a => a.id === adaptationId);

    if (!adaptation || adaptation.reversed) {
      return false;
    }

    const rule = this.adaptationRules.find(r => r.id === adaptation.ruleId);
    if (!rule || !rule.reversible) {
      return false;
    }

    try {
      // Reverse the adaptation
      this.interfaceState.update(state => ({
        ...state,
        ...this.reverseAdaptationChanges(state, rule.adaptation)
      }));

      // Mark as reversed
      adaptation.reversed = new Date().toISOString();

      // Update stores
      this.adaptationsApplied.update(history =>
        history.map(h => h.id === adaptationId ? { ...h, reversed: adaptation.reversed } : h)
      );
      this.updateAdaptationMetrics(sessionId);

      console.log(`Reversed interface adaptation: ${rule.name}`, { sessionId });

      return true;

    } catch (error) {
      console.error('Failed to reverse adaptation:', error);
      return false;
    }
  }

  /**
   * Get current interface preferences as user preferences
   */
  getCurrentPreferences(): { interface: InterfacePreferences; content: ContentPreferences } {
    let currentState: AdaptationState;
    this.interfaceState.subscribe(state => currentState = state)();

    return {
      interface: {
        layoutDensity: currentState!.layoutDensity,
        colorScheme: currentState!.colorScheme,
        fontSize: currentState!.fontSize,
        animationsEnabled: currentState!.animationSpeed !== 'none',
        sidebarPosition: currentState!.sidebarBehavior === 'hidden' ? 'hidden' : 'left'
      },
      content: {
        recommendationTypes: ['reading_suggestions', 'feature_discovery'],
        contextHintFrequency: 'moderate',
        explanationDepth: 'detailed',
        backgroundInfoLevel: 'intermediate'
      }
    };
  }

  /**
   * Reset interface to defaults
   */
  resetToDefaults(sessionId: string): void {
    this.interfaceState.set({
      layoutDensity: 'comfortable',
      colorScheme: 'auto',
      fontSize: 'medium',
      animationSpeed: 'normal',
      sidebarBehavior: 'auto_hide',
      menuOrganization: 'full',
      navigationStyle: 'sidebar',
      readingMode: 'standard',
      interactionStyle: 'hover'
    });

    // Clear session adaptations
    this.sessionAdaptations.delete(sessionId);
    this.adaptationHistory.delete(sessionId);

    this.adaptationsApplied.set([]);
    this.updateAdaptationMetrics(sessionId);
  }

  /**
   * Initialize adaptation rules
   */
  private initializeAdaptationRules(): void {
    this.adaptationRules = [
      // Layout density adaptation
      {
        id: 'comfortable_layout_for_mobile',
        name: 'Comfortable Layout for Mobile',
        trigger: {
          type: 'device_change',
          conditions: { deviceType: 'mobile' }
        },
        adaptation: {
          type: 'layout_density',
          changes: {
            layoutDensity: 'spacious',
            fontSize: 'large',
            interactionStyle: 'touch_optimized'
          },
          description: 'Increase spacing and font size for better mobile experience',
          impact: { usability: 0.5, satisfaction: 0.3, performance: 0.1 }
        },
        priority: 8,
        cooldown: 60,
        maxApplicationsPerSession: 1,
        reversible: true
      },

      // Color scheme adaptation
      {
        id: 'dark_mode_evening',
        name: 'Dark Mode for Evening',
        trigger: {
          type: 'time_based',
          conditions: { timeOfDay: ['evening', 'night'] }
        },
        adaptation: {
          type: 'color_scheme',
          changes: {
            colorScheme: 'dark',
            animationSpeed: 'slow'
          },
          description: 'Enable dark mode and reduce animations for evening reading',
          impact: { usability: 0.2, satisfaction: 0.4, performance: 0.1 }
        },
        priority: 5,
        cooldown: 180,
        maxApplicationsPerSession: 1,
        reversible: true
      },

      // Font size adaptation
      {
        id: 'larger_font_slow_reading',
        name: 'Larger Font for Slow Reading',
        trigger: {
          type: 'usage_pattern',
          conditions: { averageReadingSpeed: { operator: 'less_than', value: 150 } }
        },
        adaptation: {
          type: 'font_size',
          changes: {
            fontSize: 'large',
            layoutDensity: 'spacious'
          },
          description: 'Increase font size and spacing to improve reading speed',
          impact: { usability: 0.4, satisfaction: 0.3, performance: 0.0 }
        },
        priority: 7,
        cooldown: 30,
        maxApplicationsPerSession: 1,
        reversible: true
      },

      // Animation speed adaptation
      {
        id: 'reduce_animations_low_satisfaction',
        name: 'Reduce Animations for Low Satisfaction',
        trigger: {
          type: 'satisfaction_drop',
          conditions: { averageSatisfaction: { operator: 'less_than', value: 3.5 } }
        },
        adaptation: {
          type: 'animation_speed',
          changes: {
            animationSpeed: 'slow',
            menuOrganization: 'simplified'
          },
          description: 'Reduce animations and simplify interface for better experience',
          impact: { usability: 0.3, satisfaction: 0.5, performance: 0.2 }
        },
        priority: 9,
        cooldown: 15,
        maxApplicationsPerSession: 2,
        reversible: true
      },

      // Sidebar behavior adaptation
      {
        id: 'auto_hide_sidebar_focus',
        name: 'Auto-Hide Sidebar for Focus',
        trigger: {
          type: 'usage_pattern',
          conditions: {
            sessionDuration: { operator: 'greater_than', value: 30 },
            focusMode: true
          }
        },
        adaptation: {
          type: 'sidebar_behavior',
          changes: {
            sidebarBehavior: 'auto_hide',
            readingMode: 'focus'
          },
          description: 'Hide sidebar automatically to reduce distractions during focused reading',
          impact: { usability: 0.2, satisfaction: 0.3, performance: 0.1 }
        },
        priority: 6,
        cooldown: 45,
        maxApplicationsPerSession: 1,
        reversible: true
      },

      // Menu organization adaptation
      {
        id: 'simplified_menu_novice',
        name: 'Simplified Menu for Novice Users',
        trigger: {
          type: 'usage_pattern',
          conditions: {
            readingExperience: 'novice',
            errorRecoveryTime: { operator: 'greater_than', value: 5000 }
          }
        },
        adaptation: {
          type: 'menu_organization',
          changes: {
            menuOrganization: 'simplified',
            navigationStyle: 'breadcrumbs'
          },
          description: 'Simplify menu structure and navigation for new users',
          impact: { usability: 0.6, satisfaction: 0.4, performance: 0.0 }
        },
        priority: 8,
        cooldown: 60,
        maxApplicationsPerSession: 1,
        reversible: true
      },

      // Performance-based adaptation
      {
        id: 'minimal_interface_performance',
        name: 'Minimal Interface for Performance',
        trigger: {
          type: 'performance_issue',
          conditions: {
            responseTime: { operator: 'greater_than', value: 2000 },
            errorRate: { operator: 'greater_than', value: 0.05 }
          }
        },
        adaptation: {
          type: 'menu_organization',
          changes: {
            animationSpeed: 'none',
            menuOrganization: 'simplified',
            sidebarBehavior: 'hidden'
          },
          description: 'Minimize interface elements to improve performance',
          impact: { usability: 0.2, satisfaction: 0.1, performance: 0.7 }
        },
        priority: 10,
        cooldown: 30,
        maxApplicationsPerSession: 1,
        reversible: true
      }
    ];

    // Sort by priority
    this.adaptationRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if adaptation rule should be applied
   */
  private shouldApplyRule(rule: AdaptationRule, context: PersonalizationContext, sessionId: string): boolean {
    // Check cooldown
    if (this.isRuleOnCooldown(rule, sessionId)) {
      return false;
    }

    // Check session limits
    if (this.hasExceededSessionLimit(rule, sessionId)) {
      return false;
    }

    // Evaluate trigger conditions
    return this.evaluateTrigger(rule.trigger, context);
  }

  /**
   * Evaluate trigger conditions
   */
  private evaluateTrigger(trigger: AdaptationTrigger, context: PersonalizationContext): boolean {
    switch (trigger.type) {
      case 'device_change':
        const deviceType = context.userBehavior.readingPatterns?.[0]?.deviceType;
        return deviceType === trigger.conditions.deviceType;

      case 'time_based':
        const currentHour = new Date().getHours();
        let timeOfDay: string;
        if (currentHour >= 6 && currentHour < 12) timeOfDay = 'morning';
        else if (currentHour >= 12 && currentHour < 18) timeOfDay = 'afternoon';
        else if (currentHour >= 18 && currentHour < 22) timeOfDay = 'evening';
        else timeOfDay = 'night';

        return trigger.conditions.timeOfDay.includes(timeOfDay);

      case 'satisfaction_drop':
        const satisfactionScores = context.userBehavior.satisfactionScores || [];
        if (satisfactionScores.length < 2) return false;

        const recentScores = satisfactionScores.slice(-3);
        const avgSatisfaction = recentScores.reduce((sum, s) => sum + s.score, 0) / recentScores.length;

        const condition = trigger.conditions.averageSatisfaction;
        return this.evaluateCondition(avgSatisfaction, condition);

      case 'usage_pattern':
        return Object.entries(trigger.conditions).every(([key, condition]) => {
          let value: any;

          switch (key) {
            case 'averageReadingSpeed':
              value = context.userBehavior.readingPatterns?.[0]?.averageReadingSpeed;
              break;
            case 'sessionDuration':
              value = context.currentActivity.sessionDuration;
              break;
            case 'errorRecoveryTime':
              value = context.userBehavior.interactionMetrics?.errorRecoveryTime || 0;
              break;
            case 'readingExperience':
              // Determine experience based on usage
              const knowledgeUsage = context.userBehavior.interactionMetrics?.knowledgeEnhancementUsage || 0;
              if (knowledgeUsage > 10) value = 'expert';
              else if (knowledgeUsage > 3) value = 'intermediate';
              else value = 'novice';
              break;
            default:
              return true;
          }

          if (typeof condition === 'object' && condition.operator) {
            return this.evaluateCondition(value, condition);
          } else {
            return value === condition;
          }
        });

      case 'performance_issue':
        return Object.entries(trigger.conditions).every(([key, condition]) => {
          let value: any;

          switch (key) {
            case 'responseTime':
              value = context.systemState.performance.averageResponseTime;
              break;
            case 'errorRate':
              value = context.systemState.errorRate;
              break;
            default:
              return true;
          }

          return this.evaluateCondition(value, condition);
        });

      default:
        return false;
    }
  }

  /**
   * Evaluate a condition with operator
   */
  private evaluateCondition(value: any, condition: any): boolean {
    if (typeof condition === 'object' && condition.operator) {
      switch (condition.operator) {
        case 'greater_than':
          return value > condition.value;
        case 'less_than':
          return value < condition.value;
        case 'equals':
          return value === condition.value;
        default:
          return false;
      }
    }
    return value === condition;
  }

  /**
   * Check if rule is on cooldown
   */
  private isRuleOnCooldown(rule: AdaptationRule, sessionId: string): boolean {
    const sessionHistory = this.adaptationHistory.get(sessionId) || [];
    const lastApplication = sessionHistory
      .filter(h => h.ruleId === rule.id && !h.reversed)
      .sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime())[0];

    if (!lastApplication) return false;

    const cooldownExpiry = new Date(lastApplication.appliedAt).getTime() + (rule.cooldown * 60 * 1000);
    return Date.now() < cooldownExpiry;
  }

  /**
   * Check if rule has exceeded session limit
   */
  private hasExceededSessionLimit(rule: AdaptationRule, sessionId: string): boolean {
    const sessionHistory = this.adaptationHistory.get(sessionId) || [];
    const ruleApplications = sessionHistory.filter(h => h.ruleId === rule.id && !h.reversed);
    return ruleApplications.length >= rule.maxApplicationsPerSession;
  }

  /**
   * Create adaptation recommendation
   */
  private createAdaptationRecommendation(
    rule: AdaptationRule,
    context: PersonalizationContext
  ): PersonalizationRecommendation {
    return {
      id: `adapt_${rule.id}_${Date.now()}`,
      type: 'interface_adjustment',
      priority: rule.priority,
      title: rule.name,
      description: rule.adaptation.description,
      implementation: {
        component: 'InterfaceAdapter',
        props: {
          adaptationId: rule.id,
          changes: rule.adaptation.changes,
          reversible: rule.reversible
        }
      },
      expectedImpact: {
        satisfactionImprovement: rule.adaptation.impact.satisfaction,
        engagementImprovement: 0.1,
        usabilityImprovement: rule.adaptation.impact.usability,
        confidence: 0.8
      },
      validUntil: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      metadata: {
        ruleId: rule.id,
        adaptationType: rule.adaptation.type,
        reversible: rule.reversible
      }
    };
  }

  /**
   * Apply adaptation changes to interface state
   */
  private applyAdaptationChanges(currentState: AdaptationState, adaptation: InterfaceAdaptation): Partial<AdaptationState> {
    return adaptation.changes;
  }

  /**
   * Reverse adaptation changes
   */
  private reverseAdaptationChanges(currentState: AdaptationState, adaptation: InterfaceAdaptation): Partial<AdaptationState> {
    const reverseChanges: Partial<AdaptationState> = {};

    // For each change, set it back to default
    Object.keys(adaptation.changes).forEach(key => {
      switch (key) {
        case 'layoutDensity':
          reverseChanges.layoutDensity = 'comfortable';
          break;
        case 'colorScheme':
          reverseChanges.colorScheme = 'auto';
          break;
        case 'fontSize':
          reverseChanges.fontSize = 'medium';
          break;
        case 'animationSpeed':
          reverseChanges.animationSpeed = 'normal';
          break;
        case 'sidebarBehavior':
          reverseChanges.sidebarBehavior = 'auto_hide';
          break;
        case 'menuOrganization':
          reverseChanges.menuOrganization = 'full';
          break;
        case 'navigationStyle':
          reverseChanges.navigationStyle = 'sidebar';
          break;
        case 'readingMode':
          reverseChanges.readingMode = 'standard';
          break;
        case 'interactionStyle':
          reverseChanges.interactionStyle = 'hover';
          break;
      }
    });

    return reverseChanges;
  }

  /**
   * Generate CSS variables from interface state
   */
  private generateCSSVariables(state: AdaptationState): Record<string, string> {
    const variables: Record<string, string> = {};

    // Layout density
    switch (state.layoutDensity) {
      case 'compact':
        variables['--layout-spacing'] = '0.5rem';
        variables['--layout-padding'] = '0.75rem';
        break;
      case 'spacious':
        variables['--layout-spacing'] = '2rem';
        variables['--layout-padding'] = '2rem';
        break;
      default: // comfortable
        variables['--layout-spacing'] = '1rem';
        variables['--layout-padding'] = '1.25rem';
    }

    // Font size
    switch (state.fontSize) {
      case 'small':
        variables['--font-size-base'] = '14px';
        variables['--font-size-reading'] = '16px';
        break;
      case 'large':
        variables['--font-size-base'] = '18px';
        variables['--font-size-reading'] = '20px';
        break;
      default: // medium
        variables['--font-size-base'] = '16px';
        variables['--font-size-reading'] = '18px';
    }

    // Animation speed
    switch (state.animationSpeed) {
      case 'none':
        variables['--animation-duration'] = '0s';
        break;
      case 'slow':
        variables['--animation-duration'] = '0.5s';
        break;
      case 'fast':
        variables['--animation-duration'] = '0.15s';
        break;
      default: // normal
        variables['--animation-duration'] = '0.3s';
    }

    // Color scheme is handled by CSS media queries and data attributes

    return variables;
  }

  /**
   * Calculate impact score
   */
  private calculateImpactScore(impact: { usability: number; satisfaction: number; performance: number }): number {
    return (impact.usability * 0.4 + impact.satisfaction * 0.4 + impact.performance * 0.2) * 100;
  }

  /**
   * Update adaptation metrics
   */
  private updateAdaptationMetrics(sessionId: string): void {
    const sessionHistory = this.adaptationHistory.get(sessionId) || [];
    const totalAdaptations = sessionHistory.length;
    const acceptedAdaptations = sessionHistory.filter(h => h.userAccepted).length;
    const successfulAdaptations = sessionHistory.filter(h => h.userAccepted && !h.reversed).length;

    const userAcceptanceRate = totalAdaptations > 0 ? acceptedAdaptations / totalAdaptations : 0;
    const avgImpactScore = sessionHistory.length > 0
      ? sessionHistory.reduce((sum, h) => sum + (h.impactScore || 0), 0) / sessionHistory.length
      : 0;

    this.adaptationMetrics.set({
      totalAdaptations,
      successfulAdaptations,
      userAcceptanceRate,
      impactScore: avgImpactScore
    });
  }
}

// Export singleton instance
export const interfaceAdapter = new InterfaceAdaptationSystem();