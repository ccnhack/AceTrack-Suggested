import storage, { thinPlayers, capPlayerDetail } from '../utils/storage';
import logger from '../utils/logger';

/**
 * PLAYER SERVICE (Phase 1.2)
 * Centralized business logic for player management, profile updates, and authentication.
 */
class PlayerService {
  /**
   * Handles user login logic.
   * Returns updated user and role.
   */
  static async login(role, user) {
    logger.logAction('USER_LOGIN_START', { userId: user?.id, role });
    
    // Preparation for persistence
    const cappedUser = capPlayerDetail(user);
    await storage.setItem('currentUser', cappedUser);
    
    return {
      success: true,
      user: cappedUser,
      role: role
    };
  }

  /**
   * Handles user logout logic.
   * Returns default states for resetting the app.
   */
  static async logout() {
    logger.logAction('USER_LOGOUT_START');
    
    await storage.removeItem('currentUser');
    await storage.removeItem('pendingSync');
    await storage.removeItem('sessionCustomAvatar');
    
    return {
      success: true,
      currentUser: null,
      userRole: null
    };
  }

  /**
   * Registers a new user.
   * Ensures 'user' role is forced for safety.
   */
  static register(newPlayer, players) {
    logger.logAction('USER_SIGNUP_START', { id: newPlayer.id });
    
    const sanitizedPlayer = { ...newPlayer, role: 'user' };
    const updatedPlayers = [sanitizedPlayer, ...(players || [])];
    
    return {
      success: true,
      player: sanitizedPlayer,
      players: updatedPlayers
    };
  }

  /**
   * Updates a player's profile in the collection.
   */
  static updateProfile(updatedUser, players) {
    const updatedPlayers = (players || []).map(p => 
      String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p
    );
    
    return {
      success: true,
      players: updatedPlayers,
      user: updatedUser
    };
  }

  /**
   * Resets a player's password.
   */
  static resetPassword(userId, newPassword, players) {
    const updatedPlayers = (players || []).map(p => 
      String(p.id).toLowerCase() === String(userId).toLowerCase() ? { ...p, password: newPassword, activeSessions: [] } : p
    );
    
    return {
      success: true,
      players: updatedPlayers
    };
  }

  /**
   * Verifies a user's account (email or phone).
   */
  static verifyAccount(type, currentUser, players) {
    if (!currentUser) return { success: false, message: 'No current user' };
    
    const updatedUser = { 
      ...currentUser, 
      [type === 'email' ? 'isEmailVerified' : 'isPhoneVerified']: true 
    };
    
    const updatedPlayers = (players || []).map(p => 
      String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p
    );
    
    return {
      success: true,
      user: updatedUser,
      players: updatedPlayers
    };
  }

  /**
   * Adds credits to a user's wallet.
   */
  static topUpWallet(amount, userId, players) {
    let updatedUser = null;
    const updatedPlayers = (players || []).map(p => {
      if (String(p.id).toLowerCase() === String(userId).toLowerCase()) {
        updatedUser = {
          ...p,
          credits: (p.credits || 0) + amount,
          walletHistory: [
            { 
              id: Date.now().toString(), 
              type: 'credit', 
              amount, 
              description: 'Wallet Top Up', 
              date: new Date().toISOString() 
            }, 
            ...(p.walletHistory || [])
          ]
        };
        return updatedUser;
      }
      return p;
    });

    if (!updatedUser) return { success: false, message: 'User not found' };

    return {
      success: true,
      user: updatedUser,
      players: updatedPlayers
    };
  }
}

export default PlayerService;
