export async function canSpin({ guestId, fingerprint, ip, fingerprintWindowDays, ipSpinLimit }, db) {
  const existingSpin = await db.spin.findUnique({
    where: { guestId },
    include: { prize: true },
  });

  if (existingSpin) {
    return {
      allowed: false,
      reason: "ALREADY_SPUN",
      existingSpin,
    };
  }

  if (fingerprint) {
    const fingerprintCutoff = new Date(Date.now() - fingerprintWindowDays * 24 * 60 * 60 * 1000);
    const recentFingerprintSpin = await db.spin.findFirst({
      where: {
        fingerprint,
        createdAt: { gte: fingerprintCutoff },
      },
      include: { prize: true },
    });

    if (recentFingerprintSpin) {
      await db.antifraudLog.create({
        data: {
          reason: "FINGERPRINT_REPEAT",
          fingerprint,
          ip,
          guestId,
          meta: {
            existingSpinId: recentFingerprintSpin.id,
          },
        },
      });

      return {
        allowed: false,
        reason: "FINGERPRINT_REPEAT",
      };
    }
  }

  if (ip) {
    const ipCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentIpCount = await db.spin.count({
      where: {
        ip,
        createdAt: { gte: ipCutoff },
      },
    });

    if (recentIpCount >= ipSpinLimit) {
      await db.antifraudLog.create({
        data: {
          reason: "IP_LIMIT",
          fingerprint,
          ip,
          guestId,
          meta: {
            recentIpCount,
          },
        },
      });

      return {
        allowed: false,
        reason: "IP_LIMIT",
      };
    }
  }

  return { allowed: true };
}
