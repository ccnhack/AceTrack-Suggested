/**
 * TYPED EVENT BUS (Phase 0.4)
 * Decouples sync results and connectivity changes from the UI layer.
 */

export type EventType = 
  | 'ENTITY_UPDATED' 
  | 'SYNC_STATUS_CHANGED' 
  | 'CONNECTIVITY_CHANGED'
  | 'AUTH_STATE_CHANGED'
  | 'INITIALIZATION_COMPLETE'
  | 'VERSION_OBSOLETE'
  | 'SYNC_CONFLICT_DETECTED'
  | 'NOTIFICATION_DEEP_LINK'
  | 'NOTIFICATION_FOREGROUND_PULL';

export interface BusEvent {
  type: EventType;
  payload?: any;
}

type Listener = (event: BusEvent) => void;

class EventBus {
  private static instance: EventBus;
  private listeners: Map<EventType, Set<Listener>> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to a specific event type.
   */
  public subscribe(type: EventType, listener: Listener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    
    this.listeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => {
      const set = this.listeners.get(type);
      if (set) {
        set.delete(listener);
      }
    };
  }

  /**
   * Emit an event to all subscribers.
   */
  public emit(type: EventType, payload?: any): void {
    const set = this.listeners.get(type);
    if (set) {
      const event: BusEvent = { type, payload };
      set.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[EventBus] Error in listener for ${type}:`, error);
        }
      });
    }
  }

  /**
   * Helper: Emit intent for entity update.
   */
  public emitEntityUpdate(entity: string, id: string | null, action: 'update' | 'delete' | 'create', source: 'socket' | 'local' | 'api' | 'internal') {
    this.emit('ENTITY_UPDATED', { entity, id, action, source });
  }
}

export const eventBus = EventBus.getInstance();
