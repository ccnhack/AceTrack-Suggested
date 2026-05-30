import express from 'express';
import { CoachBooking, Player } from '../models/index.mjs';

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
  
      res.json({ success: true, availability: player.data.availability });
    } catch (error) {
      console.error('[Bookings API] Update Availability Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

export default router;
