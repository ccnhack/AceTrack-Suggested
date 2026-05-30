import logger from '../utils/logger';

class PartnerService {
  /**
   * Creates a new doubles partner request.
   */
  static createRequest(user, sport, city, skillLevel, comment, linkedTournamentId = null, targetGender = 'All') {
    logger.logAction('PARTNER_REQUEST_CREATE', { creatorId: user.id, sport, city, linkedTournamentId });

    const request = {
      id: `partner_req_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      creatorId: user.id,
      creatorName: user.name,
      creatorImage: user.image,
      sport,
      city,
      skillLevel,
      comment: comment?.trim() || '',
      linkedTournamentId,
      targetGender,
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    return {
      success: true,
      code: 'PARTNER_REQUEST_CREATED',
      type: 'success',
      data: {
        updatedRequest: request,
        priority: 'MEDIUM'
      }
    };
  }

  /**
   * Removes or marks a request as fulfilled.
   */
  static deleteRequest(requestId) {
    logger.logAction('PARTNER_REQUEST_DELETE', { requestId });

    return {
      success: true,
      code: 'PARTNER_REQUEST_DELETED',
      type: 'info',
      data: {
        removedRequestId: requestId,
        priority: 'LOW'
      }
    };
  }
}

export default PartnerService;
