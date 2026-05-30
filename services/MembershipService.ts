import { usePlayersStore } from '../stores';

export class MembershipService {
  /**
   * Approves a pending membership request.
   * @param {string} playerId 
   * @param {string} academyId 
   */
  static approveMember(playerId, academyId) {
    const { players, setPlayers } = usePlayersStore.getState();
    const updatedPlayers = players.map(p => {
      if (p.id === playerId) {
        const memberships = p.memberships || [];
        const existing = memberships.find(m => m.academyId === academyId);
        if (existing) {
          existing.status = 'active';
          existing.joinedAt = new Date().toISOString();
        }
        return { ...p, memberships };
      }
      return p;
    });
    setPlayers(updatedPlayers);
  }

  /**
   * Rejects/Removes a membership.
   * @param {string} playerId 
   * @param {string} academyId 
   */
  static removeMember(playerId, academyId) {
    const { players, setPlayers } = usePlayersStore.getState();
    const updatedPlayers = players.map(p => {
      if (p.id === playerId) {
        const memberships = p.memberships || [];
        return {
          ...p,
          memberships: memberships.filter(m => m.academyId !== academyId)
        };
      }
      return p;
    });
    setPlayers(updatedPlayers);
  }
}
