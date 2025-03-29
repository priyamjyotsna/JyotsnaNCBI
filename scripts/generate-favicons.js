const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const originalFavicon = path.join(publicDir, 'favicon.png');

// Make sure the original favicon exists
if (!fs.existsSync(originalFavicon)) {
    console.error('Original favicon.png not found in the public directory!');
    process.exit(1);
}

// Create smaller favicon versions
const sizes = {
    'favicon-16x16.png': 16,
    'favicon-32x32.png': 32,
    'apple-touch-icon.png': 180,
    'android-chrome-192x192.png': 192,
};

// Create the webmanifest file
const manifest = {
    name: "Jyotsna's NCBI Tools",
    short_name: "NCBI Tools",
    icons: [
        {
            src: "/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png"
        },
        {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png"
        }
    ],
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone"
};

// Write the manifest file
fs.writeFileSync(
    path.join(publicDir, 'site.webmanifest'),
    JSON.stringify(manifest, null, 2)
);

// Generate different sizes
Object.entries(sizes).forEach(([filename, size]) => {
    const outputPath = path.join(publicDir, filename);
    
    sharp(originalFavicon)
        .resize(size, size)
        .toFile(outputPath)
        .then(() => {
            console.log(`Generated ${filename} (${size}x${size})`);
        })
        .catch(err => {
            console.error(`Error generating ${filename}:`, err);
        });
});

console.log('Favicon generation complete!'); 