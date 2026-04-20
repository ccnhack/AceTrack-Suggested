/**
 * SUPPORT METRICS SERVICE (v2.6.132)
 * Handles performance weightage, automated assignment balancing, and metrics aggregation.
 */

class SupportMetricsService {
  /**
   * Calculates a weighted score that balances volume vs. rating.
   * Formula: (Avg Rating * log10(Closed + 1)) + (Manual Picks * 0.1)
   * This prevents "New Agent Bias" and rewards high-volume consistency.
   */
  static calculateWeightedScore(metrics) {
    const { avgRating = 0, closedTickets = 0, manualPicks = 0 } = metrics;
    const ratingWeight = avgRating || 0;
    const volumeWeight = Math.log10(closedTickets + 1);
    const poolBonus = manualPicks * 0.1;
    
    return parseFloat(((ratingWeight * volumeWeight) + poolBonus).toFixed(2));
  }

  /**
   * Identifies the best agent for automated assignment based on:
   * 1. Status must be 'active'
   * 2. Lowest current load (Open/In Progress tickets)
   * 3. Lowest lifetime volume (tie-breaker for fairness)
   */
  static findBestAgent(agents, tickets) {
    const activeAgents = agents.filter(a => a.role === 'support' && a.supportStatus === 'active');
    if (activeAgents.length === 0) return null;

    // Calculate current load for each active agent
    const agentsWithLoad = activeAgents.map(agent => {
      const currentLoad = tickets.filter(t => 
        t.assignedTo === agent.id && 
        ['Open', 'In Progress', 'Awaiting Response'].includes(t.status)
      ).length;
      
      const lifetimeTickets = agent.metrics?.totalHandled || 0;
      
      return { agent, currentLoad, lifetimeTickets };
    });

    // Sort by: 1. Load (Asc), 2. Lifetime Volume (Asc)
    agentsWithLoad.sort((a, b) => {
      if (a.currentLoad !== b.currentLoad) return a.currentLoad - b.currentLoad;
      return a.lifetimeTickets - b.lifetimeTickets;
    });

    return agentsWithLoad[0].agent;
  }

  /**
   * Aggregates team-wide metrics and generates a leaderboard.
   */
  static generateLeaderboard(agents) {
    return agents
      .filter(a => a.role === 'support' && a.supportStatus !== 'terminated')
      .map(agent => {
        const metrics = agent.metrics || { avgRating: 0, closedTickets: 0, totalHandled: 0, manualPicks: 0 };
        return {
          id: agent.id,
          name: `${agent.firstName} ${agent.lastName}`,
          email: agent.email,
          status: agent.supportStatus,
          level: agent.supportLevel || 'Trainee',
          score: this.calculateWeightedScore(metrics),
          stats: metrics
        };
      })
      .sort((a, b) => b.score - a.score);
  }
}

export default SupportMetricsService;
