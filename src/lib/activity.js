import { base44 } from "@/api/base44Client";

export async function logActivity(message, type = "system", entityType = "", entityId = "") {
  try {
    await base44.entities.ActivityLog.create({
      message,
      type,
      entity_type: entityType,
      entity_id: entityId,
      read: false,
    });
  } catch (e) {
    // non-blocking
  }
}