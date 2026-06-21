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
    // 🛡️ [SAFETY] (v2.6.438): Filter only for active support agents. 
    // Explicitly exclude 'admin' and users with non-support roles to prevent "Admin Default" bug.
    const activeAgents = agents.filter(a => 
      a && 
      a.role === 'support' && 
      a.supportStatus === 'active' && 
      a.id !== 'admin' && 
      !['terminated', 'inactive', 'left'].includes((a.supportStatus || '').toLowerCase())
    );
    
    if (activeAgents.length === 0) {
      console.warn('⚠️ [SupportMetrics] No active support agents found for auto-assignment.');
      return null;
    }

    // Helper to check if agent is currently on an approved short leave (IST)
    const isCurrentlyOnLeave = (agent) => {
      if (!agent.shortLeaves || agent.shortLeaves.length === 0) return false;
      const nowUtc = new Date();
      const istTime = new Date(nowUtc.getTime() + (5.5 * 60 * 60 * 1000));
      const todayStr = `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`;
      
      const currentH = istTime.getUTCHours();
      const currentM = istTime.getUTCMinutes();
      const currentTotalM = currentH * 60 + currentM;
      
      return agent.shortLeaves.some(l => {
        if (l.status !== 'approved' || l.date !== todayStr) return false;
        const [startH, startM] = l.startTime.split(':').map(Number);
        const [endH, endM] = l.endTime.split(':').map(Number);
        
        const startTotalM = startH * 60 + startM;
        const endTotalM = endH * 60 + endM;
        
        return currentTotalM >= startTotalM && currentTotalM <= endTotalM;
      });
    };

    // 🕐 [SHIFT PREFERENCE] (v2.6.673): Prefer agents who have checked in for their shift AND are not on short leave
    const onShiftAgents = activeAgents.filter(a => a.shiftStatus === 'on_shift' && !isCurrentlyOnLeave(a));
    const candidatePool = onShiftAgents.length > 0 ? onShiftAgents : activeAgents.filter(a => !isCurrentlyOnLeave(a));
    
    if (onShiftAgents.length > 0) {
      console.log(`✅ [SupportMetrics] ${onShiftAgents.length} on-shift active agent(s) available.`);
    } else {
      console.log(`⚠️ [SupportMetrics] No on-shift agents available (might be on short leave), falling back to ${candidatePool.length} active agent(s).`);
    }

    // Calculate current load for each candidate agent
    const agentsWithLoad = candidatePool.map(agent => {
      const currentLoad = (tickets || []).filter(t => 
        t && 
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

    const best = agentsWithLoad[0].agent;
    console.log(`✅ [SupportMetrics] Best agent found: ${best.id} (Load: ${agentsWithLoad[0].currentLoad}, OnShift: ${best.shiftStatus === 'on_shift'})`);
    return best;
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
