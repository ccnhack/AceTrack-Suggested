import SyncOrchestrator from './sync/SyncOrchestrator';
import { Player, CorporateDepartment, Match } from '../types';

class CorporateService {
  /**
   * Calculate standings for departments based on their employee match results
   */
  calculateDepartmentStandings(departments: CorporateDepartment[], employees: Player[], matches: Match[]): CorporateDepartment[] {
    const standings = departments.map(dept => {
      let points = 0;
      
      dept.employeeIds.forEach(empId => {
        // Find matches for this employee
        const employeeMatches = matches.filter(m => 
          (m.player1Id === empId || m.player2Id === empId) && m.status === 'Completed'
        );
        
        employeeMatches.forEach(m => {
          if (m.winnerId === empId) {
            points += 3; // 3 points for a win
          } else if (m.winnerId === 'Draw') {
            points += 1; // 1 point for a draw
          }
        });
      });
      
      return { ...dept, points };
    });
    
    // Sort by points descending
    return standings.sort((a, b) => (b.points || 0) - (a.points || 0));
  }

  /**
   * Calculate wellness metrics (e.g. participation rate)
   */
  calculateWellnessMetrics(departments: CorporateDepartment[], employees: Player[]) {
    const totalEmployees = departments.reduce((sum, dept) => sum + dept.employeeIds.length, 0);
    const activeEmployees = employees.filter(e => (e.matchesPlayed || 0) > 0).length;
    
    return {
      totalEmployees,
      activeEmployees,
      participationRate: totalEmployees > 0 ? (activeEmployees / totalEmployees) * 100 : 0
    };
  }
}

export default new CorporateService();
