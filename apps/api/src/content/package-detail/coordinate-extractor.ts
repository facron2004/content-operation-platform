import { Logger } from '@nestjs/common';
import type { CheerioAPI } from 'cheerio';

/**
 * Extract merchant coordinates from HTML DOM using multi-level fallback:
 * 1. #longitude / #latitude input fields
 * 2. input[name="longitude"] / input[name="latitude"]
 * 3. Chinese text patterns (经度:/纬度:)
 */
export function extractCoordinates($: CheerioAPI): { lng?: number; lat?: number } {
  const logger = new Logger('CoordinateExtractor');
  let lng: number | undefined;
  let lat: number | undefined;

  const lngInput = $('#longitude');
  const latInput = $('#latitude');

  if (lngInput.length) {
    const rawLng = lngInput.val();
    lng = rawLng ? parseFloat(String(rawLng)) : undefined;
    logger.debug(`longitude input found, value: ${rawLng} → ${lng}`);
  } else {
    const altLng = $('input[name="longitude"]').first();
    if (altLng.length) {
      const rawLng = altLng.val();
      lng = rawLng ? parseFloat(String(rawLng)) : undefined;
      logger.debug(`longitude[name] found: ${rawLng} → ${lng}`);
    }
  }

  if (latInput.length) {
    const rawLat = latInput.val();
    lat = rawLat ? parseFloat(String(rawLat)) : undefined;
    logger.debug(`latitude input found, value: ${rawLat} → ${lat}`);
  } else {
    const altLat = $('input[name="latitude"]').first();
    if (altLat.length) {
      const rawLat = altLat.val();
      lat = rawLat ? parseFloat(String(rawLat)) : undefined;
      logger.debug(`latitude[name] found: ${rawLat} → ${lat}`);
    }
  }

  // As last resort, search entire HTML text for Chinese lat/lng patterns
  if (!lng || !lat) {
    const bodyText = $('body').text() || '';
    const lngMatch = bodyText.match(/经度[：:]\s*([\d.]+)/);
    const latMatch = bodyText.match(/纬度[：:]\s*([\d.]+)/);
    if (lngMatch) lng = parseFloat(lngMatch[1]);
    if (latMatch) lat = parseFloat(latMatch[1]);
    if (lngMatch || latMatch) {
      logger.debug(`Found coords via Chinese text: ${lat}, ${lng}`);
    }
  }

  if (lng && lat) {
    logger.log(`Extracted coordinates: ${lat}, ${lng}`);
  } else {
    logger.debug('No coordinates found');
  }

  return { lng, lat };
}
