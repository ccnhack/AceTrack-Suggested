import express from 'express';
import { CoachBooking, Player, Tournament } from '../models/index.mjs';
import { sendPushNotification } from '../notifications.js';
import { addInAppNotification } from '../helpers/utils.mjs';

const router = express.Router();

/**
 * @route POST /api/v1/bookings/create
 * @desc Create a new coach booking
 */
router.post('/create', async (req, res) => {
  try {
    const { id, data } = req.body;
    
    if (!id || !data) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const booking = new CoachBooking({
      id,
      data,
      lastUpdated: new Date()
    });
    await booking.save();

    res.json({ success: true, booking });
  } catch (error) {
    console.error('[Bookings API] Create Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route GET /api/v1/bookings/coach/:coachId
 * @desc Get bookings for a specific coach
 */
router.get('/coach/:coachId', async (req, res) => {
  try {
    const { coachId } = req.params;
    const bookings = await CoachBooking.find({ 'data.coachId': coachId }).lean();
    
    res.json({ success: true, bookings: bookings.map(b => ({ id: b.id, ...b.data, lastUpdated: b.lastUpdated })) });
  } catch (error) {
    console.error('[Bookings API] Get Coach Bookings Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route GET /api/v1/bookings/player/:playerId
 * @desc Get bookings for a specific player
 */
router.get('/player/:playerId', async (req, res) => {
    try {
      const { playerId } = req.params;
      const bookings = await CoachBooking.find({ 'data.playerId': playerId }).lean();
      
      res.json({ success: true, bookings: bookings.map(b => ({ id: b.id, ...b.data, lastUpdated: b.lastUpdated })) });
    } catch (error) {
      console.error('[Bookings API] Get Player Bookings Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

/**
 * @route PUT /api/v1/bookings/:id/status
 * @desc Update booking status
 */
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const booking = await CoachBooking.findOneAndUpdate(
      { id },
      { 
        $set: { 'data.status': status, lastUpdated: new Date() }
      },
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    res.json({ success: true, booking: { id: booking.id, ...booking.data, lastUpdated: booking.lastUpdated } });
  } catch (error) {
    console.error('[Bookings API] Update Status Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @route PUT /api/v1/bookings/coach/:coachId/availability
 * @desc Update a coach's availability slots
 */
router.put('/coach/:coachId/availability', async (req, res) => {
    try {
      const { coachId } = req.params;
      const { availability } = req.body; // Array of WeeklySlot
      
      const player = await Player.findOneAndUpdate(
        { id: coachId },
        { 
          $set: { 'data.availability': availability, lastUpdated: new Date() }
        },
        { new: true }
      );
      
      if (!player) {
        return res.status(404).json({ success: false, message: 'Coach not found' });
      }
      
      // RETROACTIVE NOTIFICATION LOGIC (v2.6.x)
      try {
        const coach = player.data;
        const tournaments = await Tournament.find({ 'data.assignedCoachId': coachId }).lean();
        let notificationsModified = false;
        
        for (const doc of tournaments) {
          const t = doc.data;
          
          if (!t.tournamentConcluded && t.date && t.time) {
            const hasNotification = coach.notifications && coach.notifications.some(
              n => n.data && n.data.tournamentId === t.id && n.data.type === 'COACH_ASSIGNED'
            );

            // If we already sent the assignment notification, skip.
            if (!hasNotification) {
              const d = new Date(t.date);
              if (!isNaN(d.getTime())) {
                const tDayOfWeek = d.getDay();
                const parts = t.time.split(' ');
                let tTime24 = '';
                if (parts.length === 2) {
                  let [hours, minutes] = parts[0].split(':');
                  if (hours === '12') hours = '00';
                  if (parts[1].toUpperCase() === 'PM') hours = (parseInt(hours, 10) + 12).toString();
                  hours = hours.toString().padStart(2, '0');
                  tTime24 = `${hours}:${minutes}`;
                } else {
                  tTime24 = t.time;
                }

                const isAvailable = availability.some(slot => slot.dayOfWeek === tDayOfWeek && tTime24 >= slot.startTime && tTime24 < slot.endTime);
                
                if (isAvailable) {
                   const title = "Tournament Assignment 🎓";
                   const body = `You have been assigned as coach for ${t.title}.`;
                   
                   addInAppNotification(coach, title, body, { tournamentId: t.id, type: 'COACH_ASSIGNED' });
                   notificationsModified = true;
                   
                   if (coach.pushTokens && coach.pushTokens.length > 0) {
                     await sendPushNotification(coach.pushTokens, title, body, { tournamentId: t.id, type: 'COACH_ASSIGNED' });
                   }
                }
              }
            }
          }
        }

        if (notificationsModified) {
          await Player.updateOne({ id: coachId }, { $set: { 'data.notifications': coach.notifications } });
        }
      } catch (err) {
        console.error('[Bookings API] Retroactive Notification Error:', err);
      }
  
      res.json({ success: true, availability: player.data.availability });
    } catch (error) {
      console.error('[Bookings API] Update Availability Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

export default router;
