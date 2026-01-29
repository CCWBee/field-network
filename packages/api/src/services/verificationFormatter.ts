/**
 * Verification Formatter Service
 *
 * Formats verification check results into human-readable messages
 * so workers can understand WHY their submission scored what it did.
 */

export interface VerificationCheck {
  check: string;
  passed: boolean;
  message: string;
  actual?: string | number;
  expected?: string | number;
}

export interface VerificationDetails {
  checks: VerificationCheck[];
  summary: {
    passed: number;
    failed: number;
    score: number;
  };
}

/**
 * Format a location check result
 */
export function formatLocationCheck(
  passed: boolean,
  distanceMeters: number | null,
  radiusMeters: number
): VerificationCheck {
  if (distanceMeters === null) {
    return {
      check: 'location',
      passed: false,
      message: 'No GPS data available in photos',
      expected: `Within ${radiusMeters}m of task location`,
    };
  }

  if (passed) {
    return {
      check: 'location',
      passed: true,
      message: `${Math.round(distanceMeters)}m from target (within ${radiusMeters}m radius)`,
      actual: Math.round(distanceMeters),
      expected: radiusMeters,
    };
  }

  return {
    check: 'location',
    passed: false,
    message: `${Math.round(distanceMeters)}m from target (${Math.round(distanceMeters - radiusMeters)}m outside ${radiusMeters}m radius)`,
    actual: Math.round(distanceMeters),
    expected: radiusMeters,
  };
}

/**
 * Format a bearing check result
 */
export function formatBearingCheck(
  passed: boolean,
  actualBearing: number | null,
  targetBearing: number,
  tolerance: number
): VerificationCheck {
  if (actualBearing === null) {
    return {
      check: 'bearing',
      passed: false,
      message: 'No compass data available in photos',
      expected: `${targetBearing}° ±${tolerance}°`,
    };
  }

  // Calculate the angular difference
  let diff = Math.abs(actualBearing - targetBearing);
  if (diff > 180) diff = 360 - diff;

  if (passed) {
    return {
      check: 'bearing',
      passed: true,
      message: `Bearing ${Math.round(actualBearing)}° matches target ${targetBearing}° (within ±${tolerance}°)`,
      actual: Math.round(actualBearing),
      expected: targetBearing,
    };
  }

  return {
    check: 'bearing',
    passed: false,
    message: `Bearing ${Math.round(diff)}° off target (±${tolerance}° allowed)`,
    actual: Math.round(actualBearing),
    expected: targetBearing,
  };
}

/**
 * Format a time window check result
 */
export function formatTimeWindowCheck(
  passed: boolean,
  submittedAt: Date,
  deadline: Date
): VerificationCheck {
  const diff = deadline.getTime() - submittedAt.getTime();
  const minsRemaining = Math.round(diff / (1000 * 60));

  if (passed) {
    if (minsRemaining > 60) {
      const hoursRemaining = Math.round(minsRemaining / 60);
      return {
        check: 'time_window',
        passed: true,
        message: `Submitted ${hoursRemaining} hours before deadline`,
      };
    }
    return {
      check: 'time_window',
      passed: true,
      message: `Submitted ${minsRemaining} mins before deadline`,
    };
  }

  const minsLate = Math.abs(minsRemaining);
  if (minsLate > 60) {
    const hoursLate = Math.round(minsLate / 60);
    return {
      check: 'time_window',
      passed: false,
      message: `Submitted ${hoursLate} hours after deadline`,
    };
  }

  return {
    check: 'time_window',
    passed: false,
    message: `Submitted ${minsLate} mins after deadline`,
  };
}

/**
 * Format an artefact count check result
 */
export function formatArtefactCountCheck(
  passed: boolean,
  actualCount: number,
  requiredCount: number
): VerificationCheck {
  if (passed) {
    return {
      check: 'artefact_count',
      passed: true,
      message: `${actualCount} ${actualCount === 1 ? 'photo' : 'photos'} submitted (${requiredCount} required)`,
      actual: actualCount,
      expected: requiredCount,
    };
  }

  return {
    check: 'artefact_count',
    passed: false,
    message: `Only ${actualCount} ${actualCount === 1 ? 'photo' : 'photos'} submitted (${requiredCount} required)`,
    actual: actualCount,
    expected: requiredCount,
  };
}

/**
 * Format a duplicate detection check result
 */
export function formatDuplicateCheck(
  passed: boolean,
  duplicateCount: number = 0
): VerificationCheck {
  if (passed) {
    return {
      check: 'duplicates',
      passed: true,
      message: 'No matching photos found in other submissions',
    };
  }

  return {
    check: 'duplicates',
    passed: false,
    message: `${duplicateCount} ${duplicateCount === 1 ? 'photo matches' : 'photos match'} existing submissions`,
    actual: duplicateCount,
    expected: 0,
  };
}

/**
 * Format an image dimensions check result
 */
export function formatDimensionsCheck(
  passed: boolean,
  actualWidth: number,
  actualHeight: number,
  minWidth: number,
  minHeight: number
): VerificationCheck {
  if (passed) {
    return {
      check: 'dimensions',
      passed: true,
      message: `Resolution ${actualWidth}×${actualHeight} exceeds minimum ${minWidth}×${minHeight}`,
      actual: `${actualWidth}×${actualHeight}`,
      expected: `${minWidth}×${minHeight}`,
    };
  }

  const issues: string[] = [];
  if (actualWidth < minWidth) {
    issues.push(`width ${actualWidth}px < ${minWidth}px`);
  }
  if (actualHeight < minHeight) {
    issues.push(`height ${actualHeight}px < ${minHeight}px`);
  }

  return {
    check: 'dimensions',
    passed: false,
    message: `Resolution too small: ${issues.join(', ')}`,
    actual: `${actualWidth}×${actualHeight}`,
    expected: `${minWidth}×${minHeight}`,
  };
}

/**
 * Convert raw verification result to human-readable format
 */
export function formatVerificationResult(
  verificationJson: any,
  task: any,
  artefacts: any[]
): VerificationDetails {
  const checks: VerificationCheck[] = [];
  const verification = typeof verificationJson === 'string'
    ? JSON.parse(verificationJson)
    : verificationJson;

  const requirements = typeof task.requirementsJson === 'string'
    ? JSON.parse(task.requirementsJson)
    : (task.requirementsJson || {});

  // Artefact count
  const requiredCount = requirements?.photos?.count || 1;
  const artefactCountPassed = verification.passed?.includes('artefact_count');
  checks.push(formatArtefactCountCheck(artefactCountPassed, artefacts.length, requiredCount));

  // Time window
  const timeWindowPassed = verification.passed?.includes('time_window');
  checks.push(formatTimeWindowCheck(
    timeWindowPassed,
    new Date(), // We don't have exact submission time here, would need to pass it
    new Date(task.timeEnd)
  ));

  // Location
  const locationPassed = verification.passed?.includes('location_verification');
  // Extract distance from flags if available
  let avgDistance: number | null = null;
  const locationFlags = (verification.flags || []).filter((f: string) =>
    f.includes('outside_radius') || f.includes('no_gps')
  );
  if (locationFlags.length === 0 && artefacts.some((a: any) => a.gpsLat != null)) {
    // If no location flags and we have GPS data, calculate average distance
    const distances = artefacts
      .filter((a: any) => a.gpsLat != null && a.gpsLon != null)
      .map((a: any) => calculateDistance(task.locationLat, task.locationLon, a.gpsLat, a.gpsLon));
    if (distances.length > 0) {
      avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    }
  }
  checks.push(formatLocationCheck(locationPassed, avgDistance, task.radiusM));

  // Bearing (if required)
  if (requirements?.bearing?.required) {
    const bearingPassed = verification.passed?.includes('bearing_verification');
    const targetBearing = requirements.bearing.target_deg;
    const tolerance = requirements.bearing.tolerance_deg || 45;
    // Get average bearing from artefacts
    const bearings = artefacts
      .filter((a: any) => a.bearing != null)
      .map((a: any) => a.bearing);
    const avgBearing = bearings.length > 0
      ? bearings.reduce((a: number, b: number) => a + b, 0) / bearings.length
      : null;
    checks.push(formatBearingCheck(bearingPassed, avgBearing, targetBearing, tolerance));
  }

  // Duplicates
  const duplicatePassed = verification.passed?.includes('duplicate_detection');
  const duplicateFlags = (verification.flags || []).filter((f: string) =>
    f.includes('duplicate_sha256')
  );
  checks.push(formatDuplicateCheck(duplicatePassed, duplicateFlags.length));

  // Dimensions (if required)
  const minWidth = requirements?.photos?.min_width_px;
  const minHeight = requirements?.photos?.min_height_px;
  if (minWidth || minHeight) {
    const dimensionsPassed = verification.passed?.includes('image_dimensions');
    // Get smallest dimensions from artefacts
    const widths = artefacts.map((a: any) => a.widthPx || 0);
    const heights = artefacts.map((a: any) => a.heightPx || 0);
    const minActualWidth = Math.min(...widths);
    const minActualHeight = Math.min(...heights);
    checks.push(formatDimensionsCheck(
      dimensionsPassed,
      minActualWidth,
      minActualHeight,
      minWidth || 0,
      minHeight || 0
    ));
  }

  // Calculate summary
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;
  const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 0;

  return {
    checks,
    summary: {
      passed,
      failed,
      score,
    },
  };
}

/**
 * Haversine distance calculation (meters)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
