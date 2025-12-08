
import re

presets = [
  "1920's Jazz",
  "1950's Rock & Roll",
  "1950's Rhythm & Blues"
]

for preset in presets:
    # JS: preset.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    lower = preset.lower()
    # Python re.sub equivalent
    replaced = re.sub(r'[^a-z0-9]+', '-', lower)
    final = replaced.strip('-')
    print(f"'{preset}' -> '{final}'")
