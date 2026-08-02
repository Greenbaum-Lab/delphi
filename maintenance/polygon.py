'''
Point in polygon test, ported from the DORA interface.

Kept arithmetically identical to polygonSamples in DORA so that a polygon drawn
there and a population resolved from the same coordinates hold the same
individuals. Rings are [latitude, longitude] pairs, left open, and coordinates
are treated as planar because DORA draws in an equirectangular projection.
'''


def contains_point(ring, latitude, longitude):
	'''Ray cast along increasing latitude, toggling on each edge crossed.'''
	inside = False
	for index in range(len(ring)):
		latitude_a, longitude_a = ring[index]
		latitude_b, longitude_b = ring[(index + 1) % len(ring)]
		if (longitude_a > longitude) != (longitude_b > longitude):
			crossing = (latitude_b - latitude_a) * (longitude - longitude_a) / (longitude_b - longitude_a) + latitude_a
			if latitude < crossing:
				inside = not inside
	return inside


def polygon_samples(ring, samples):
	'''Samples whose coordinates fall inside a ring, in input order.'''
	return [
		sample for sample in samples
		if sample['Latitude'] is not None and sample['Longitude'] is not None
		and contains_point(ring, sample['Latitude'], sample['Longitude'])
	]
