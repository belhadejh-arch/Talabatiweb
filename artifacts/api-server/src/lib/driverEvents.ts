import type { Response } from "express";

export type DriverEvent = {
  type: "NEW_DRIVER_ORDER";
  notificationId: number | null;
  orderId: number;
  message: string;
};

const streams = new Map<number, Set<Response>>();

export function subscribeToDriverEvents(driverId: number, response: Response): () => void {
  const driverStreams = streams.get(driverId) ?? new Set<Response>();
  driverStreams.add(response);
  streams.set(driverId, driverStreams);

  return () => {
    driverStreams.delete(response);
    if (driverStreams.size === 0) streams.delete(driverId);
  };
}

export function publishDriverEvent(driverId: number, event: DriverEvent): void {
  const driverStreams = streams.get(driverId);
  if (!driverStreams) return;

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const response of driverStreams) {
    try {
      response.write(payload);
    } catch {
      driverStreams.delete(response);
    }
  }
  if (driverStreams.size === 0) streams.delete(driverId);
}