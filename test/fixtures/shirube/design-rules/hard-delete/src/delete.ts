export async function purgeBookings(db: { booking: { deleteMany: Function } }): Promise<void> {
  await db.booking.deleteMany({ where: { status: "cancelled" } });
}
