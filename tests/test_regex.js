
const presets = [
    "1920's Jazz",
    "1950's Rock & Roll",
    "1950's Rhythm & Blues"
];

presets.forEach(preset => {
    const coverName = preset.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    console.log(`'${preset}' -> '${coverName}'`);
});
