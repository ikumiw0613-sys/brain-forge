from random import SystemRandom

STAGE_ID = "ST-001"
STAGE_VERSION = 1
CONTAINER_COUNT = 16
QUALITY_THRESHOLD = 70
SCAN_LIMIT = 5

_random = SystemRandom()


def generate_qualities(excluded_index: int | None = None) -> tuple[int, ...]:
    positions = [index for index in range(CONTAINER_COUNT) if index != excluded_index]
    first_eligible = _random.choice(positions)
    lower = _random.sample(range(QUALITY_THRESHOLD), first_eligible)
    higher = _random.sample(range(QUALITY_THRESHOLD, 101), CONTAINER_COUNT - first_eligible)
    return tuple(sorted(lower) + sorted(higher))
